// Focus Guard - YouTube Content Filter
// Hides Shorts and Comments on YouTube

(function() {
  var STORAGE_KEY_SHORTS = 'focusGuard_hideShorts';
  var STORAGE_KEY_COMMENTS = 'focusGuard_hideComments';

  var styleEl = null;
  var observer = null;

  // Layer 1: Primary selectors (YouTube custom elements)
  var SHORTS_SELECTORS_L1 = [
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytd-guide-entry-renderer a[title="Shorts"]'
  ];

  // Layer 2: Fallback selectors (data attributes, href patterns)
  var SHORTS_SELECTORS_L2 = [
    'a[href*="/shorts/"]',
    '[is-shorts]',
    'ytd-mini-guide-entry-renderer a[title="Shorts"]'
  ];

  // Layer 3: Heuristic selectors (text/aria-label based)
  var SHORTS_SELECTORS_L3 = [
    '[aria-label*="Shorts"]'
  ];

  var SHORTS_CSS = SHORTS_SELECTORS_L1.join(',\n');

  function applyFallbackLayer(layer) {
    var selectors = layer === 2 ? SHORTS_SELECTORS_L2 : SHORTS_SELECTORS_L3;
    var style = document.getElementById('focusGuardFallbackCSS');
    if (!style) {
      style = document.createElement('style');
      style.id = 'focusGuardFallbackCSS';
      document.head.appendChild(style);
    }
    var css = selectors.map(function(s) { return s + ' { display: none !important; }'; }).join('\n');
    style.textContent += '\n' + css;
  }

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

  setTimeout(function() {
    chrome.storage.local.get(STORAGE_KEY_SHORTS, function(data) {
      if (!data[STORAGE_KEY_SHORTS]) return; // Shorts hiding is off
      if (!document.querySelector(SHORTS_SELECTORS_L1.join(','))) {
        console.warn('[Focus Guard] Layer 1 Shorts selectors found nothing. Trying Layer 2.');
        applyFallbackLayer(2);
        setTimeout(function() {
          if (!document.querySelector(SHORTS_SELECTORS_L2.join(','))) {
            console.warn('[Focus Guard] Layer 2 Shorts selectors found nothing. Trying Layer 3.');
            applyFallbackLayer(3);
          }
        }, 2000);
      }
    });
  }, 3000);

  // Listen for storage changes (real-time toggle)
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local') return;
    if (STORAGE_KEY_SHORTS in changes || STORAGE_KEY_COMMENTS in changes) {
      loadAndApply();
    }
  });
})();
