const { PALETTE } = CVDeck;
const STARTER = CVDeck.STARTER_TEMPLATE;

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
// Debounced save that merges every field changed in the wait window, so
// editing two fields quickly does not drop the first change.
const patchSaver = (fn, ms) => {
  let pending = {};
  const flush = debounce(() => { const p = pending; pending = {}; fn(p); }, ms);
  return (patch) => { Object.assign(pending, patch); flush(); };
};
const section = (deck) => document.querySelector(`section[data-deck="${deck}"]`);

function showError(deck, msg) {
  const el = section(deck).querySelector('.error');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

async function addFiles(deck, files) { // FR-001, FR-002, ERR-003, ERR-004
  const errors = [];
  for (const f of files) {
    try { await CVDeck.addFile(deck, f); } catch (e) { errors.push(e.message); }
  }
  showError(deck, errors.join(' '));
}

/* ---------- card editor ---------- */
function field(label, input) { return h('label', {}, label, input); }

function editor(card) {
  const [bg, fg] = PALETTE[card.color] || PALETTE[0];
  const save = patchSaver((patch) => CVDeck.update(card.id, patch), 350);
  const input = (key, attrs = {}) => h('input', { value: card[key] || '', ...attrs, oninput: (e) => save({ [key]: e.target.value }) });

  const name = h('input', { value: card.name, 'aria-label': 'Card name', oninput: (e) => save({ name: e.target.value || 'Untitled' }) }); // FR-004
  const body = h('div', { class: 'body' });

  if (card.kind === 'file') {
    const ext = '.' + CVDeck.ext(card.fileName);
    const fname = h('input', {
      value: card.fileName,
      oninput: (e) => { // FR-004: display file name; keep the real extension
        let v = e.target.value.trim() || 'file';
        if (!v.toLowerCase().endsWith(ext)) v += ext;
        save({ fileName: v });
      },
    });
    body.append(
      field('File name shown to the job site', fname),
      h('div', { class: 'meta' }, `${CVDeck.ext(card.fileName).toUpperCase()} · ${CVDeck.formatSize(card.size)}`));
  }
  if (card.kind === 'template') { // FR-005
    body.append(field('Template text', h('textarea', { value: card.text, oninput: (e) => save({ text: e.target.value }) })));
  }
  if (card.deck === 'pf') { // FR-002: file, link, or both
    body.append(h('div', { class: 'two' },
      field('URL', input('url', { type: 'url', placeholder: 'https://' })),
      field('Page title', input('title', { placeholder: 'Shown on the card' }))));
  }
  body.append(field('Notes', input('notes', { placeholder: 'When to use this card' })));
  body.append(field('Color', h('div', { class: 'swatches' }, PALETTE.map(([c], k) => // FR-041
    h('button', { class: 'sw' + (k === card.color ? ' on' : ''), style: `background:${c}`, 'aria-label': `Color ${k + 1}`, onclick: () => CVDeck.update(card.id, { color: k }) })))));

  const foot = h('div', { class: 'foot' });
  if (card.kind === 'file') { // FR-006
    const picker = h('input', { type: 'file', accept: '.pdf,.docx', hidden: '' });
    picker.addEventListener('change', async () => {
      if (!picker.files[0]) return;
      try { await CVDeck.replaceFile(card.id, picker.files[0]); showError(card.deck, ''); }
      catch (e) { showError(card.deck, e.message); }
    });
    foot.append(h('label', { class: 'btn' }, 'Replace file', picker));
  }
  foot.append(h('button', { class: 'btn danger', onclick: () => { // FR-007
    if (confirm(`Delete "${card.name}"? This cannot be undone.`)) CVDeck.remove(card.id).then(render);
  } }, 'Delete'));
  body.append(foot);

  return h('article', { class: 'card', 'data-id': card.id },
    h('div', { class: 'strip', style: `background:${bg};color:${fg}` }, h('span', { class: 'badge', style: `color:${fg}` }, CVDeck.badge(card)), name,
      h('span', { class: 'date', title: 'Added ' + CVDeck.cardDate(card).long }, CVDeck.cardDate(card).short)),
    body);
}

/* ---------- render ---------- */
async function render() {
  const cards = await CVDeck.list();
  for (const deck of Object.keys(CVDeck.DECKS)) {
    const sec = section(deck);
    const list = cards.filter((c) => c.deck === deck);
    sec.querySelector('.count').textContent = list.length;
    const grid = sec.querySelector('.grid');
    grid.classList.toggle('wide', deck === 'cl');
    grid.replaceChildren(...(list.length ? list.map(editor) : [h('p', { class: 'empty' }, 'No cards yet.')]));
  }
}

// Re-render on outside changes (drawer colors, saved letters), but never
// while the user is typing in an editor on this page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const typing = document.activeElement?.matches('input, textarea') && document.activeElement.closest('.card, .faqitem');
  if (typing) return;
  if (changes.cards) render();
  if (changes.faq) renderFaq();
});

