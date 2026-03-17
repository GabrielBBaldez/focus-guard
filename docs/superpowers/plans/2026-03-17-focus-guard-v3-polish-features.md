# Focus Guard v3 - Polish & Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Focus Guard from v2 to v3 with UX polish (theme, animations, onboarding, smart notifications) and high-impact features (focus mode, pause, achievements, weekly goals, expanded history).

**Architecture:** Chrome Extension (Manifest V3) with service worker (`background.js`), popup UI (`popup.html/js`), block page (`blocked.html/js`), shared constants (`defaults.js`), and YouTube content script (`youtube-filter.js`). All data in `chrome.storage.local`. No external dependencies.

**Tech Stack:** Vanilla JS, CSS custom properties, Chrome Extensions API (Manifest V3), chrome.storage.local, chrome.alarms, chrome.notifications.

**Spec:** `docs/superpowers/specs/2026-03-17-focus-guard-v3-polish-features-design.md`

---

## Chunk 1: Theme System & Animations (Tasks 1-2)

### Task 1: Theme System (Claro/Escuro)

**Files:**
- Modify: `defaults.js`
- Modify: `popup.html` (CSS refactor — ~100+ hardcoded colors → CSS variables)
- Modify: `popup.js` (theme toggle logic)
- Modify: `blocked.html` (CSS refactor)
- Modify: `blocked.js` (theme apply)
- Modify: `background.js` (add STORAGE_KEYS.THEME)

#### Step 1: Add theme storage key and default

- [ ] **1.1: Add THEME to STORAGE_KEYS in background.js**

In `background.js`, after line 20 (`ENTRY_PASSED`), add:

```js
STREAK: 'focusGuard_streak',           // existing - just add to STORAGE_KEYS if missing
THEME: 'focusGuard_theme',             // "dark" | "light" | "system"
```

- [ ] **1.2: Add theme default to defaults.js**

In `defaults.js`, add inside the DEFAULTS object:

```js
THEME: 'dark',
```

- [ ] **1.3: Commit**

```bash
git add defaults.js background.js
git commit -m "feat: add theme storage key and default"
```

#### Step 2: Refactor popup.html CSS to use custom properties

- [ ] **2.1: Define CSS custom properties in popup.html :root**

Replace the `:root` block and add theme variables. In `popup.html`, replace the existing `:root { ... }` with:

```css
:root {
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}

/* Dark theme (default) */
.theme-dark {
  color-scheme: dark;
  --bg-primary: #101014;
  --bg-secondary: #15151e;
  --bg-tertiary: #1a1a2e;
  --bg-card: #18181b;
  --bg-card-hover: #1e1e24;
  --bg-input: #1c1c24;
  --border-primary: #1f1f2e;
  --border-secondary: #27272a;
  --border-input: #2a2a3a;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --accent-subtle: rgba(99, 102, 241, 0.1);
  --danger: #dc2626;
  --danger-hover: #ef4444;
  --danger-subtle: rgba(220, 38, 38, 0.1);
  --success: #22c55e;
  --success-subtle: rgba(34, 197, 94, 0.1);
  --warning: #eab308;
  --warning-subtle: rgba(234, 179, 8, 0.1);
  --shadow: rgba(0, 0, 0, 0.3);
  --header-bg: linear-gradient(135deg, #15151e 0%, #1a1a2e 100%);
}

/* Light theme */
.theme-light {
  color-scheme: light;
  --bg-primary: #f4f4f5;
  --bg-secondary: #e4e4e7;
  --bg-tertiary: #d4d4d8;
  --bg-card: #ffffff;
  --bg-card-hover: #fafafa;
  --bg-input: #f4f4f5;
  --border-primary: #d4d4d8;
  --border-secondary: #e4e4e7;
  --border-input: #a1a1aa;
  --text-primary: #18181b;
  --text-secondary: #52525b;
  --text-muted: #71717a;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --accent-subtle: rgba(99, 102, 241, 0.08);
  --danger: #dc2626;
  --danger-hover: #b91c1c;
  --danger-subtle: rgba(220, 38, 38, 0.08);
  --success: #16a34a;
  --success-subtle: rgba(22, 163, 74, 0.08);
  --warning: #ca8a04;
  --warning-subtle: rgba(202, 138, 4, 0.08);
  --shadow: rgba(0, 0, 0, 0.08);
  --header-bg: linear-gradient(135deg, #e4e4e7 0%, #d4d4d8 100%);
}
```

- [ ] **2.2: Replace all hardcoded colors in popup.html CSS**

Systematically replace hardcoded colors throughout popup.html's `<style>` block:

| Find | Replace with |
|------|-------------|
| `background: #101014` | `background: var(--bg-primary)` |
| `background-color: #101014` | `background-color: var(--bg-primary)` |
| `color: #e4e4e7` | `color: var(--text-primary)` |
| `background: linear-gradient(135deg, #15151e 0%, #1a1a2e 100%)` | `background: var(--header-bg)` |
| `border-bottom: 1px solid #1f1f2e` | `border-bottom: 1px solid var(--border-primary)` |
| `#18181b` (card backgrounds) | `var(--bg-card)` |
| `#27272a` (borders) | `var(--border-secondary)` |
| `#a1a1aa` (secondary text) | `var(--text-secondary)` |
| `#71717a` (muted text) | `var(--text-muted)` |
| `#6366f1` (accent) | `var(--accent)` |
| `#dc2626` (danger) | `var(--danger)` |
| `#22c55e` (success) | `var(--success)` |
| `#eab308` (warning) | `var(--warning)` |

Do the same for `html, body` styles — remove `!important` from color/background since CSS vars handle it.

**Important:** There are many color instances. Go through ALL CSS rules in popup.html and replace every hardcoded color with the matching variable. When unsure which variable to use, pick the semantically closest one.

- [ ] **2.3: Replace hardcoded `<html>` tag with theme class**

In `popup.html`, change:
```html
<html lang="pt-BR">
```
to:
```html
<html lang="pt-BR" class="theme-dark">
```

- [ ] **2.4: Commit**

```bash
git add popup.html
git commit -m "feat: refactor popup.html CSS to use theme variables"
```

#### Step 3: Refactor blocked.html CSS to use custom properties

- [ ] **3.1: Add the same CSS custom property definitions to blocked.html**

Copy the exact same `:root`, `.theme-dark`, and `.theme-light` CSS blocks from popup.html into blocked.html's `<style>` section.

- [ ] **3.2: Replace all hardcoded colors in blocked.html CSS**

Same replacement process as popup.html — go through all CSS in blocked.html and replace hardcoded colors with `var(--xxx)` variables.

- [ ] **3.3: Add theme class to blocked.html html tag**

```html
<html lang="pt-BR" class="theme-dark">
```

- [ ] **3.4: Commit**

```bash
git add blocked.html
git commit -m "feat: refactor blocked.html CSS to use theme variables"
```

#### Step 4: Theme toggle logic in popup.js

- [ ] **4.1: Add theme loading and applying in popup.js**

At the top of `popup.js` (or inside the `DOMContentLoaded` handler), add:

```js
// ── Theme ──
function applyTheme(theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.className = `theme-${resolved}`;
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.content = resolved;
  const metaDarkreader = document.querySelector('meta[name="darkreader-lock"]');
  if (metaDarkreader) {
    if (resolved === 'light') metaDarkreader.remove();
  } else if (resolved === 'dark') {
    const meta = document.createElement('meta');
    meta.name = 'darkreader-lock';
    document.head.appendChild(meta);
  }
}

// Load theme on startup
chrome.storage.local.get('focusGuard_theme', (data) => {
  applyTheme(data.focusGuard_theme || 'dark');
});

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  chrome.storage.local.get('focusGuard_theme', (data) => {
    if ((data.focusGuard_theme || 'dark') === 'system') applyTheme('system');
  });
});
```

- [ ] **4.2: Add theme selector in Settings tab HTML (popup.html)**

Inside the Settings tab content area, add:

```html
<div class="setting-group">
  <label class="setting-label">Tema</label>
  <select id="themeSelect" class="setting-select">
    <option value="dark">Escuro</option>
    <option value="light">Claro</option>
    <option value="system">Sistema</option>
  </select>
</div>
```

- [ ] **4.3: Wire up theme selector in popup.js**

```js
const themeSelect = document.getElementById('themeSelect');
chrome.storage.local.get('focusGuard_theme', (data) => {
  themeSelect.value = data.focusGuard_theme || 'dark';
});
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value;
  chrome.storage.local.set({ focusGuard_theme: theme });
  applyTheme(theme);
});
```

- [ ] **4.4: Add theme loading to blocked.js**

