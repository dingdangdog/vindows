(() => {
  // Global guards for unexpected errors in content script
  try {
    window.addEventListener('unhandledrejection', (e) => {
      try { e.preventDefault(); } catch (_) {}
      try { console.warn('CS unhandled rejection:', e && e.reason); } catch (_) {}
    });
    window.addEventListener('error', (e) => {
      try { console.warn('CS error:', e && (e.error || e.message)); } catch (_) {}
    });
  } catch (_) {}
  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (rect.bottom < 0 || rect.right < 0) return false;
    if (
      rect.top > (window.innerHeight || document.documentElement.clientHeight)
    )
      return false;
    if (rect.left > (window.innerWidth || document.documentElement.clientWidth))
      return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity || "1") === 0
    )
      return false;
    return true;
  }

  function getCandidateVideos() {
    const videos = Array.from(document.querySelectorAll("video"));
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
    const candidates = getCandidateVideos();
    const hasVideo = candidates.length > 0;
    try {
      chrome.runtime.sendMessage(
        { type: "VIDEO_STATE", hasVideo, count: candidates.length },
        () => {
          // ignore response; check for lastError to avoid unchecked exceptions
          if (chrome.runtime && chrome.runtime.lastError) {
            // noop
          }
        }
      );
    } catch (e) {
      // noop
    }
    return candidates;
  }

  function requestPiP() {
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
  }

  const observer = new MutationObserver(() => {
    throttleReport();
  });

  let throttleTimer = null;
  function throttleReport() {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      reportState();
    }, 500);
  }

  // Initial
  reportState();
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });

  // Keep detection fresh on tab visibility/focus changes
  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        throttleReport();
      }
    },
    { passive: true }
  );
  window.addEventListener(
    "focus",
    () => {
      throttleReport();
    },
    { passive: true }
  );

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "DO_PIP") {
      Promise.resolve(requestPiP()).then((ok) => {
        if (!ok) {
          try {
            chrome.runtime.sendMessage(
              { type: "VIDEO_STATE", hasVideo: false, count: 0 },
              () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  // noop
                }
              }
            );
          } catch (e) {
            // noop
          }
        }
        try {
          sendResponse({ ok: !!ok });
        } catch (_) {}
      });
      return true; // keep channel open for async response
    }
    if (msg && msg.type === "RESCAN") {
      reportState();
    }
  });
})();
