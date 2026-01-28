// ==UserScript==
// @name         soundcloud shuffle likes (fixed button injection)
// @version      1.8
// @description  Adds a shuffle play button to "Likes" and playlists (uses floating button so UI changes don't break it)
// @author       bhackel + patch
// @match        https://soundcloud.com/*
// @grant        none
// @run-at       document-end
// @license      MIT
// @noframes
// @namespace    https://greasyfork.org/en/users/324178-bhackel
// ==/UserScript==

(function () {
  "use strict";

  // ---------- Helpers ----------
  function cleanUrl() {
    return window.location.href.split("?")[0];
  }

  function isSupportedPage(url) {
    // Match the script's original intent, but be a bit more permissive
    return (
      url.includes("/likes") ||
      url.includes("/sets/") ||
      url.includes("/discover/") // includes /discover/sets/...
    );
  }

  function addStylesOnce() {
    if (document.getElementById("bhackel-shuffle-style")) return;
    const style = document.createElement("style");
    style.id = "bhackel-shuffle-style";
    style.textContent = `
      .bhackel-shuffle-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 999999;
        border: 0;
        border-radius: 18px;
        padding: 10px 14px;
        font: 12px/1.2 Arial, sans-serif;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,.25);
        background: #ff5500;
        color: #fff;
      }
      .bhackel-shuffle-fab:hover { filter: brightness(0.95); }
      .bhackel-shuffle-fab:active { transform: translateY(1px); }
      .bhackel-shuffle-fab--stopped { background: #ff5500; }
      .bhackel-shuffle-fab--loading { background: #111; }
      .bhackel-shuffle-fab--error { background: #b00020; }
    `;
    document.head.appendChild(style);
  }

  function inferPageType(url) {
    if (url.includes("you/likes")) return "Likes";
    if (url.includes("/likes") && !url.includes("you/likes")) return "GenericLikes";
    if (url.includes("/discover/sets/")) return "Discover";
    if (url.includes("/sets/") && !url.includes("/discover/")) return "Playlist";
    // Fallback: treat likes-like pages as Likes
    if (url.includes("/likes")) return "Likes";
    return "Playlist";
  }

  function getTracksContainer(pageType) {
    if (pageType === "Likes" || pageType === "GenericLikes") {
      return document.querySelector(".lazyLoadingList__list");
    }
    if (pageType === "Playlist") {
      return document.querySelector(".trackList__list");
    }
    if (pageType === "Discover") {
      return document.querySelector(".systemPlaylistTrackList__list");
    }
    return null;
  }

  function safeClick(el, label) {
    if (!el) throw new Error(`Missing element: ${label}`);
    el.click();
  }

  // ---------- Button injection (robust) ----------
  function ensureButton() {
    const url = cleanUrl();

    // Remove the button if we navigate away
    if (!isSupportedPage(url)) {
      const existing = document.querySelector(".bhackel-shuffle-likes");
      if (existing) existing.remove();
      return;
    }

    let btn = document.querySelector(".bhackel-shuffle-likes");
    if (!btn) {
      addStylesOnce();
      btn = document.createElement("button");
      btn.className = "bhackel-shuffle-likes bhackel-shuffle-fab bhackel-shuffle-fab--stopped";
      btn.textContent = "Shuffle Play";
      btn.scrolling = false;
      btn.interval = 0;
      btn.timeout = 0;

      btn.onclick = function () {
        setupLoad(btn);
      };

      document.body.appendChild(btn);
    }

    // Keep its pageType current if user navigates within SC
    btn.pageType = inferPageType(url);
  }

  // Detect SPA navigations
  function hookHistory() {
    const _pushState = history.pushState;
    const _replaceState = history.replaceState;

    function fire() {
      window.dispatchEvent(new Event("bhackel-locationchange"));
    }

    history.pushState = function () {
      _pushState.apply(this, arguments);
      fire();
    };
    history.replaceState = function () {
      _replaceState.apply(this, arguments);
      fire();
    };
    window.addEventListener("popstate", fire);
  }

  // Re-check periodically too (SoundCloud re-renders often)
  function startButtonLoop() {
    ensureButton();
    setInterval(ensureButton, 1500);
    window.addEventListener("bhackel-locationchange", () => {
      // small delay so SC can render the new page DOM
      setTimeout(ensureButton, 250);
    });
  }

  // ---------- Original logic (mostly unchanged) ----------
  function setupLoad(btn) {
    if (btn.scrolling === false) {
      btn.textContent = "Click to Stop Loading";
      btn.classList.remove("bhackel-shuffle-fab--stopped", "bhackel-shuffle-fab--error");
      btn.classList.add("bhackel-shuffle-fab--loading");

      btn.scrolling = true;

      const tracks = getTracksContainer(btn.pageType);
      if (!tracks || !tracks.children || tracks.childElementCount <= 2) {
        btn.textContent = "Error: Tracks not found";
        btn.classList.remove("bhackel-shuffle-fab--loading");
        btn.classList.add("bhackel-shuffle-fab--error");
        btn.scrolling = false;
        return;
      }

      try {
        // Reset the queue to the beginning
        const firstTrack = tracks.children[0];
        const secondTrack = tracks.children[1];

        const firstPlayButton = firstTrack.querySelector(".playButton");
        const secondPlayButton = secondTrack.querySelector(".playButton");

        safeClick(secondPlayButton, "second track play button");
        setTimeout(() => safeClick(firstPlayButton, "first track play button"), 150);

        setTimeout(() => {
          const playButton = document.querySelector(".playControl");
          if (playButton && playButton.classList.contains("playing")) {
            playButton.click();
          }
        }, 500);

        // Add the first track to the queue so it gets shuffled
        const moreBtn = tracks.getElementsByClassName("sc-button-more")[0];
        safeClick(moreBtn, "track 'more' button");

        const addToNextUp = document.getElementsByClassName("moreActions__button addToNextUp")[0];
        safeClick(addToNextUp, "'Add to Next Up' action");

        // Open the queue to load it
        toggleQueue("open");

        btn.timeout = setTimeout(() => {
          btn.interval = setInterval(() => scrollQueue(btn), 500);
        }, 3000);
      } catch (e) {
        console.error("[soundcloud shuffle likes] error:", e);
        btn.textContent = "Error (check console)";
        btn.classList.remove("bhackel-shuffle-fab--loading");
        btn.classList.add("bhackel-shuffle-fab--error");
        btn.scrolling = false;
        clearInterval(btn.interval);
        clearTimeout(btn.timeout);
      }
    } else {
      clearInterval(btn.interval);
      clearTimeout(btn.timeout);
      btn.interval = 0;
      btn.scrolling = false;
      btn.textContent = "Shuffle Play";
      btn.classList.remove("bhackel-shuffle-fab--loading", "bhackel-shuffle-fab--error");
      btn.classList.add("bhackel-shuffle-fab--stopped");
    }
  }

  function scrollQueue(btn) {
    const queue = document.querySelector(".queue");
    if (!queue) return;

    if (queue.classList.contains("m-visible")) {
      const scrollableQueue = document.querySelector(".queue__scrollableInner");
      const queueContainer = document.querySelector(".queue__itemsHeight");

      if (!scrollableQueue || !queueContainer) return;

      const scrollToHeight = parseInt(queueContainer.style.height || "0", 10);
      scrollableQueue.scroll(0, scrollToHeight);

      // Check if all tracks are loaded, then play
      const autoplayDiv = document.querySelector(".queue__fallback");
      if (autoplayDiv) {
        clearInterval(btn.interval);
        btn.scrolling = false;
        btn.interval = 0;
        play(btn);
      }
    } else {
      toggleQueue("open");
    }
  }

  function play(btn) {
    btn.textContent = "Shuffle Play";
    btn.classList.remove("bhackel-shuffle-fab--loading", "bhackel-shuffle-fab--error");
    btn.classList.add("bhackel-shuffle-fab--stopped");

    const playButton = document.querySelector(".playControl");
    const shuffleButton = document.querySelector(".shuffleControl");
    const skipButton = document.querySelector(".skipControl__next");

    if (!shuffleButton || !skipButton) return;

    if (shuffleButton.classList.contains("m-shuffling")) {
      shuffleButton.click();
      shuffleButton.click();
    } else {
      shuffleButton.click();
    }

    skipButton.click();
    toggleQueue("close");
    if (playButton) playButton.focus();
  }

  function toggleQueue(changeToState) {
    const queue = document.querySelector(".queue");
    if (!queue) return;
    const isQueueOpen = queue.classList.contains("m-visible");

    if ((isQueueOpen && changeToState === "close") || (!isQueueOpen && changeToState === "open")) {
      const queueTrigger = document.querySelector(".playbackSoundBadge__queueCircle");
      if (queueTrigger) queueTrigger.click();
    }
  }

  // ---------- Boot ----------
  hookHistory();
  startButtonLoop();

  // Extra safety: if SC mounts late
  const mo = new MutationObserver(() => ensureButton());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
