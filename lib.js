// Shared by the content script, the manager page and the preview page.
// Storage layout (chrome.storage.local):
//   cards            – array of card metadata (DATA-001..004)
//   blob:<id>        – file content as a data URL (DATA-002)
//   draft:<id>       – form values + edited letter text of a template (DATA-003, A-08)
//   profile          – { name, email, phone } (DATA-005)
var CVDeck = globalThis.CVDeck || (() => {
  const local = chrome.storage.local;
  const get = async (key, fallback) => (await local.get(key))[key] ?? fallback;

  // UI-007: 8 colors, [strip background, strip text]; all pairs exceed 4.5:1.
  const PALETTE = [
    ['#CECBF6', '#26215C'], ['#9FE1CB', '#04342C'], ['#F5C4B3', '#4A1B0C'], ['#B5D4F4', '#042C53'],
    ['#FAC775', '#412402'], ['#F4C0D1', '#4B1528'], ['#C0DD97', '#173404'], ['#F7C1C1', '#501313'],
  ];
  const DECKS = { cv: 'CVs', cl: 'Letters', pf: 'Portfolio' };
  const MAX_SIZE = 10 * 1024 * 1024; // A-02
  const TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  // A-09: form fields until OQ-01 is closed.
  const FIELDS = [
    { key: 'organization', label: 'Organization', required: true, placeholder: 'Acme Corp' },
    { key: 'role', label: 'Role', required: false, placeholder: 'Data Analyst' },
    { key: 'recipient', label: 'Recipient', required: true, placeholder: 'Jane Smith' },
    { key: 'recipient_title', label: 'Recipient title', required: false, placeholder: 'Head of Data' },
  ];

  // A-10: preloaded questions that need a written answer; the user writes the
  // answers. Short facts (salary, notice period, referral source) are left out.
  const FAQ_DEFAULTS = [
    'Why do you want to work at {{organization}}?',
    'Why are you interested in this role?',
    'What do you know about {{organization}}?',
    'Tell us about yourself.',
    'Why should we hire you?',
    'What are your greatest strengths?',
    'What is your biggest weakness?',
    'Describe a project you are proud of.',
    'Describe a challenge you faced and how you handled it.',
    'Tell us about a time you worked with a difficult teammate or stakeholder.',
    'Why are you leaving your current job?',
    'Where do you see yourself in five years?',
    'Is there anything else you would like us to know?',
  ];
  // Defaults from FAQ version 1 that are short facts, not written answers.
  const FAQ_DROPPED = [
    'What is your greatest professional achievement?',
    'What are your salary expectations?',
    'What is your notice period or earliest start date?',
    'How did you hear about {{organization}}?',
  ];
  const FAQ_VERSION = 2;

  const api = {
    PALETTE, DECKS, FIELDS, MAX_SIZE,
    STARTER_TEMPLATE: 'Dear {{recipient}},\n\nI am applying for the {{role}} role at {{organization}}.\n\n\n\nKind regards,',
    MIME: 'application/x-cvdeck-card',
    MIME_URL: 'application/x-cvdeck-has-url',

    uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ext: (name = '') => (name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase(),

    async list() { return get('cards', []); },
    async saveList(cards) { await local.set({ cards }); },
    async getData(id) { return get('blob:' + id, null); },
    async getProfile() { return get('profile', { name: '', email: '', phone: '' }); },
    async setProfile(profile) { await local.set({ profile }); },
    // DATA-007: one organization for the current application, shared by the
    // FAQ and every cover-letter template (Q34).
    async getOrg() { return get('app:organization', ''); },
    async setOrg(organization) { await local.set({ 'app:organization': organization }); },

    async getDraft(id) {
      const [draft, organization] = await Promise.all([get('draft:' + id, { values: {}, edited: null }), api.getOrg()]);
      draft.values = { ...draft.values, organization };
      return draft;
    },
    async setDraft(id, draft) {
      const { organization = '', ...rest } = draft.values;
      await local.set({ ['draft:' + id]: { ...draft, values: rest }, 'app:organization': organization });
    },

    /* ---------- FAQ (FR-080..FR-089) ---------- */
    MIME_FAQ: 'application/x-cvdeck-faq',
    async getFaq() {
      const [faq, version] = await Promise.all([get('faq', null), get('faq:version', 1)]);
      const fresh = (question) => ({ id: api.uid(), question, answer: '' });
      if (!faq) { // A-10
        const seeded = FAQ_DEFAULTS.map(fresh);
        await local.set({ faq: seeded, 'faq:version': FAQ_VERSION });
        return seeded;
      }
      if (version >= FAQ_VERSION) return faq;
      // Upgrade an old default list: drop unanswered short-fact questions,
      // add the new written-answer questions. User answers are never removed.
      const kept = faq.filter((q) => !(FAQ_DROPPED.includes(q.question) && !q.answer.trim()));
      const added = FAQ_DEFAULTS.filter((d) => !kept.some((q) => q.question === d)).map(fresh);
      const upgraded = [...kept, ...added];
      await local.set({ faq: upgraded, 'faq:version': FAQ_VERSION });
      return upgraded;
    },
    async saveFaq(faq) { await local.set({ faq }); },
    async addFaq(question = 'New question', answer = '') {
      const item = { id: api.uid(), question, answer };
      await api.saveFaq([...(await api.getFaq()), item]);
      return item;
    },
    async updateFaq(id, patch) {
      await api.saveFaq((await api.getFaq()).map((q) => (q.id === id ? { ...q, ...patch } : q)));
    },
    async removeFaq(id) { await api.saveFaq((await api.getFaq()).filter((q) => q.id !== id)); },
    needsOrg: (text) => /\{\{\s*organization\s*\}\}/.test(text),

    // FR-040: next palette color after the last card of the same deck.
    nextColor(cards, deck) {
      const inDeck = cards.filter((c) => c.deck === deck);
      return inDeck.length ? (inDeck[inDeck.length - 1].color + 1) % PALETTE.length : 0;
    },

    uniqueName(cards, deck, base) { // BR-05
      let name = base, n = 2;
      while (cards.some((c) => c.deck === deck && c.name === name)) name = `${base} (${n++})`;
      return name;
    },

    // ERR-003 / ERR-004
    validateFile(file) {
      if (!TYPES[api.ext(file.name)]) throw new Error(`${file.name}: only PDF and DOCX files are supported.`);
      if (file.size > MAX_SIZE) throw new Error(`${file.name}: files must be 10 MB or smaller.`);
    },

    readAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
    },

    async add(card) {
      const cards = await api.list();
      const full = {
        id: api.uid(), color: api.nextColor(cards, card.deck), notes: '',
        createdAt: Date.now(), lastUsed: null, ...card,
      };
      await api.saveList([...cards, full]);
      return full;
    },

    async addFile(deck, file) { // FR-001, FR-002
      api.validateFile(file);
      const id = api.uid();
      await local.set({ ['blob:' + id]: await api.readAsDataURL(file) });
      return api.add({
        id, deck, kind: 'file', name: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name, mime: TYPES[api.ext(file.name)], size: file.size,
      });
    },

    async replaceFile(id, file) { // FR-006
      api.validateFile(file);
      await local.set({ ['blob:' + id]: await api.readAsDataURL(file) });
      await api.update(id, { fileName: file.name, mime: TYPES[api.ext(file.name)], size: file.size, updatedAt: Date.now() });
    },

    // UI-014: date the content was added or last replaced.
    cardDate(card) {
      const d = new Date(card.updatedAt || card.createdAt);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      return {
        short: d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' }),
        long: d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      };
    },

    addLink(url, title) { // FR-002
      return api.add({ deck: 'pf', kind: 'link', name: title || url, url, title: title || '' });
    },

    addTemplate(name, text) { // FR-003
      return api.add({ deck: 'cl', kind: 'template', name, text });
    },

    async saveLetter(organization, bytes) { // BR-03, A-04
      const cards = await api.list();
      const name = api.uniqueName(cards, 'cl', `Cover letter – ${organization}`);
      const id = api.uid();
      await local.set({ ['blob:' + id]: api.bytesToDataUrl(bytes, TYPES.pdf) });
      return api.add({
        id, deck: 'cl', kind: 'file', name, fileName: api.letterFileName(organization),
        mime: TYPES.pdf, size: bytes.length,
      });
    },

    async update(id, patch) {
      const cards = await api.list();
      await api.saveList(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },

    async remove(id) { // FR-007
      await api.saveList((await api.list()).filter((c) => c.id !== id));
      await local.remove(['blob:' + id, 'draft:' + id]);
    },

    touch(id) { return api.update(id, { lastUsed: Date.now() }); },

    hasFile: (card) => card.kind === 'file',
    hasUrl: (card) => !!card.url,

    badge(card) {
      if (card.kind === 'template') return 'TPL';
      if (card.kind === 'link') return 'LINK';
      return api.ext(card.fileName).toUpperCase() + (card.url ? '+' : '');
    },

    formatSize(bytes = 0) {
      if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    },

    // FR-032: {{key}} → value; unknown or empty keys stay visible.
    fill(text, values) {
      return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => values[k] || m);
    },

    missingRequired: (values) => FIELDS.filter((f) => f.required && !values[f.key]?.trim()),

    letterFileName: (org) => `Cover_letter_${org.trim().replace(/[^\w-]+/g, '_')}.pdf`,

    dataUrlToBytes(dataUrl) {
      const bin = atob(dataUrl.split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    },

    bytesToDataUrl(bytes, mime) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:${mime};base64,${btoa(bin)}`;
    },

    async fileOf(card) {
      const data = await api.getData(card.id);
      if (!data) throw new Error('File content is missing.');
      return new File([api.dataUrlToBytes(data)], card.fileName, { type: card.mime });
    },

    letterDate: () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), // A-05

    /* ---------------------------------------------------------------
     * FR-033 / OQ-03: A4 letter PDF with the standard Helvetica fonts.
     * Text is encoded as WinAnsi; characters outside it become "?".
     * --------------------------------------------------------------- */
    letterPdf(profile, values, body) {
      const W = 595.28, H = 841.89, M = 64, MAX_W = W - 2 * M, BOTTOM = M;
      // Helvetica advance widths (1/1000 em) for codes 32–126.
      const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
      const WIN = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
      const WIN_W = { 0x80: 556, 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000 };
      const enc = (s) => [...s.replace(/\t/g, '    ')].map((ch) => {
        const c = ch.charCodeAt(0);
        if (c >= 32 && c < 127) return ch;
        if (WIN[ch]) return String.fromCharCode(WIN[ch]);
        if (c >= 160 && c <= 255) return ch;
        return '?';
      }).join('');
      const width = (s, size) => [...s].reduce((w, ch) => {
        const c = ch.charCodeAt(0);
        return w + (c >= 32 && c < 127 ? HW[c - 32] : WIN_W[c] || 556);
      }, 0) * size / 1000;
      const esc = (s) => s.replace(/[\\()]/g, (m) => '\\' + m);
      const wrap = (s, size) => {
        const words = s.split(/ +/), lines = [];
        let line = '';
        for (const w of words) {
          const next = line ? line + ' ' + w : w;
          if (line && width(next, size) > MAX_W) { lines.push(line); line = w; } else line = next;
        }
        lines.push(line);
        return lines;
      };

      const pages = [];
      let ops = [], y = H - M;
      const newPage = () => { pages.push(ops.join('\n')); ops = []; y = H - M; };
      const text = (s, { font = 'F1', size = 11, gray = 0, lead = size * 1.45 } = {}) => {
        if (y - lead < BOTTOM) newPage();
        ops.push(`BT /${font} ${size} Tf ${gray} g ${M} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`);
        y -= lead;
      };

      text(enc(profile.name || ''), { font: 'F2', size: 18, lead: 22 });
      const contact = [profile.email, profile.phone].filter(Boolean).join('  ·  ');
      if (contact) text(enc(contact), { size: 10, gray: 0.37 });
      y -= 18;
      text(enc(api.letterDate()));
      y -= 14;
      for (const k of ['recipient', 'recipient_title', 'organization']) if (values[k]) text(enc(values[k]));
      y -= 14;
      for (const para of body.replace(/\r/g, '').split('\n')) {
        if (!para.trim()) { y -= 8; continue; }
        for (const l of wrap(enc(para), 11)) text(l);
      }
      pages.push(ops.join('\n'));

      const objs = [];
      objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
      objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
      const kids = [];
      let n = 5;
      for (const content of pages) {
        const p = n++, c = n++;
        kids.push(`${p} 0 R`);
        objs[p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`;
        objs[c] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
      }
      objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offsets = [];
      for (let i = 1; i < objs.length; i++) {
        offsets[i] = out.length;
        out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
      }
      const xref = out.length;
      out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
      for (let i = 1; i < objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return Uint8Array.from(out, (ch) => ch.charCodeAt(0));
    },
  };
  return api;
})();