Add similar `applyTheme()` and load logic at the top of `blocked.js` (same function, without the Settings selector logic).

- [ ] **4.5: Commit**

```bash
git add popup.html popup.js blocked.html blocked.js
git commit -m "feat: add theme toggle (dark/light/system)"
```

- [ ] **4.6: Manual test**

1. Load extension in chrome://extensions (developer mode)
2. Open popup → Settings → change theme to Light → verify popup switches
3. Change to System → change OS dark mode → verify it follows
4. Navigate to a blocked site → verify blocked.html uses correct theme
5. Reload extension → verify theme persists

---

### Task 2: Animations & Transitions

**Files:**
- Modify: `popup.html` (CSS animations)
- Modify: `blocked.html` (CSS animations)
- Modify: `blocked.js` (count-up JS)

#### Step 1: Popup animations

- [ ] **1.1: Add tab transition CSS to popup.html**

Add to popup.html's `<style>`:

```css
/* ── Animations ── */
@media (prefers-reduced-motion: no-preference) {
  .tab-content {
    animation: fadeSlideIn 150ms ease;
  }

  @keyframes fadeSlideIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .site-card {
    animation: fadeIn 200ms ease both;
  }

  .site-card:nth-child(1) { animation-delay: 0ms; }
  .site-card:nth-child(2) { animation-delay: 50ms; }
  .site-card:nth-child(3) { animation-delay: 100ms; }
  .site-card:nth-child(4) { animation-delay: 150ms; }
  .site-card:nth-child(5) { animation-delay: 200ms; }
  .site-card:nth-child(n+6) { animation-delay: 250ms; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .bar-fill {
    transition: width 400ms ease-out;
  }

  .badge-status {
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .btn-delete:hover {
    transform: scale(1.1);
    color: var(--danger);
    transition: all 150ms ease;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **1.2: Commit**

```bash
git add popup.html
git commit -m "feat: add popup animations with reduced-motion support"
```

#### Step 2: Blocked page animations

- [ ] **2.1: Add blocked page CSS animations**

Add to blocked.html's `<style>`:

```css
@media (prefers-reduced-motion: no-preference) {
  .logo-container {
    animation: floatUp 400ms ease both;
  }

  @keyframes floatUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .stat-card {
    animation: fadeIn 300ms ease both;
  }
  .stat-card:nth-child(1) { animation-delay: 100ms; }
  .stat-card:nth-child(2) { animation-delay: 200ms; }
  .stat-card:nth-child(3) { animation-delay: 300ms; }

  .quote-text {
    animation: fadeIn 400ms ease 400ms both;
  }

  .btn-bypass:hover {
    box-shadow: 0 0 12px var(--accent-subtle);
    transition: box-shadow 200ms ease;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* Override existing animations */
  .logo-orbit, .grid-bg { animation: none !important; }
}
```

- [ ] **2.2: Add count-up animation JS to blocked.js**

In `blocked.js`, find where stat values are set (e.g., `document.getElementById('statUsed').textContent = ...`) and wrap with a count-up function:

```js
function animateCountUp(element, targetValue, duration = 400) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = targetValue;
    return;
  }
  const target = parseInt(targetValue) || 0;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    element.textContent = Math.round(target * eased) + 'min';
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}
```

Call `animateCountUp()` instead of directly setting `.textContent` for the stat cards on page load.

- [ ] **2.3: Commit**

```bash
git add blocked.html blocked.js
git commit -m "feat: add blocked page animations and count-up effect"
```

- [ ] **2.4: Manual test**

1. Open popup → verify tab switching is smooth
2. Verify site cards appear with stagger effect
3. Get blocked → verify logo floats up, stats count up
4. In OS accessibility → enable reduced motion → verify all animations stop

---

## Chunk 2: Onboarding & Notifications (Tasks 3-4)

### Task 3: Onboarding (First-Use Experience)

**Files:**
- Modify: `popup.html` (onboarding overlay HTML + CSS)
- Modify: `popup.js` (onboarding flow logic)

#### Step 1: Add onboarding HTML

- [ ] **1.1: Add onboarding overlay HTML to popup.html**

Before the closing `</body>`, add:

```html
<!-- Onboarding Overlay -->
<div id="onboardingOverlay" class="onboarding-overlay" style="display:none;">
  <div class="onboarding-container">
    <!-- Step 1 -->
    <div class="onboarding-step" data-step="1">
      <div class="onboarding-icon">🛡️</div>
      <h2>Bem-vindo ao Focus Guard!</h2>
      <p>Controle seu tempo online com limites diarios para sites que distraem.</p>
      <div class="onboarding-actions">
        <button class="btn-skip" id="onboardingSkip">Pular</button>
        <button class="btn-next" id="onboardingNext1">Proximo</button>
      </div>
    </div>
    <!-- Step 2 -->
    <div class="onboarding-step" data-step="2" style="display:none;">
      <h2>Adicione seu primeiro site</h2>
      <div class="onboarding-suggestions">
        <button class="suggestion-chip" data-site="youtube.com">youtube.com</button>
        <button class="suggestion-chip" data-site="twitter.com">twitter.com</button>
        <button class="suggestion-chip" data-site="reddit.com">reddit.com</button>
        <button class="suggestion-chip" data-site="instagram.com">instagram.com</button>
        <button class="suggestion-chip" data-site="tiktok.com">tiktok.com</button>
      </div>
      <div class="onboarding-custom">
        <input type="text" id="onboardingSiteInput" placeholder="ou digite um dominio...">
        <input type="number" id="onboardingLimitInput" placeholder="30" min="1" value="30">
        <span class="limit-label">min/dia</span>
      </div>
      <button class="btn-add-onboarding" id="onboardingAdd" disabled>Adicionar</button>
      <div class="onboarding-added" id="onboardingAdded"></div>
      <div class="onboarding-actions">
        <button class="btn-skip" id="onboardingSkip2">Pular</button>
        <button class="btn-next" id="onboardingNext2">Proximo</button>
      </div>
    </div>
    <!-- Step 3 -->
    <div class="onboarding-step" data-step="3" style="display:none;">
      <div class="onboarding-icon">✅</div>
      <h2>Pronto!</h2>
      <p>Use a aba <strong>Settings</strong> para personalizar notificacoes, challenges e mais.</p>
      <button class="btn-next" id="onboardingFinish">Comecar</button>
    </div>
    <!-- Step indicators -->
    <div class="onboarding-dots">
      <span class="dot active"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>
