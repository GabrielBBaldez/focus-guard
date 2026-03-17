# Focus Guard v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Focus Guard from a personal Chrome extension to a Chrome Web Store-ready product with bug fixes, polished UI/UX, customization features, and analytics.

**Architecture:** Vanilla JS Chrome extension (MV3). No build system, no frameworks. All files are static and loaded directly. Service worker (`background.js`) handles tracking/blocking, `popup.html/js` is the extension popup, `blocked.html/js` is shown when a site is blocked, `youtube-filter.js` is a content script.

**Tech Stack:** JavaScript (ES2020), HTML5, CSS3, Chrome Extension APIs (MV3), SVG for charts.

**Spec:** `docs/superpowers/specs/2026-03-12-focus-guard-v2-design.md`

**Testing strategy:** No test framework exists. Manual verification via dev server (`node server.js` on port 8090) for UI checks, and by loading the unpacked extension in `chrome://extensions` for integration testing. Each task includes verification steps.

---

## File Map

### New Files
- `defaults.js` — Shared constants (DEFAULTS object), loaded by popup.html, blocked.html, and imported by background.js

### Modified Files
- `background.js` (1079 lines) — Race condition fix, mutex, atomic reset, streak logic, config message handlers
- `blocked.js` (566 lines) — Toast UI, countdown fix, challenge progress bar, pomodoro/breathing config read, streak message
- `blocked.html` (617 lines) — Toast container, fade-in animation, section reorganization, progress bar
- `popup.js` (866 lines) — Tab transitions, domain validation, config sections (pomodoro/breathing), export/import, SVG charts, streak badge
- `popup.html` (726 lines) — Config reorganization, chart containers, streak badge, tab transition CSS, tooltip CSS
- `youtube-filter.js` (119 lines) — Layered selector strategy with fallback
- `manifest.json` (41 lines) — Add defaults.js to web_accessible_resources

---

## Chunk 1: Phase 1 — Bug Fixes & Stability

### Task 1: Create defaults.js shared constants

**Files:**
- Create: `defaults.js`
- Modify: `manifest.json`
- Modify: `blocked.html:614` (add script tag before blocked.js)
- Modify: `popup.html:726` (add script tag before popup.js — popup.js is inline but referenced)

- [ ] **Step 1: Create defaults.js**

```javascript
// defaults.js — Shared constants for Focus Guard
// This is the single source of truth for all default values.
// Loaded by popup.html and blocked.html via <script> tag.
// background.js uses importScripts('defaults.js').

var DEFAULTS = {
  POMODORO_FOCUS: 25 * 60,
  POMODORO_BREAK: 5 * 60,
  BREATHING_PATTERN: {
    name: 'relaxamento',
    phases: [
      { label: 'Inspire', seconds: 4 },
      { label: 'Segure', seconds: 4 },
      { label: 'Expire', seconds: 4 }
    ]
  },
  WARNING_THRESHOLD: 5 * 60,
  MAX_EXTRA_SECONDS: 60 * 60,
  HISTORY_DAYS: 30,
  SNAPSHOT_INTERVAL: 5 * 60 * 1000,
  BADGE_UPDATE_INTERVAL: 1000,
  EXTRA_TIME_MIN: 5,
  TOAST_DURATION: 3000,
};
```

- [ ] **Step 2: Add importScripts to background.js**

At the very top of `background.js` (before line 1), add:
```javascript
importScripts('defaults.js');
```

- [ ] **Step 3: Add script tag to blocked.html**

Before the `<script src="blocked.js">` tag (line 614), add:
```html
  <script src="defaults.js"></script>
```

- [ ] **Step 4: Add script tag to popup.html**

At `popup.html:724`, before `<script src="popup.js"></script>`, add:
```html
  <script src="defaults.js"></script>
```

- [ ] **Step 5: Update manifest.json web_accessible_resources**

In `manifest.json`, add `"defaults.js"` to the resources array (line 37):
```json
"resources": ["blocked.html", "icons/logo.png", "defaults.js"],
```

- [ ] **Step 6: Replace magic numbers with DEFAULTS refs in background.js**

In `background.js`, replace hardcoded values with `DEFAULTS.*` references:
- `25 * 60` → `DEFAULTS.POMODORO_FOCUS`
- `5 * 60` (break) → `DEFAULTS.POMODORO_BREAK`
- `5 * 60 * 1000` (snapshot interval) → `DEFAULTS.SNAPSHOT_INTERVAL`
- `60 * 60` (max extra) → `DEFAULTS.MAX_EXTRA_SECONDS`
- `1000` (badge interval) → `DEFAULTS.BADGE_UPDATE_INTERVAL`

Note: popup.js and blocked.js magic numbers will be replaced in their respective tasks (Task 13 for pomodoro, Task 14 for breathing).

- [ ] **Step 7: Verify**

Open `http://localhost:8090/blocked.html?site=youtube.com` — confirm no JS errors in console. Check that `DEFAULTS` is defined by opening DevTools console and typing `DEFAULTS`.

- [ ] **Step 8: Commit**

```bash
git add defaults.js background.js blocked.html popup.html manifest.json
git commit -m "feat: add shared defaults.js constants file"
```

---

### Task 2: Fix race condition in resetIfNewDay with mutex

**Files:**
- Modify: `background.js:144-167` (resetIfNewDay)
- Modify: `background.js:225-247` (getWeeklyUsage)

- [ ] **Step 1: Add mutex lock variable**

At `background.js` around line 142, before `resetIfNewDay`, add:
```javascript
let _resetLock = null;
```

- [ ] **Step 2: Wrap resetIfNewDay with mutex**

Replace `background.js:144-167` (the entire `resetIfNewDay` function) with:

```javascript
async function resetIfNewDay() {
  if (_resetLock) return _resetLock;
  _resetLock = _doResetIfNewDay();
  try { return await _resetLock; } finally { _resetLock = null; }
}

async function _doResetIfNewDay() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.USAGE_DATE, STORAGE_KEYS.USAGE, STORAGE_KEYS.BYPASSED, STORAGE_KEYS.EXTRA, STORAGE_KEYS.ENTRY_PASSED]);
  const today = getToday();
  if (data[STORAGE_KEYS.USAGE_DATE] !== today) {
    // Save yesterday's usage to history before resetting
    if (data[STORAGE_KEYS.USAGE] && data[STORAGE_KEYS.USAGE_DATE]) {
      await saveToHistory(data[STORAGE_KEYS.USAGE_DATE], data[STORAGE_KEYS.USAGE]);
    }
    // Clear 5-min warning flags
    const allKeys = await chrome.storage.local.get(null);
    const warnKeys = Object.keys(allKeys).filter(k => k.startsWith('_warned5_'));
    if (warnKeys.length > 0) await chrome.storage.local.remove(warnKeys);

    // Atomic reset: all transient data zeroed in one call
    await chrome.storage.local.set({
      [STORAGE_KEYS.USAGE]: {},
      [STORAGE_KEYS.USAGE_DATE]: today,
      [STORAGE_KEYS.BYPASSED]: {},
      [STORAGE_KEYS.EXTRA]: {},
      [STORAGE_KEYS.ENTRY_PASSED]: {}
    });
    return {};
  }
  return data[STORAGE_KEYS.USAGE] || {};
}
```

- [ ] **Step 3: Refactor getWeeklyUsage to read from history only**

Replace `background.js:225-247` (the entire `getWeeklyUsage` function) with:

```javascript
async function getWeeklyUsage(pattern) {
  // Read exclusively from history for the full 7-day window.
  // Callers in blocking-critical paths must call saveToHistory() BEFORE this.
  const histData = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const history = histData[STORAGE_KEYS.HISTORY] || {};
  let total = 0;
  const today = new Date();
  for (let i = 0; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (history[dateStr] && history[dateStr][pattern]) {
      total += history[dateStr][pattern];
    }
  }
  return total;
}
```

