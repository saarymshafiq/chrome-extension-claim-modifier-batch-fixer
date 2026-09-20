// Opens each claim URL in its own tab, waits for it to finish loading, then
// explicitly injects content.js. This is more reliable than relying purely on
// manifest-declared content_scripts, especially for background/inactive tabs
// and SPA pages where the DOM isn't ready right at document_idle.

function injectWhenReady(tabId) {
  function listener(updatedTabId, changeInfo) {
    if (updatedTabId === tabId && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      // Small extra delay to let the Ember SPA render the modal content
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }).catch(err => {
          console.warn('[SP Fixer] Injection failed for tab', tabId, err);
        });
      }, 800);
    }
  }
  chrome.tabs.onUpdated.addListener(listener);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_BATCH' && Array.isArray(msg.urls)) {
    msg.urls.forEach((url, i) => {
      setTimeout(() => {
        chrome.tabs.create({ url, active: false }, (tab) => {
          if (tab && tab.id) injectWhenReady(tab.id);
        });
      }, i * 700);
    });
    sendResponse({ ok: true });
  }
  return true;
});
