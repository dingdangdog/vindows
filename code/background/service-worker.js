const tabVideoState = new Map();
let isServiceWorkerReady = false;

// Global error guards to prevent unexpected crashes
self.addEventListener("unhandledrejection", (e) => {
  try {
    e.preventDefault();
  } catch (_) {}
  try {
    console.warn("SW unhandled rejection:", e && e.reason);
  } catch (_) {}
});
self.addEventListener("error", (e) => {
  try {
    console.warn("SW error:", e && (e.error || e.message));
  } catch (_) {}
});

// Mark service worker as ready when installed/activated
self.addEventListener("install", () => {
  isServiceWorkerReady = true;
});

self.addEventListener("activate", () => {
  isServiceWorkerReady = true;
});

// Helper function to safely send messages
function safeSendMessage(tabId, message, callback) {
  if (!isServiceWorkerReady) {
    if (callback) callback();
    return;
  }

  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        // Content script not available, ignore error
        console.debug("Content script not available for tab:", tabId);
      }
      if (callback) callback(response);
    });
  } catch (e) {
    console.debug("Error sending message to tab:", tabId, e);
    if (callback) callback();
  }
}

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
  try {
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
        try {
          sendResponse(state);
        } catch (_) {}
      });
      return true; // keep the message channel open for async response
    }
    if (message && message.type === "REQUEST_PIP_FROM_POPUP") {
      if (sender.tab && sender.tab.id != null) {
        safeSendMessage(sender.tab.id, { type: "DO_PIP" });
      }
    }
  } catch (e) {
    try {
      console.warn("onMessage handler error:", e);
    } catch (_) {}
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  const state = tabVideoState.get(tab.id) || { hasVideo: false, count: 0 };
  if (state.hasVideo) {
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
              chrome.tabs.sendMessage(tab.id, { type: "DO_PIP" });
            }, 100);
          })
          .catch(() => {
            // Cannot inject, show notification
            chrome.notifications.create({
              type: "basic",
              iconUrl: ICON_GRAY_URL,
              title:
                chrome.i18n.getMessage("notifCannotOpenTitle") ||
                "无法打开小窗",
              message:
                chrome.i18n.getMessage("notifCannotOpenMsg") ||
                "该页面不支持或无法注入脚本",
            });
          });
      }
    });
  } else {
    chrome.notifications.create({
      type: "basic",
      iconUrl: ICON_GRAY_URL,
      title: chrome.i18n.getMessage("notifNoVideoTitle") || "未检测到视频",
      message:
        chrome.i18n.getMessage("notifNoVideoMsg") ||
        "当前页面未检测到任何可用的视频元素",
    });
  }
});

function rescanTab(tabId) {
  try {
    // Check if tab is accessible before sending message
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        // Tab doesn't exist or is not accessible
        markNoVideo(tabId);
        return;
      }

      // Check if we can inject content script into this tab
      if (
        tab.url &&
        (tab.url.startsWith("chrome://") ||
          tab.url.startsWith("chrome-extension://") ||
          tab.url.startsWith("moz-extension://"))
      ) {
        // Cannot inject into chrome:// pages
        markNoVideo(tabId);
        return;
      }

      safeSendMessage(tabId, { type: "RESCAN" }, () => {
        // If safeSendMessage fails, mark as no video
        markNoVideo(tabId);
      });
    });
  } catch (e) {
    markNoVideo(tabId);
  }
}

// Track recent rescans to prevent excessive triggering
const recentRescans = new Map();
const RESCAN_COOLDOWN = 3000; // 3 seconds cooldown between rescans for same tab

function shouldRescan(tabId) {
  const now = Date.now();
  const lastRescan = recentRescans.get(tabId);
  if (lastRescan && now - lastRescan < RESCAN_COOLDOWN) {
    return false;
  }
  recentRescans.set(tabId, now);
  return true;
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (shouldRescan(tabId)) {
    rescanTab(tabId);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only rescan on complete status change and if URL actually changed
  if (
    changeInfo.status === "complete" &&
    changeInfo.url &&
    shouldRescan(tabId)
  ) {
    rescanTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoState.delete(tabId);
  recentRescans.delete(tabId);
});

// Reduce window focus change triggers - only rescan if tab hasn't been scanned recently
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && tab.id != null && shouldRescan(tab.id)) {
      rescanTab(tab.id);
    }
  } catch (_) {}
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
    // Ensure window and tab are focused so sites requiring user gesture are more likely to allow PiP
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch (_) {}
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (_) {}
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
          title:
            chrome.i18n.getMessage("notifCannotOpenTitle") || "无法打开小窗",
          message:
            chrome.i18n.getMessage("notifCannotOpenMsg") ||
            "该页面不支持或无法注入脚本",
        });
        return;
      }
      const ok = resp && resp.ok;
      if (!ok) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: ICON_GRAY_URL,
          title:
            chrome.i18n.getMessage("notifCannotOpenTitle") || "无法打开小窗",
          message:
            chrome.i18n.getMessage("notifCannotOpenMsg") ||
            "可能需要用户手势，或页面不支持画中画",
        });
      }
    });
  } catch (_) {}
});