</div>
```

- [ ] **1.2: Add onboarding CSS to popup.html**

```css
/* ── Onboarding ── */
.onboarding-overlay {
  position: fixed; inset: 0;
  background: var(--bg-primary);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.onboarding-container {
  padding: 32px 24px;
  text-align: center;
  width: 100%;
}
.onboarding-step { animation: fadeSlideIn 150ms ease; }
.onboarding-icon { font-size: 48px; margin-bottom: 16px; }
.onboarding-step h2 { font-size: 20px; color: var(--text-primary); margin-bottom: 8px; }
.onboarding-step p { color: var(--text-secondary); font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
.onboarding-suggestions {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 16px;
}
.suggestion-chip {
  padding: 6px 14px; border-radius: var(--radius-full);
  background: var(--accent-subtle); color: var(--accent);
  border: 1px solid var(--accent); cursor: pointer; font-size: 13px;
  transition: all var(--transition-fast);
}
.suggestion-chip:hover, .suggestion-chip.selected {
  background: var(--accent); color: white;
}
.onboarding-custom {
  display: flex; gap: 8px; align-items: center; justify-content: center; margin-bottom: 16px;
}
.onboarding-custom input[type="text"] {
  flex: 1; max-width: 180px; padding: 8px 12px;
  background: var(--bg-input); border: 1px solid var(--border-input);
  border-radius: var(--radius-md); color: var(--text-primary); font-size: 13px;
}
.onboarding-custom input[type="number"] {
  width: 60px; padding: 8px; text-align: center;
  background: var(--bg-input); border: 1px solid var(--border-input);
  border-radius: var(--radius-md); color: var(--text-primary); font-size: 13px;
}
.limit-label { color: var(--text-muted); font-size: 12px; }
.btn-add-onboarding {
  padding: 8px 20px; background: var(--accent); color: white;
  border: none; border-radius: var(--radius-md); cursor: pointer;
  font-size: 13px; margin-bottom: 12px;
}
.btn-add-onboarding:disabled { opacity: 0.5; cursor: not-allowed; }
.onboarding-added { color: var(--success); font-size: 13px; min-height: 20px; margin-bottom: 12px; }
.onboarding-actions { display: flex; gap: 12px; justify-content: center; margin-top: 16px; }
.btn-skip {
  padding: 8px 20px; background: transparent; color: var(--text-muted);
  border: 1px solid var(--border-secondary); border-radius: var(--radius-md);
  cursor: pointer; font-size: 13px;
}
.btn-next {
  padding: 8px 20px; background: var(--accent); color: white;
  border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 13px;
}
.onboarding-dots { display: flex; gap: 8px; justify-content: center; margin-top: 24px; }
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--border-secondary); transition: background var(--transition-fast);
}
.dot.active { background: var(--accent); }
```

- [ ] **1.3: Commit**

```bash
git add popup.html
git commit -m "feat: add onboarding overlay HTML and CSS"
```

#### Step 2: Onboarding JS logic

- [ ] **2.1: Add onboarding logic to popup.js**

```js
// ── Onboarding ──
function initOnboarding() {
  chrome.storage.local.get(['focusGuard_onboarded', 'focusGuard_sites'], (data) => {
    const onboarded = data.focusGuard_onboarded;
    const sites = data.focusGuard_sites || {};
    if (onboarded || Object.keys(sites).length > 0) return;

    const overlay = document.getElementById('onboardingOverlay');
    overlay.style.display = 'flex';
    let currentStep = 1;
    const dots = overlay.querySelectorAll('.dot');
    const addedSites = [];

    function showStep(n) {
      overlay.querySelectorAll('.onboarding-step').forEach(s => s.style.display = 'none');
      overlay.querySelector(`[data-step="${n}"]`).style.display = 'block';
      dots.forEach((d, i) => d.classList.toggle('active', i === n - 1));
      currentStep = n;
    }

    function finishOnboarding() {
      chrome.storage.local.set({ focusGuard_onboarded: true });
      overlay.style.display = 'none';
      if (typeof loadData === 'function') loadData();
    }

    // Skip buttons
    document.getElementById('onboardingSkip').addEventListener('click', finishOnboarding);
    document.getElementById('onboardingSkip2').addEventListener('click', finishOnboarding);

    // Next buttons
    document.getElementById('onboardingNext1').addEventListener('click', () => showStep(2));
    document.getElementById('onboardingNext2').addEventListener('click', () => showStep(3));
    document.getElementById('onboardingFinish').addEventListener('click', finishOnboarding);

    // Suggestion chips
    const siteInput = document.getElementById('onboardingSiteInput');
    const limitInput = document.getElementById('onboardingLimitInput');
    const addBtn = document.getElementById('onboardingAdd');

    overlay.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        overlay.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        siteInput.value = chip.dataset.site;
        addBtn.disabled = false;
      });
    });

    siteInput.addEventListener('input', () => {
      addBtn.disabled = !siteInput.value.trim();
      overlay.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('selected'));
    });

    addBtn.addEventListener('click', () => {
      const site = siteInput.value.trim().toLowerCase();
      const limit = parseInt(limitInput.value) || 30;
      if (!site) return;

      chrome.runtime.sendMessage({ type: 'addSite', pattern: site, limitMinutes: limit }, () => {
        addedSites.push(site);
        document.getElementById('onboardingAdded').textContent = `Adicionado: ${addedSites.join(', ')}`;
        siteInput.value = '';
        addBtn.disabled = true;
        overlay.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('selected'));
      });
    });
  });
}

// Call at DOMContentLoaded
initOnboarding();
```

- [ ] **2.2: Commit**

```bash
git add popup.js
git commit -m "feat: add onboarding flow logic"
```

- [ ] **2.3: Manual test**

1. Clear extension storage (chrome://extensions → Focus Guard → clear data)
2. Open popup → verify onboarding overlay appears
3. Click suggestion chip → verify it fills input
4. Add a site → verify confirmation text
5. Navigate through all 3 steps
6. Close popup, reopen → verify onboarding does NOT appear again
7. Test "Pular" button → verify it skips and sets onboarded flag

---

### Task 4: Smart Notifications

**Files:**
- Modify: `defaults.js` (notification defaults)
- Modify: `background.js` (notification logic in addUsage, new storage key)
- Modify: `popup.html` (notification settings UI)
- Modify: `popup.js` (notification settings logic)

#### Step 1: Add notification defaults and storage

- [ ] **1.1: Add notification defaults to defaults.js**

```js
NOTIFICATIONS: {
  enabled: true,
  thresholds: { 50: false, 75: true, 90: true }
},
```

- [ ] **1.2: Add NOTIFICATIONS storage key to background.js STORAGE_KEYS**

```js
NOTIFICATIONS: 'focusGuard_notifications', // { enabled, thresholds: { 50: bool, 75: bool, 90: bool } }
```

- [ ] **1.3: Add notification messages array to background.js**

```js
const NOTIFICATION_MESSAGES = {
  50: [
    'Voce ja usou metade do tempo em {site}. Ainda tem {remaining}min.',
    'Metade do limite atingida para {site}. Restam {remaining}min.',
    '50% do tempo usado em {site}. Use os {remaining}min restantes com sabedoria.'
  ],
  75: [
    'Atencao! Restam apenas {remaining}min para {site}.',
    '{site}: 75% do limite atingido. Faltam {remaining}min.',
    'Quase la! Apenas {remaining}min restantes para {site}.'
  ],
  90: [
    'Ultimos minutos! {site} sera bloqueado em {remaining}min.',
    'Alerta: apenas {remaining}min antes de {site} ser bloqueado!',
    '{site} sera bloqueado em breve. Restam {remaining}min.'
  ]
};
```

- [ ] **1.4: Commit**

```bash
git add defaults.js background.js
git commit -m "feat: add smart notification defaults and messages"
```

#### Step 2: Implement threshold checking in addUsage

- [ ] **2.1: Add threshold notification logic to background.js**

Find the existing `addUsage()` function. Inside, after usage is accumulated and before the block check, add logic to check notification thresholds:

```js
// Inside addUsage(), after incrementing usage and before block check:
async function checkNotificationThresholds(pattern, usedSeconds, limitSeconds) {
  const config = await new Promise(r =>
    chrome.storage.local.get(STORAGE_KEYS.NOTIFICATIONS, d =>
      r(d[STORAGE_KEYS.NOTIFICATIONS] || DEFAULTS.NOTIFICATIONS)
    )
  );
  if (!config.enabled) return;

  const pct = (usedSeconds / limitSeconds) * 100;
  const remaining = Math.ceil((limitSeconds - usedSeconds) / 60);

  for (const [threshold, enabled] of Object.entries(config.thresholds)) {
    if (!enabled) continue;
    const t = parseInt(threshold);
    const warnKey = `_warned${t}_${pattern}`;

    if (pct >= t) {
      const data = await new Promise(r => chrome.storage.local.get(warnKey, r));
      if (!data[warnKey]) {
        chrome.storage.local.set({ [warnKey]: true });
        const messages = NOTIFICATION_MESSAGES[t] || [];
        const msg = messages[Math.floor(Math.random() * messages.length)] || '';
        const text = msg.replace('{site}', pattern).replace('{remaining}', remaining);
        chrome.notifications.create(`threshold_${t}_${pattern}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Focus Guard',
          message: text
        });
      }
    }
  }
}
```

Call `checkNotificationThresholds(pattern, totalUsed, limitSeconds)` from within `addUsage()`.

- [ ] **2.2: Update resetIfNewDay to clear threshold warning flags**

In `_doResetIfNewDay()`, alongside clearing `_warned5_*` flags, also clear `_warned50_*`, `_warned75_*`, `_warned90_*` flags.

- [ ] **2.3: Commit**

```bash
git add background.js
git commit -m "feat: implement smart notification threshold checking"
```

#### Step 3: Notification settings UI

- [ ] **3.1: Add notification settings HTML to popup.html Settings tab**

```html
<div class="setting-group">
  <label class="setting-label">Notificacoes de Limite</label>
  <div class="threshold-toggles">
    <label class="toggle-row">
      <input type="checkbox" id="notify50"> 50% do limite
    </label>
    <label class="toggle-row">
      <input type="checkbox" id="notify75" checked> 75% do limite
    </label>
    <label class="toggle-row">
      <input type="checkbox" id="notify90" checked> 90% do limite
    </label>
  </div>
</div>
```

- [ ] **3.2: Wire up notification settings in popup.js**

```js
// Load notification settings
chrome.storage.local.get('focusGuard_notifications', (data) => {
  const config = data.focusGuard_notifications || { enabled: true, thresholds: { 50: false, 75: true, 90: true } };
  document.getElementById('notify50').checked = config.thresholds[50] || false;
  document.getElementById('notify75').checked = config.thresholds[75] !== false;
  document.getElementById('notify90').checked = config.thresholds[90] !== false;
});

['notify50', 'notify75', 'notify90'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    const config = {
      enabled: true,
      thresholds: {
        50: document.getElementById('notify50').checked,
        75: document.getElementById('notify75').checked,
        90: document.getElementById('notify90').checked
      }
    };
    chrome.storage.local.set({ focusGuard_notifications: config });
  });
});
```

- [ ] **3.3: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add notification threshold settings UI"
```

- [ ] **3.4: Manual test**

1. Open popup → Settings → verify threshold checkboxes appear with correct defaults
2. Toggle 50% on → verify it saves
3. Use a tracked site → at 50% of limit → verify notification appears
4. At 75% → verify notification
5. At 90% → verify notification
6. Reload page → verify same threshold doesn't re-notify (anti-spam)
7. Next day simulation (clear storage date) → verify flags reset

---

## Chunk 3: Pause & Focus Mode (Tasks 5-6)

### Task 5: Pause Without Disabling

**Files:**
- Modify: `background.js` (isPaused, addUsage check, resetIfNewDay, alarm, STORAGE_KEYS)
- Modify: `popup.html` (pause button + dropdown + banner)
- Modify: `popup.js` (pause logic)

#### Step 1: Backend pause logic

- [ ] **1.1: Add PAUSED and PAUSE_COUNT to STORAGE_KEYS in background.js**

```js
PAUSED: 'focusGuard_paused',           // { until: timestamp } | null
PAUSE_COUNT: 'focusGuard_pauseCount',  // number (max 3/day)
```

- [ ] **1.2: Add isPaused() function to background.js**

```js
async function isPaused() {
  const data = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.PAUSED, r));
  const paused = data[STORAGE_KEYS.PAUSED];
  if (!paused || !paused.until) return false;
  if (Date.now() >= paused.until) {
    // Expired, clear it
    chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
    return false;
  }
  return true;
}
```

- [ ] **1.3: Guard addUsage() with isPaused() check**

At the start of `addUsage()`, add:

```js
if (await isPaused()) return;
```

Note: if `addUsage` is not already async, make it async.

- [ ] **1.4: Guard updateBadge() with pause indicator**

In `updateBadge()`, add at the top:

```js
if (await isPaused()) {
  chrome.action.setBadgeText({ text: '⏸' });
  chrome.action.setBadgeBackgroundColor({ color: '#eab308' });
  return;
}
```

- [ ] **1.5: Add pause message handler**

```js
// In the chrome.runtime.onMessage listener, add:
case 'pauseTracking': {
  const countData = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.PAUSE_COUNT, r));
  const count = countData[STORAGE_KEYS.PAUSE_COUNT] || 0;
  if (count >= 3) {
    sendResponse({ success: false, reason: 'limit' });
    return true;
  }
  const nuclear = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.NUCLEAR, r));
  if (nuclear[STORAGE_KEYS.NUCLEAR]?.until > Date.now()) {
    sendResponse({ success: false, reason: 'nuclear' });
    return true;
  }
  const until = Date.now() + (msg.minutes * 60 * 1000);
  chrome.storage.local.set({
    [STORAGE_KEYS.PAUSED]: { until },
    [STORAGE_KEYS.PAUSE_COUNT]: count + 1
  });
  chrome.alarms.create('pauseEnd', { when: until });
  stopTracking();
  updateBadge();
  sendResponse({ success: true, until, remaining: 3 - count - 1 });
  return true;
}

