const tabVideoState = new Map();

// Pre-resolve icon URLs to absolute extension URLs to avoid fetch issues
const ICON_COLOR_URL = chrome.runtime.getURL("assets/icons/logo.png");
const ICON_GRAY_URL = chrome.runtime.getURL("assets/icons/logo_gray.png");

function markNoVideo(tabId) {
  updateState(tabId, { hasVideo: false, count: 0 });
}

function setIconForTab(tabId, hasVideo, count) {
  const path = hasVideo ? ICON_COLOR_URL : ICON_GRAY_URL;
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
  // Provide current state to popup
  if (message && message.type === "GET_STATE_FOR_POPUP") {
    const msgTabId =
      message && typeof message.tabId === "number" ? message.tabId : null;
    const senderTabId =
      sender.tab && sender.tab.id != null ? sender.tab.id : null;
    const useTabId = msgTabId != null ? msgTabId : senderTabId;
    if (useTabId != null) {
      const state = tabVideoState.get(useTabId) || {
        hasVideo: false,
        count: 0,
      };
      sendResponse(state);
      return true;
    }
    // Fallback: query active tab in current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      const activeId = tab && tab.id != null ? tab.id : null;
      const state =
        activeId != null
          ? tabVideoState.get(activeId) || { hasVideo: false, count: 0 }
          : { hasVideo: false, count: 0 };
      sendResponse(state);
    });
    return true; // keep the message channel open for async response
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
      iconUrl: ICON_GRAY_URL,
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

// Keyboard command: toggle PiP via Ctrl+Alt+V (configured in manifest)
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") return;
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || tab.id == null) return;
    // Nudge a rescan to refresh detection
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "RESCAN" });
    } catch (_) {}
    // Always attempt PiP regardless of cached state to match popup behavior
    chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" }, (resp) => {
      if (chrome.runtime.lastError) {
        // content script not available in this page (e.g., chrome:// or PDF)
        chrome.notifications.create({
          type: "basic",
          iconUrl: ICON_GRAY_URL,
          title: "无法打开小窗",
          message: "该页面不支持或无法注入脚本",
        });
        return;
      }
      const ok = resp && resp.ok;
      if (!ok) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: ICON_GRAY_URL,
          title: "无法打开小窗",
          message: "可能需要用户手势，或页面不支持画中画",
        });
      }
    });
  } catch (_) {}
});
