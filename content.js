(() => {
  if (globalThis.__cvDeckContent?.alive()) return;
  globalThis.__cvDeckContent = { alive: () => !!chrome.runtime?.id };

  const { MIME, MIME_URL, PALETTE, FIELDS } = CVDeck;
  const MIME_FILE = 'application/x-cvdeck-has-file';
  const IS_TOP = window === window.top;
  let drawerHost = null; // top frame only

  // After the extension is reloaded or updated, the copy of this script that
  // is still running in open tabs loses access to chrome.* APIs. It must stop
  // handling events so the new copy can, and it must not leave its UI behind.
  const orphaned = () => !chrome.runtime?.id;
  document.querySelectorAll('cvdeck-drawer, cvdeck-overlay').forEach((el) => el.remove());

  /* =====================================================================
   * Overlay per frame: target highlight (UI-009) and messages (UI-010)
   * ===================================================================== */
  let overlay = null;
  function getOverlay() {
    if (overlay?.host.isConnected) return overlay;
    const host = document.createElement('cvdeck-overlay');
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        *{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
        .hl{position:fixed;display:none;border:2px solid #534AB7;background:rgba(83,74,183,.08);border-radius:8px}
        .hl.guess{border-style:dashed;border-color:#BA7517;background:rgba(186,117,23,.06)}
        .hl span{position:absolute;top:-22px;left:-2px;font:600 11px/1 system-ui,sans-serif;color:#fff;background:#534AB7;padding:5px 8px;border-radius:6px;white-space:nowrap}
        .hl.guess span{background:#BA7517}
        .toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center}
        .toast{pointer-events:auto;display:flex;align-items:center;gap:10px;font:500 13px/1.4 system-ui,sans-serif;color:#fff;background:#2C2C2A;
          padding:10px 14px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:460px;animation:in .18s ease-out}
        .toast.ok{background:#27500A}.toast.warn{background:#633806}.toast.error{background:#791F1F}
        .toast button{font:600 12px system-ui,sans-serif;border:0;border-radius:7px;padding:6px 10px;cursor:pointer;background:#fff;color:#2C2C2A}
        .toast button.alt{background:transparent;color:#fff;outline:1px solid rgba(255,255,255,.5)}
        @keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      </style>
      <div class="hl"><span></span></div>
      <div class="toasts"></div>`;
    (document.body || document.documentElement).appendChild(host);
    overlay = { host, hl: root.querySelector('.hl'), label: root.querySelector('.hl span'), toasts: root.querySelector('.toasts') };
    return overlay;
  }

  function toast(message, tone = 'ok', ms = 3500, buttons = []) {
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.alt) btn.className = 'alt';
      btn.onclick = () => { el.remove(); b.onClick?.(); };
      el.appendChild(btn);
    }
    getOverlay().toasts.appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
  }

  function showHighlight(el, text, guess) {
    const o = getOverlay();
    const r = visibleBox(el).getBoundingClientRect();
    Object.assign(o.hl.style, {
      display: 'block', left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px',
    });
    o.hl.classList.toggle('guess', !!guess);
    o.label.textContent = text;
  }
  const hideHighlight = () => { if (overlay) overlay.hl.style.display = 'none'; };

  /* =====================================================================
   * Drop-target resolution (FR-023)
   * ===================================================================== */
  const parentOf = (n) => n.parentElement || (n.parentNode instanceof ShadowRoot ? n.parentNode.host : null);
  const isFileInput = (el) => el instanceof HTMLInputElement && el.type === 'file' && !el.disabled;
  const isTextField = (el) => {
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
    if (el instanceof HTMLInputElement) return /^(text|search|url|email|)$/.test(el.type) && !el.readOnly && !el.disabled;
    return el instanceof HTMLElement && el.isContentEditable;
  };

  const OTHER_CONTROLS = 'textarea, select, input:not([type=file]):not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset])';

  function visibleBox(el) { // hidden inputs have no box; use the first visible ancestor
    for (let n = el; n; n = parentOf(n)) {
      const r = n.getBoundingClientRect();
      if (r.width > 24 && r.height > 12) return n;
    }
    return el;
  }

  function nearest(inputs, x, y) {
    let best = inputs[0], bestD = Infinity;
    for (const i of inputs) {
      const r = visibleBox(i).getBoundingClientRect();
      const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
      if (dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = i; }
    }
    return best;
  }

  function resolveTarget(el, x, y) {
    for (let n = el, d = 0; n && d < 4; n = parentOf(n), d++) {
      if (isFileInput(n)) return { kind: 'input', el: n };
      if (n instanceof HTMLLabelElement && isFileInput(n.control)) return { kind: 'input', el: n.control };
      if (isTextField(n)) return { kind: 'text', el: n };
    }
    // Climb only while inside the upload widget: once an ancestor also holds
    // other visible form fields, it is the whole form, not the widget.
    for (let n = el, d = 0; n && d < 10 && n !== document.documentElement; n = parentOf(n), d++) {
      if ([...n.querySelectorAll(OTHER_CONTROLS)].some((c) => c.getClientRects().length)) break;
      const inputs = [...n.querySelectorAll('input[type=file]')].filter((i) => !i.disabled);
      if (inputs.length) return { kind: 'input', el: inputs.length === 1 ? inputs[0] : nearest(inputs, x, y) };
    }
    return { kind: 'dropzone', el }; // ERR-002
  }

  /* =====================================================================
   * Applying a card
   * ===================================================================== */
  function acceptsFile(input, file) {
    const accept = (input.accept || '').trim();
    if (!accept) return true;
    const name = file.name.toLowerCase();
    return accept.split(',').map((s) => s.trim().toLowerCase()).some((a) =>
      a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : a === file.type);
  }

  function attachToInput(input, file) { // BR-06, BR-07
    const dt = new DataTransfer();
    if (input.multiple) for (const f of input.files) dt.items.add(f);
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syntheticDrop(el, file, x, y) { // ERR-002
    const dt = new DataTransfer();
    dt.items.add(file);
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt };
    for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, opts));
  }

  function insertText(el, text) { // FR-022
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll');
      if (!document.execCommand('insertText', false, text)) el.textContent = text;
    } else {
      el.select?.();
      if (!(document.execCommand('insertText', false, text) && el.value === text)) {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function offerSave(organization, bytes, fileName, verb = 'Attached') { // FR-034, BR-03, BR-04
    toast(`${verb} ${fileName}. Save it as a new card?`, 'ok', 0, [
      { label: 'Save', onClick: async () => {
        const card = await CVDeck.saveLetter(organization, bytes);
        toast(`Saved "${card.name}" to Letters`);
      } },
      { label: "Don't save", alt: true },
    ]);
  }

  // The file a card produces: its stored file, or the filled letter PDF of a template.
  async function buildFile(card) {
    try {
      if (card.kind !== 'template') return { file: await CVDeck.fileOf(card), letter: null };
      const [draft, profile] = await Promise.all([CVDeck.getDraft(card.id), CVDeck.getProfile()]); // FR-032, FR-033, FR-036
      const body = CVDeck.fill(draft.edited ?? card.text, draft.values);
      const bytes = CVDeck.letterPdf(profile, draft.values, body);
      return {
        file: new File([bytes], CVDeck.letterFileName(draft.values.organization), { type: 'application/pdf' }),
        letter: { org: draft.values.organization, bytes },
      };
    } catch (err) {
      toast(card.kind === 'template' ? 'Could not create the cover letter PDF.' : 'Could not read the file: ' + err.message, 'error'); // ERR-005
      return null;
    }
  }

  async function downloadCard(card) { // FR-070..FR-073
    const built = await buildFile(card);
    if (!built) return;
    const url = URL.createObjectURL(built.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = built.file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    CVDeck.touch(card.id);
    if (built.letter) offerSave(built.letter.org, built.letter.bytes, built.file.name, 'Downloaded');
    else toast(`Downloaded ${built.file.name}`);
  }

  async function applyCard(id, el, x, y) {
    const card = (await CVDeck.list()).find((c) => c.id === id);
    if (!card) return toast('That card no longer exists.', 'error'); // ERR-001
    const target = resolveTarget(el, x, y);

    if (target.kind === 'text') {
      if (!card.url) return toast('Drop files on an upload box.', 'warn'); // BR-15
      insertText(target.el, card.url); // BR-09
      CVDeck.touch(id);
      return toast(`Pasted ${card.url}`);
    }
    if (card.kind === 'link') return toast('Drop links on a text field.', 'warn'); // ERR-007

    const built = await buildFile(card);
    if (!built) return;
    const { file, letter } = built;

    if (target.kind === 'input') {
      attachToInput(target.el, file);
      if (!acceptsFile(target.el, file)) toast(`Attached ${file.name}, but this field asks for ${target.el.accept}.`, 'warn', 5000); // BR-08
      else if (!letter) toast(`Attached ${file.name}`);
    } else {
      syntheticDrop(target.el, file, x, y);
      toast(`Dropped ${file.name}. If nothing happened, use the site's upload button.`, 'warn', 5000);
    }
    CVDeck.touch(id);
    if (letter) offerSave(letter.org, letter.bytes, file.name);
  }

  /* =====================================================================
   * Drag listeners (capture phase, every frame). Only drags carrying the
   * CV Deck type are intercepted; normal page drags are untouched.
   * ===================================================================== */
  const types = (e) => [...(e.dataTransfer?.types || [])];
  const isFaqDrag = (e) => types(e).includes(CVDeck.MIME_FAQ);
  const hasCard = (e) => types(e).includes(MIME) || isFaqDrag(e);
  const onDrawer = (e) => drawerHost && e.composedPath().includes(drawerHost); // BR-10
  const deepTarget = (e) => (e.composedPath()[0] instanceof Element ? e.composedPath()[0] : e.target);

  let lastHover = null;
  function onDragOver(e) {
    if (!hasCard(e) || orphaned()) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (onDrawer(e)) { lastHover = null; return hideHighlight(); }
    const el = deepTarget(e);
    if (el === lastHover) return;
    lastHover = el;
    const t = resolveTarget(el, e.clientX, e.clientY);
    const hasUrl = types(e).includes(MIME_URL) || isFaqDrag(e), hasFile = types(e).includes(MIME_FILE);
    if (t.kind === 'text') hasUrl ? showHighlight(t.el, 'Paste here') : hideHighlight();
    else if (!hasFile) hideHighlight();
    else if (t.kind === 'input') showHighlight(t.el, 'Attach here');
    else showHighlight(t.el, 'Try dropping here', true);
  }

  window.addEventListener('dragenter', onDragOver, true);
  window.addEventListener('dragover', onDragOver, true);
  window.addEventListener('dragleave', (e) => {
    if (hasCard(e) && !e.relatedTarget) { hideHighlight(); lastHover = null; }
  }, true);
  window.addEventListener('drop', (e) => {
    if (!hasCard(e) || orphaned()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hideHighlight();
    lastHover = null;
    if (onDrawer(e)) return;
    if (isFaqDrag(e)) return applyFaq(e.dataTransfer.getData(CVDeck.MIME_FAQ), deepTarget(e), e.clientX, e.clientY);
    applyCard(e.dataTransfer.getData(MIME), deepTarget(e), e.clientX, e.clientY);
  }, true);

  async function applyFaq(id, el, x, y) { // FR-085
    const [faq, org] = await Promise.all([CVDeck.getFaq(), CVDeck.getOrg()]);
    const item = faq.find((q) => q.id === id);
    if (!item) return toast('That question no longer exists.', 'error');
    const target = resolveTarget(el, x, y);
    if (target.kind !== 'text') return toast('Drop answers on a text box.', 'warn'); // BR-20
    insertText(target.el, CVDeck.fill(item.answer, { organization: org }));
    toast('Pasted your answer');
  }

  /* =====================================================================
   * Drawer (top frame only)
   * ===================================================================== */
  if (!IS_TOP) return;

  const ORIGINS_KEY = 'ui:openOrigins';
  const PAGE_SIZE = 6; // FR-015
  const STEP = 56;     // UI-003
  let shadow = null, ui = {};
  let cards = [], profile = { name: '' };
  let tab = 'cv', page = { cv: 0, cl: 0, pf: 0 }, hov = null, cardEls = [];
  let popped = null; // { card, draft?, el }
  let dragging = false;
  let faq = [], org = '';
  const loaded = Promise.all([CVDeck.list(), CVDeck.getProfile(), chrome.storage.local.get(ORIGINS_KEY), CVDeck.getFaq(), CVDeck.getOrg()])
    .then(([c, p, o, f, g]) => { cards = c; profile = p; faq = f; org = g; return o; });

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    button{font:inherit}
    .drawer{position:fixed;top:0;right:0;bottom:0;width:280px;display:flex;flex-direction:column;background:#F8F7F4;color:#2C2C2A;
      border-left:1px solid #D3D1C7;box-shadow:-12px 0 32px rgba(0,0,0,.10);transition:opacity .15s}
    .ghost{opacity:.22!important;pointer-events:none!important}
    header{display:flex;align-items:center;gap:6px;padding:12px 10px 8px 12px}
    .logo{width:22px;height:22px;border-radius:6px;background:#534AB7;color:#fff;font:700 10px/22px system-ui;text-align:center}
    .title{flex:1;font-weight:600;font-size:14px}
    .icon{border:0;background:transparent;color:#5F5E5A;width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:15px;line-height:1}
    .icon:hover{background:#ECEAE3;color:#2C2C2A}
    .tabs{display:flex;gap:4px;padding:0 10px 10px}
    .tabs button{flex:1 1 auto;border:0;background:#fff;color:#5F5E5A;padding:7px 4px;border-radius:8px;font-size:11.5px;white-space:nowrap;cursor:pointer;outline:1px solid transparent}
    .tabs button.on{color:#2C2C2A;font-weight:600;outline-color:#B4B2A9}
    .stack{position:relative;flex:1;overflow:hidden}
    .card{position:absolute;left:26px;top:4px;width:224px;height:118px;border-radius:12px;background:#fff;border:1px solid #D3D1C7;
      overflow:hidden;cursor:pointer;user-select:none;transition:transform .45s cubic-bezier(.2,.8,.2,1),box-shadow .2s}
    .card:hover{box-shadow:0 10px 24px rgba(0,0,0,.14)}
    .strip{display:flex;align-items:center;gap:8px;height:44px;padding:0 10px}
    .badge{flex:none;font:600 10px/1 system-ui;background:#fff;padding:4px 6px;border-radius:4px}
    .name{flex:1;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sub{font-size:11.5px;color:#5F5E5A;margin:8px 12px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bar{height:4px;border-radius:3px;background:#F1EFE8;margin:8px 12px 0}
    .foot{padding:6px 10px 12px;text-align:center}
    .more{width:100%;border:1px solid #D3D1C7;background:#fff;border-radius:8px;padding:6px;font-size:12px;cursor:pointer;color:#2C2C2A;margin-bottom:6px}
    .hint{font-size:11px;color:#888780;margin:0;line-height:1.4}
    .empty{padding:24px 18px;text-align:center;font-size:12.5px;color:#5F5E5A;line-height:1.5}
    .link{border:0;background:none;color:#534AB7;font-weight:600;cursor:pointer;padding:0;font-size:inherit}
    .mini{position:fixed;right:0;top:40%;border:0;background:#534AB7;color:#fff;font:700 11px system-ui;padding:12px 8px;border-radius:10px 0 0 10px;cursor:pointer;display:none}
    .dim{position:fixed;top:0;left:0;bottom:0;right:280px;background:rgba(20,20,18,.38);display:none}
    .pop{position:fixed;right:292px;top:16px;width:420px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#2C2C2A;
      border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.28);animation:pop .42s cubic-bezier(.34,1.4,.64,1);transition:opacity .15s}
    @keyframes pop{from{transform:translateX(150px) scale(.55);opacity:0}to{transform:none;opacity:1}}
    .pop .strip{height:48px;position:sticky;top:0;z-index:1;cursor:grab;padding:0 8px 0 12px}
    .pop .name{font-size:13.5px}
    .sec{padding:12px 16px 0}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
    label{display:block;font-size:11px;color:#5F5E5A;margin:0 0 3px}
    input,textarea{width:100%;border:1px solid #D3D1C7;border-radius:7px;padding:6px 8px;font-size:12.5px;color:#2C2C2A;background:#fff;outline:none}
    input:focus,textarea:focus{border-color:#7F77DD;box-shadow:0 0 0 3px #EEEDFE}
    input.bad{border-color:#E24B4A;box-shadow:0 0 0 3px #FCEBEB}
    textarea{height:96px;resize:vertical;line-height:1.45}
    .err{font-size:11.5px;color:#A32D2D;margin:8px 0 0;display:none}
    .paper{border:1px solid #E5E3DC;border-radius:8px;padding:14px 16px;background:#fff;font-size:11.5px;line-height:1.55;color:#2C2C2A;max-height:220px;overflow:auto}
    .paper .h{font-size:14px;font-weight:700}
    .paper .c{color:#5F5E5A;margin-bottom:10px}
    .paper .b{white-space:pre-wrap;margin-top:10px}
    .mk{background:#FAEEDA;color:#412402;border-radius:3px;padding:0 2px}
    .mk.miss{background:#FCEBEB;color:#791F1F}
    .frame{width:100%;height:380px;border:1px solid #E5E3DC;border-radius:8px;display:block;background:#F1EFE8}
    .label{font-size:11px;color:#633806;background:#FAEEDA;padding:4px 8px;border-radius:6px;margin:0 0 8px}
    .meta{font-size:11.5px;color:#5F5E5A;margin:6px 0 0}
    .linkbox{display:flex;align-items:center;gap:10px;border:1px solid #E5E3DC;border-radius:8px;padding:8px 10px}
    .linkbox div{flex:1;min-width:0}
    .linkbox p{margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .btn{border:1px solid #B4B2A9;background:#fff;border-radius:7px;padding:6px 10px;font-size:12px;cursor:pointer;color:#2C2C2A;white-space:nowrap}
    .btn:hover{background:#F1EFE8}
    .swatches{display:flex;gap:6px}
    .sw{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;padding:0}
    .sw.on{border-color:#2C2C2A}
    .popfoot{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 16px;border-top:1px solid #F1EFE8;background:#F8F7F4;font-size:12px;color:#5F5E5A}
    .popfoot span.grow{flex:1}
    .pill{font-size:11px;padding:3px 8px;border-radius:6px}
    .pill.ok{background:#EAF3DE;color:#27500A}.pill.no{background:#FCEBEB;color:#791F1F}
    .menu{position:fixed;display:none;background:#fff;border:1px solid #D3D1C7;border-radius:10px;padding:8px 10px;box-shadow:0 10px 30px rgba(0,0,0,.18)}
    .menu p{font-size:11px;color:#5F5E5A;margin:0 0 6px}
    .menu .swatches{display:grid;grid-template-columns:repeat(4,22px)}
    .menu hr{border:0;border-top:1px solid #F1EFE8;margin:8px -10px}
    .menu .del{display:block;width:100%;text-align:left;border:0;background:none;color:#A32D2D;font-size:12.5px;padding:4px 2px;cursor:pointer;border-radius:6px}
    .menu .del:hover{background:#FCEBEB}
    .menu .act{display:block;width:100%;text-align:left;border:0;background:none;color:#2C2C2A;font-size:12.5px;padding:4px 2px;cursor:pointer;border-radius:6px}
    .menu .act:hover{background:#F1EFE8}
    .stack.faqmode{overflow-y:auto;padding:0 10px 10px}
    .orgbox{position:sticky;top:0;z-index:1;background:#F8F7F4;padding:2px 0 10px}
    .orgbox p{font-size:10.5px;color:#888780;margin:4px 0 0}
    .faqlist{display:flex;flex-direction:column;gap:8px}
    .faq{position:relative;background:#fff;border:1px solid #D3D1C7;border-radius:10px;padding:9px 30px 9px 11px;cursor:pointer;user-select:none;transition:border-color .12s,box-shadow .12s}
    .faq:hover{border-color:#AFA9EC;box-shadow:0 4px 12px rgba(83,74,183,.12)}
    .faq .q{font-size:12.5px;font-weight:600;line-height:1.35}
    .faq .a{font-size:11.5px;color:#5F5E5A;margin-top:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .faq .a.none{color:#BA7517;font-style:italic}
    .faq .copy{position:absolute;top:8px;right:9px;color:#888780;font-size:13px}
    .faq:hover .copy{color:#534AB7}
    .menu .confirm{font-size:12px;color:#2C2C2A;margin:0 0 8px;max-width:180px}
    .menu .row{display:flex;gap:6px}
    .menu .row button{flex:1;border:1px solid #B4B2A9;background:#fff;border-radius:7px;padding:5px 8px;font-size:12px;cursor:pointer}
    .menu .row .yes{background:#A32D2D;border-color:#A32D2D;color:#fff}
    .date{flex:none;font-size:10.5px;opacity:.8;white-space:nowrap}
  `;

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const openManager = () => chrome.runtime.sendMessage({ type: 'cvdeck:manager' });

  function strip(card, extra = []) {
    const [bg, fg] = PALETTE[card.color] || PALETTE[0];
    const date = CVDeck.cardDate(card);
    return h('div', { class: 'strip', style: `background:${bg};color:${fg}` },
      h('span', { class: 'badge', style: `color:${fg}` }, CVDeck.badge(card)),
      h('span', { class: 'name' }, card.name),
      h('span', { class: 'date', title: 'Added ' + date.long }, date.short), ...extra); // UI-014
  }

  const subline = (c) => c.kind === 'template' ? 'Template · click to fill in'
    : c.kind === 'link' ? c.url.replace(/^https?:\/\//, '')
    : `${c.fileName} · ${CVDeck.formatSize(c.size)}`;

  /* ---------- drag sources ---------- */
  const STALE = 'CV Deck was updated. Reload this page to keep using it.';

  function startDrag(e, card) {
    if (orphaned()) { e.preventDefault(); return toast(STALE, 'warn', 6000); }
    e.dataTransfer.setData(MIME, card.id);
    if (card.url) e.dataTransfer.setData(MIME_URL, '1');
    if (card.kind !== 'link') e.dataTransfer.setData(MIME_FILE, '1');
    e.dataTransfer.effectAllowed = 'copy';
    dragging = true;
    setTimeout(() => { // FR-025, UI-012 (deferred so the drag image is captured first)
      if (!dragging) return;
      ui.drawer.classList.add('ghost');
      popped?.el.classList.add('ghost');
      ui.dim.style.display = 'none';
    }, 0);
  }
  function endDrag() {
    dragging = false;
    ui.drawer.classList.remove('ghost');
    popped?.el.classList.remove('ghost');
    if (popped) ui.dim.style.display = 'block';
    hideHighlight();
  }

  /* ---------- deck ---------- */
  function cardEl(card, i) {
    const el = h('div', { class: 'card', draggable: 'true', title: card.name }, // A-07
      strip(card), h('p', { class: 'sub' }, subline(card)),
      h('div', { class: 'bar', style: 'width:150px' }), h('div', { class: 'bar', style: 'width:105px' }));
    el.addEventListener('mouseenter', () => { hov = i; layout(); });
    el.addEventListener('mouseleave', () => { hov = null; layout(); });
    el.addEventListener('click', () => openPop(card));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); colorMenu(card, e); });
    el.addEventListener('dragstart', (e) => {
      if (card.kind === 'template') { e.preventDefault(); openPop(card); return; } // BR-14
      startDrag(e, card);
    });
    el.addEventListener('dragend', endDrag);
    return el;
  }

  function layout() { // UI-003, FR-014
    const mid = (cardEls.length - 1) / 2;
    cardEls.forEach((el, i) => {
      let x = 0, y = i * STEP, r = (i - mid) * 1.1, s = 1;
      if (hov !== null) {
        if (i === hov) { x = -18; s = 1.04; r = 0; }
        else if (i > hov) y += 64 / (i - hov + 0.4);
      }
      el.style.zIndex = i === hov ? 50 : i;
      el.style.transform = `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`;
    });
  }

  function render() {
    if (!shadow) return;
    for (const b of ui.tabs) {
      const d = b.dataset.deck;
      b.classList.toggle('on', d === tab);
      b.textContent = d === 'faq' ? `FAQ ${faq.length}` : `${CVDeck.DECKS[d]} ${cards.filter((c) => c.deck === d).length}`;
    }
    if (tab === 'faq') return renderFaq();
    ui.stack.classList.remove('faqmode');
    const deck = cards.filter((c) => c.deck === tab);
    const pages = Math.max(1, Math.ceil(deck.length / PAGE_SIZE));
    if (page[tab] >= pages) page[tab] = 0;
    const slice = deck.slice(page[tab] * PAGE_SIZE, page[tab] * PAGE_SIZE + PAGE_SIZE);
    hov = null;
    cardEls = slice.map(cardEl);
    if (cardEls.length) ui.stack.replaceChildren(...cardEls);
    else ui.stack.replaceChildren(h('div', { class: 'empty' },
      `No ${CVDeck.DECKS[tab].toLowerCase()} yet. `, h('button', { class: 'link', onclick: openManager }, 'Add some')));
    layout();

    const after = deck.length - (page[tab] + 1) * PAGE_SIZE;
    ui.more.style.display = pages > 1 ? 'block' : 'none';
    ui.more.textContent = after > 0 ? `Show ${Math.min(after, PAGE_SIZE)} more ▾` : `Back to first ${PAGE_SIZE} ▴`;
    ui.hint.textContent = tab === 'cl'
      ? 'Click a template to fill it in. Right-click a card for color, download or delete; right-click empty space to add.'
      : 'Drag a card onto the form, or click it to preview. Right-click a card for more; right-click empty space to add.';
  }

  /* ---------- FAQ tab (FR-080..FR-087) ---------- */
  function faqBlocked(item) { // BR-18, BR-19
    if (!item.answer.trim()) { toast('No answer yet. Add it in settings.', 'warn'); return true; }
    if (CVDeck.needsOrg(item.answer) && !org.trim()) {
      ui.orgInput.classList.add('bad');
      ui.orgInput.focus();
      toast('Add the organization first.', 'warn');
      return true;
    }
    return false;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = h('textarea', { style: 'position:fixed;left:-9999px' }, text); // pages that block the async clipboard
    shadow.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  function faqRow(item) {
    const answer = CVDeck.fill(item.answer, { organization: org });
    const row = h('div', { class: 'faq', draggable: 'true', title: 'Click to copy the answer, or drag it onto a text box' },
      h('div', { class: 'q' }, CVDeck.fill(item.question, { organization: org })),
      item.answer.trim() ? h('div', { class: 'a' }, answer) : h('div', { class: 'a none' }, 'No answer yet. Add it in settings.'),
      h('span', { class: 'copy', 'aria-hidden': 'true' }, '⧉'));
    row.addEventListener('click', async () => { // FR-084
      if (faqBlocked(item)) return;
      toast((await copyText(answer)) ? 'Copied your answer' : 'Copy failed. Drag the question onto the text box instead.', 'ok', 2500);
    });
    row.addEventListener('dragstart', (e) => { // FR-085
      if (orphaned()) { e.preventDefault(); return toast(STALE, 'warn', 6000); }
      if (faqBlocked(item)) return e.preventDefault();
      e.dataTransfer.setData(CVDeck.MIME_FAQ, item.id);
      e.dataTransfer.effectAllowed = 'copy';
      dragging = true;
      setTimeout(() => { if (dragging) ui.drawer.classList.add('ghost'); }, 0);
    });
    row.addEventListener('dragend', endDrag);
    row.addEventListener('contextmenu', (e) => e.stopPropagation()); // no add-menu on rows
    return row;
  }

  function renderFaq() {
    ui.stack.classList.add('faqmode');
    if (ui.stack.firstChild !== ui.orgBox) ui.stack.replaceChildren(ui.orgBox, ui.faqList); // keep focus in the field
    if (shadow.activeElement !== ui.orgInput) ui.orgInput.value = org;
    ui.faqList.replaceChildren(...(faq.length ? faq.map(faqRow)
      : [h('div', { class: 'empty' }, 'No questions yet. ', h('button', { class: 'link', onclick: openManager }, 'Add some'))]));
    ui.more.style.display = 'none';
    ui.hint.textContent = 'Click a question to copy its answer, or drag it onto a text box.';
  }

  /* ---------- add menu on empty space (FR-044) ---------- */
  function pickFiles(deck) {
    const input = h('input', { type: 'file', accept: '.pdf,.docx', multiple: true });
    input.addEventListener('change', async () => {
      const errors = [];
      let added = 0;
      for (const f of input.files) {
        try { await CVDeck.addFile(deck, f); added++; } catch (err) { errors.push(err.message); } // ERR-003, ERR-004
      }
      if (added) toast(`Added ${added} file${added > 1 ? 's' : ''} to ${CVDeck.DECKS[deck]}`);
      if (errors.length) toast(errors.join(' '), 'error', 6000);
    });
    input.click();
  }

  function addMenu(e) {
    const hide = () => { ui.menu.style.display = 'none'; };
    const item = (label, fn) => h('button', { class: 'act', onclick: (ev) => { ev.stopPropagation(); hide(); fn(); } }, label);
    const actions = {
      cv: item('Add CV files…', () => pickFiles('cv')),
      pf: item('Add portfolio file…', () => pickFiles('pf')),
      cl: item('New template', async () => { await CVDeck.addTemplate('New template', CVDeck.STARTER_TEMPLATE); openManager(); }),
      faq: item('Add question', async () => { await CVDeck.addFaq(); chrome.runtime.sendMessage({ type: 'cvdeck:manager', section: 'faq' }); }),
    };
    ui.menu.replaceChildren(actions[tab]);
    Object.assign(ui.menu.style, { display: 'block', left: Math.min(e.clientX, innerWidth - 200) + 'px', top: Math.min(e.clientY, innerHeight - 60) + 'px' });
  }

  /* ---------- color menu (FR-042) ---------- */
  function swatches(current, onPick) {
    return h('div', { class: 'swatches' }, PALETTE.map(([bg], k) =>
      h('button', { class: 'sw' + (k === current ? ' on' : ''), style: `background:${bg}`, 'aria-label': `Color ${k + 1}`,
        onclick: (e) => { e.stopPropagation(); onPick(k); } })));
  }
  function colorMenu(card, e) { // FR-042, FR-043
    const hide = () => { ui.menu.style.display = 'none'; };
    const askDelete = (ev) => {
      ev.stopPropagation();
      ui.menu.replaceChildren(
        h('p', { class: 'confirm' }, `Delete "${card.name}"? This cannot be undone.`),
        h('div', { class: 'row' },
          h('button', { onclick: (x) => { x.stopPropagation(); hide(); } }, 'Cancel'),
          h('button', { class: 'yes', onclick: (x) => { x.stopPropagation(); hide(); CVDeck.remove(card.id); } }, 'Delete')));
    };
    const download = async (ev) => { // FR-073
      ev.stopPropagation();
      hide();
      if (card.kind !== 'template') return downloadCard(card);
      const draft = await CVDeck.getDraft(card.id);
      if (CVDeck.missingRequired(draft.values).length || !profile.name) { // BR-16
        await openPop(card);
        return templateReady('downloading');
      }
      downloadCard(card);
    };
    ui.menu.replaceChildren(
      h('p', {}, 'Card color'),
      swatches(card.color, (k) => { hide(); CVDeck.update(card.id, { color: k }); }),
      h('hr'),
      card.kind !== 'link' ? h('button', { class: 'act', onclick: download }, 'Download') : null, // BR-17
      h('button', { class: 'del', onclick: askDelete }, 'Delete card…'));
    Object.assign(ui.menu.style, { display: 'block', left: Math.min(e.clientX, innerWidth - 200) + 'px', top: Math.min(e.clientY, innerHeight - 140) + 'px' });
  }

  /* ---------- popped card (FR-030..038, FR-060..064) ---------- */
  function closePop() { // FR-035
    popped = null;
    ui.layer.replaceChildren();
    ui.dim.style.display = 'none';
  }

  async function openPop(card) {
    if (orphaned()) return toast(STALE, 'warn', 6000);
    ui.menu.style.display = 'none';
    const draft = card.kind === 'template' ? await CVDeck.getDraft(card.id) : null;
    const el = h('div', { class: 'pop' });
    popped = { card, draft, el };
    const close = h('button', { class: 'icon', title: 'Close', 'aria-label': 'Close', onclick: closePop }, '✕');
    const head = strip(card, [close]);
    head.setAttribute('draggable', 'true');
    head.title = 'Drag onto the form';
    close.style.color = 'inherit';
    el.append(head, ...(card.kind === 'template' ? templateBody(card, draft) : fileBody(card)));

    head.addEventListener('dragstart', (e) => {
      if (card.kind === 'template') {
        if (!templateReady('dragging')) return e.preventDefault();
        popped.flush();
      }
      startDrag(e, card);
    });
    head.addEventListener('dragend', endDrag);
    ui.layer.replaceChildren(el);
    ui.dim.style.display = 'block';
  }

  function templateBody(card, draft) {
    const values = draft.values;
    const saveDraft = debounce(() => CVDeck.setDraft(card.id, draft), 300);
    const inputs = {};
    const grid = h('div', { class: 'grid' }, FIELDS.map((f) => {
      const input = h('input', { value: values[f.key] || '', placeholder: f.placeholder });
      input.addEventListener('input', () => {
        values[f.key] = input.value.trim();
        input.classList.remove('bad');
        ui.err.style.display = 'none';
        saveDraft();
        update();
      });
      inputs[f.key] = input;
      return h('div', {}, h('label', {}, f.label + (f.required ? ' *' : '')), input);
    }));
    const text = h('textarea', {}, draft.edited ?? card.text);
    text.addEventListener('input', () => { // FR-036: draft only, template unchanged
      draft.edited = text.value === card.text ? null : text.value;
      saveDraft();
      update();
    });

    const paper = h('div', { class: 'paper' });
    const pill = h('span', { class: 'pill' });
    ui.err = h('p', { class: 'err' });
    popped.inputs = inputs;
    popped.flush = () => CVDeck.setDraft(card.id, draft);

    function marked(src) { // FR-038
      const out = [];
      let last = 0;
      src.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k, idx) => {
        out.push(src.slice(last, idx));
        out.push(h('span', { class: 'mk' + (values[k] ? '' : ' miss') }, values[k] || m));
        last = idx + m.length;
      });
      out.push(src.slice(last));
      return out;
    }
    function update() {
      const contact = [profile.email, profile.phone].filter(Boolean).join('  ·  ');
      const rec = ['recipient', 'recipient_title', 'organization'].filter((k) => values[k])
        .map((k) => h('div', {}, h('span', { class: 'mk' }, values[k])));
      paper.replaceChildren(
        h('div', { class: 'h' }, profile.name || 'Your name'),
        h('div', { class: 'c' }, contact || 'Add your email and phone in the profile'),
        h('div', {}, CVDeck.letterDate()),
        h('div', { style: 'margin-top:10px' }, rec),
        h('div', { class: 'b' }, marked(draft.edited ?? card.text)));
      const ready = !CVDeck.missingRequired(values).length && profile.name; // UI-013
      pill.className = 'pill ' + (ready ? 'ok' : 'no');
      pill.textContent = ready ? 'Ready' : 'Fill required fields';
    }
    popped.update = update;
    update();

    return [
      h('div', { class: 'sec' }, grid, ui.err),
      h('div', { class: 'sec' }, h('label', {}, 'Letter text · changes apply to this application only'), text),
      h('div', { class: 'sec' }, h('label', {}, 'Preview'), paper),
      h('div', { class: 'popfoot' }, h('span', { class: 'grow' }, 'Drag the colored strip onto the cover letter field'), pill, downloadBtn(downloadTemplate)),
    ];
  }

  // BR-01, BR-02, BR-16: checks the popped template; highlights what is missing.
  function templateReady(action) {
    const missing = CVDeck.missingRequired(popped.draft.values);
    if (missing.length) {
      missing.forEach((f) => popped.inputs[f.key].classList.add('bad'));
      ui.err.replaceChildren(`Fill in ${missing.map((f) => f.label).join(' and ')} before ${action}.`);
      ui.err.style.display = 'block';
      return false;
    }
    if (!profile.name) {
      ui.err.replaceChildren('Add your name in the profile first. ', h('button', { class: 'link', onclick: openManager }, 'Open profile settings'));
      ui.err.style.display = 'block';
      return false;
    }
    return true;
  }

  async function downloadTemplate() { // FR-072
    if (!templateReady('downloading')) return;
    await popped.flush();
    downloadCard(popped.card);
  }

  const downloadBtn = (onclick) => h('button', { class: 'btn', onclick }, 'Download ↓'); // FR-070

  function fileBody(card) {
    const parts = [];
    if (card.kind === 'file') { // FR-061, FR-062
      parts.push(h('div', { class: 'sec' },
        card.mime !== 'application/pdf' ? h('p', { class: 'label' }, 'Preview, may differ from Word') : null,
        h('iframe', { class: 'frame', src: chrome.runtime.getURL('preview.html?id=' + encodeURIComponent(card.id)) }),
        h('p', { class: 'meta' }, `${card.fileName} · ${CVDeck.formatSize(card.size)}`)));
    }
    if (card.url) { // FR-063, FR-055
      parts.push(h('div', { class: 'sec' }, h('div', { class: 'linkbox' },
        h('div', {}, h('p', { style: 'font-size:12.5px' }, card.title || card.url), h('p', { style: 'font-size:11.5px;color:#5F5E5A' }, card.url)),
        h('button', { class: 'btn', onclick: () => chrome.runtime.sendMessage({ type: 'cvdeck:openLink', url: card.url }) }, 'Open link ↗'))));
    }
    const notes = h('input', { value: card.notes || '', placeholder: 'When to use this card' }); // FR-064
    const saveNotes = debounce(() => CVDeck.update(card.id, { notes: notes.value }), 400);
    notes.addEventListener('input', saveNotes);
    parts.push(h('div', { class: 'sec' }, h('label', {}, 'Notes'), notes));
    parts.push(h('div', { class: 'sec' }, h('label', {}, 'Color'), swatches(card.color, (k) => CVDeck.update(card.id, { color: k }))));
    parts.push(h('div', { class: 'popfoot' }, h('span', { class: 'grow' },
      card.kind === 'link' ? 'Drag the colored strip onto a text field' : 'Drag the colored strip onto the form'),
      card.kind === 'file' ? downloadBtn(() => downloadCard(card)) : null)); // FR-071, BR-17
    return parts;
  }

  /* ---------- mount / toggle ---------- */
  function mount() {
    if (drawerHost?.isConnected) return;
    drawerHost = document.createElement('cvdeck-drawer');
    drawerHost.style.cssText = 'all:initial;position:fixed;top:0;right:0;z-index:2147483646;';
    shadow = drawerHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style>`;

    ui.dim = h('div', { class: 'dim', onclick: closePop }); // FR-035
    ui.layer = h('div');
    ui.tabs = [...Object.keys(CVDeck.DECKS), 'faq'].map((d) => h('button', { 'data-deck': d, onclick: () => { tab = d; closePop(); render(); } }));
    ui.stack = h('div', { class: 'stack' });
    ui.stack.addEventListener('contextmenu', (e) => { // FR-044
      if (e.composedPath()[0].closest?.('.orgbox')) return; // keep the normal menu (paste) in the field
      e.preventDefault();
      addMenu(e);
    });
    ui.orgInput = h('input', { placeholder: 'Acme Corp', 'aria-label': 'Organization' }); // FR-081
    const saveOrg = debounce(() => CVDeck.setOrg(org), 300);
    ui.orgInput.addEventListener('input', () => {
      org = ui.orgInput.value.trim();
      ui.orgInput.classList.remove('bad');
      saveOrg();
      ui.faqList.replaceChildren(...faq.map(faqRow));
    });
    ui.orgBox = h('div', { class: 'orgbox' },
      h('label', {}, 'Organization'), ui.orgInput,
      h('p', {}, 'Fills {{organization}} in answers and cover letters.'));
    ui.faqList = h('div', { class: 'faqlist' });
    ui.more = h('button', { class: 'more', onclick: () => { const n = Math.ceil(cards.filter((c) => c.deck === tab).length / PAGE_SIZE); page[tab] = (page[tab] + 1) % n; render(); } });
    ui.hint = h('p', { class: 'hint' });
    ui.mini = h('button', { class: 'mini', title: 'Show CV Deck', onclick: () => setMinimized(false) }, 'CV');
    ui.menu = h('div', { class: 'menu' });
    ui.drawer = h('aside', { class: 'drawer' },
      h('header', {},
        h('div', { class: 'logo' }, 'CV'), h('div', { class: 'title' }, 'CV Deck'),
        h('button', { class: 'icon', title: 'Manage cards and profile', onclick: openManager }, '⚙'),
        h('button', { class: 'icon', title: 'Minimize', onclick: () => setMinimized(true) }, '–'),
        h('button', { class: 'icon', title: 'Close', onclick: () => setOpen(false) }, '✕')),
      h('nav', { class: 'tabs' }, ui.tabs),
      ui.stack,
      h('div', { class: 'foot' }, ui.more, ui.hint));
    shadow.append(ui.dim, ui.layer, ui.drawer, ui.mini, ui.menu);
    shadow.addEventListener('click', (e) => { if (!ui.menu.contains(e.composedPath()[0])) ui.menu.style.display = 'none'; });
    for (const t of ['keydown', 'keyup', 'keypress']) shadow.addEventListener(t, (e) => e.stopPropagation());
    document.documentElement.appendChild(drawerHost);
    render();
  }

  function setMinimized(min) {
    if (min) closePop();
    ui.drawer.style.display = min ? 'none' : 'flex';
    ui.mini.style.display = min ? 'block' : 'none';
  }

  async function setOpen(open) {
    await loaded;
    const origins = new Set((await chrome.storage.local.get(ORIGINS_KEY))[ORIGINS_KEY] || []);
    open ? origins.add(location.origin) : origins.delete(location.origin);
    chrome.storage.local.set({ [ORIGINS_KEY]: [...origins] });
    if (open) { mount(); setMinimized(false); }
    else { drawerHost?.remove(); drawerHost = shadow = null; popped = null; ui = {}; }
  }

  document.addEventListener('click', () => { if (ui.menu) ui.menu.style.display = 'none'; });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'cvdeck:toggle') setOpen(!drawerHost?.isConnected);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.profile) { profile = changes.profile.newValue || { name: '' }; popped?.update?.(); }
    if (changes.faq) { faq = changes.faq.newValue || []; render(); }
    if (changes['app:organization']) { // DATA-007: keep the FAQ tab and an open template in step
      org = changes['app:organization'].newValue || '';
      if (tab === 'faq') render();
      const input = popped?.inputs?.organization;
      if (input && shadow.activeElement !== input) {
        input.value = org;
        popped.draft.values.organization = org;
        popped.update();
      }
    }
    if (changes.cards) {
      cards = changes.cards.newValue || [];
      render();
      if (popped) {
        const fresh = cards.find((c) => c.id === popped.card.id);
        if (!fresh) closePop();
        else if (fresh.color !== popped.card.color) {
          popped.card.color = fresh.color;
          const [bg, fg] = PALETTE[fresh.color];
          const s = popped.el.querySelector('.strip');
          s.style.background = bg; s.style.color = fg;
          s.querySelector('.badge').style.color = fg;
          popped.el.querySelectorAll('.sw').forEach((b, k) => b.classList.toggle('on', k === fresh.color));
        }
      }
    }
  });

  loaded.then((o) => {
    if ((o[ORIGINS_KEY] || []).includes(location.origin)) mount(); // A-06
  });
})();
