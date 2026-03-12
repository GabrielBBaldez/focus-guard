// Focus Guard - YouTube Content Filter
// Hides Shorts and Comments on YouTube

(function() {
  var STORAGE_KEY_SHORTS = 'focusGuard_hideShorts';
  var STORAGE_KEY_COMMENTS = 'focusGuard_hideComments';

  var styleEl = null;
  var observer = null;

  var SHORTS_CSS = [
    // Shorts shelf on home page
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    // Shorts tab in channel pages
    'tp-yt-paper-tab:has(> .tab-content > yt-icon > span > div > svg > path[d*="m18 9.28"])',
    // Shorts in search results
    'ytd-reel-shelf-renderer',
    // Shorts navigation link in sidebar
    'ytd-guide-entry-renderer:has(a[title="Shorts"])',
    'ytd-mini-guide-entry-renderer:has(a[title="Shorts"])',
    // Shorts in notifications
    'ytd-notification-renderer:has(a[href*="/shorts/"])',
    // Shorts badges and chips
    'yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"])',
    // Shorts in browse/explore
    'ytd-grid-video-renderer:has(a[href*="/shorts/"])',
    'ytd-video-renderer:has(a[href*="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href*="/shorts/"])'
  ].join(',\n');

  var COMMENTS_CSS = [
    // Comments section on video page
    'ytd-comments#comments',
    '#comments',
    // Comments section on Shorts
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]'
  ].join(',\n');

  function buildCSS(hideShorts, hideComments) {
    var rules = [];
    if (hideShorts) {
      rules.push(SHORTS_CSS + ' { display: none !important; }');
    }
    if (hideComments) {
      rules.push(COMMENTS_CSS + ' { display: none !important; }');
    }
    return rules.join('\n');
  }

  function applyStyles(hideShorts, hideComments) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'focus-guard-yt-filter';
      (document.head || document.documentElement).appendChild(styleEl);
    }

    var css = buildCSS(hideShorts, hideComments);
    if (styleEl.textContent !== css) {
      styleEl.textContent = css;
    }
  }

  function removeStyles() {
    if (styleEl) {
      styleEl.textContent = '';
    }
  }

  // Also redirect if user navigates directly to /shorts/
  function checkShortsRedirect(hideShorts) {
    if (!hideShorts) return;
    if (window.location.pathname.startsWith('/shorts/')) {
      // Extract video ID and redirect to regular player
      var videoId = window.location.pathname.split('/shorts/')[1];
      if (videoId) {
        videoId = videoId.split('/')[0].split('?')[0];
        window.location.replace('https://www.youtube.com/watch?v=' + videoId);
      }
    }
  }

  function loadAndApply() {
    chrome.storage.local.get([STORAGE_KEY_SHORTS, STORAGE_KEY_COMMENTS], function(data) {
      if (chrome.runtime.lastError) return;
      var hideShorts = !!data[STORAGE_KEY_SHORTS];
      var hideComments = !!data[STORAGE_KEY_COMMENTS];

      if (hideShorts || hideComments) {
        applyStyles(hideShorts, hideComments);
        checkShortsRedirect(hideShorts);
      } else {
        removeStyles();
      }
    });
  }

  // Initial load
  loadAndApply();

  // Re-apply on SPA navigation (YouTube is a SPA)
  var lastUrl = location.href;
  observer = new MutationObserver(function() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      loadAndApply();
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Listen for storage changes (real-time toggle)
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local') return;
    if (STORAGE_KEY_SHORTS in changes || STORAGE_KEY_COMMENTS in changes) {
      loadAndApply();
    }
  });
})();