case 'getPauseStatus': {
  const pData = await new Promise(r => chrome.storage.local.get([STORAGE_KEYS.PAUSED, STORAGE_KEYS.PAUSE_COUNT], r));
  const paused = pData[STORAGE_KEYS.PAUSED];
  const pCount = pData[STORAGE_KEYS.PAUSE_COUNT] || 0;
  sendResponse({
    active: paused?.until > Date.now(),
    until: paused?.until || null,
    pausesRemaining: 3 - pCount
  });
  return true;
}
```

- [ ] **1.6: Handle pauseEnd alarm**

In the `chrome.alarms.onAlarm` listener, add:

```js
if (alarm.name === 'pauseEnd') {
  chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
  initActiveTab(); // resume tracking
}
```

- [ ] **1.7: Reset pauseCount in resetIfNewDay**

In `_doResetIfNewDay()`, add:

```js
chrome.storage.local.set({ [STORAGE_KEYS.PAUSE_COUNT]: 0 });
chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
```

- [ ] **1.8: Commit**

```bash
git add background.js
git commit -m "feat: add pause tracking backend logic"
```

#### Step 2: Pause UI

- [ ] **2.1: Add pause button HTML to popup.html header**

In the header area (`.header-right` or similar), add:

```html
<div class="pause-wrapper" id="pauseWrapper">
  <button class="btn-pause" id="pauseBtn" title="Pausar tracking">⏸</button>
  <div class="pause-dropdown" id="pauseDropdown" style="display:none;">
    <button class="pause-option" data-minutes="5">5 min</button>
    <button class="pause-option" data-minutes="15">15 min</button>
    <button class="pause-option" data-minutes="30">30 min</button>
    <button class="pause-option" data-minutes="60">1 hora</button>
  </div>
</div>
```

- [ ] **2.2: Add pause banner HTML to popup.html (below header)**

```html
<div class="pause-banner" id="pauseBanner" style="display:none;">
  ⏸ Pausado — retoma em <span id="pauseCountdown">--:--</span>
  <span class="pause-remaining" id="pauseRemaining"></span>
</div>
```

- [ ] **2.3: Add pause CSS to popup.html**

```css
.pause-wrapper { position: relative; }
.btn-pause {
  background: transparent; border: 1px solid var(--border-secondary);
  color: var(--text-secondary); border-radius: var(--radius-md);
  padding: 4px 8px; cursor: pointer; font-size: 14px;
  transition: all var(--transition-fast);
}
.btn-pause:hover { border-color: var(--warning); color: var(--warning); }
.btn-pause:disabled { opacity: 0.3; cursor: not-allowed; }
.pause-dropdown {
  position: absolute; top: 100%; right: 0; margin-top: 4px;
  background: var(--bg-card); border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md); overflow: hidden; z-index: 100;
  box-shadow: 0 4px 12px var(--shadow);
}
.pause-option {
  display: block; width: 100%; padding: 8px 16px; border: none;
  background: transparent; color: var(--text-primary); cursor: pointer;
  font-size: 13px; text-align: left; white-space: nowrap;
}
.pause-option:hover { background: var(--accent-subtle); }
.pause-banner {
  padding: 8px 16px; text-align: center; font-size: 13px;
  background: var(--warning-subtle); color: var(--warning);
  border-bottom: 1px solid var(--warning);
}
.pause-remaining { font-size: 11px; color: var(--text-muted); margin-left: 8px; }
```

- [ ] **2.4: Wire up pause UI in popup.js**

```js
// ── Pause ──
const pauseBtn = document.getElementById('pauseBtn');
const pauseDropdown = document.getElementById('pauseDropdown');
const pauseBanner = document.getElementById('pauseBanner');
const pauseCountdown = document.getElementById('pauseCountdown');
const pauseRemaining = document.getElementById('pauseRemaining');
let pauseTimer = null;

function updatePauseUI() {
  chrome.runtime.sendMessage({ type: 'getPauseStatus' }, (res) => {
    if (!res) return;
    if (res.active) {
      pauseBanner.style.display = 'block';
      pauseBtn.disabled = true;
      pauseRemaining.textContent = `(${res.pausesRemaining} pausas restantes)`;
      clearInterval(pauseTimer);
      pauseTimer = setInterval(() => {
        const left = Math.max(0, res.until - Date.now());
        const min = Math.floor(left / 60000);
        const sec = Math.floor((left % 60000) / 1000);
        pauseCountdown.textContent = `${min}:${String(sec).padStart(2, '0')}`;
        if (left <= 0) {
          clearInterval(pauseTimer);
          pauseBanner.style.display = 'none';
          pauseBtn.disabled = false;
          if (typeof loadData === 'function') loadData();
        }
      }, 1000);
    } else {
      pauseBanner.style.display = 'none';
      pauseBtn.disabled = res.pausesRemaining <= 0;
      pauseRemaining.textContent = '';
    }

    // Hide pause during nuclear/focus
    chrome.runtime.sendMessage({ type: 'getNuclearInfo' }, (nuclear) => {
      const wrapper = document.getElementById('pauseWrapper');
      if (nuclear?.active) {
        wrapper.style.display = 'none';
      } else {
        wrapper.style.display = 'block';
      }
    });
  });
}

pauseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  pauseDropdown.style.display = pauseDropdown.style.display === 'none' ? 'block' : 'none';
});

document.addEventListener('click', () => pauseDropdown.style.display = 'none');

pauseDropdown.querySelectorAll('.pause-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const minutes = parseInt(btn.dataset.minutes);
    chrome.runtime.sendMessage({ type: 'pauseTracking', minutes }, (res) => {
      pauseDropdown.style.display = 'none';
      if (res?.success) updatePauseUI();
    });
  });
});

updatePauseUI();
```

- [ ] **2.5: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add pause button UI with dropdown and banner"
```

- [ ] **2.6: Manual test**

1. Open popup → verify pause button visible in header
2. Click pause → verify dropdown appears with 5/15/30/60 options
3. Select 5 min → verify yellow banner with countdown
4. Verify badge shows "⏸"
5. Wait for expiry → verify tracking resumes
6. Pause 3 times → verify button disabled after 3rd
7. Activate nuclear → verify pause button hidden
8. Next day (reset) → verify pause counter resets

---

### Task 6: Focus Mode (Selective Nuclear)

**Files:**
- Modify: `background.js` (activateFocusMode handler, adjust isNuclearBlocked)
- Modify: `popup.html` (focus mode button + modal)
- Modify: `popup.js` (focus mode logic)
- Modify: `blocked.html` (focus mode visual variant)
- Modify: `blocked.js` (detect focus vs nuclear)

#### Step 1: Backend focus mode

- [ ] **1.1: Add activateFocusMode message handler to background.js**

```js
case 'activateFocusMode': {
  const duration = Math.max(5, Math.min(480, msg.minutes || 30));
  const until = Date.now() + duration * 60000;
  const sites = msg.sites || []; // array of patterns
  chrome.storage.local.set({
    [STORAGE_KEYS.NUCLEAR]: { until, sites, mode: 'focus' }
  });
  // Increment focus mode counter
  const fmcData = await new Promise(r => chrome.storage.local.get('focusGuard_focusModeCount', r));
  chrome.storage.local.set({ focusGuard_focusModeCount: (fmcData.focusGuard_focusModeCount || 0) + 1 });

  chrome.alarms.create('nuclearEnd', { when: until });
  // Block matching tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    for (const pattern of sites) {
      if (matchesPattern(tab.url, pattern)) {
        const blockUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(pattern)}&focus=1`);
        chrome.tabs.update(tab.id, { url: blockUrl });
        break;
      }
    }
  }
  updateBadge();
  sendResponse({ success: true });
  return true;
}
```

- [ ] **1.2: Adjust isNuclearBlocked to differentiate focus vs nuclear**

The existing `isNuclearBlocked()` already supports arrays vs `'all'`. Ensure it checks `mode` field:

```js
// In isNuclearBlocked or wherever nuclear state is checked for the blocked page:
// If nuclear.mode === 'focus', set query param ?focus=1 on redirect
```

- [ ] **1.3: Commit**

```bash
git add background.js
git commit -m "feat: add focus mode backend with selective site blocking"
```

#### Step 2: Focus mode UI

- [ ] **2.1: Add focus mode button and modal to popup.html**

Above the sites list, add:

```html
<button class="btn-focus-mode" id="focusModeBtn">⚡ Modo Foco</button>

<div class="focus-modal-overlay" id="focusModal" style="display:none;">
  <div class="focus-modal">
    <h3>Modo Foco</h3>
    <p>Selecione os sites para bloquear:</p>
    <div class="focus-site-list" id="focusSiteList"></div>
    <div class="focus-duration">
      <label>Duracao:</label>
      <div class="focus-duration-options">
        <button class="duration-btn" data-min="15">15min</button>
        <button class="duration-btn active" data-min="30">30min</button>
        <button class="duration-btn" data-min="60">1h</button>
        <button class="duration-btn" data-min="120">2h</button>
        <input type="number" class="duration-custom" id="focusCustomMin" placeholder="min" min="5" max="480">
      </div>
    </div>
    <div class="focus-actions">
      <button class="btn-cancel-focus" id="focusCancel">Cancelar</button>
      <button class="btn-start-focus" id="focusStart">Iniciar Foco</button>
    </div>
  </div>
</div>
```

- [ ] **2.2: Add focus mode CSS to popup.html**

```css
.btn-focus-mode {
  width: 100%; padding: 10px; margin-bottom: 12px;
  background: var(--accent-subtle); color: var(--accent);
  border: 1px solid var(--accent); border-radius: var(--radius-md);
  cursor: pointer; font-size: 14px; font-weight: 600;
  transition: all var(--transition-fast);
}
.btn-focus-mode:hover { background: var(--accent); color: white; }
.focus-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  z-index: 500; display: flex; align-items: center; justify-content: center;
}
.focus-modal {
  background: var(--bg-card); border: 1px solid var(--border-secondary);
  border-radius: var(--radius-lg); padding: 20px; width: 340px; max-height: 400px;
  overflow-y: auto;
}
.focus-modal h3 { color: var(--accent); margin-bottom: 8px; font-size: 16px; }
.focus-modal p { color: var(--text-secondary); font-size: 13px; margin-bottom: 12px; }
.focus-site-list { max-height: 150px; overflow-y: auto; margin-bottom: 12px; }
.focus-site-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  color: var(--text-primary); font-size: 13px;
}
.focus-site-item input[type="checkbox"] { accent-color: var(--accent); }
.focus-duration { margin-bottom: 16px; }
.focus-duration label { color: var(--text-secondary); font-size: 12px; display: block; margin-bottom: 6px; }
.focus-duration-options { display: flex; gap: 6px; flex-wrap: wrap; }
.duration-btn {
  padding: 6px 12px; border: 1px solid var(--border-secondary);
  background: transparent; color: var(--text-primary);
  border-radius: var(--radius-md); cursor: pointer; font-size: 12px;
}
.duration-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
.duration-custom {
  width: 60px; padding: 6px; border: 1px solid var(--border-input);
  background: var(--bg-input); color: var(--text-primary);
  border-radius: var(--radius-md); font-size: 12px; text-align: center;
}
.focus-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn-cancel-focus {
  padding: 8px 16px; background: transparent; color: var(--text-muted);
  border: 1px solid var(--border-secondary); border-radius: var(--radius-md); cursor: pointer;
}
.btn-start-focus {
  padding: 8px 16px; background: var(--accent); color: white;
  border: none; border-radius: var(--radius-md); cursor: pointer; font-weight: 600;
}

/* Focus banner (replaces nuclear banner when mode=focus) */
.focus-banner {
  padding: 8px 16px; text-align: center; font-size: 13px;
  background: var(--accent-subtle); color: var(--accent);
  border-bottom: 1px solid var(--accent);
}
```

- [ ] **2.3: Wire up focus mode JS in popup.js**

```js
// ── Focus Mode ──
const focusModeBtn = document.getElementById('focusModeBtn');
const focusModal = document.getElementById('focusModal');
const focusSiteList = document.getElementById('focusSiteList');
let focusDuration = 30;

focusModeBtn.addEventListener('click', () => {
  // Populate site list
  chrome.runtime.sendMessage({ type: 'getSites' }, (sites) => {
    focusSiteList.innerHTML = '';
    for (const [pattern] of Object.entries(sites || {})) {
      const item = document.createElement('label');
      item.className = 'focus-site-item';
      item.innerHTML = `<input type="checkbox" checked value="${pattern}"> ${pattern}`;
      focusSiteList.appendChild(item);
    }
    focusModal.style.display = 'flex';
  });
});

document.getElementById('focusCancel').addEventListener('click', () => {
  focusModal.style.display = 'none';
});

focusModal.querySelectorAll('.duration-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    focusModal.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    focusDuration = parseInt(btn.dataset.min);
    document.getElementById('focusCustomMin').value = '';
  });
});

document.getElementById('focusCustomMin').addEventListener('input', (e) => {
  if (e.target.value) {
    focusDuration = parseInt(e.target.value) || 30;
    focusModal.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
  }
});