Also, in the `checkIfBlocked` function (the blocking handler), add a `saveToHistory()` call before `getWeeklyUsage()`:
```javascript
// Before checking weekly limit, flush current usage to history
const liveData = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_DATE]);
if (liveData[STORAGE_KEYS.USAGE_DATE]) {
  await saveToHistory(liveData[STORAGE_KEYS.USAGE_DATE], liveData[STORAGE_KEYS.USAGE] || {});
}
const weeklyUsed = await getWeeklyUsage(pattern);
```

- [ ] **Step 4: Verify**

Load extension in Chrome. Add a site, use it, verify it still tracks and blocks correctly. Check that weekly usage message handler still works via popup History tab.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "fix: race condition in resetIfNewDay with mutex and history-only weekly reads"
```

---

### Task 3: Add toast notification system to blocked page

**Files:**
- Modify: `blocked.html` (add toast container CSS + HTML)
- Modify: `blocked.js` (add showToast function, update handlers)

- [ ] **Step 1: Add toast CSS to blocked.html**

In `blocked.html`, inside the `<style>` section (before closing `</style>`), add:

```css
/* Toast notifications */
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.toast {
  background: #27272a;
  color: #e4e4e7;
  padding: 12px 20px;
  border-radius: 8px;
  border-left: 4px solid #6366f1;
  font-size: 0.9rem;
  opacity: 0;
  transform: translateX(100%);
  transition: all 0.3s ease;
  max-width: 340px;
}
.toast.visible {
  opacity: 1;
  transform: translateX(0);
}
.toast.error {
  border-left-color: #ef4444;
}
.toast.success {
  border-left-color: #22c55e;
}
```

- [ ] **Step 2: Add toast container HTML to blocked.html**

Right after the opening `<body>` tag, add:
```html
<div class="toast-container" id="toastContainer"></div>
```

- [ ] **Step 3: Add showToast function to blocked.js**

At the top of `blocked.js` (after line 11, after the variable declarations), add:

```javascript
// ── Toast Notifications ──
function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toastContainer');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(function() {
    toast.classList.add('visible');
  });
  setTimeout(function() {
    toast.classList.remove('visible');
    setTimeout(function() { toast.remove(); }, 300);
  }, DEFAULTS.TOAST_DURATION);
}
```

- [ ] **Step 4: Verify**

Open `http://localhost:8090/blocked.html?site=youtube.com`. The page should load without errors. Toast system ready for use (will be wired up in Task 4).

- [ ] **Step 5: Commit**

```bash
git add blocked.html blocked.js
git commit -m "feat: add toast notification system to blocked page"
```

---

### Task 4: Add feedback messages to bypass/extra handlers

**Files:**
- Modify: `background.js:707-737` (bypassSite handler)
- Modify: `background.js:740-789` (addExtraTime handler)
- Modify: `blocked.js` (show toasts on errors)

- [ ] **Step 1: Update bypassSite handler responses**

In `background.js:707-737`, update the error responses to include structured reason codes. Change the nuclear check response (around line 718):
```javascript
sendResponse({ error: 'Modo nuclear ativo — impossível desbloquear', reason: 'nuclear' });
```

Add a weekly limit check before the bypass logic (after the nuclear check, around line 722):
```javascript
// Check weekly limit
const weeklyLimitData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
const weeklyLimits = weeklyLimitData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
if (weeklyLimits[pattern]) {
  const weeklyUsed = await getWeeklyUsage(pattern);
  if (weeklyUsed >= weeklyLimits[pattern] * 60) {
    sendResponse({ error: 'Limite semanal atingido — bypass não disponível esta semana.', reason: 'weekly_limit' });
    return;
  }
}
```

Add a challenge-required check if entry challenge is enabled but not passed:
```javascript
// Check if challenge is required
const challengeData = await chrome.storage.local.get([STORAGE_KEYS.CHALLENGE, STORAGE_KEYS.ENTRY_PASSED]);
if (challengeData[STORAGE_KEYS.CHALLENGE] && !challengeData[STORAGE_KEYS.ENTRY_PASSED]?.[pattern]) {
  sendResponse({ error: 'Desafio necessário para desbloquear opções.', reason: 'challenge' });
  return;
}
```

- [ ] **Step 2: Update addExtraTime handler responses**

In `background.js:740-789`, ensure all error responses include reason codes:
- Nuclear: `reason: 'nuclear'`
- Weekly limit: `reason: 'weekly_limit'`
- Max extra reached (line 776-778): `reason: 'max_extra'`, message: `'Você já usou todo o tempo extra de hoje (máximo 60 minutos).'`

- [ ] **Step 3: Update blocked.js bypass handlers to show toasts**

In `blocked.js`, find the `sendBypass` function and update to show toast on error:
```javascript
function sendBypass(btn, msg) {
  btn.disabled = true;
  chrome.runtime.sendMessage(msg, function(response) {
    if (chrome.runtime.lastError || !response) {
      btn.disabled = false;
      showToast('Erro de comunicação com a extensão.', 'error');
      return;
    }
    if (response.error) {
      btn.disabled = false;
      showToast(response.error, 'error');
      return;
    }
    if (response.ok && response.redirectUrl) {
      showToast('Redirecionando...', 'success');
      window.location.href = response.redirectUrl;
    }
  });
}
```

- [ ] **Step 4: Fix weekly countdown bug**

In `blocked.js:550-565`, replace the `updateCountdown()` function:

```javascript
function updateCountdown() {
  var now = new Date();
  if (isWeeklyBlock) {
    // Weekly blocks: show usage context with actual data
    chrome.runtime.sendMessage({ type: 'getWeeklyUsage', site: currentSite }, function(resp) {
      if (chrome.runtime.lastError || !resp) return;
      var usedH = Math.floor(resp.used / 3600);
      var usedM = Math.floor((resp.used % 3600) / 60);
      var limitH = Math.floor(resp.limit / 3600);
      var limitM = Math.floor((resp.limit % 3600) / 60);
      document.getElementById('countdown').textContent =
        'Uso semanal: ' + usedH + 'h' + usedM + 'min / ' + limitH + 'h' + limitM + 'min — reseta conforme dias antigos saem da janela de 7 dias.';
    });
  } else {
    var midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    var diff = midnight - now;
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    document.getElementById('countdown').textContent = 'Acesso liberado em ' + h + 'h ' + m + 'min';
  }
}
```

- [ ] **Step 5: Verify**

Load extension. Block a site. Test: click +5min button — should show toast with message. Test nuclear mode — should show appropriate error toast.

- [ ] **Step 6: Commit**

```bash
git add background.js blocked.js
git commit -m "feat: structured error responses with toast feedback on blocked page"
```

---

### Task 5: Accessibility improvements

**Files:**
- Modify: `popup.html` (aria labels, roles, tabindex)
- Modify: `blocked.html` (aria labels, roles, sr-only class)

- [ ] **Step 1: Add sr-only CSS class to both HTML files**

In both `popup.html` and `blocked.html`, add to the `<style>` section:
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Add aria-labels to popup.html interactive elements**

Update the tab buttons (line 519-521):
```html
<button class="tab-btn active" data-tab="sites" aria-label="Aba de sites rastreados">Sites</button>
<button class="tab-btn" data-tab="history" aria-label="Aba de histórico">Histórico</button>
<button class="tab-btn" data-tab="settings" aria-label="Aba de configurações">Config</button>
```

Add `role="tablist"` to the tab container, `role="tab"` to each button, `role="tabpanel"` to each panel.

- [ ] **Step 3: Add aria-labels to blocked.html interactive elements**

Add `role="progressbar"` and `aria-valuenow`/`aria-valuemax` to the pomodoro SVG ring. Add `aria-label` to all buttons that don't have one yet (pomodoroStart, pomodoroPause, pomodoroReset, breathToggle).

- [ ] **Step 4: Add dynamic ARIA updates in blocked.js**

