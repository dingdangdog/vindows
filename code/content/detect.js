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
    return candidates;
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

  const observer = new MutationObserver(() => {
    try {
      throttleReport();
    } catch (_) {}
  });

  let throttleTimer = null;
  function throttleReport() {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      try {
        reportState();
      } catch (_) {}
    }, 500);
  }

  // Initial scan with delay to let dynamic content load
  setTimeout(() => {
    try {
      reportState();
    } catch (_) {}
  }, 1000);

  // More aggressive observer for dynamic sites like x.com
  try {
    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "src", "data-src"],
    });
  } catch (_) {}

  // Keep detection fresh on tab visibility/focus changes
  try {
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) {
          try {
            throttleReport();
          } catch (_) {}
        }
      },
      { passive: true }
    );
  } catch (_) {}

  try {
    window.addEventListener(
      "focus",
      () => {
        try {
          throttleReport();
        } catch (_) {}
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
        } catch (_) {}
      }
    } catch (_) {}
  });
})();
