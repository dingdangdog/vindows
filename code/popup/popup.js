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

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");
  const btn = document.getElementById("pipBtn");

  function renderState(state) {
    const hasVideo = !!(state && state.hasVideo);
    const count = state && state.count ? state.count : 0;
    if (hasVideo) {
      statusEl.textContent =
        count > 1 ? `检测到 ${count} 个视频` : "检测到 1 个视频";
      btn.disabled = false;
      btn.textContent = "开启小窗";
    } else {
      statusEl.textContent = "未检测到可用视频";
      btn.disabled = true;
      btn.textContent = "无可用视频";
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
    statusEl.textContent = "准备就绪";
  }
});