/* ---------- FAQ (FR-086, FR-087) ---------- */
function faqEditor(item) {
  const save = patchSaver((patch) => CVDeck.updateFaq(item.id, patch), 350);
  const answer = h('textarea', {
    value: item.answer, placeholder: 'Your answer. Use {{organization}} for the company name.',
    class: item.answer.trim() ? null : 'empty-answer',
    oninput: (e) => { e.target.classList.toggle('empty-answer', !e.target.value.trim()); save({ answer: e.target.value }); },
  });
  return h('div', { class: 'faqitem' },
    h('input', { value: item.question, 'aria-label': 'Question', oninput: (e) => save({ question: e.target.value || 'Untitled question' }) }),
    h('button', { class: 'btn danger', onclick: async () => { if (confirm(`Delete "${item.question}"?`)) { await CVDeck.removeFaq(item.id); renderFaq(); } } }, 'Delete'),
    answer);
}

async function renderFaq() {
  const faq = await CVDeck.getFaq();
  const sec = document.getElementById('faq');
  sec.querySelector('.count').textContent = faq.length;
  sec.querySelector('.faqgrid').replaceChildren(...(faq.length ? faq.map(faqEditor) : [h('p', { class: 'empty' }, 'No questions yet.')]));
}

document.querySelector('[data-add="faq"]').addEventListener('click', async () => {
  await CVDeck.addFaq();
  await renderFaq();
  document.querySelector('#faq .faqitem:last-child input').select();
});

/* ---------- profile (FR-009) ---------- */
(async () => {
  const profile = await CVDeck.getProfile();
  const save = debounce(() => CVDeck.setProfile(profile), 300);
  document.querySelectorAll('[data-p]').forEach((inp) => {
    inp.value = profile[inp.dataset.p] || '';
    inp.addEventListener('input', () => { profile[inp.dataset.p] = inp.value.trim(); save(); });
  });
})();

/* ---------- add actions ---------- */
document.querySelectorAll('section[data-deck]').forEach((sec) => {
  const deck = sec.dataset.deck;
  const filePicker = sec.querySelector('input[data-add="file"]');
  if (filePicker) {
    filePicker.addEventListener('change', async () => { await addFiles(deck, [...filePicker.files]); filePicker.value = ''; });
    sec.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); sec.classList.add('dragover'); } });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.classList.remove('dragover'); });
    sec.addEventListener('drop', (e) => { e.preventDefault(); sec.classList.remove('dragover'); addFiles(deck, [...e.dataTransfer.files]); });
  }
});

document.querySelector('[data-add="template"]').addEventListener('click', () => CVDeck.addTemplate('New template', STARTER)); // FR-003

const linkForm = document.querySelector('.linkform');
document.querySelector('[data-add="link"]').addEventListener('click', () => { linkForm.hidden = false; linkForm.elements.url.focus(); });
linkForm.querySelector('[data-cancel]').addEventListener('click', () => { linkForm.hidden = true; linkForm.reset(); });
linkForm.addEventListener('submit', async (e) => { // FR-002
  e.preventDefault();
  const url = linkForm.elements.url.value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return showError('pf', 'Enter a link that starts with http:// or https://');
  await CVDeck.addLink(url, linkForm.elements.title.value.trim());
  showError('pf', '');
  linkForm.reset();
  linkForm.hidden = true;
});

render();
renderFaq().then(() => {
  // "Add question" in the drawer opens this page at #faq: focus the new question.
  if (location.hash === '#faq') document.querySelector('#faq .faqitem:last-child input')?.select();
});
