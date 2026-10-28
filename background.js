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

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
