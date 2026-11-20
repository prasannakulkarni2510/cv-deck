// FR-010 / FR-011: toggle the drawer. Tabs opened before the extension was
// installed have no content script yet, so inject it on first use.
async function toggle(tab) {
  if (!tab?.id || !/^(https?|file):/.test(tab.url || '')) return; // ERR-006
  const msg = { type: 'cvdeck:toggle' };
  try {
    await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['lib.js', 'content.js'] });
    await chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
  }
}

chrome.action.onClicked.addListener(toggle);

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-drawer') return;
  tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  toggle(tab);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'cvdeck:manager') {
    if (msg.section) chrome.tabs.create({ url: chrome.runtime.getURL('options.html#' + msg.section) });
    else chrome.runtime.openOptionsPage();
  }
  if (msg?.type === 'cvdeck:openLink' && /^https?:\/\//i.test(msg.url)) { // FR-055
    chrome.tabs.create({ url: msg.url, index: (sender.tab?.index ?? 0) + 1 });
  }
});

importScripts('lib.js');

// Optional personal prefill: a prefill.json next to manifest.json (git-ignored,
// so personal data never reaches the repo). It only fills what is empty and
// never overwrites; it runs again only when the file's contents change.
async function applyPrefill() {
  let raw;
  try {
    const res = await fetch(chrome.runtime.getURL('prefill.json'));
    if (!res.ok) return;
    raw = await res.text();
  } catch { return; } // no file: nothing to do
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  hash = `${raw.length}:${hash}`;
  if ((await chrome.storage.local.get('prefill:hash'))['prefill:hash'] === hash) return;
  let data;
  try { data = JSON.parse(raw); } catch (err) { console.warn('CV Deck: prefill.json is not valid JSON.', err); return; }

  if (data.profile) {
    const profile = await CVDeck.getProfile();
    for (const k of ['name', 'email', 'phone']) if (!profile[k] && data.profile[k]) profile[k] = data.profile[k];
    await CVDeck.setProfile(profile);
  }

  if (data.details?.length) {
    const details = await CVDeck.getDetails();
    for (const d of data.details) {
      if (!d.value || details.some((x) => x.type === d.type && x.value === d.value)) continue;
      const empty = details.find((x) => x.type === d.type && !x.value.trim());
      if (empty) empty.value = d.value;
      else details.push({ id: CVDeck.uid(), type: d.type, label: d.label || CVDeck.detailType(d.type).label, value: d.value });
    }
    await CVDeck.saveDetails(details);
  }

  if (data.faq?.length) {
    const faq = await CVDeck.getFaq();
    for (const q of data.faq) {
      const same = faq.find((x) => x.question.trim() === q.question.trim());
      if (!same) faq.push({ id: CVDeck.uid(), question: q.question, answer: q.answer || '' });
      else if (!same.answer.trim() && q.answer) same.answer = q.answer;
    }
    await CVDeck.saveFaq(faq);
  }

  for (const t of data.templates || []) {
    if ((await CVDeck.list()).some((c) => c.kind === 'template' && c.text === t.text)) continue;
    const card = await CVDeck.addTemplate(t.name || 'Cover letter', t.text);
    if (t.notes) await CVDeck.update(card.id, { notes: t.notes });
  }

  for (const f of data.files || []) { // { deck: "cv" | "pf", path: "prefill/CV.pdf", notes? }
    try {
      const res = await fetch(chrome.runtime.getURL(f.path));
      if (!res.ok) throw new Error(res.status);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const fileName = f.path.split('/').pop();
      if ((await CVDeck.list()).some((c) => c.deck === f.deck && c.fileName === fileName && c.size === bytes.length)) continue;
      const type = CVDeck.ext(fileName) === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const card = await CVDeck.addFile(f.deck || 'cv', new File([bytes], fileName, { type }));
      if (f.notes) await CVDeck.update(card.id, { notes: f.notes });
    } catch (err) { console.warn(`CV Deck: could not prefill ${f.path}.`, err); }
  }

  await chrome.storage.local.set({ 'prefill:hash': hash });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await applyPrefill();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