document.getElementById('focusStart').addEventListener('click', () => {
  const checked = focusSiteList.querySelectorAll('input[type="checkbox"]:checked');
  const sites = Array.from(checked).map(cb => cb.value);
  if (sites.length === 0) return;
  chrome.runtime.sendMessage({
    type: 'activateFocusMode',
    minutes: focusDuration,
    sites
  }, () => {
    focusModal.style.display = 'none';
    if (typeof loadData === 'function') loadData();
  });
});
```

- [ ] **2.4: Update nuclear banner in popup to show focus variant**

In the existing nuclear banner rendering logic in popup.js, check `mode` field:

```js
// When rendering nuclear banner, check:
// if nuclear.mode === 'focus' → show focus-banner class with indigo instead of nuclear red
```

- [ ] **2.5: Update blocked page to detect focus mode**

In `blocked.js`, check URL params for `?focus=1` and adjust visual treatment:
- Title: "Modo Foco ativo" instead of "Tempo esgotado!"
- Color scheme: indigo instead of red for accent elements
- Hide bypass buttons (same as nuclear)

- [ ] **2.6: Commit**

```bash
git add popup.html popup.js background.js blocked.html blocked.js
git commit -m "feat: add Focus Mode with selective site blocking"
```

- [ ] **2.7: Manual test**

1. Open popup → verify "Modo Foco" button appears
2. Click → verify modal with site checkboxes and duration options
3. Uncheck one site, set 15min → click "Iniciar Foco"
4. Verify checked sites are blocked, unchecked site works
5. Verify blocked page shows "Modo Foco" with indigo theme
6. Verify focus banner (indigo) in popup, not nuclear (red)
7. Verify pause button is hidden during focus mode
8. Wait for expiry → verify sites unblock

---

## Chunk 4: Weekly Goals & Expanded History (Tasks 7-8)

### Task 7: Weekly Goals

**Files:**
- Modify: `defaults.js` (goals default)
- Modify: `background.js` (STORAGE_KEYS)
- Modify: `popup.html` (goals card + settings UI)
- Modify: `popup.js` (goals logic + rendering)

#### Step 1: Goals storage and defaults

- [ ] **1.1: Add goals storage key and default**

In `background.js` STORAGE_KEYS:
```js
GOALS: 'focusGuard_goals', // { general: minutes, sites: { pattern: minutes } }
```

In `defaults.js`:
```js
GOALS: null,
```

- [ ] **1.2: Commit**

```bash
git add defaults.js background.js
git commit -m "feat: add weekly goals storage key"
```

#### Step 2: Goals settings UI

- [ ] **2.1: Add goals settings section to popup.html Settings tab**

```html
<div class="setting-group">
  <label class="setting-label">Metas Semanais</label>
  <div class="goal-setting">
    <label class="toggle-row">
      <span>Meta geral semanal:</span>
      <input type="number" id="goalGeneral" placeholder="horas" min="1" max="168" style="width:60px;">
      <span class="limit-label">h/semana</span>
    </label>
  </div>
  <p class="setting-hint">Defina um objetivo motivacional de tempo maximo por semana. Nao bloqueia — apenas acompanha.</p>
</div>
```

- [ ] **2.2: Wire up goals settings in popup.js**

```js
// ── Weekly Goals ──
const goalGeneralInput = document.getElementById('goalGeneral');

chrome.storage.local.get('focusGuard_goals', (data) => {
  const goals = data.focusGuard_goals;
  if (goals?.general) goalGeneralInput.value = Math.round(goals.general / 60);
});

goalGeneralInput.addEventListener('change', () => {
  const hours = parseInt(goalGeneralInput.value);
  if (hours > 0) {
    chrome.storage.local.set({ focusGuard_goals: { general: hours * 60, sites: {} } });
  } else {
    chrome.storage.local.remove('focusGuard_goals');
  }
  renderGoalCard();
});
```

- [ ] **2.3: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add weekly goals settings UI"
```

#### Step 3: Goals progress card

- [ ] **3.1: Add goals card HTML to popup.html (top of Sites tab)**

```html
<div class="goal-card" id="goalCard" style="display:none;">
  <div class="goal-header">
    <span class="goal-title">Meta Semanal</span>
    <span class="goal-badge" id="goalBadge"></span>
  </div>
  <div class="goal-progress-bar">
    <div class="goal-fill" id="goalFill"></div>
  </div>
  <span class="goal-text" id="goalText"></span>
</div>
```

- [ ] **3.2: Add goals card CSS to popup.html**

```css
.goal-card {
  padding: 12px 16px; margin: 12px 16px 0;
  background: var(--bg-card); border: 1px solid var(--border-secondary);
  border-radius: var(--radius-md);
}
.goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.goal-title { color: var(--text-secondary); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.goal-badge {
  font-size: 11px; padding: 2px 8px; border-radius: var(--radius-full); font-weight: 600;
}
.goal-badge.achieved {
  background: var(--success-subtle); color: var(--success);
  animation: goalGlow 400ms ease;
}
@keyframes goalGlow {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); box-shadow: 0 0 8px var(--success); }
  100% { transform: scale(1); }
}
.goal-progress-bar {
  height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden;
}
.goal-fill {
  height: 100%; border-radius: 3px; transition: width 400ms ease-out;
}
.goal-fill.green { background: var(--success); }
.goal-fill.yellow { background: var(--warning); }
.goal-fill.red { background: var(--danger); }
.goal-text { font-size: 12px; color: var(--text-muted); margin-top: 6px; display: block; }
```

- [ ] **3.3: Add renderGoalCard function to popup.js**

```js
function renderGoalCard() {
  const goalCard = document.getElementById('goalCard');
  chrome.storage.local.get(['focusGuard_goals', 'focusGuard_history', 'focusGuard_usage'], (data) => {
    const goals = data.focusGuard_goals;
    if (!goals?.general) { goalCard.style.display = 'none'; return; }

    goalCard.style.display = 'block';
    // Calculate weekly total (reuse getWeeklyUsage pattern)
    const history = data.focusGuard_history || {};
    const usage = data.focusGuard_usage || {};
    const today = new Date();
    let totalSeconds = 0;

    // Sum today
    for (const sec of Object.values(usage)) totalSeconds += sec;

    // Sum last 6 days from history
    for (let i = 1; i <= 6; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const dayData = history[key];
      if (dayData) {
        for (const sec of Object.values(dayData)) totalSeconds += sec;
      }
    }

    const usedHours = totalSeconds / 3600;
    const goalHours = goals.general / 60;
    const pct = Math.min((usedHours / goalHours) * 100, 100);

    const fill = document.getElementById('goalFill');
    fill.style.width = `${pct}%`;
    fill.className = 'goal-fill ' + (pct < 70 ? 'green' : pct < 90 ? 'yellow' : 'red');

    document.getElementById('goalText').textContent =
      `${usedHours.toFixed(1)}h de ${goalHours.toFixed(0)}h usadas esta semana`;

    const badge = document.getElementById('goalBadge');
    if (pct <= 100 && today.getDay() === 0) { // Sunday = week end check
      badge.textContent = 'Meta cumprida!';
      badge.className = 'goal-badge achieved';
    } else {
      badge.textContent = `${Math.round(pct)}%`;
      badge.className = 'goal-badge';
      badge.style.color = pct < 70 ? 'var(--success)' : pct < 90 ? 'var(--warning)' : 'var(--danger)';
    }
  });
}

// Call renderGoalCard inside loadData or refreshUsage
```

- [ ] **3.4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add weekly goals progress card"
```

- [ ] **3.5: Manual test**

1. Settings → set weekly goal to 5 hours
2. Sites tab → verify goal card appears at top
3. Use tracked sites → verify progress bar updates
4. Verify colors: green <70%, yellow 70-90%, red >90%
5. Remove goal (clear input) → verify card disappears

---

### Task 8: Expanded History (365 days + Contribution Graph)

**Files:**
- Modify: `defaults.js` (HISTORY_DAYS → 365)
- Modify: `background.js` (saveToHistory compression, remove 30-day limit)
- Modify: `popup.html` (contribution graph HTML + CSS)
- Modify: `popup.js` (contribution graph rendering)

#### Step 1: Expand history retention

- [ ] **1.1: Update HISTORY_DAYS in defaults.js**

```js
HISTORY_DAYS: 365,
```

- [ ] **1.2: Update saveToHistory in background.js**

Find `saveToHistory()` and:
1. Replace any hardcoded `30` with `DEFAULTS.HISTORY_DAYS`
2. Add compression logic:

```js
// After saving today's data, compress old entries
function compressHistory(history) {
  const now = new Date();
  const compressionThreshold = 90; // days
  const maxDays = DEFAULTS.HISTORY_DAYS;

  for (const dateKey of Object.keys(history)) {
    const date = new Date(dateKey);
    const ageDays = Math.floor((now - date) / 86400000);

    if (ageDays > maxDays) {
      delete history[dateKey]; // Too old, remove
    } else if (ageDays > compressionThreshold) {
      // Compress to total only
      const dayData = history[dateKey];
      if (dayData && !dayData._total && typeof dayData === 'object') {
        let total = 0;
        for (const val of Object.values(dayData)) total += val;
        history[dateKey] = { _total: total };
      }
    }
  }
  return history;
}
```

Call `compressHistory(history)` before saving back to storage in `saveToHistory()`.

- [ ] **1.3: Commit**

```bash
git add defaults.js background.js
git commit -m "feat: expand history to 365 days with compression"
```

#### Step 2: Contribution graph

- [ ] **2.1: Add contribution graph HTML to popup.html History tab**

```html
<div class="history-section">
  <div class="history-section-header">
    <span>Atividade</span>
    <div class="graph-toggle">
      <button class="graph-toggle-btn active" data-range="26">26 sem</button>
      <button class="graph-toggle-btn" data-range="52">Ano</button>
    </div>
  </div>
  <div class="contribution-container" id="contributionContainer">
    <div class="contribution-graph" id="contributionGraph"></div>
    <div class="contribution-legend">
      <span class="legend-label">Menos</span>
      <span class="legend-cell" style="background: var(--bg-tertiary);"></span>
      <span class="legend-cell" style="background: #166534;"></span>
      <span class="legend-cell" style="background: #15803d;"></span>
      <span class="legend-cell" style="background: #22c55e;"></span>
      <span class="legend-cell" style="background: var(--danger);"></span>
      <span class="legend-label">Mais</span>
    </div>
  </div>
  <div class="contribution-tooltip" id="contributionTooltip" style="display:none;"></div>
