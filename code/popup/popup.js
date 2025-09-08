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
  if (!statusEl || !btn || !refreshBtn) {
    try {
      console.warn("Popup elements missing");
    } catch (_) {}
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
      refreshBtn.style.display = "none";
    } else {
      statusEl.textContent = chrome.i18n.getMessage("statusNoVideo");
      btn.disabled = true;
      btn.textContent = chrome.i18n.getMessage("btnNoVideo");
      refreshBtn.style.display = "block";
    }
  }

  btn.addEventListener("click", async () => {
    const tab = await getCurrentTab();
    if (!tab) return;
    try {
      await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script not available, try to inject it first
            chrome.scripting
              .executeScript({
                target: { tabId: tab.id },
                files: ["content/detect.js"],
              })
              .then(() => {
                // Retry after injection
                setTimeout(() => {
                  chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" }, () =>
                    resolve()
                  );
                }, 100);
              })
              .catch(() => {
                reject(new Error("Cannot inject content script"));
              });
          } else {
            resolve();
          }
        });
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

  // Add refresh button click handler
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent =
      chrome.i18n.getMessage("statusScanning") || "Scanning...";

    try {
      await updateStatus();

      // Get updated state after refresh
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
    } catch (e) {
      console.warn("Refresh failed:", e);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent =
        chrome.i18n.getMessage("btnRefresh") || "Refresh";
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
    try {
      statusEl.textContent = chrome.i18n.getMessage("statusReady");
    } catch (_) {}
  }
});
