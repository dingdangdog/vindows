async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateStatus() {
  const tab = await getCurrentTab();
  if (!tab) return;
  try {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "RESCAN" }, () => {
        resolve();
      });
    });
  } catch (e) {
    // ignore
  }
}

// Swallow unexpected rejections/errors to avoid cryptic extension errors UI
window.addEventListener('unhandledrejection', (e) => {
  try { e.preventDefault(); } catch (_) {}
  try { console.warn('Unhandled rejection in popup:', e && e.reason); } catch (_) {}
});
window.addEventListener('error', (e) => {
  try { console.warn('Unhandled error in popup:', e && (e.error || e.message)); } catch (_) {}
});

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("pipBtn");
  if (!statusEl || !btn) {
    try { console.warn('Popup elements missing'); } catch (_) {}
    return;
  }

  function renderState(state) {
    const hasVideo = !!(state && state.hasVideo);
    const count = state && state.count ? state.count : 0;
    if (hasVideo) {
      statusEl.textContent =
        count > 1
          ? chrome.i18n.getMessage("statusDetectedMany", String(count))
          : chrome.i18n.getMessage("statusDetectedOne");
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage("btnOpen");
    } else {
      statusEl.textContent = chrome.i18n.getMessage("statusNoVideo");
      btn.disabled = true;
      btn.textContent = chrome.i18n.getMessage("btnNoVideo");
    }
  }

  btn.addEventListener("click", async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    try {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" }, () => resolve());
      });
    } catch (e) {
      // if content script not ready, try nudge with RESCAN
      try {
        await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: "RESCAN" }, () => resolve());
        });
      } catch (_) {}
    }
  });

  await updateStatus();

  // Query background for current state and render
  try {
    const tab = await getCurrentTab();
    const state = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_STATE_FOR_POPUP", tabId: tab && tab.id },
        (resp) => {
          resolve(resp);
        }
      );
    });
    renderState(state);
  } catch (_) {
    try { statusEl.textContent = chrome.i18n.getMessage("statusReady"); } catch (_) {}
  }
});
