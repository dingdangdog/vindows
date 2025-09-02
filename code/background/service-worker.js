const tabVideoState = new Map();

function markNoVideo(tabId) {
  updateState(tabId, { hasVideo: false, count: 0 });
}

function setIconForTab(tabId, hasVideo, count) {
  const path = hasVideo
    ? "assets/icons/logo.png"
    : "assets/icons/logo_gray.png";
  chrome.action.setIcon({ tabId, path });
  if (hasVideo && count > 1) {
    chrome.action.setBadgeText({ tabId, text: String(Math.min(count, 9)) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#222" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "" });
  }
}

function updateState(tabId, state) {
  tabVideoState.set(tabId, state);
  setIconForTab(tabId, state.hasVideo, state.count || 0);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message &&
    message.type === "VIDEO_STATE" &&
    sender.tab &&
    sender.tab.id != null
  ) {
    updateState(sender.tab.id, {
      hasVideo: !!message.hasVideo,
      count: message.count || 0,
    });
  }
  if (message && message.type === "REQUEST_PIP_FROM_POPUP") {
    if (sender.tab && sender.tab.id != null) {
      chrome.tabs.sendMessage(sender.tab.id, { type: "DO_PIP" });
    }
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  const state = tabVideoState.get(tab.id) || { hasVideo: false, count: 0 };
  if (state.hasVideo) {
    chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" });
  } else {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icons/icon-128-gray.png",
      title: "未检测到视频",
      message: "当前页面未检测到任何可用的视频元素",
    });
  }
});

function rescanTab(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, { type: "RESCAN" }, () => {
      if (chrome.runtime.lastError) {
        // Content script likely not injected (e.g., chrome:// or PDF). Mark as no video.
        markNoVideo(tabId);
      }
    });
  } catch (e) {
    markNoVideo(tabId);
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  rescanTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    rescanTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoState.delete(tabId);
});
