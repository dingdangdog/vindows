(() => {
  // Disable global error listeners to avoid catching page's own errors
  // They were causing issues with x.com's JavaScript errors

  function isElementVisible(el) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      if (rect.bottom < 0 || rect.right < 0) return false;
      if (
        rect.top > (window.innerHeight || document.documentElement.clientHeight)
      )
        return false;
      if (
        rect.left > (window.innerWidth || document.documentElement.clientWidth)
      )
        return false;
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") === 0
      )
        return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function getCandidateVideos() {
    const videos = [];
    try {
      // Method 1: Standard querySelector
      const standardVideos = document.querySelectorAll("video");
      for (const v of standardVideos) {
        if (v && !videos.includes(v)) videos.push(v);
      }
    } catch (_) {}

    try {
      // Method 2: Look for videos in common containers (x.com, YouTube, etc.)
      const containers = document.querySelectorAll(
        '[data-testid*="video"], [data-testid*="media"], .video-container, .media-container, [class*="video"], [class*="media"]'
      );
      for (const container of containers) {
        try {
          const containerVideos = container.querySelectorAll("video");
          for (const v of containerVideos) {
            if (v && !videos.includes(v)) videos.push(v);
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      // Method 3: Look for video URLs in data attributes or src
      const videoElements = document.querySelectorAll(
        '[src*=".mp4"], [src*=".webm"], [src*=".ogg"], [data-src*=".mp4"], [data-src*=".webm"]'
      );
      for (const el of videoElements) {
        if (el.tagName === "VIDEO" && !videos.includes(el)) videos.push(el);
      }
    } catch (_) {}

    const candidates = videos
      .filter((v) => {
        try {
          // must be visible and ready to play
          const visible = isElementVisible(v);
          const hasSource =
            (v.currentSrc && v.currentSrc.length) ||
            (v.src && v.src.length) ||
            v.querySelector("source");
          const ready = v.readyState >= 2; // HAVE_CURRENT_DATA
          return visible && (hasSource || ready);
        } catch (e) {
          return false;
        }
      })
      .map((v) => ({
        el: v,
        area: (v.clientWidth || 0) * (v.clientHeight || 0),
        playing: !!(!v.paused && !v.ended && v.readyState > 2),
      }));
    candidates.sort((a, b) => {
      if (a.playing !== b.playing) return a.playing ? -1 : 1; // playing first
      return b.area - a.area; // larger first
    });

    // Return only the best video (if any) to simplify state management
    return candidates.length > 0 ? [candidates[0]] : [];
  }

  function reportState() {
    try {
      const candidates = getCandidateVideos();
      const hasVideo = candidates.length > 0;
      try {
        chrome.runtime.sendMessage(
          { type: "VIDEO_STATE", hasVideo, count: candidates.length },
          () => {
            // ignore response; check for lastError to avoid unchecked exceptions
            if (chrome.runtime && chrome.runtime.lastError) {
              // Service worker might not be ready, ignore error
              console.debug("Service worker not ready for message");
            }
          }
        );
      } catch (e) {
        // Runtime not available, ignore error
        console.debug("Runtime not available for message");
      }
      return candidates;
    } catch (_) {
      return [];
    }
  }

  function requestPiP() {
    try {
      const candidates = getCandidateVideos();
      if (!candidates.length) return false;
      const target = candidates[0].el;
      if (!document.pictureInPictureElement && target.requestPictureInPicture) {
        return target
          .requestPictureInPicture()
          .then(() => true)
          .catch(() => false);
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  const observer = new MutationObserver((mutations) => {
    try {
      // Only trigger if mutations are relevant to video detection
      let shouldCheck = false;
      for (const mutation of mutations) {
        // Check for video-related changes
        if (mutation.type === "childList") {
          for (const node of [
            ...mutation.addedNodes,
            ...mutation.removedNodes,
          ]) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (
                element.tagName === "VIDEO" ||
                (element.querySelector && element.querySelector("video")) ||
                element.className?.includes("video") ||
                element.className?.includes("media")
              ) {
                shouldCheck = true;
                break;
              }
            }
          }
        } else if (mutation.type === "attributes") {
          const target = mutation.target;
          if (
            target.tagName === "VIDEO" ||
            (mutation.attributeName === "src" && target.tagName === "VIDEO") ||
            (mutation.attributeName === "style" && target.tagName === "VIDEO")
          ) {
            shouldCheck = true;
          }
        }
        if (shouldCheck) break;
      }

      if (shouldCheck) {
        throttleReport();
      }
    } catch (_) {}
  });

  let throttleTimer = null;
  let lastReportTime = 0;
  const REPORT_COOLDOWN = 1000; // Increased from 500ms to 1000ms to reduce flickering

  function throttleReport() {
    if (throttleTimer) return;

    const now = Date.now();
    const timeSinceLastReport = now - lastReportTime;

    // If we reported recently, wait longer before next report
    const delay = timeSinceLastReport < REPORT_COOLDOWN ? REPORT_COOLDOWN : 500;

    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      lastReportTime = Date.now();
      try {
        reportState();
      } catch (_) {}
    }, delay);
  }

  // Wait for page to be more fully rendered before initial scan
  function waitForPageReady() {
    return new Promise((resolve) => {
      // Check if page is already loaded and rendered
      if (document.readyState === "complete") {
        // Additional delay for dynamic content and rendering
        setTimeout(resolve, 2000);
        return;
      }

      // Wait for load event
      window.addEventListener(
        "load",
        () => {
          // Additional delay after load for dynamic content
          setTimeout(resolve, 2000);
        },
        { once: true }
      );

      // Fallback timeout in case load event doesn't fire
      setTimeout(resolve, 5000);
    });
  }

  // Initial scan after page is ready
  waitForPageReady().then(() => {
    try {
      reportState();
    } catch (_) {}
  });

  // Also do an immediate scan for refresh scenarios
  // This helps when content script is re-injected
  setTimeout(() => {
    try {
      reportState();
    } catch (_) {}
  }, 100);

  // More aggressive observer for dynamic sites like x.com
  try {
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "src", "data-src"],
    });
  } catch (_) {}

  // Keep detection fresh on tab visibility/focus changes (with throttling)
  let visibilityTimeout = null;
  try {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden && !visibilityTimeout) {
          visibilityTimeout = setTimeout(() => {
            visibilityTimeout = null;
            try {
              throttleReport();
            } catch (_) {}
          }, 1000); // Delay visibility change detection
        }
      },
      { passive: true }
    );
  } catch (_) {}

  let focusTimeout = null;
  try {
    window.addEventListener(
      "focus",
      () => {
        if (!focusTimeout) {
          focusTimeout = setTimeout(() => {
            focusTimeout = null;
            try {
              throttleReport();
            } catch (_) {}
          }, 1000); // Delay focus change detection
        }
      },
      { passive: true }
    );
  } catch (_) {}

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg && msg.type === "DO_PIP") {
        Promise.resolve(requestPiP()).then((ok) => {
          if (!ok) {
            try {
              chrome.runtime.sendMessage(
                { type: "VIDEO_STATE", hasVideo: false, count: 0 },
                () => {
                  if (chrome.runtime && chrome.runtime.lastError) {
                    // Service worker might not be ready, ignore error
                    console.debug("Service worker not ready for state update");
                  }
                }
              );
            } catch (e) {
              // Runtime not available, ignore error
              console.debug("Runtime not available for state update");
            }
          }
          try {
            sendResponse({ ok: !!ok });
          } catch (_) {}
        });
        return true; // keep channel open for async response
      }
      if (msg && msg.type === "RESCAN") {
        try {
          reportState();
          sendResponse({ success: true });
        } catch (_) {
          sendResponse({ success: false });
        }
        return true; // keep channel open for async response
      }
    } catch (_) {}
  });
})();