</div>
```

- [ ] **2.2: Add contribution graph CSS to popup.html**

```css
.contribution-container { overflow-x: auto; padding: 8px 0; }
.contribution-graph {
  display: grid;
  grid-template-rows: repeat(7, 1fr);
  grid-auto-flow: column;
  gap: 2px;
  width: fit-content;
}
.contrib-cell {
  width: 8px; height: 8px; border-radius: 1px;
  background: var(--bg-tertiary); cursor: pointer;
  transition: outline 100ms ease;
}
.contrib-cell:hover { outline: 1px solid var(--text-muted); }
.contrib-cell.level-1 { background: #166534; }
.contrib-cell.level-2 { background: #15803d; }
.contrib-cell.level-3 { background: #22c55e; }
.contrib-cell.level-over { background: var(--danger); }
.contribution-legend {
  display: flex; align-items: center; gap: 3px;
  margin-top: 8px; justify-content: flex-end;
}
.legend-label { font-size: 10px; color: var(--text-muted); }
.legend-cell { width: 8px; height: 8px; border-radius: 1px; }
.contribution-tooltip {
  position: absolute; padding: 6px 10px;
  background: var(--bg-card); border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm); font-size: 11px; color: var(--text-primary);
  pointer-events: none; z-index: 200; box-shadow: 0 2px 8px var(--shadow);
  white-space: nowrap;
}
.graph-toggle { display: flex; gap: 4px; }
.graph-toggle-btn {
  padding: 2px 8px; font-size: 11px; border: 1px solid var(--border-secondary);
  background: transparent; color: var(--text-muted); border-radius: var(--radius-sm); cursor: pointer;
}
.graph-toggle-btn.active { background: var(--accent); color: white; border-color: var(--accent); }
```

- [ ] **2.3: Add contribution graph rendering to popup.js**

```js
function renderContributionGraph(weeks = 26) {
  const graph = document.getElementById('contributionGraph');
  graph.innerHTML = '';

  chrome.storage.local.get(['focusGuard_history', 'focusGuard_usage', 'focusGuard_sites'], (data) => {
    const history = data.focusGuard_history || {};
    const usage = data.focusGuard_usage || {};
    const sites = data.focusGuard_sites || {};
    const today = new Date();
    const totalDays = weeks * 7;

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      let totalSec = 0;
      let overLimit = false;

      if (i === 0) {
        // Today: use live usage
        for (const [pattern, sec] of Object.entries(usage)) {
          totalSec += sec;
          if (sites[pattern] && sec > sites[pattern] * 60) overLimit = true;
        }
      } else {
        const dayData = history[key];
        if (dayData) {
          if (dayData._total !== undefined) {
            totalSec = dayData._total;
          } else {
            for (const [pattern, sec] of Object.entries(dayData)) {
              totalSec += sec;
              if (sites[pattern] && sec > sites[pattern] * 60) overLimit = true;
            }
          }
        }
      }

      const totalMin = totalSec / 60;
      let level = '';
      if (overLimit) level = 'level-over';
      else if (totalMin > 120) level = 'level-3';
      else if (totalMin > 60) level = 'level-2';
      else if (totalMin > 0) level = 'level-1';

      const cell = document.createElement('div');
      cell.className = `contrib-cell ${level}`;
      cell.dataset.date = key;
      cell.dataset.minutes = Math.round(totalMin);

      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
      cell.addEventListener('mouseenter', (e) => {
        const tooltip = document.getElementById('contributionTooltip');
        tooltip.textContent = `${dayNames[d.getDay()]}, ${d.getDate()}/${d.getMonth()+1} — ${Math.round(totalMin)}min`;
        tooltip.style.display = 'block';
        const rect = e.target.getBoundingClientRect();
        const popupRect = document.body.getBoundingClientRect();
        tooltip.style.left = `${rect.left - popupRect.left}px`;
        tooltip.style.top = `${rect.top - popupRect.top - 30}px`;
      });
      cell.addEventListener('mouseleave', () => {
        document.getElementById('contributionTooltip').style.display = 'none';
      });

      graph.appendChild(cell);
    }
  });
}

// Graph toggle buttons
document.querySelectorAll('.graph-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.graph-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderContributionGraph(parseInt(btn.dataset.range));
  });
});

// Call renderContributionGraph() inside loadHistory
```

- [ ] **2.4: Commit**

```bash
git add defaults.js background.js popup.html popup.js
git commit -m "feat: add contribution graph and 365-day history"
```

- [ ] **2.5: Manual test**

1. History tab → verify contribution graph renders (26 weeks default)
2. Click "Ano" toggle → verify graph expands with scroll
3. Hover cells → verify tooltip shows date + minutes
4. Verify colors: grey=no use, green shades=use, red=over limit
5. Verify old data (>90 days) gets compressed to `_total` on next day reset

---

## Chunk 5: Achievements System (Task 9)

### Task 9: Achievements / Badges

**Files:**
- Modify: `background.js` (achievement checks, counters, message handlers)
- Modify: `blocked.js` (breathing/pomodoro completion messages)
- Modify: `popup.html` (achievements section in History tab)
- Modify: `popup.js` (achievements rendering)

#### Step 1: Achievement definitions and checking logic

- [ ] **1.1: Add achievement definitions to background.js**

```js
const ACHIEVEMENTS = {
  first_block:     { name: 'Primeiro Limite',  icon: '🛡️', desc: 'Ser bloqueado pela primeira vez' },
  first_challenge: { name: 'Desafio Aceito',   icon: '✍️', desc: 'Completar primeiro challenge' },
  first_nuclear:   { name: 'Botao Vermelho',   icon: '☢️', desc: 'Ativar nuclear pela primeira vez' },
  streak_3:        { name: 'Foco Iniciante',   icon: '🔥', desc: 'Streak de 3 dias' },
  streak_7:        { name: 'Semana Perfeita',   icon: '⭐', desc: 'Streak de 7 dias' },
  streak_30:       { name: 'Mes de Ferro',      icon: '💎', desc: 'Streak de 30 dias' },
  sites_5:         { name: 'Guardiao',          icon: '🏰', desc: 'Rastrear 5 sites simultaneos' },
  focus_10:        { name: 'Modo Foco x10',     icon: '⚡', desc: 'Usar Modo Foco 10 vezes' },
  breathe_5:       { name: 'Respiracao Zen',    icon: '🧘', desc: 'Completar 5 exercicios de respiracao' },
  pomodoro_10:     { name: 'Pomodoro Master',   icon: '🍅', desc: 'Completar 10 ciclos de pomodoro' },
  no_bypass_7:     { name: 'Sem Atalhos',       icon: '💪', desc: '7 dias sem usar bypass/extra time' },
  veteran:         { name: 'Veterano',          icon: '🎖️', desc: 'Usar Focus Guard por 30 dias' }
};