In `blocked.js`, in the `updatePomodoroDisplay` function, add after updating the visual ring:
```javascript
var ring = document.getElementById('pomodoroRing');
if (ring) {
  ring.setAttribute('aria-valuenow', Math.round((pomodoroState.remaining / pomodoroState.total) * 100));
}
```

In `popup.js`, when updating site progress bars in the card rendering:
```javascript
progressBar.setAttribute('aria-valuenow', Math.round(pct));
progressBar.setAttribute('aria-valuemax', '100');
progressBar.setAttribute('role', 'progressbar');
```

- [ ] **Step 5: Add focus-visible styles**

In both HTML files, add:
```css
:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}
```

- [ ] **Step 6: Verify**

Tab through popup.html and blocked.html with keyboard only. Verify all interactive elements are reachable and have visible focus indicators.

- [ ] **Step 7: Commit**

```bash
git add popup.html blocked.html
git commit -m "feat: add basic accessibility (ARIA labels, sr-only, focus-visible)"
```

---

### Task 6: YouTube filter robustness

**Files:**
- Modify: `youtube-filter.js` (entire file refactored)

- [ ] **Step 1: Refactor youtube-filter.js with layered selectors**

Replace the selector constants section with a layered approach:

```javascript
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
```

- [ ] **Step 2: Add applyFallbackLayer function and fallback detection**

After the selector definitions, add the `applyFallbackLayer` function:

```javascript
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
```

After the MutationObserver setup, add a 3-second fallback check:

```javascript
setTimeout(function() {
  if (!document.querySelector(SHORTS_SELECTORS_L1.join(','))) {
    console.warn('[Focus Guard] Layer 1 Shorts selectors found nothing. Trying Layer 2.');
    // Apply Layer 2 selectors to CSS
    applyFallbackLayer(2);
    setTimeout(function() {
      if (!document.querySelector(SHORTS_SELECTORS_L2.join(','))) {
        console.warn('[Focus Guard] Layer 2 Shorts selectors found nothing. Trying Layer 3.');
        applyFallbackLayer(3);
      }
    }, 2000);
  }
}, 3000);
```

- [ ] **Step 3: Verify**

Open youtube.com with the extension loaded. Check console for any fallback warnings. Verify Shorts are hidden.

- [ ] **Step 4: Commit**

```bash
git add youtube-filter.js
git commit -m "feat: layered YouTube filter selectors with fallback detection"
```

---

### Task 7: Chrome Web Store cleanup

**Files:**
- Modify: `.gitignore` (add server.js note)
- Create: `.webstoreignore` (exclude dev files from CWS package)

- [ ] **Step 1: Create .webstoreignore**

```
server.js
docs/
.git/
.gitignore
.webstoreignore
```

- [ ] **Step 2: Update .gitignore**

Ensure `server.js` is listed (it already is, verify).

- [ ] **Step 3: Add host_permissions justification comment to manifest.json**

In `manifest.json`, add a comment block explaining why `<all_urls>` is needed (for CWS review):
Note: JSON doesn't support comments, so add a `_comment` field:
```json
"_host_permissions_justification": "Required to track usage time on any user-configured domain"
```

- [ ] **Step 4: Verify packaging**

Run: `ls -la focus-guard/` and confirm `server.js`, `docs/` would be excluded by `.webstoreignore`.

- [ ] **Step 5: Commit**

```bash
git add .webstoreignore .gitignore
git commit -m "chore: add .webstoreignore for Chrome Web Store packaging"
```

---

## Chunk 2: Phase 2 — UI/UX Revision

### Task 8: Popup tab transition animation

**Files:**
- Modify: `popup.html` (CSS transitions)
- Modify: `popup.js:106-115` (tab switching logic)

- [ ] **Step 1: Add tab transition CSS to popup.html**

In the `<style>` section, add:
```css
.tabs-container {
  position: relative;
  overflow: hidden;
  max-height: 380px;
}
.tab-panel {
  position: absolute;
  top: 0; left: 0; right: 0;
  visibility: hidden;
  opacity: 0;
  transform: translateX(20px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: none;
}
.tab-panel.active {
  position: relative;
  visibility: visible;
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
```

- [ ] **Step 2: Wrap tab panels in a container**

In `popup.html`, wrap all `.tab-panel` divs in:
```html
<div class="tabs-container">
  <!-- existing tab panels -->
</div>
```

- [ ] **Step 3: Update tab switching JS**

In `popup.js`, find the tab button click handler (search for `tab-btn` click listeners), replace with:
```javascript
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var activePanel = document.querySelector('.tab-panel.active');
    if (activePanel) {
      activePanel.style.opacity = '0';
      activePanel.style.transform = 'translateX(-20px)';
      setTimeout(function() {
        document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var newPanel = document.getElementById('tab-' + btn.dataset.tab);
        newPanel.classList.add('active');
        if (btn.dataset.tab === 'history') loadHistory();
        if (btn.dataset.tab === 'settings') loadSettings();
      }, 150);
    }
  });
});
```

- [ ] **Step 4: Verify**

