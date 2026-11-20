const ALLOWED_DISCORD_ORIGINS = /^https:\/\/(?:canary\.|ptb\.)?discord\.com(?:\/|$)/;

chrome.runtime.onInstalled.addListener(() => {
  console.info('Discord Auto Quest extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  if (request?.action !== 'executeQuestCode') {
    return false;
  }

  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url || sender.url || '';

  if (!tabId || !ALLOWED_DISCORD_ORIGINS.test(tabUrl)) {
    sendResponse({ success: false, error: 'Invalid sender tab or origin' });
    return false;
  }

  const manifest = chrome.runtime.getManifest();
  chrome.scripting.executeScript({
    target: { tabId },
    func: (version) => { window.__QUEST_VERSION = version; },
    args: [manifest.version],
    world: 'MAIN'
  }).then(() => {
    return chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/quest-runner.js'],
      world: 'MAIN'
    });
  }).then(() => {
    sendResponse({ success: true });
  }).catch((error) => {
    console.error('Error injecting quest code:', error);
    sendResponse({ success: false, error: error.message });
  });

  return true;
});
