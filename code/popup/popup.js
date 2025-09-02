async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateStatus() {
  const tab = await getCurrentTab();
  if (!tab) return;
  try {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' }, () => {
        resolve();
      });
    });
  } catch (e) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const btn = document.getElementById('pipBtn');

  btn.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    try {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: 'DO_PIP' }, () => resolve());
      });
    } catch (e) {
      // if content script not ready, try nudge with RESCAN
      try {
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' }, () => resolve());
        });
      } catch (_) {}
    }
  });

  await updateStatus();
  statusEl.textContent = '准备就绪';
});