Open `http://localhost:8090/popup.html`. Click between tabs. Transitions should be smooth slide+fade.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: smooth tab transition animations in popup"
```

---

### Task 9: Blocked page visual hierarchy and fade-in

**Files:**
- Modify: `blocked.html` (reorganize sections, add fade-in CSS)
- Modify: `blocked.js` (challenge progress bar)

- [ ] **Step 1: Add fade-in animation CSS to blocked.html**

In `<style>`:
```css
#mainContainer {
  opacity: 0;
  transform: translateY(20px);
  animation: fadeInUp 0.6s ease forwards;
}
@keyframes fadeInUp {
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Add challenge progress bar HTML and CSS**

In `blocked.html`, after the challenge `<textarea>` element and before the `challengeHint` div, add:
```html
<div class="challenge-progress" id="challengeProgress">
  <div class="challenge-progress-fill" id="challengeProgressFill"></div>
</div>
```

CSS:
```css
.challenge-progress {
  width: 100%;
  height: 4px;
  background: #27272a;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}
.challenge-progress-fill {
  height: 100%;
  background: #6366f1;
  border-radius: 2px;
  transition: width 0.15s ease;
  width: 0%;
}
.challenge-progress-fill.complete {
  background: #22c55e;
}
```

- [ ] **Step 3: Add progress bar logic to blocked.js**

In `blocked.js`, find the challengeInput event listener area and add an `input` listener:

```javascript
challengeInput.addEventListener('input', function() {
  if (!originalChallengeText) return;
  var typed = this.value.length;
  var total = originalChallengeText.length;
  var pct = Math.min((typed / total) * 100, 100);
  var fill = document.getElementById('challengeProgressFill');
  fill.style.width = pct + '%';
  if (pct >= 100) {
    fill.classList.add('complete');
  } else {
    fill.classList.remove('complete');
  }
});
```

- [ ] **Step 4: Add challenge success animation**

In `blocked.html` `<style>`, add:
```css
@keyframes successFlash {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50% { box-shadow: 0 0 20px 10px rgba(34, 197, 94, 0.2); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}
.challenge-success { animation: successFlash 0.8s ease; }
```

In `blocked.js`, when the challenge is verified successfully (search for the verify success handler), add before showing bypass buttons:
```javascript
document.getElementById('challengeSection').classList.add('challenge-success');
```

- [ ] **Step 5: Verify**

Open `http://localhost:8090/blocked.html?site=youtube.com`. Page should fade in. Challenge area should show progress bar as you type.

- [ ] **Step 6: Commit**

```bash
git add blocked.html blocked.js
git commit -m "feat: blocked page fade-in animation and challenge progress bar"
```

---

### Task 10: Config tab reorganization

**Files:**
- Modify: `popup.html` settings tab panel (search for `tab-settings` or the config section)

- [ ] **Step 1: Add config category CSS**

```css
.config-category {
  margin-top: 16px;
}
.config-category:first-child {
  margin-top: 0;
}
.config-category-header {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #71717a;
  padding: 8px 0 4px;
  border-bottom: 1px solid #27272a;
  margin-bottom: 8px;
}
.config-category-header.danger {
  color: #ef4444;
  border-bottom-color: #7f1d1d;
}
```

- [ ] **Step 2: Wrap existing config items in category divs**

Reorganize the settings tab panel to group items under category headers:

```html
<div class="config-category">
  <div class="config-category-header">Desafios</div>
  <!-- challenge toggle, difficulty, entry challenge -->
</div>
<div class="config-category">
  <div class="config-category-header">Tempo Extra</div>
  <!-- extra time minutes input -->
</div>
<div class="config-category">
  <div class="config-category-header">Horários</div>
  <!-- schedule editor -->
</div>
<div class="config-category">
  <div class="config-category-header">YouTube</div>
  <!-- hide shorts, hide comments toggles -->
</div>
<div class="config-category">
  <div class="config-category-header danger">Zona de Perigo</div>
  <!-- nuclear option -->
</div>
```

Note: Pomodoro and Breathing categories will be added in Phase 3 (Task 13-14). Data (Export/Import) will be added in Task 15.

- [ ] **Step 3: Verify**

Open `http://localhost:8090/popup.html`, go to Config tab. Categories should be visually separated with headers.

- [ ] **Step 4: Commit**

```bash
git add popup.html
git commit -m "feat: reorganize config tab with category headers"
```

---

### Task 11: Visual consistency pass

**Files:**
- Modify: `popup.html` (spacing, border-radius, transitions, typography)
- Modify: `blocked.html` (matching consistency)

- [ ] **Step 1: Standardize spacing and border-radius in popup.html**

Add/update CSS custom properties at the top of the `<style>`:
```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

Update these selectors to use the variables:
- `.setting-group` → `border-radius: var(--radius-lg)`
- `.tab-btn` → `border-radius: var(--radius-full); transition: all var(--transition-fast)`
- `.btn-config`, `.btn-nuclear` → `border-radius: var(--radius-md); transition: all var(--transition-fast)`
- `.site-card` → `border-radius: var(--radius-lg)`
- Input elements → `border-radius: var(--radius-md)`

- [ ] **Step 2: Add tooltip CSS**

```css
[data-tooltip] {
  position: relative;
}
[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #18181b;
  color: #e4e4e7;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  white-space: nowrap;
  z-index: 100;
  border: 1px solid #27272a;
  pointer-events: none;
}
```

- [ ] **Step 3: Apply same CSS variables to blocked.html**

In `blocked.html` `<style>` section, add the same `:root` variables and `[data-tooltip]` CSS from Step 1-2. Update button and card elements in blocked.html to use `var(--radius-*)` and `var(--transition-*)` consistently.

- [ ] **Step 4: Add gradient progress bars**

Update the `.site-progress-fill` CSS in popup.html:
```css
.site-progress-fill.green { background: linear-gradient(90deg, #22c55e, #4ade80); }
.site-progress-fill.yellow { background: linear-gradient(90deg, #eab308, #facc15); }
.site-progress-fill.red { background: linear-gradient(90deg, #dc2626, #ef4444); }
```

- [ ] **Step 5: Add site card status icons**

In `popup.html` `<style>`, add:
```css
.site-status-icon { font-size: 0.75rem; margin-right: 4px; }
```

In `popup.js`, in the site card rendering function (search for `site-card` creation), add a status icon before the site name:
```javascript
var statusIcon = '';
if (isBlocked) statusIcon = '<span class="site-status-icon" title="Bloqueado">&#128274;</span>';
else if (isScheduled) statusIcon = '<span class="site-status-icon" title="Agendado">&#128197;</span>';
else statusIcon = '<span class="site-status-icon" title="Rastreando">&#9202;</span>';
```

- [ ] **Step 6: Add global progress bar in popup header**

In `popup.html`, after the header toggle area and before the tab buttons, add:
```html
<div class="global-progress" id="globalProgress">
  <div class="global-progress-fill" id="globalProgressFill"></div>
</div>
```

CSS:
```css
.global-progress { width: 100%; height: 3px; background: #27272a; border-radius: 2px; margin: 8px 0; }
.global-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
```

In `popup.js`, in `loadData` (after calculating all site usages), add:
```javascript
var totalUsed = 0, totalLimit = 0;
Object.keys(sites).forEach(function(p) {
  totalUsed += (usage[p] || 0);
  totalLimit += sites[p] * 60;
});
var globalPct = totalLimit > 0 ? Math.min((totalUsed / totalLimit) * 100, 100) : 0;
var globalFill = document.getElementById('globalProgressFill');
globalFill.style.width = globalPct + '%';
globalFill.style.background = globalPct > 80 ? '#ef4444' : (globalPct > 50 ? '#eab308' : '#22c55e');
```

- [ ] **Step 7: Verify**

Open popup and blocked pages. Check visual consistency: spacing, borders, transitions, status icons on site cards, global progress bar in header.

- [ ] **Step 8: Commit**

```bash
git add popup.html blocked.html
git commit -m "feat: visual consistency pass (CSS variables, tooltips, gradient progress)"
```

---

### Task 12: Domain validation on add-site form

**Files:**
- Modify: `popup.js` (add input validation)
- Modify: `popup.html` (validation styling)

- [ ] **Step 1: Add validation CSS to popup.html**

```css
.site-input.valid { border-color: #22c55e; }
.site-input.invalid { border-color: #ef4444; }
```

- [ ] **Step 2: Add validation logic to popup.js**

Find the site input element reference and add an `input` listener:

```javascript
var siteInput = document.getElementById('siteInput');
siteInput.addEventListener('input', function() {
  var val = this.value.trim().toLowerCase();
  // Strip protocol and www prefix
  val = val.replace(/^https?:\/\//, '').replace(/^www\./, '');
  this.classList.remove('valid', 'invalid');
  if (!val) return;
  // Basic domain validation: at least one dot, no spaces, valid chars
  var isValid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(\/.+)?$/.test(val);
  this.classList.add(isValid ? 'valid' : 'invalid');
});
```

- [ ] **Step 3: Update placeholder text**

In `popup.html`, find the site input element (search for `siteInput`) and update its placeholder:
```html
<input id="siteInput" placeholder="Ex: youtube.com, reddit.com" ...>
```

- [ ] **Step 4: Verify**

Open popup, type "youtube.com" — should show green border. Type "https://youtube.com" — should also show green (protocol stripped). Type "not valid!" — should show red border.

- [ ] **Step 5: Commit**

```bash
git add popup.js popup.html
git commit -m "feat: real-time domain validation on add-site form"
```

---

## Chunk 3: Phase 3 — Customization

### Task 13: Customizable Pomodoro timer

**Files:**
- Modify: `popup.html` (add Pomodoro config section)
- Modify: `popup.js` (save/load pomodoro config)
- Modify: `blocked.js:334-346` (read config instead of hardcoded values)

- [ ] **Step 1: Add Pomodoro config section to popup.html**

After the "Tempo Extra" category in the config tab, add:

```html
<div class="config-category">
  <div class="config-category-header">Pomodoro</div>
  <div class="config-row">
    <label>Preset</label>
    <select id="pomodoroPreset" class="config-select">
      <option value="classic">Clássico (25/5)</option>
      <option value="long">Longo (50/10)</option>
      <option value="short">Curto (15/5)</option>
    </select>
  </div>
  <div class="config-row">
    <label>Foco (min)</label>
    <select id="pomodoroFocusMin" class="config-select">
      <option value="15">15</option>
      <option value="25" selected>25</option>
      <option value="30">30</option>
      <option value="45">45</option>
      <option value="50">50</option>
    </select>
  </div>
  <div class="config-row">
    <label>Pausa (min)</label>
    <select id="pomodoroBreakMin" class="config-select">
      <option value="5" selected>5</option>
      <option value="10">10</option>
      <option value="15">15</option>
    </select>
  </div>
</div>
```

- [ ] **Step 2: Add pomodoro config save/load to popup.js**

Add to `loadSettings()`:
```javascript
// Pomodoro Config
var pomData = await chrome.storage.local.get('focusGuard_pomodoroConfig');
var pomConfig = pomData.focusGuard_pomodoroConfig || { focus: DEFAULTS.POMODORO_FOCUS, break: DEFAULTS.POMODORO_BREAK };
document.getElementById('pomodoroFocusMin').value = pomConfig.focus / 60;
document.getElementById('pomodoroBreakMin').value = pomConfig.break / 60;
```

Add event listeners for preset and dropdown changes:
```javascript
document.getElementById('pomodoroPreset').addEventListener('change', function() {
  var presets = { classic: [25, 5], long: [50, 10], short: [15, 5] };
  var p = presets[this.value];
  document.getElementById('pomodoroFocusMin').value = p[0];
  document.getElementById('pomodoroBreakMin').value = p[1];
  savePomodoroConfig();
});
document.getElementById('pomodoroFocusMin').addEventListener('change', savePomodoroConfig);
document.getElementById('pomodoroBreakMin').addEventListener('change', savePomodoroConfig);

function savePomodoroConfig() {
  var focus = parseInt(document.getElementById('pomodoroFocusMin').value) * 60;
  var breakTime = parseInt(document.getElementById('pomodoroBreakMin').value) * 60;
  chrome.storage.local.set({ focusGuard_pomodoroConfig: { focus: focus, break: breakTime } });
}
```

- [ ] **Step 3: Update blocked.js to read pomodoro config**

Replace the hardcoded constants at `blocked.js:334-335`:
```javascript
// Replace:
// var POMODORO_FOCUS = 25 * 60;
// var POMODORO_BREAK = 5 * 60;

// Load from config (falls back to DEFAULTS)
var POMODORO_FOCUS = DEFAULTS.POMODORO_FOCUS;
var POMODORO_BREAK = DEFAULTS.POMODORO_BREAK;

chrome.storage.local.get('focusGuard_pomodoroConfig', function(data) {
  var config = data.focusGuard_pomodoroConfig;
  if (config) {
    POMODORO_FOCUS = config.focus || DEFAULTS.POMODORO_FOCUS;
    POMODORO_BREAK = config.break || DEFAULTS.POMODORO_BREAK;
    // Update display if not running
    if (!pomodoroState.running) {
      pomodoroState.remaining = POMODORO_FOCUS;
      pomodoroState.total = POMODORO_FOCUS;
      updatePomodoroDisplay();
    }
  }
});
```

- [ ] **Step 4: Verify**

Open popup Config, change pomodoro to 50/10. Open blocked page — timer should show 50:00. Change back to 25/5 — timer should update.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js blocked.js
git commit -m "feat: customizable pomodoro timer with presets"
```

---

### Task 14: Customizable breathing exercise

**Files:**
- Modify: `popup.html` (add Breathing config section)
- Modify: `popup.js` (save/load breathing config)
- Modify: `blocked.js:292-324` (dynamic phases from config, updates `.breath-info` element via JS)

- [ ] **Step 1: Add Breathing config section to popup.html**

After the Pomodoro category:
```html
<div class="config-category">
  <div class="config-category-header">Respiração</div>
  <div class="config-row">
    <label>Padrão</label>
    <select id="breathingPreset" class="config-select">
      <option value="relaxamento">Relaxamento (4-4-4)</option>
      <option value="box">Box Breathing (4-4-4-4)</option>
      <option value="sono">Sono (4-7-8)</option>
    </select>
  </div>
</div>
```

- [ ] **Step 2: Add breathing config save/load to popup.js**

```javascript
var BREATHING_PRESETS = {
  relaxamento: { name: 'relaxamento', phases: [
    { label: 'Inspire', seconds: 4 }, { label: 'Segure', seconds: 4 }, { label: 'Expire', seconds: 4 }
  ]},
  box: { name: 'box', phases: [
    { label: 'Inspire', seconds: 4 }, { label: 'Segure', seconds: 4 }, { label: 'Expire', seconds: 4 }, { label: 'Segure', seconds: 4 }
  ]},
  sono: { name: 'sono', phases: [
    { label: 'Inspire', seconds: 4 }, { label: 'Segure', seconds: 7 }, { label: 'Expire', seconds: 8 }
  ]}
};

// In loadSettings():
var breathData = await chrome.storage.local.get('focusGuard_breathingConfig');
var breathConfig = breathData.focusGuard_breathingConfig || DEFAULTS.BREATHING_PATTERN;
document.getElementById('breathingPreset').value = breathConfig.name || 'relaxamento';

// Event listener:
document.getElementById('breathingPreset').addEventListener('change', function() {
  var preset = BREATHING_PRESETS[this.value];
  chrome.storage.local.set({ focusGuard_breathingConfig: preset });
});
```

- [ ] **Step 3: Update blocked.js to use dynamic breathing phases**

Replace the hardcoded `startBreathing()` function at `blocked.js:292-301`:

```javascript
var breathingPhases = DEFAULTS.BREATHING_PATTERN.phases;

chrome.storage.local.get('focusGuard_breathingConfig', function(data) {
  if (data.focusGuard_breathingConfig && data.focusGuard_breathingConfig.phases) {
    breathingPhases = data.focusGuard_breathingConfig.phases;
    // Update info text
    var info = breathingPhases.map(function(p) { return p.seconds + 's ' + p.label.toLowerCase(); }).join(' - ');
    var infoEl = document.querySelector('.breath-info');
    if (infoEl) infoEl.textContent = info;
  }
});

function startBreathing() {
  stopBreathing();
  runPhaseSequence(0);
}

function runPhaseSequence(index) {
  if (index >= breathingPhases.length) {
    startBreathing(); // loop
    return;
  }
  var phase = breathingPhases[index];
  var className = index === 0 ? 'inhale' : (phase.label === 'Expire' ? 'exhale' : 'hold');
  runPhase(className, phase.label, phase.seconds, function() {
    runPhaseSequence(index + 1);
  });
}
```

- [ ] **Step 4: Verify**

Open popup Config, select "Sono (4-7-8)". Open blocked page, start breathing exercise. Phases should be 4s-7s-8s with correct labels.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js blocked.js
git commit -m "feat: customizable breathing exercise with presets"
```

---

### Task 15: Export/Import configuration

**Files:**
- Modify: `popup.html` (add Data category with buttons + import modal)
- Modify: `popup.js` (export/import logic)

- [ ] **Step 1: Add Data category to popup.html config tab**

Before the "Zona de Perigo" category:
```html
<div class="config-category">
  <div class="config-category-header">Dados</div>
  <div class="config-row" style="flex-direction: column; gap: 8px;">
    <button class="btn-config" id="btnExport">Exportar Configurações</button>
    <button class="btn-config" id="btnImport">Importar Configurações</button>
    <input type="file" id="importFileInput" accept=".json" style="display:none">
  </div>
</div>
```

Add import modal HTML before closing `</body>`:
```html
<div class="import-overlay" id="importOverlay" style="display:none">
  <div class="import-modal">
    <h3>Importar Configurações</h3>
    <div class="import-preview" id="importPreview"></div>
    <div class="import-actions">
      <button class="btn-config" id="btnImportReplace">Substituir tudo</button>
      <button class="btn-config" id="btnImportMerge">Mesclar</button>
      <button class="btn-config" id="btnImportCancel">Cancelar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add import modal CSS to popup.html**

In `popup.html`, add to the `<style>` section (before closing `</style>`):

```css
.import-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 200;
  display: flex; align-items: center; justify-content: center;
}
.import-modal {
  background: #18181b; border: 1px solid #27272a;
  border-radius: 8px; padding: 20px; max-width: 360px; width: 90%;
}
.import-modal h3 { margin: 0 0 12px; font-size: 1rem; }
.import-preview { font-size: 0.8rem; color: #a1a1aa; margin-bottom: 16px; max-height: 200px; overflow-y: auto; }
.import-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.import-actions .btn-config { flex: 1; min-width: 100px; }
```

- [ ] **Step 3: Add export logic to popup.js**

```javascript
// EXPORT_KEYS defined above (shared with import validation)
document.getElementById('btnExport').addEventListener('click', async function() {
  var data = await chrome.storage.local.get(EXPORT_KEYS);
  var exportObj = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {}
  };
  EXPORT_KEYS.forEach(function(k) { if (data[k] !== undefined) exportObj.data[k] = data[k]; });
  var blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'focus-guard-backup-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
});
```

- [ ] **Step 4: Add import validation and logic to popup.js**

```javascript
var EXPORT_KEYS = [
  'focusGuard_sites', 'focusGuard_weeklyLimits', 'focusGuard_schedule',
  'focusGuard_challenge', 'focusGuard_entryChallenge', 'focusGuard_extraTimeMin',
  'focusGuard_pomodoroConfig', 'focusGuard_breathingConfig',
  'focusGuard_hideShorts', 'focusGuard_hideComments'
];

function validateImportData(data) {
  // Whitelist: only allow known keys
  var validKeys = Object.keys(data).filter(function(k) { return EXPORT_KEYS.indexOf(k) !== -1; });
  var cleaned = {};
  validKeys.forEach(function(k) { cleaned[k] = data[k]; });
  // Type checks
  if (cleaned.focusGuard_sites && typeof cleaned.focusGuard_sites !== 'object') return null;
  if (cleaned.focusGuard_challenge !== undefined && typeof cleaned.focusGuard_challenge !== 'boolean') return null;
  if (cleaned.focusGuard_entryChallenge !== undefined && typeof cleaned.focusGuard_entryChallenge !== 'boolean') return null;
  if (cleaned.focusGuard_extraTimeMin !== undefined && (typeof cleaned.focusGuard_extraTimeMin !== 'number' || cleaned.focusGuard_extraTimeMin < 1 || cleaned.focusGuard_extraTimeMin > 30)) return null;
  return cleaned;
}

var pendingImportData = null;

document.getElementById('btnImport').addEventListener('click', function() {
  document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var parsed = JSON.parse(ev.target.result);
      if (!parsed.version || !parsed.data) throw new Error('Schema inválido');
      var validated = validateImportData(parsed.data);
      if (!validated || Object.keys(validated).length === 0) throw new Error('Dados inválidos ou nenhuma chave reconhecida');
      pendingImportData = validated;
      // Show preview
      var siteCount = parsed.data.focusGuard_sites ? Object.keys(parsed.data.focusGuard_sites).length : 0;
      document.getElementById('importPreview').innerHTML =
        '<p><strong>Arquivo:</strong> ' + file.name + '</p>' +
        '<p><strong>Data:</strong> ' + (parsed.exportedAt || 'N/A') + '</p>' +
        '<p><strong>Sites:</strong> ' + siteCount + '</p>' +
        '<p><strong>Configs:</strong> ' + Object.keys(parsed.data).length + ' chaves</p>';
      document.getElementById('importOverlay').style.display = 'flex';
    } catch (err) {
      alert('Arquivo inválido: ' + err.message);
    }
  };
  reader.readAsText(file);
  this.value = '';
});

document.getElementById('btnImportCancel').addEventListener('click', function() {
  document.getElementById('importOverlay').style.display = 'none';
  pendingImportData = null;
});

document.getElementById('btnImportReplace').addEventListener('click', async function() {
  if (!pendingImportData) return;
  if (!confirm('Sites e configurações atuais serão removidos. Apenas os dados do backup serão mantidos. Continuar?')) return;
  // Clear ALL known config keys first, not just imported ones
  await chrome.storage.local.remove(EXPORT_KEYS);
  await chrome.storage.local.set(pendingImportData);
  document.getElementById('importOverlay').style.display = 'none';
  pendingImportData = null;
  loadSettings();
  loadData();
});

document.getElementById('btnImportMerge').addEventListener('click', async function() {
  if (!pendingImportData) return;
  // Merge: update existing, add new, keep what's not in backup
  var existing = await chrome.storage.local.get(Object.keys(pendingImportData));
  var merged = {};
  Object.keys(pendingImportData).forEach(function(key) {
    if (typeof pendingImportData[key] === 'object' && !Array.isArray(pendingImportData[key]) && existing[key]) {
      merged[key] = Object.assign({}, existing[key], pendingImportData[key]);
    } else {
      merged[key] = pendingImportData[key];
    }
  });
  await chrome.storage.local.set(merged);
  document.getElementById('importOverlay').style.display = 'none';
  pendingImportData = null;
  loadSettings();
  loadData();
});
```

- [ ] **Step 5: Verify**

Open popup Config. Click "Exportar" — should download JSON file. Click "Importar" — select the file — should show preview modal. Click "Substituir tudo" — configs should apply.

- [ ] **Step 6: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: export/import configuration with replace and merge modes"
```

---

## Chunk 4: Phase 4 — Analytics & Streaks

### Task 16: Streak system in background.js

**Files:**
- Modify: `background.js` (streak evaluation in resetIfNewDay, streak initialization, message handler)

- [ ] **Step 1: Add streak initialization on install**

Find the `chrome.runtime.onInstalled` handler in background.js and add streak initialization:

```javascript
// Inside onInstalled handler:
const streakData = await chrome.storage.local.get('focusGuard_streak');
if (!streakData.focusGuard_streak) {
  await chrome.storage.local.set({
    focusGuard_streak: { current: 0, best: 0, lastGoodDay: null }
  });
}
```

- [ ] **Step 2: Add streak evaluation to _doResetIfNewDay**

In the `_doResetIfNewDay` function (created in Task 2), BEFORE the atomic reset, add streak evaluation:

```javascript
// --- Streak evaluation (BEFORE reset) ---
const streakResult = await chrome.storage.local.get('focusGuard_streak');
const streak = streakResult.focusGuard_streak || { current: 0, best: 0, lastGoodDay: null };
const sites = await getTrackedSites();
const bypassed = data[STORAGE_KEYS.BYPASSED] || {};
const extra = data[STORAGE_KEYS.EXTRA] || {};
const usage = data[STORAGE_KEYS.USAGE] || {};

let dayGood = true;
for (const pattern of Object.keys(sites)) {
  const limitSec = sites[pattern] * 60;
  if ((usage[pattern] || 0) > limitSec) { dayGood = false; break; }
  if (bypassed[pattern]) { dayGood = false; break; }
  if ((extra[pattern] || 0) > 0) { dayGood = false; break; }
}

// Use the usage date from the data being evaluated (yesterday's date, before reset)
var evaluatedDay = data[STORAGE_KEYS.USAGE_DATE];
if (dayGood && Object.keys(sites).length > 0) {
  streak.current++;
  if (streak.current > streak.best) streak.best = streak.current;
  streak.lastGoodDay = evaluatedDay;
} else {
  streak.current = 0;
}

// Include streak in the atomic reset
await chrome.storage.local.set({
  [STORAGE_KEYS.USAGE]: {},
  [STORAGE_KEYS.USAGE_DATE]: today,
  [STORAGE_KEYS.BYPASSED]: {},
  [STORAGE_KEYS.EXTRA]: {},
  [STORAGE_KEYS.ENTRY_PASSED]: {},
  focusGuard_streak: streak
});
```

Remove the old separate `chrome.storage.local.set` for the reset (since it's now combined).

- [ ] **Step 3: Add getStreak message handler**

In the message handler block:
```javascript
if (msg.type === 'getStreak') {
  chrome.storage.local.get('focusGuard_streak', function(data) {
    sendResponse(data.focusGuard_streak || { current: 0, best: 0, lastGoodDay: null });
  });
  return true;
}
```

- [ ] **Step 4: Verify**

Load extension. Check that streak initializes on install. Check that `chrome.storage.local.get('focusGuard_streak')` returns the default value in devtools.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: streak evaluation system in daily reset"
```

---

### Task 17: Streak badge in popup

**Files:**
- Modify: `popup.html` (streak badge in header)
- Modify: `popup.js` (load and display streak)

- [ ] **Step 1: Add streak badge HTML to popup.html**

In the header section (near the toggle), add:
```html
<div class="streak-badge" id="streakBadge" data-tooltip="Dias consecutivos dentro do limite" style="display:none">
  <span class="streak-icon">&#128293;</span>
  <span class="streak-count" id="streakCount">0</span>
</div>
```

- [ ] **Step 2: Add streak badge CSS**

```css
.streak-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #27272a;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.streak-icon { font-size: 1rem; }
.streak-badge.hot .streak-icon { font-size: 1.2rem; filter: brightness(1.3); transform: scale(1.1); }
.streak-badge.fire .streak-icon { font-size: 1.4rem; filter: brightness(1.5); animation: fireGlow 1s ease infinite alternate; }
@keyframes fireGlow {
  from { filter: brightness(1.3); transform: scale(1.0); }
  to { filter: brightness(1.8); transform: scale(1.3); }
}
```

- [ ] **Step 3: Add streak loading to popup.js**

In the main `loadData` function or at initialization:
```javascript
chrome.runtime.sendMessage({ type: 'getStreak' }, function(streak) {
  if (chrome.runtime.lastError || !streak) return;
  var badge = document.getElementById('streakBadge');
  var count = document.getElementById('streakCount');
  if (streak.current > 0) {
    badge.style.display = '';
    count.textContent = streak.current;
    badge.dataset.tooltip = streak.current + ' dias consecutivos! Recorde: ' + streak.best + ' dias';
    badge.classList.remove('hot', 'fire');
    if (streak.current >= 8) badge.classList.add('fire');
    else if (streak.current >= 4) badge.classList.add('hot');
  } else {
    badge.style.display = 'none';
  }
});
```

- [ ] **Step 4: Verify**

Open popup — streak badge should appear if streak > 0. Manually set streak in devtools to test visual tiers.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: streak fire badge in popup header"
```

---

### Task 18: Streak message on blocked page

**Files:**
- Modify: `blocked.html` (streak message element)
- Modify: `blocked.js` (load and show streak)

- [ ] **Step 1: Add streak message element to blocked.html**

After the `<div id="quoteText">` element (search for `quoteText` in blocked.html):
```html
<div class="streak-message" id="streakMessage" style="display:none"></div>
```

CSS:
```css
.streak-message {
  color: #eab308;
  font-size: 0.85rem;
  margin-top: 8px;
  text-align: center;
}
```

- [ ] **Step 2: Load streak in blocked.js**

After the quote initialization in blocked.js (search for `quoteText` or the quote array section):
```javascript
chrome.runtime.sendMessage({ type: 'getStreak' }, function(streak) {
  if (chrome.runtime.lastError || !streak || streak.current <= 0) return;
  var el = document.getElementById('streakMessage');
  el.textContent = 'Você tem um streak de ' + streak.current + ' dias. Não quebre agora!';
  el.style.display = '';
});
```

- [ ] **Step 3: Verify**

Open blocked page. If streak > 0, message should appear below the quote.

- [ ] **Step 4: Commit**

```bash
git add blocked.html blocked.js
git commit -m "feat: streak motivation message on blocked page"
```

---

### Task 19: SVG stacked bar chart (7-day)

**Files:**
- Modify: `popup.html` (chart container)
- Modify: `popup.js` (chart rendering)

- [ ] **Step 1: Add chart containers to popup.html**

In the history tab panel, before the existing sparklines section:
```html
<div class="chart-section" id="chartSection">
  <div class="chart-title">Últimos 7 dias</div>
  <svg id="barChart" class="bar-chart" viewBox="0 0 380 200"></svg>
  <div class="chart-title" style="margin-top: 16px;">Tendência (30 dias)</div>
  <svg id="lineChart" class="line-chart" viewBox="0 0 380 160"></svg>
  <div class="chart-legend" id="chartLegend"></div>
</div>
```

CSS:
```css
.chart-section { padding: 8px 0; }
.chart-title { font-size: 0.75rem; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.bar-chart, .line-chart { width: 100%; height: auto; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.chart-legend-item { display: flex; align-items: center; gap: 4px; font-size: 0.7rem; color: #a1a1aa; }
.chart-legend-color { width: 10px; height: 10px; border-radius: 2px; }
```

- [ ] **Step 2: Add color hash function and site colors to popup.js**

```javascript
var SITE_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

function simpleHash(str) {
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getSiteColor(siteName) {
  return SITE_COLORS[simpleHash(siteName) % SITE_COLORS.length];
}
```

- [ ] **Step 3: Add renderBarChart function to popup.js**

```javascript
function renderBarChart(history) {
  var svg = document.getElementById('barChart');
  var today = new Date();
  var days = [];
  var allSites = new Set();

  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    days.push({ date: dateStr, label: dayNames[d.getDay()], usage: history[dateStr] || {} });
    Object.keys(history[dateStr] || {}).forEach(function(s) { allSites.add(s); });
  }

  var sites = Array.from(allSites);
  var maxTotal = 0;
  days.forEach(function(day) {
    var total = 0;
    sites.forEach(function(s) { total += (day.usage[s] || 0); });
    if (total > maxTotal) maxTotal = total;
  });

  if (maxTotal === 0) { svg.innerHTML = '<text x="190" y="100" text-anchor="middle" fill="#71717a" font-size="12">Sem dados ainda</text>'; return; }

  var barWidth = 36;
  var gap = (380 - 7 * barWidth) / 8;
  var chartHeight = 170;
  var html = '';

  days.forEach(function(day, i) {
    var x = gap + i * (barWidth + gap);
    var yOffset = 0;
    sites.forEach(function(site) {
      var sec = day.usage[site] || 0;
      var h = (sec / maxTotal) * chartHeight;
      if (h > 0) {
        var y = chartHeight - yOffset - h;
        html += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + h + '" fill="' + getSiteColor(site) + '" rx="2">';
        html += '<title>' + site + ': ' + Math.round(sec / 60) + 'min</title></rect>';
        yOffset += h;
      }
    });
    // Color-code day label based on total usage vs sum of limits
    var totalSec = 0;
    sites.forEach(function(s) { totalSec += (day.usage[s] || 0); });
    var dayColor = '#71717a'; // default gray
    if (totalSec > 0 && maxTotal > 0) {
      var ratio = totalSec / maxTotal;
      dayColor = ratio > 0.8 ? '#ef4444' : (ratio > 0.5 ? '#eab308' : '#22c55e');
    }
    html += '<text x="' + (x + barWidth / 2) + '" y="190" text-anchor="middle" fill="' + dayColor + '" font-size="10">' + day.label + '</text>';
  });

  svg.innerHTML = html;

  // Legend
  var legend = document.getElementById('chartLegend');
  legend.innerHTML = sites.map(function(s) {
    return '<div class="chart-legend-item"><div class="chart-legend-color" style="background:' + getSiteColor(s) + '"></div>' + s + '</div>';
  }).join('');
}
```

- [ ] **Step 4: Call renderBarChart from loadHistory**

In the `loadHistory` function, after processing the history data, add:
```javascript
renderBarChart(history);
```

- [ ] **Step 5: Verify**

Open popup History tab. Bar chart should render with colored stacked bars. Hover should show site/minutes.

- [ ] **Step 6: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: SVG stacked bar chart for 7-day history"
```

---

### Task 20: SVG trend line chart (30-day)

**Files:**
- Modify: `popup.js` (add renderLineChart function)

- [ ] **Step 1: Add renderLineChart function**

```javascript
function renderLineChart(history) {
  var svg = document.getElementById('lineChart');
  var today = new Date();
  var points = [];

  for (var i = 29; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var dayUsage = history[dateStr] || {};
    var total = Object.values(dayUsage).reduce(function(a, b) { return a + b; }, 0);
    points.push({ date: dateStr, total: total, day: d.getDate() });
  }

  var maxVal = Math.max.apply(null, points.map(function(p) { return p.total; }));
  if (maxVal === 0) { svg.innerHTML = '<text x="190" y="80" text-anchor="middle" fill="#71717a" font-size="12">Sem dados</text>'; return; }

  var chartW = 370;
  var chartH = 130;
  var padL = 5;
  var padT = 10;

  var pathPoints = points.map(function(p, i) {
    var x = padL + (i / 29) * chartW;
    var y = padT + chartH - (p.total / maxVal) * chartH;
    return { x: x, y: y, total: p.total, date: p.date, day: p.day };
  });

  var linePath = pathPoints.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
  var areaPath = linePath + ' L' + pathPoints[pathPoints.length - 1].x + ',' + (padT + chartH) + ' L' + padL + ',' + (padT + chartH) + ' Z';

  // Average line
  var avg = points.reduce(function(a, p) { return a + p.total; }, 0) / 30;
  var avgY = padT + chartH - (avg / maxVal) * chartH;

  var html = '';
  html += '<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>';
  html += '<path d="' + areaPath + '" fill="url(#areaGrad)"/>';
  html += '<path d="' + linePath + '" fill="none" stroke="#6366f1" stroke-width="2"/>';
  html += '<line x1="' + padL + '" y1="' + avgY + '" x2="' + (padL + chartW) + '" y2="' + avgY + '" stroke="#71717a" stroke-width="1" stroke-dasharray="4,4"/>';
  html += '<text x="' + (padL + chartW) + '" y="' + (avgY - 4) + '" text-anchor="end" fill="#71717a" font-size="9">média: ' + Math.round(avg / 60) + 'min</text>';

  // Hover dots
  pathPoints.forEach(function(p) {
    if (p.total > 0) {
      html += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="#6366f1" opacity="0"><title>' + p.date + ': ' + Math.round(p.total / 60) + 'min</title></circle>';
      html += '<circle cx="' + p.x + '" cy="' + p.y + '" r="8" fill="transparent"><title>' + p.date + ': ' + Math.round(p.total / 60) + 'min</title></circle>';
    }
  });

  // X-axis labels (every 5 days)
  for (var j = 0; j < 30; j += 5) {
    html += '<text x="' + pathPoints[j].x + '" y="' + (padT + chartH + 14) + '" text-anchor="middle" fill="#71717a" font-size="9">' + pathPoints[j].day + '</text>';
  }

  svg.innerHTML = html;
}
```

- [ ] **Step 2: Call renderLineChart from loadHistory**

```javascript
renderLineChart(history);
```

- [ ] **Step 3: Add trend comparison**

Below the charts, add a trend indicator:
```javascript
function calculateTrend(history) {
  var today = new Date();
  var thisWeek = 0, lastWeek = 0;
  for (var i = 0; i < 7; i++) {
    var d1 = new Date(today); d1.setDate(d1.getDate() - i);
    var d2 = new Date(today); d2.setDate(d2.getDate() - i - 7);
    var ds1 = d1.getFullYear() + '-' + String(d1.getMonth() + 1).padStart(2, '0') + '-' + String(d1.getDate()).padStart(2, '0');
    var ds2 = d2.getFullYear() + '-' + String(d2.getMonth() + 1).padStart(2, '0') + '-' + String(d2.getDate()).padStart(2, '0');
    thisWeek += Object.values(history[ds1] || {}).reduce(function(a, b) { return a + b; }, 0);
    lastWeek += Object.values(history[ds2] || {}).reduce(function(a, b) { return a + b; }, 0);
  }
  if (lastWeek === 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}
```

- [ ] **Step 4: Add trend display HTML to popup.html**

In the history tab, after the `<div class="chart-legend" id="chartLegend"></div>`, add:
```html
<div class="trend-indicator" id="trendIndicator" style="display:none">
  <span id="trendArrow"></span>
  <span id="trendText"></span>
</div>
```

CSS (add to popup.html `<style>`):
```css
.trend-indicator {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.8rem; margin-top: 8px; padding: 6px 10px;
  background: #27272a; border-radius: 6px;
}
.trend-indicator.down { color: #22c55e; }
.trend-indicator.up { color: #ef4444; }
```

- [ ] **Step 5: Wire calculateTrend to UI in popup.js**

In `loadHistory`, after calling `renderLineChart(history)`:
```javascript
var trend = calculateTrend(history);
var indicator = document.getElementById('trendIndicator');
if (trend !== null) {
  indicator.style.display = '';
  var arrow = trend <= 0 ? '\u2193' : '\u2191';
  indicator.className = 'trend-indicator ' + (trend <= 0 ? 'down' : 'up');
  document.getElementById('trendArrow').textContent = arrow;
  document.getElementById('trendText').textContent = Math.abs(trend) + '% vs semana passada';
} else {
  indicator.style.display = 'none';
}
```

- [ ] **Step 6: Verify**

Open popup History. Line chart should render with gradient area, average line, hover tooltips, and trend arrow below.

- [ ] **Step 7: Commit**

```bash
git add popup.js popup.html
git commit -m "feat: SVG 30-day trend line chart with average and trend comparison"
```

---

### Task 21: Streak card in history tab

**Files:**
- Modify: `popup.html` (streak card in history tab)
- Modify: `popup.js` (render streak card)

- [ ] **Step 1: Add streak card HTML to history tab**

At the top of the history tab panel:
```html
<div class="streak-card" id="streakCard" style="display:none">
  <div class="streak-card-icon" id="streakCardIcon">&#128293;</div>
  <div class="streak-card-info">
    <div class="streak-card-current"><span id="streakCardCurrent">0</span> dias</div>
    <div class="streak-card-best">Recorde: <span id="streakCardBest">0</span> dias</div>
  </div>
</div>
```

CSS:
```css
.streak-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #27272a, #1e1b2e);
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.streak-card-icon { font-size: 2rem; }
.streak-card-current { font-size: 1.1rem; font-weight: 700; }
.streak-card-best { font-size: 0.75rem; color: #71717a; }
```

- [ ] **Step 2: Load streak in loadHistory**

```javascript
chrome.runtime.sendMessage({ type: 'getStreak' }, function(streak) {
  if (chrome.runtime.lastError || !streak) return;
  var card = document.getElementById('streakCard');
  if (streak.current > 0 || streak.best > 0) {
    card.style.display = '';
    document.getElementById('streakCardCurrent').textContent = streak.current;
    document.getElementById('streakCardBest').textContent = streak.best;
  }
});
```

- [ ] **Step 3: Verify**

Open popup History tab. Streak card should show at the top if streak > 0 or has a best record.

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: streak card in history tab with current and best record"
```

---

### Task 22: Final verification and cleanup

- [ ] **Step 1: Load extension in Chrome**

Go to `chrome://extensions`, enable Developer Mode, "Load unpacked", select `focus-guard` folder.

- [ ] **Step 2: Test all features end-to-end**

- Add a site, verify tracking works
- Let timer run to limit, verify blocked page appears
- Verify toast notifications on blocked page
- Test challenge system (all difficulties)
- Test pomodoro timer (change config, verify)
- Test breathing exercise (change preset, verify)
- Test export/import (export, clear data, import back)
- Verify streak badge appears after a "good" day
- Verify charts render in history tab
- Test nuclear option
- Test YouTube filter on youtube.com

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Focus Guard v2 complete — ready for Chrome Web Store review"
```
