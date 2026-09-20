const linksEl = document.getElementById('links');
const statusEl = document.getElementById('status');

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.getElementById('grabBtn').addEventListener('click', async () => {
  const tab = await currentTab();
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Each claim row is an <a> wrapping the whole row, linking to a URL with ?modalClaimId=...
      const anchors = Array.from(document.querySelectorAll('a[href*="modalClaimId="]'));
      const hrefs = anchors.map(a => a.href).filter((h, i, arr) => h && arr.indexOf(h) === i);
      return hrefs;
    }
  });
  const found = result.result || [];
  linksEl.value = found.join('\n');
  statusEl.textContent = `Found ${found.length} link(s) on this page.`;
});

document.getElementById('openBtn').addEventListener('click', async () => {
  const urls = linksEl.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) {
    statusEl.textContent = 'No links entered.';
    return;
  }
  statusEl.textContent = `Opening ${urls.length} tab(s)...`;
  await chrome.runtime.sendMessage({ type: 'START_BATCH', urls });
  statusEl.textContent = `Opening ${urls.length} tab(s). Each will correct and save the modifier, then wait for your review.`;
});