async function checkAndUnlockAchievement(id) {
  const data = await new Promise(r => chrome.storage.local.get('focusGuard_achievements', r));
  const achievements = data.focusGuard_achievements || {};
  if (achievements[id]) return; // Already unlocked

  achievements[id] = { unlockedAt: Date.now() };
  chrome.storage.local.set({ focusGuard_achievements: achievements });

  const def = ACHIEVEMENTS[id];
  if (def) {
    chrome.notifications.create(`achievement_${id}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Conquista Desbloqueada!',
      message: `${def.icon} ${def.name} — ${def.desc}`
    });
  }
}
```

- [ ] **1.2: Add achievement trigger points in background.js**

Insert `checkAndUnlockAchievement()` calls at the appropriate locations:

- In `blockSite()`: `checkAndUnlockAchievement('first_block')`
- In challenge verify handler (when challenge passes): `checkAndUnlockAchievement('first_challenge')`
- In `activateNuclear` handler: `checkAndUnlockAchievement('first_nuclear')`
- In `_doResetIfNewDay()` after streak update:
  ```js
  if (streak.current >= 3) checkAndUnlockAchievement('streak_3');
  if (streak.current >= 7) checkAndUnlockAchievement('streak_7');
  if (streak.current >= 30) checkAndUnlockAchievement('streak_30');
  ```
- In `addSite` handler: check if `Object.keys(sites).length >= 5` → `checkAndUnlockAchievement('sites_5')`
- In `activateFocusMode` handler: check `focusGuard_focusModeCount >= 10` → `checkAndUnlockAchievement('focus_10')`
- In `_doResetIfNewDay()`: check `focusGuard_noBypassDays >= 7` → `checkAndUnlockAchievement('no_bypass_7')`
- In `_doResetIfNewDay()`: count total days tracked (history keys count) → if >= 30: `checkAndUnlockAchievement('veteran')`

- [ ] **1.3: Add breathing/pomodoro counter message handlers**

```js
case 'breathingCompleted': {
  const bcData = await new Promise(r => chrome.storage.local.get('focusGuard_breathingCount', r));
  const count = (bcData.focusGuard_breathingCount || 0) + 1;
  chrome.storage.local.set({ focusGuard_breathingCount: count });
  if (count >= 5) checkAndUnlockAchievement('breathe_5');
  sendResponse({ count });
  return true;
}

case 'pomodoroCompleted': {
  const pcData = await new Promise(r => chrome.storage.local.get('focusGuard_pomodoroCount', r));
  const count = (pcData.focusGuard_pomodoroCount || 0) + 1;
  chrome.storage.local.set({ focusGuard_pomodoroCount: count });
  if (count >= 10) checkAndUnlockAchievement('pomodoro_10');
  sendResponse({ count });
  return true;
}

case 'getAchievements': {
  const aData = await new Promise(r => chrome.storage.local.get('focusGuard_achievements', r));
  sendResponse({ achievements: aData.focusGuard_achievements || {}, definitions: ACHIEVEMENTS });
  return true;
}
```

- [ ] **1.4: Update no_bypass_days tracking in _doResetIfNewDay**

```js
// Inside _doResetIfNewDay, after streak evaluation:
const bypassed = data[STORAGE_KEYS.BYPASSED] || {};
const extra = data[STORAGE_KEYS.EXTRA] || {};
const usedBypass = Object.keys(bypassed).length > 0 || Object.keys(extra).length > 0;

const nbdData = await new Promise(r => chrome.storage.local.get('focusGuard_noBypassDays', r));
let noBypassDays = nbdData.focusGuard_noBypassDays || 0;
if (!usedBypass) {
  noBypassDays++;
} else {
  noBypassDays = 0;
}
chrome.storage.local.set({ focusGuard_noBypassDays: noBypassDays });
if (noBypassDays >= 7) checkAndUnlockAchievement('no_bypass_7');
```

- [ ] **1.5: Commit**

```bash
git add background.js
git commit -m "feat: add achievements system with trigger points"
```

#### Step 2: Send completion messages from blocked.js

- [ ] **2.1: Send breathing completion message from blocked.js**

Find where breathing exercise completes a full cycle (all phases done). Add:

```js
chrome.runtime.sendMessage({ type: 'breathingCompleted' });
```

- [ ] **2.2: Send pomodoro completion message from blocked.js**

Find where a pomodoro focus cycle completes (timer hits 0 in focus phase). Add:

```js
chrome.runtime.sendMessage({ type: 'pomodoroCompleted' });
```

- [ ] **2.3: Commit**

```bash
git add blocked.js
git commit -m "feat: send breathing/pomodoro completion messages for achievements"
```

#### Step 3: Achievements UI

- [ ] **3.1: Add achievements section HTML to popup.html History tab**

After the streak card in History tab:

```html
<div class="achievements-section">
  <h3 class="section-title">Conquistas</h3>
  <div class="achievements-grid" id="achievementsGrid"></div>
</div>
```

- [ ] **3.2: Add achievements CSS to popup.html**

```css
.achievements-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 8px; padding: 0 16px;
}
.achievement-item {
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 4px; border-radius: var(--radius-md);
  background: var(--bg-card); border: 1px solid var(--border-secondary);
  text-align: center; position: relative;
}
.achievement-item.locked {
  opacity: 0.4; filter: grayscale(100%);
}
.achievement-icon { font-size: 24px; margin-bottom: 4px; }
.achievement-name { font-size: 10px; color: var(--text-secondary); line-height: 1.2; }
.achievement-item.locked .achievement-icon::after {
  content: '?'; position: absolute; font-size: 16px;
  color: var(--text-muted); top: 8px;
}
.achievement-item:not(.locked) {
  border-color: var(--accent);
  box-shadow: 0 0 4px var(--accent-subtle);
}
```

- [ ] **3.3: Add achievements rendering to popup.js**

```js
function renderAchievements() {
  chrome.runtime.sendMessage({ type: 'getAchievements' }, (res) => {
    if (!res) return;
    const grid = document.getElementById('achievementsGrid');
    grid.innerHTML = '';

    for (const [id, def] of Object.entries(res.definitions)) {
      const unlocked = res.achievements[id];
      const item = document.createElement('div');
      item.className = `achievement-item ${unlocked ? '' : 'locked'}`;
      item.title = unlocked
        ? `${def.name}: ${def.desc}\nDesbloqueado em ${new Date(unlocked.unlockedAt).toLocaleDateString('pt-BR')}`
        : def.desc;
      item.innerHTML = `
        <span class="achievement-icon">${unlocked ? def.icon : '?'}</span>
        <span class="achievement-name">${unlocked ? def.name : '???'}</span>
      `;
      grid.appendChild(item);
    }
  });
}

// Call renderAchievements() inside loadHistory
```

- [ ] **3.4: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add achievements grid UI in History tab"
```

- [ ] **3.5: Manual test**

1. History tab → verify 12 achievement slots (mostly locked/grey)
2. Add 5 sites → verify "Guardiao" unlocks with notification
3. Get blocked → verify "Primeiro Limite" unlocks
4. Complete a challenge → verify "Desafio Aceito" unlocks
5. Activate nuclear → verify "Botao Vermelho" unlocks
6. Hover locked achievement → verify tooltip shows description
7. Hover unlocked → verify tooltip shows name + unlock date

---

## Chunk 6: Final Polish (Task 10)

### Task 10: Version Bump & Final Integration

**Files:**
- Modify: `manifest.json` (version bump)
- All files (final integration check)

- [ ] **10.1: Update manifest.json version to 3.0**

```json
"version": "3.0",
```

- [ ] **10.2: Update manifest description**

```json
"description": "Controle seu tempo online com limites diarios, modo foco, conquistas e mais. Tema claro/escuro, historico de 365 dias.",
```

- [ ] **10.3: Full integration test**

1. Clear extension data, reload extension
2. Verify onboarding appears on first load
3. Add sites via onboarding
4. Switch theme to Light → verify popup and blocked page
5. Switch to System → toggle OS dark mode → verify
6. Verify animations play (tabs, cards, bars)
7. Enable reduced motion in OS → verify animations stop
8. Set notification thresholds → use tracked site → verify notifications at 50/75/90%
9. Use "Modo Foco" → select specific sites → verify only those blocked
10. Verify blocked page shows "Modo Foco" style (indigo)
11. Pause tracking → verify countdown + badge
12. Pause 3x → verify button disabled
13. Set weekly goal → verify progress card
14. Check History tab → verify contribution graph
15. Toggle graph between 26 weeks and full year
16. Check achievements → verify earned ones are lit up
17. Activate Nuclear → verify pause button hidden
18. Export config → verify new settings included
19. Import config → verify new settings applied

- [ ] **10.4: Commit version bump**

```bash
git add manifest.json
git commit -m "chore: bump version to 3.0"
```

- [ ] **10.5: Create v3.0 zip for Chrome Web Store**

```bash
cd /c/Users/Baldez/Desktop/focus-guard
zip -r ../focus-guard-v3.0.zip . -x ".git/*" ".gitnexus/*" "docs/*" "node_modules/*" ".claude/*" "CLAUDE.md" "AGENTS.md"
```

Verify the zip contains only extension files needed for submission.
