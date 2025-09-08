async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function updateStatus() {
  const tab = await getCurrentTab();
  if (!tab) return;

  // Try to send RESCAN to existing content script
  // If it fails, just ignore - some pages can't have content scripts
  try {
    await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "RESCAN" }, () => {
        if (chrome.runtime.lastError) {
          // Content script not available - this is normal for some pages
          console.debug(
            "Content script not available (this is normal for system pages):",
            chrome.runtime.lastError.message
          );
        }
        resolve(); // Always resolve, never reject
      });
    });
  } catch (e) {
    // Even if there's an error, don't throw - just log it
    console.debug("Failed to send RESCAN message:", e);
  }
}

// Swallow unexpected rejections/errors to avoid cryptic extension errors UI
window.addEventListener("unhandledrejection", (e) => {
  try {
    e.preventDefault();
  } catch (_) {}
  try {
    console.warn("Unhandled rejection in popup:", e && e.reason);
  } catch (_) {}
});
window.addEventListener("error", (e) => {
  try {
    console.warn("Unhandled error in popup:", e && (e.error || e.message));
  } catch (_) {}
});

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("pipBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const shortcutHint = document.getElementById("shortcutHint");
  if (!statusEl || !btn || !refreshBtn || !shortcutHint) {
    try {
      console.warn("Popup elements missing");
    } catch (_) {}
    return;
  }

  function renderState(state) {
    const hasVideo = !!(state && state.hasVideo);
    if (hasVideo) {
      // Simplified: always show "detected video" without count
      statusEl.textContent = chrome.i18n.getMessage("statusDetectedOne");
      btn.disabled = false;
      btn.textContent = chrome.i18n.getMessage("btnOpen");
      shortcutHint.style.display = "block";
    } else {
      statusEl.textContent = chrome.i18n.getMessage("statusNoVideo");
      btn.disabled = true;
      btn.textContent = chrome.i18n.getMessage("btnNoVideo");
      shortcutHint.style.display = "none";
    }
  }

  btn.addEventListener("click", async () => {
    const tab = await getCurrentTab();
    if (!tab) return;

    // Simply try to send DO_PIP message
    // If it fails, it means the page doesn't support content scripts - that's fine
    chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not available - this is normal for some pages
        console.debug(
          "DO_PIP failed (normal for system pages):",
          chrome.runtime.lastError.message
        );
      }
      // Don't need to do anything else - either it worked or the page doesn't support it
    });
  });

  // Add refresh button click handler
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent =
      chrome.i18n.getMessage("statusScanning") || "Scanning...";

    // Try to trigger a rescan - if it fails, that's fine
    await updateStatus();

    // Wait a moment for any potential detection to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get updated state after refresh attempt
    const tab = await getCurrentTab();
    const state = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_STATE_FOR_POPUP", tabId: tab && tab.id },
        (resp) => {
          // Check for runtime error
          if (chrome.runtime.lastError) {
            console.debug(
              "Background script not available:",
              chrome.runtime.lastError.message
            );
            resolve({ hasVideo: false, count: 0 });
            return;
          }
          // Use the actual response from background script
          resolve(resp || { hasVideo: false, count: 0 });
        }
      );
    });
    renderState(state);

    refreshBtn.disabled = false;
    refreshBtn.textContent = chrome.i18n.getMessage("btnRefresh") || "Refresh";
  });

  // Don't auto-update on popup open, let user control refresh manually
  // await updateStatus();

  // Query background for current state and render
  try {
    const tab = await getCurrentTab();
    const state = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "GET_STATE_FOR_POPUP", tabId: tab && tab.id },
        (resp) => {
          // Check for runtime error
          if (chrome.runtime.lastError) {
            console.debug(
              "Background script not available:",
              chrome.runtime.lastError.message
            );
            resolve({ hasVideo: false, count: 0 });
            return;
          }
          // Use the actual response from background script
          resolve(resp || { hasVideo: false, count: 0 });
        }
      );
    });
    renderState(state);
  } catch (_) {
    try {
      statusEl.textContent = chrome.i18n.getMessage("statusReady");
      renderState({ hasVideo: false, count: 0 });
    } catch (_) {}
  }
});
