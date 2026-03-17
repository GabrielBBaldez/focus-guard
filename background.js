importScripts('defaults.js');

// Focus Guard - Background Service Worker
// Tracks time spent on configured sites and blocks when limit exceeded

const STORAGE_KEYS = {
  SITES: 'focusGuard_sites',        // { pattern: limitMinutes }
  USAGE: 'focusGuard_usage',        // { pattern: secondsUsed }
  USAGE_DATE: 'focusGuard_date',    // "YYYY-MM-DD"
  ENABLED: 'focusGuard_enabled',    // boolean
  BYPASSED: 'focusGuard_bypassed',  // { pattern: true } - ignored for today
  EXTRA: 'focusGuard_extra',        // { pattern: extraSeconds } - bonus time
  HISTORY: 'focusGuard_history',    // { "YYYY-MM-DD": { pattern: seconds } }
  NUCLEAR: 'focusGuard_nuclear',    // { until: timestamp, sites: 'all' | [patterns] }
  SCHEDULE: 'focusGuard_schedule',  // { pattern: { days: [0-6], startHour: 0-23, startMin: 0-59, endHour: 0-23, endMin: 0-59 } }
  CHALLENGE: 'focusGuard_challenge', // { enabled: boolean, difficulty: 'easy'|'medium'|'hard' }
  WEEKLY_LIMITS: 'focusGuard_weeklyLimits', // { pattern: limitMinutes }
  EXTRA_TIME_MIN: 'focusGuard_extraTimeMin', // number (default 5)
  ENTRY_CHALLENGE: 'focusGuard_entryChallenge', // { enabled: boolean }
  ENTRY_PASSED: 'focusGuard_entryPassed', // { pattern: timestamp } - entry challenges passed today
  THEME: 'focusGuard_theme', // 'dark' | 'light' | 'system'
  NOTIFICATIONS: 'focusGuard_notifications', // { enabled: boolean, thresholds: { 50: bool, 75: bool, 90: bool } }
  PAUSED: 'focusGuard_paused',           // { until: timestamp } | null
  PAUSE_COUNT: 'focusGuard_pauseCount',   // number (max 3/day)
  GOALS: 'focusGuard_goals',              // { general: hours } | null
  STREAK: 'focusGuard_streak',
  NO_BYPASS_DAYS: 'focusGuard_noBypassDays',
  BREATHING_COUNT: 'focusGuard_breathingCount',
  POMODORO_COUNT: 'focusGuard_pomodoroCount',
  FOCUS_MODE_COUNT: 'focusGuard_focusModeCount',
  ACHIEVEMENTS: 'focusGuard_achievements',
  ONBOARDED: 'focusGuard_onboarded',
  POMODORO_CONFIG: 'focusGuard_pomodoroConfig',
  BREATHING_CONFIG: 'focusGuard_breathingConfig',
  HIDE_SHORTS: 'focusGuard_hideShorts',
  HIDE_COMMENTS: 'focusGuard_hideComments'
};

const ACHIEVEMENTS = {
  first_block:     { name: 'Primeiro Limite',  icon: '\u{1F6E1}\uFE0F', desc: 'Ser bloqueado pela primeira vez' },
  first_challenge: { name: 'Desafio Aceito',   icon: '\u270D\uFE0F', desc: 'Completar primeiro challenge' },
  first_nuclear:   { name: 'Botao Vermelho',   icon: '\u2622\uFE0F', desc: 'Ativar nuclear pela primeira vez' },
  streak_3:        { name: 'Foco Iniciante',    icon: '\u{1F525}', desc: 'Streak de 3 dias' },
  streak_7:        { name: 'Semana Perfeita',   icon: '\u2B50', desc: 'Streak de 7 dias' },
  streak_30:       { name: 'Mes de Ferro',      icon: '\u{1F48E}', desc: 'Streak de 30 dias' },
  sites_5:         { name: 'Guardiao',          icon: '\u{1F3F0}', desc: 'Rastrear 5 sites simultaneos' },
  focus_10:        { name: 'Modo Foco x10',     icon: '\u26A1', desc: 'Usar Modo Foco 10 vezes' },
  breathe_5:       { name: 'Respiracao Zen',    icon: '\u{1F9D8}', desc: 'Completar 5 exercicios de respiracao' },
  pomodoro_10:     { name: 'Pomodoro Master',   icon: '\u{1F345}', desc: 'Completar 10 ciclos de pomodoro' },
  no_bypass_7:     { name: 'Sem Atalhos',       icon: '\u{1F4AA}', desc: '7 dias sem usar bypass/extra time' },
  veteran:         { name: 'Veterano',          icon: '\u{1F396}\uFE0F', desc: 'Usar Focus Guard por 30 dias' }
};

async function checkAndUnlockAchievement(id) {
  const data = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.ACHIEVEMENTS, r));
  const achievements = data[STORAGE_KEYS.ACHIEVEMENTS] || {};
  if (achievements[id]) return; // Already unlocked
  achievements[id] = { unlockedAt: Date.now() };
  chrome.storage.local.set({ [STORAGE_KEYS.ACHIEVEMENTS]: achievements });
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

let activeTabId = null;
let activeHostname = null;
let activeUrl = null;
let trackingInterval = null;

// ── Pause Tracking ──

async function isPaused() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PAUSED);
  const paused = data[STORAGE_KEYS.PAUSED];
  if (!paused || !paused.until) return false;
  if (Date.now() >= paused.until) {
    await chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
    return false;
  }
  return true;
}

// ── Notification Messages ──

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

async function checkNotificationThresholds(pattern, usedSeconds, limitSeconds) {
  const notifData = await chrome.storage.local.get(STORAGE_KEYS.NOTIFICATIONS);
  const config = notifData[STORAGE_KEYS.NOTIFICATIONS] || DEFAULTS.NOTIFICATIONS;
  if (!config.enabled) return;

  const percentage = (usedSeconds / limitSeconds) * 100;
  const remainingMin = Math.max(0, Math.round((limitSeconds - usedSeconds) / 60));

  for (const threshold of [50, 75, 90]) {
    if (!config.thresholds[threshold]) continue;
    if (percentage < threshold) continue;

    const warnKey = `_warned${threshold}_${pattern}`;
    const warnData = await chrome.storage.local.get(warnKey);
    if (warnData[warnKey]) continue;

    await chrome.storage.local.set({ [warnKey]: true });
    const messages = NOTIFICATION_MESSAGES[threshold];
    const message = messages[Math.floor(Math.random() * messages.length)]
      .replace(/\{site\}/g, pattern)
      .replace(/\{remaining\}/g, String(remainingMin));

    chrome.notifications.create(`threshold-${threshold}-${pattern}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Focus Guard',
      message: message,
      priority: 1
    });
  }
}

// ── Date Helpers ──

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDayOfWeek() {
  return new Date().getDay(); // 0=Sunday, 6=Saturday
}

function getCurrentTime() {
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

// ── URL Matching ──

// Extract root domain from URL
function getHostname(url) {
  try {
    let hostname = new URL(url).hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const secondLevel = ['co', 'com', 'net', 'org', 'edu', 'gov'];
      if (secondLevel.includes(parts[parts.length - 2])) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch {
    return null;
  }
}

// Get full path from URL (hostname + path)
function getUrlPath(url) {
  try {
    const u = new URL(url);
    let hostname = u.hostname.replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const secondLevel = ['co', 'com', 'net', 'org', 'edu', 'gov'];
      if (secondLevel.includes(parts[parts.length - 2])) {
        hostname = parts.slice(-3).join('.');
      } else {
        hostname = parts.slice(-2).join('.');
      }
    }
    const path = u.pathname.replace(/\/$/, '');
    return hostname + path;
  } catch {
    return null;
  }
}

// Match a URL against a pattern (supports hostname-only and path patterns)
// Patterns: "youtube.com", "reddit.com/r/memes", "*.twitter.com"
function matchesPattern(url, pattern) {
  if (!url || !pattern) return false;

  const hostname = getHostname(url);
  const fullPath = getUrlPath(url);

  if (!hostname || !fullPath) return false;

  // Normalize pattern
  const p = pattern.toLowerCase().trim();

  // Simple hostname match (most common): "youtube.com"
  if (!p.includes('/')) {
    return hostname === p;
  }

  // Path match: "reddit.com/r/memes" matches "reddit.com/r/memes/hot" but NOT "reddit.com/r/me"
  if (fullPath === p) return true;
  if (fullPath.startsWith(p + '/') || fullPath.startsWith(p + '?')) return true;
  return false;
}

// Find which tracked pattern matches a URL (returns the pattern key or null)
function findMatchingPattern(url, sites) {
  if (!url) return null;

  // First try exact path matches (more specific = higher priority)
  const pathMatches = [];
  const hostMatches = [];

  for (const pattern of Object.keys(sites)) {
    if (pattern.includes('/')) {
      if (matchesPattern(url, pattern)) pathMatches.push(pattern);
    } else {
      if (matchesPattern(url, pattern)) hostMatches.push(pattern);
    }
  }

  // Prefer longest (most specific) path match
  if (pathMatches.length > 0) {
    return pathMatches.sort((a, b) => b.length - a.length)[0];
  }

  // Fall back to hostname match
  return hostMatches[0] || null;
}

// Sanitize site/pattern input
function sanitizePattern(input) {
  if (!input || typeof input !== 'string') return null;
  let p = input.toLowerCase().trim();
  p = p.replace(/^(https?:\/\/)?(www\.)?/, '');
  p = p.replace(/[#?].*$/, '');
  p = p.replace(/\/+$/, '');
  return p || null;
}

// ── Storage Helpers ──

let _resetLock = null;

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
    // Clear 5-min warning flags and threshold notification flags
    const allKeys = await chrome.storage.local.get(null);
    const warnKeys = Object.keys(allKeys).filter(k =>
      k.startsWith('_warned5_') || k.startsWith('_warned50_') ||
      k.startsWith('_warned75_') || k.startsWith('_warned90_')
    );
    if (warnKeys.length > 0) await chrome.storage.local.remove(warnKeys);

    // --- Streak evaluation (BEFORE reset) ---
    const streakResult = await chrome.storage.local.get(STORAGE_KEYS.STREAK);
    const streak = streakResult[STORAGE_KEYS.STREAK] || { current: 0, best: 0, lastGoodDay: null };
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

    var evaluatedDay = data[STORAGE_KEYS.USAGE_DATE];
    if (dayGood && Object.keys(sites).length > 0) {
      streak.current++;
      if (streak.current > streak.best) streak.best = streak.current;
      streak.lastGoodDay = evaluatedDay;
    } else {
      streak.current = 0;
    }

    // Achievement checks for streaks
    if (streak.current >= 3) checkAndUnlockAchievement('streak_3');
    if (streak.current >= 7) checkAndUnlockAchievement('streak_7');
    if (streak.current >= 30) checkAndUnlockAchievement('streak_30');

    // No-bypass streak tracking
    const usedBypass = Object.keys(bypassed).length > 0 || Object.keys(extra).length > 0;
    const nbdData = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.NO_BYPASS_DAYS, r));
    let noBypassDays = nbdData[STORAGE_KEYS.NO_BYPASS_DAYS] || 0;
    noBypassDays = usedBypass ? 0 : noBypassDays + 1;
    chrome.storage.local.set({ [STORAGE_KEYS.NO_BYPASS_DAYS]: noBypassDays });
    if (noBypassDays >= 7) checkAndUnlockAchievement('no_bypass_7');

    // Veteran achievement: check history days
    const histData = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const historyObj = histData[STORAGE_KEYS.HISTORY] || {};
    const historyDays = Object.keys(historyObj).length;
    if (historyDays >= 30) checkAndUnlockAchievement('veteran');

    // Atomic reset: all transient data zeroed in one call
    await chrome.storage.local.set({
      [STORAGE_KEYS.USAGE]: {},
      [STORAGE_KEYS.USAGE_DATE]: today,
      [STORAGE_KEYS.BYPASSED]: {},
      [STORAGE_KEYS.EXTRA]: {},
      [STORAGE_KEYS.ENTRY_PASSED]: {},
      [STORAGE_KEYS.PAUSE_COUNT]: 0,
      [STORAGE_KEYS.STREAK]: streak
    });
    await chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
    return {};
  }
  return data[STORAGE_KEYS.USAGE] || {};
}

async function getTrackedSites() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SITES);
  return data[STORAGE_KEYS.SITES] || {};
}

async function isEnabled() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.ENABLED);
  return data[STORAGE_KEYS.ENABLED] !== false;
}

// ── History ──

function compressHistory(history) {
  const now = new Date();
  for (const dateKey of Object.keys(history)) {
    const date = new Date(dateKey);
    const ageDays = Math.floor((now - date) / 86400000);
    if (ageDays > DEFAULTS.HISTORY_DAYS) {
      delete history[dateKey];
    } else if (ageDays > 90) {
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

async function saveToHistory(dateStr, usage) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const history = data[STORAGE_KEYS.HISTORY] || {};

    // Only save if there's actual usage
    const hasUsage = Object.values(usage).some(v => v > 0);
    if (!hasUsage) return;

    history[dateStr] = usage;

    // Compress old entries and delete entries older than HISTORY_DAYS
    compressHistory(history);

    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
  } catch { /* storage error - non critical */ }
}

// Save current day's usage to history (called periodically)
async function snapshotToday() {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_DATE]);
    const usage = data[STORAGE_KEYS.USAGE] || {};
    const date = data[STORAGE_KEYS.USAGE_DATE];
    if (!date) return;

    const histData = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    const history = histData[STORAGE_KEYS.HISTORY] || {};
    history[date] = usage;

    // Compress old entries and delete entries older than HISTORY_DAYS
    compressHistory(history);

    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
  } catch { /* non critical */ }
}

// ── Weekly Usage ──

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

// ── Nuclear Option ──

async function isNuclearActive() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.NUCLEAR);
  const nuclear = data[STORAGE_KEYS.NUCLEAR];
  if (!nuclear || !nuclear.until) return false;
  if (Date.now() >= nuclear.until) {
    // Nuclear expired, clean up
    await chrome.storage.local.remove(STORAGE_KEYS.NUCLEAR);
    return false;
  }
  return true;
}

async function getNuclearInfo() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.NUCLEAR);
  return data[STORAGE_KEYS.NUCLEAR] || null;
}

// Check if a specific site is under nuclear lockdown
async function isNuclearBlocked(pattern) {
  const nuclear = await getNuclearInfo();
  if (!nuclear || !nuclear.until || Date.now() >= nuclear.until) return false;
  if (nuclear.sites === 'all') return true;
  if (Array.isArray(nuclear.sites)) return nuclear.sites.includes(pattern);
  return false;
}

// ── Schedule (Active Days/Hours) ──

async function isInActiveSchedule(pattern) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SCHEDULE);
  const schedules = data[STORAGE_KEYS.SCHEDULE] || {};
  const schedule = schedules[pattern];

  // No schedule = always active (always tracked/blocked)
  if (!schedule) return true;

  const day = getDayOfWeek();
  const { hour, minute } = getCurrentTime();

  // Check if today is an active day
  if (schedule.days && !schedule.days.includes(day)) return false;

  // Check time range
  const currentMinutes = hour * 60 + minute;
  const startMinutes = (schedule.startHour || 0) * 60 + (schedule.startMin || 0);
  const endMinutes = (schedule.endHour || 23) * 60 + (schedule.endMin || 59);

  // Handle overnight schedules (e.g., 22:00 - 06:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

// ── Challenge System ──

const CHALLENGE_TEXTS = {
  easy: [
    'Eu reconheço que estou perdendo tempo e escolho voltar ao foco agora.',
    'Meu tempo é valioso e eu decido usá-lo com sabedoria a partir de agora.',
    'Cada minuto conta e eu escolho investir meu tempo no que realmente importa.',
    'Eu tenho controle sobre minhas escolhas e agora escolho ser produtivo.',
    'Esse site pode esperar. Minhas metas não podem.',
    'Eu sou mais forte do que a vontade de procrastinar.',
    'Foco é uma habilidade e eu estou treinando ela agora.',
    'Eu mereço o resultado que vem da disciplina diária.',
    'Distração é conforto temporário. Progresso é satisfação duradoura.',
    'Eu escolho conscientemente fechar esta página e seguir em frente.',
    'Meu futuro agradece cada momento em que eu escolho o foco.',
    'Agora não. Eu tenho algo mais importante para fazer.'
  ],
  medium: [
    'A disciplina é escolher entre o que você quer agora e o que você mais quer na vida. Eu escolho o que mais quero.',
    'Eu entendo que a distração é o inimigo do progresso e decido conscientemente retomar minha produtividade agora mesmo.',
    'O sucesso não é construído nos momentos de motivação mas sim nos momentos de disciplina como este aqui.',
    'Cada vez que eu resisto à tentação de me distrair eu fortaleço minha capacidade de manter o foco no que importa.',
    'O tempo que eu gasto aqui é tempo que eu nunca vou recuperar. Eu escolho investir esse tempo em algo que me faz crescer.',
    'A diferença entre quem eu sou e quem eu quero ser está nas pequenas decisões como esta que eu tomo agora.',
    'Nenhum scroll infinito vai me dar a sensação de realização que eu tenho quando completo algo importante.',
    'Eu não preciso de mais entretenimento. Eu preciso de mais foco para alcançar o que realmente quero na vida.',
    'Procrastinar é emprestar tempo do meu eu futuro e pagar com juros de estresse. Eu escolho parar agora.',
    'Este momento de tentação é temporário mas o hábito que eu construo ao resistir dura para sempre.',
    'Pessoas bem-sucedidas fazem o que é necessário mesmo quando não estão com vontade. Eu escolho ser essa pessoa agora.',
    'Minha atenção é meu recurso mais valioso e eu me recuso a entregá-la de graça para algoritmos de distração.'
  ],
  hard: [
    'Eu reconheço plenamente que estou desperdiçando meu tempo precioso em distração digital e faço a escolha consciente de parar agora retomar o foco e investir minha energia no que realmente importa para meus objetivos de longo prazo.',
    'A cada segundo que passo em distração estou roubando tempo do meu eu futuro. Eu escolho ser disciplinado agora para colher os frutos depois. Este momento de resistência define quem eu sou e quem eu quero me tornar.',
    'Nenhuma notificação curtida ou vídeo vale mais do que meu progresso pessoal e profissional. Eu tenho o poder de fechar esta página e voltar ao trabalho que realmente me move em direção aos meus sonhos e objetivos.',
    'A dopamina fácil das redes sociais está treinando meu cérebro para evitar o esforço real. Eu me recuso a continuar nesse ciclo e escolho deliberadamente o desconforto produtivo que me leva ao crescimento verdadeiro.',
    'Daqui a um ano eu vou olhar para trás e agradecer cada momento em que eu tive a coragem de fechar uma aba de distração e voltar ao trabalho que realmente constrói o futuro que eu quero para mim e para as pessoas que amo.',
    'O algoritmo dessa plataforma foi projetado por engenheiros brilhantes para capturar minha atenção. Mas eu sou mais forte do que qualquer algoritmo porque eu tenho algo que ele não tem: um propósito claro e a determinação de alcançá-lo.',
    'Cada minuto que eu gasto rolando uma timeline é um minuto que eu poderia ter usado para aprender algo novo desenvolver uma habilidade ou avançar em um projeto que realmente importa. Eu escolho parar agora e honrar o meu potencial.',
    'A procrastinação é a arte de se manter ocupado com coisas que não importam para evitar enfrentar as que importam. Eu reconheço essa armadilha e faço a escolha corajosa de enfrentar o que é difícil em vez de fugir para o conforto digital.',
    'Eu entendo que o arrependimento de não ter feito o suficiente é muito pior do que o desconforto de largar a distração agora. Meu eu futuro merece o esforço que eu posso fazer neste exato momento em vez de desperdiçá-lo em conteúdo passageiro.',
    'As pessoas que eu admiro não chegaram onde estão assistindo vídeos sem parar ou rolando feeds infinitos. Elas chegaram lá fazendo escolhas difíceis repetidamente como a que eu estou fazendo agora ao fechar esta página e voltar ao que importa de verdade.'
  ]
};

function getRandomChallenge(difficulty) {
  const texts = CHALLENGE_TEXTS[difficulty] || CHALLENGE_TEXTS.medium;
  return texts[Math.floor(Math.random() * texts.length)];
}

// ── Core Tracking ──

async function addUsage(hostname, seconds) {
  if (await isPaused()) return;
  if (!activeTabId) return;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    if (!tab || getHostname(tab.url) !== hostname) return;
  } catch { return; }

  const usage = await resetIfNewDay();
  const sites = await getTrackedSites();

  // Find matching pattern for this URL
  const pattern = findMatchingPattern(activeUrl || `https://${hostname}`, sites);
  if (!pattern) return;

  // Check schedule - if not in active hours, don't track
  if (!(await isInActiveSchedule(pattern))) return;

  // Check if bypassed for today
  const bypassData = await chrome.storage.local.get(STORAGE_KEYS.BYPASSED);
  const bypassed = bypassData[STORAGE_KEYS.BYPASSED] || {};
  if (bypassed[pattern]) return;

  usage[pattern] = (usage[pattern] || 0) + seconds;
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });

  // Check notification thresholds
  const baseLimitSeconds = sites[pattern] * 60;
  await checkNotificationThresholds(pattern, usage[pattern], baseLimitSeconds);

  // Get extra time bonus
  const extraData = await chrome.storage.local.get(STORAGE_KEYS.EXTRA);
  const extra = extraData[STORAGE_KEYS.EXTRA] || {};
  const extraSeconds = extra[pattern] || 0;

  const limitSeconds = (sites[pattern] * 60) + extraSeconds;
  const remaining = limitSeconds - usage[pattern];

  // Warn 5 minutes before limit (track last warning to avoid missing)
  if (remaining <= 300 && remaining > 0) {
    const warnKey = `_warned5_${pattern}`;
    const warnData = await chrome.storage.local.get(warnKey);
    if (!warnData[warnKey]) {
      await chrome.storage.local.set({ [warnKey]: true });
      chrome.notifications.create(`warn-${pattern}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Focus Guard',
        message: `Restam 5 minutos em ${pattern}`,
        priority: 1
      });
    }
  }

  if (usage[pattern] >= limitSeconds) {
    blockSite(pattern);
  }

  // Check weekly limit (independently of daily)
  const weeklyData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
  const weeklyLimits = weeklyData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
  if (weeklyLimits[pattern]) {
    // Before checking weekly limit, flush current usage to history
    const liveData = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_DATE]);
    if (liveData[STORAGE_KEYS.USAGE_DATE]) {
      await saveToHistory(liveData[STORAGE_KEYS.USAGE_DATE], liveData[STORAGE_KEYS.USAGE] || {});
    }
    const weeklyUsed = await getWeeklyUsage(pattern);
    if (weeklyUsed >= weeklyLimits[pattern] * 60) {
      blockSite(pattern, 'weekly');
    }
  }

  updateBadge();
}

// ── Badge ──

async function updateBadge() {
  if (await isPaused()) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#eab308' });
    return;
  }
  const usage = await resetIfNewDay();
  const sites = await getTrackedSites();

  let totalMinutes = 0;
  const nuclearActive = await isNuclearActive();

  for (const pattern of Object.keys(sites)) {
    const used = usage[pattern] || 0;
    totalMinutes += Math.floor(used / 60);
  }

  if (nuclearActive) {
    const nuclearInfo = await getNuclearInfo();
    if (nuclearInfo && nuclearInfo.mode === 'focus') {
      chrome.action.setBadgeText({ text: 'F' });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    } else {
      chrome.action.setBadgeText({ text: 'N' });
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    }
  } else if (totalMinutes > 0) {
    const text = totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h` : `${totalMinutes}m`;
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Blocking ──

async function blockSite(pattern, reason) {
  checkAndUnlockAchievement('first_block');
  try {
    const nuclearActive = await isNuclearBlocked(pattern);
    const nuclearParam = nuclearActive ? '&nuclear=1' : '';
    const focusParam = reason === 'focus' ? '&focus=1' : '';
    const reasonParam = reason === 'weekly' ? '&reason=weekly' : '';
    const tabs = await chrome.tabs.query({});
    const sites = await getTrackedSites();
    for (const tab of tabs) {
      const matched = findMatchingPattern(tab.url, sites);
      if (matched === pattern) {
        const blockUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(pattern)}${nuclearParam}${focusParam}${reasonParam}`);
        chrome.tabs.update(tab.id, { url: blockUrl });
      }
    }
  } catch { /* tabs API can fail if window is closing */ }
}

// Returns false if not blocked, or a string reason ('daily'|'weekly'|'nuclear') if blocked
async function checkIfBlocked(url) {
  const hostname = getHostname(url);
  if (!hostname) return false;

  const sites = await getTrackedSites();
  const pattern = findMatchingPattern(url, sites);
  if (!pattern) return false;

  // Check nuclear option first - overrides everything
  if (await isNuclearBlocked(pattern)) return 'nuclear';

  // Check schedule - if not in active hours, don't block
  if (!(await isInActiveSchedule(pattern))) return false;

  // Check if bypassed for today
  const bypassData = await chrome.storage.local.get(STORAGE_KEYS.BYPASSED);
  const bypassed = bypassData[STORAGE_KEYS.BYPASSED] || {};
  if (bypassed[pattern]) return false;

  const usage = await resetIfNewDay();
  const extraData = await chrome.storage.local.get(STORAGE_KEYS.EXTRA);
  const extra = extraData[STORAGE_KEYS.EXTRA] || {};
  const extraSeconds = extra[pattern] || 0;

  const limitSeconds = (sites[pattern] * 60) + extraSeconds;
  if ((usage[pattern] || 0) >= limitSeconds) return 'daily';

  // Check weekly limit
  const weeklyLimitData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
  const weeklyLimits = weeklyLimitData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
  if (weeklyLimits[pattern]) {
    // Before checking weekly limit, flush current usage to history
    const liveData2 = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_DATE]);
    if (liveData2[STORAGE_KEYS.USAGE_DATE]) {
      await saveToHistory(liveData2[STORAGE_KEYS.USAGE_DATE], liveData2[STORAGE_KEYS.USAGE] || {});
    }
    const weeklyUsed = await getWeeklyUsage(pattern);
    if (weeklyUsed >= weeklyLimits[pattern] * 60) return 'weekly';
  }

  return false;
}

// ── Tracking Lifecycle ──

async function startTracking() {
  stopTracking();

  if (!(await isEnabled())) return;
  if (!activeHostname) return;

  const sites = await getTrackedSites();
  const url = activeUrl || `https://${activeHostname}`;
  const pattern = findMatchingPattern(url, sites);
  if (!pattern) return;

  const blockReason = await checkIfBlocked(url);
  if (blockReason) {
    blockSite(pattern, blockReason === 'weekly' ? 'weekly' : undefined);
    return;
  }

  const trackedHost = activeHostname;
  trackingInterval = setInterval(async () => {
    if (trackedHost && activeHostname === trackedHost) {
      await addUsage(trackedHost, 1);
    }
  }, DEFAULTS.BADGE_UPDATE_INTERVAL);
}

function stopTracking() {
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
}

// Initialize active tab on service worker startup
async function initActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId = tab.id;
      activeHostname = getHostname(tab.url);
      activeUrl = tab.url;
      await startTracking();
    }
  } catch { /* no active tab */ }
}
initActiveTab();

// ── Tab Event Listeners ──

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  activeTabId = activeInfo.tabId;
  try {
    const tab = await chrome.tabs.get(activeTabId);
    activeHostname = getHostname(tab.url);
    activeUrl = tab.url;
    await startTracking();
  } catch {
    activeHostname = null;
    activeUrl = null;
    stopTracking();
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.url) {
    activeHostname = getHostname(changeInfo.url);
    activeUrl = changeInfo.url;
    await startTracking();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    stopTracking();
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) {
      activeTabId = tab.id;
      activeHostname = getHostname(tab.url);
      activeUrl = tab.url;
      await startTracking();
    }
  } catch {
    stopTracking();
  }
});

// Block navigation to sites that are already over limit
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (!(await isEnabled())) return;

  const hostname = getHostname(details.url);
  if (!hostname) return;

  const sites = await getTrackedSites();
  const pattern = findMatchingPattern(details.url, sites);
  if (!pattern) return;

  // Check nuclear
  if (await isNuclearBlocked(pattern)) {
    const blockUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(pattern)}&nuclear=1`);
    chrome.tabs.update(details.tabId, { url: blockUrl });
    return;
  }

  const blockReason = await checkIfBlocked(details.url);
  if (blockReason) {
    const reasonParam = blockReason === 'weekly' ? '&reason=weekly' : '';
    const blockUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(pattern)}${reasonParam}`);
    chrome.tabs.update(details.tabId, { url: blockUrl });
    return;
  }

  // Check entry challenge (must complete challenge before accessing tracked site)
  const entryChallengeData = await chrome.storage.local.get(STORAGE_KEYS.ENTRY_CHALLENGE);
  const entryChallenge = entryChallengeData[STORAGE_KEYS.ENTRY_CHALLENGE] || { enabled: false };
  if (entryChallenge.enabled) {
    const passedData = await chrome.storage.local.get(STORAGE_KEYS.ENTRY_PASSED);
    const passed = passedData[STORAGE_KEYS.ENTRY_PASSED] || {};
    if (!passed[pattern]) {
      const blockUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(pattern)}&entry=1`);
      chrome.tabs.update(details.tabId, { url: blockUrl });
      return;
    }
  }
});

// ── Message Handlers ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === 'getStreak') {
    chrome.storage.local.get(STORAGE_KEYS.STREAK, function(data) {
      sendResponse(data[STORAGE_KEYS.STREAK] || { current: 0, best: 0, lastGoodDay: null });
    });
    return true;
  }

  // Get usage data (for popup and blocked page)
  if (msg.type === 'getUsage') {
    (async () => {
      try {
        const usage = await resetIfNewDay();
        const sites = await getTrackedSites();
        const multiData = await chrome.storage.local.get([
          STORAGE_KEYS.BYPASSED, STORAGE_KEYS.EXTRA, STORAGE_KEYS.NUCLEAR,
          STORAGE_KEYS.SCHEDULE, STORAGE_KEYS.CHALLENGE, STORAGE_KEYS.WEEKLY_LIMITS,
          STORAGE_KEYS.EXTRA_TIME_MIN, STORAGE_KEYS.ENTRY_CHALLENGE
        ]);
        sendResponse({
          usage,
          sites,
          bypassed: multiData[STORAGE_KEYS.BYPASSED] || {},
          extra: multiData[STORAGE_KEYS.EXTRA] || {},
          nuclear: multiData[STORAGE_KEYS.NUCLEAR] || null,
          schedule: multiData[STORAGE_KEYS.SCHEDULE] || {},
          challenge: multiData[STORAGE_KEYS.CHALLENGE] || { enabled: false, difficulty: 'medium' },
          weeklyLimits: multiData[STORAGE_KEYS.WEEKLY_LIMITS] || {},
          extraTimeMin: multiData[STORAGE_KEYS.EXTRA_TIME_MIN] || 5,
          entryChallenge: multiData[STORAGE_KEYS.ENTRY_CHALLENGE] || { enabled: false }
        });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Get history (for popup history view)
  if (msg.type === 'getHistory') {
    (async () => {
      try {
        // Snapshot today first so history is up to date
        await snapshotToday();
        const data = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
        sendResponse({ history: data[STORAGE_KEYS.HISTORY] || {} });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Reset usage
  if (msg.type === 'resetUsage') {
    (async () => {
      try {
        // Clear warning flags and threshold notification flags
        const allKeys = await chrome.storage.local.get(null);
        const warnKeys = Object.keys(allKeys).filter(k =>
          k.startsWith('_warned5_') || k.startsWith('_warned50_') ||
          k.startsWith('_warned75_') || k.startsWith('_warned90_')
        );
        if (warnKeys.length > 0) await chrome.storage.local.remove(warnKeys);

        await chrome.storage.local.set({
          [STORAGE_KEYS.USAGE]: {},
          [STORAGE_KEYS.BYPASSED]: {},
          [STORAGE_KEYS.EXTRA]: {},
          [STORAGE_KEYS.ENTRY_PASSED]: {}
        });
        updateBadge();
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Bypass: ignore site for the rest of the day
  if (msg.type === 'bypassSite') {
    (async () => {
      try {
        // Verify request comes from our blocked page
        if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL('blocked.html'))) {
          sendResponse({ error: 'Requisição inválida' });
          return;
        }
        const pattern = sanitizePattern(msg.site);
        if (!pattern) { sendResponse({ error: 'Site inválido' }); return; }

        if (await isNuclearBlocked(pattern)) {
          sendResponse({ error: 'Modo nuclear ativo — impossível desbloquear', reason: 'nuclear' });
          return;
        }

        const sites = await getTrackedSites();
        if (!sites[pattern]) { sendResponse({ error: 'Site não rastreado' }); return; }

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

        // Check if challenge is required
        const challengeData = await chrome.storage.local.get([STORAGE_KEYS.CHALLENGE, STORAGE_KEYS.ENTRY_PASSED]);
        if (challengeData[STORAGE_KEYS.CHALLENGE]?.enabled && !challengeData[STORAGE_KEYS.ENTRY_PASSED]?.[pattern]) {
          sendResponse({ error: 'Desafio necessário para desbloquear opções.', reason: 'challenge' });
          return;
        }

        const data = await chrome.storage.local.get(STORAGE_KEYS.BYPASSED);
        const bypassed = data[STORAGE_KEYS.BYPASSED] || {};
        bypassed[pattern] = true;
        await chrome.storage.local.set({ [STORAGE_KEYS.BYPASSED]: bypassed });
        updateBadge();

        const redirect = pattern.includes('/') ? `https://${pattern}` : `https://${pattern}`;
        sendResponse({ ok: true, redirectUrl: redirect });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Extra time
  if (msg.type === 'addExtraTime') {
    (async () => {
      try {
        // Verify request comes from our blocked page
        if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL('blocked.html'))) {
          sendResponse({ error: 'Requisição inválida' });
          return;
        }
        const pattern = sanitizePattern(msg.site);
        const extraTimeData = await chrome.storage.local.get(STORAGE_KEYS.EXTRA_TIME_MIN);
        const configuredMin = extraTimeData[STORAGE_KEYS.EXTRA_TIME_MIN] || 5;
        const minutes = Math.min(Math.max(parseInt(msg.minutes) || configuredMin, 1), 30);
        if (!pattern) { sendResponse({ error: 'Site inválido' }); return; }

        if (await isNuclearBlocked(pattern)) {
          sendResponse({ error: 'Modo nuclear ativo — impossível adicionar tempo', reason: 'nuclear' });
          return;
        }

        const sites = await getTrackedSites();
        if (!sites[pattern]) { sendResponse({ error: 'Site não rastreado' }); return; }

        // Check if weekly limit is already hit - extra time only helps daily
        const weeklyLimitData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
        const weeklyLimits = weeklyLimitData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
        if (weeklyLimits[pattern]) {
          const weeklyUsed = await getWeeklyUsage(pattern);
          if (weeklyUsed >= weeklyLimits[pattern] * 60) {
            sendResponse({ error: 'Limite semanal atingido — tempo extra não pode ajudar', reason: 'weekly_limit' });
            return;
          }
        }

        const data = await chrome.storage.local.get(STORAGE_KEYS.EXTRA);
        const extra = data[STORAGE_KEYS.EXTRA] || {};
        const current = extra[pattern] || 0;
        if (current >= DEFAULTS.MAX_EXTRA_SECONDS) {
          sendResponse({ error: 'Você já usou todo o tempo extra de hoje (máximo 60 minutos).', reason: 'max_extra' });
          return;
        }
        extra[pattern] = Math.min(current + (minutes * 60), DEFAULTS.MAX_EXTRA_SECONDS);
        await chrome.storage.local.set({ [STORAGE_KEYS.EXTRA]: extra });
        updateBadge();

        const redirect = `https://${pattern}`;
        sendResponse({ ok: true, redirectUrl: redirect });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Nuclear Option: block all/specific sites irrevocably for X hours
  if (msg.type === 'activateNuclear') {
    (async () => {
      try {
        const hours = Math.min(Math.max(parseFloat(msg.hours) || 1, 0.25), 24);
        const sites = msg.sites || 'all'; // 'all' or array of patterns

        const until = Date.now() + (hours * 60 * 60 * 1000);
        await chrome.storage.local.set({
          [STORAGE_KEYS.NUCLEAR]: { until, sites, mode: 'nuclear' }
        });

        checkAndUnlockAchievement('first_nuclear');

        // Create alarm for auto-cleanup
        chrome.alarms.create('nuclearEnd', { when: until });

        // Immediately block all nuclear sites
        if (sites === 'all') {
          const trackedSites = await getTrackedSites();
          for (const pattern of Object.keys(trackedSites)) {
            await blockSite(pattern);
          }
        } else if (Array.isArray(sites)) {
          for (const pattern of sites) {
            await blockSite(pattern);
          }
        }

        updateBadge();
        sendResponse({ ok: true, until });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Focus Mode: selective nuclear for chosen sites
  if (msg.type === 'activateFocusMode') {
    (async () => {
      try {
        const minutes = Math.min(Math.max(parseInt(msg.minutes) || 30, 5), 480);
        const sites = msg.sites; // array of patterns
        if (!Array.isArray(sites) || sites.length === 0) {
          sendResponse({ error: 'Selecione pelo menos um site' });
          return;
        }

        const until = Date.now() + (minutes * 60 * 1000);
        await chrome.storage.local.set({
          [STORAGE_KEYS.NUCLEAR]: { until, sites, mode: 'focus' }
        });

        // Increment focus mode counter
        const countData = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_MODE_COUNT);
        const count = (countData[STORAGE_KEYS.FOCUS_MODE_COUNT] || 0) + 1;
        await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_MODE_COUNT]: count });

        if (count >= 10) checkAndUnlockAchievement('focus_10');

        // Create alarm for auto-cleanup
        chrome.alarms.create('nuclearEnd', { when: until });

        // Immediately block matching tabs
        for (const pattern of sites) {
          await blockSite(pattern, 'focus');
        }

        updateBadge();
        sendResponse({ ok: true, until });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Get nuclear status
  if (msg.type === 'getNuclearStatus') {
    (async () => {
      try {
        const nuclear = await getNuclearInfo();
        if (nuclear && nuclear.until && Date.now() < nuclear.until) {
          sendResponse({ active: true, until: nuclear.until, sites: nuclear.sites, mode: nuclear.mode || 'nuclear' });
        } else {
          sendResponse({ active: false });
        }
      } catch { sendResponse({ active: false }); }
    })();
    return true;
  }

  // Pause tracking
  if (msg.type === 'pauseTracking') {
    (async () => {
      try {
        // Check nuclear not active
        if (await isNuclearActive()) {
          sendResponse({ success: false, error: 'Nuclear option is active' });
          return;
        }
        // Check pause count
        const countData = await chrome.storage.local.get(STORAGE_KEYS.PAUSE_COUNT);
        const pauseCount = countData[STORAGE_KEYS.PAUSE_COUNT] || 0;
        if (pauseCount >= 3) {
          sendResponse({ success: false, error: 'Pause limit reached (3/day)', remaining: 0 });
          return;
        }
        const minutes = msg.minutes || 5;
        const until = Date.now() + minutes * 60 * 1000;
        await chrome.storage.local.set({
          [STORAGE_KEYS.PAUSED]: { until },
          [STORAGE_KEYS.PAUSE_COUNT]: pauseCount + 1
        });
        chrome.alarms.create('pauseEnd', { when: until });
        stopTracking();
        updateBadge();
        sendResponse({ success: true, until, remaining: 3 - (pauseCount + 1) });
      } catch { sendResponse({ success: false, error: 'Internal error' }); }
    })();
    return true;
  }

  // Get pause status
  if (msg.type === 'getPauseStatus') {
    (async () => {
      try {
        const data = await chrome.storage.local.get([STORAGE_KEYS.PAUSED, STORAGE_KEYS.PAUSE_COUNT]);
        const paused = data[STORAGE_KEYS.PAUSED];
        const pauseCount = data[STORAGE_KEYS.PAUSE_COUNT] || 0;
        if (paused && paused.until && Date.now() < paused.until) {
          sendResponse({ active: true, until: paused.until, pausesRemaining: 3 - pauseCount });
        } else {
          if (paused) await chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
          sendResponse({ active: false, pausesRemaining: 3 - pauseCount });
        }
      } catch { sendResponse({ active: false, pausesRemaining: 0 }); }
    })();
    return true;
  }

  // Save schedule for a site
  if (msg.type === 'saveSchedule') {
    (async () => {
      try {
        const pattern = sanitizePattern(msg.site);
        if (!pattern) { sendResponse({ error: 'Site inválido' }); return; }

        const data = await chrome.storage.local.get(STORAGE_KEYS.SCHEDULE);
        const schedules = data[STORAGE_KEYS.SCHEDULE] || {};

        if (msg.schedule === null) {
          // Remove schedule (always active)
          delete schedules[pattern];
        } else {
          schedules[pattern] = {
            days: msg.schedule.days || [0, 1, 2, 3, 4, 5, 6],
            startHour: msg.schedule.startHour || 0,
            startMin: msg.schedule.startMin || 0,
            endHour: msg.schedule.endHour !== undefined ? msg.schedule.endHour : 23,
            endMin: msg.schedule.endMin !== undefined ? msg.schedule.endMin : 59
          };
        }

        await chrome.storage.local.set({ [STORAGE_KEYS.SCHEDULE]: schedules });
        await startTracking();
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Save challenge settings
  if (msg.type === 'saveChallenge') {
    (async () => {
      try {
        await chrome.storage.local.set({
          [STORAGE_KEYS.CHALLENGE]: {
            enabled: !!msg.enabled,
            difficulty: msg.difficulty || 'medium'
          }
        });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Get challenge text (for blocked page)
  if (msg.type === 'getChallenge') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.CHALLENGE);
        const config = data[STORAGE_KEYS.CHALLENGE] || { enabled: false, difficulty: 'medium' };
        if (!config.enabled) {
          sendResponse({ enabled: false });
          return;
        }
        const text = getRandomChallenge(config.difficulty);
        sendResponse({ enabled: true, text, difficulty: config.difficulty });
      } catch { sendResponse({ enabled: false }); }
    })();
    return true;
  }

  // Get notification config
  if (msg.type === 'getNotificationConfig') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.NOTIFICATIONS);
        sendResponse(data[STORAGE_KEYS.NOTIFICATIONS] || DEFAULTS.NOTIFICATIONS);
      } catch { sendResponse(DEFAULTS.NOTIFICATIONS); }
    })();
    return true;
  }

  // Set notification config
  if (msg.type === 'setNotificationConfig') {
    (async () => {
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.NOTIFICATIONS]: msg.config });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Verify challenge (for blocked page - validates the typed text)
  if (msg.type === 'verifyChallenge') {
    (async () => {
      try {
        const original = (msg.original || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const typed = (msg.typed || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const match = original === typed;
        if (match) checkAndUnlockAchievement('first_challenge');
        sendResponse({ ok: match });
      } catch { sendResponse({ ok: false }); }
    })();
    return true;
  }

  // Save weekly limit for a site
  if (msg.type === 'saveWeeklyLimit') {
    (async () => {
      try {
        const pattern = sanitizePattern(msg.site);
        if (!pattern) { sendResponse({ error: 'Site inválido' }); return; }
        const data = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
        const limits = data[STORAGE_KEYS.WEEKLY_LIMITS] || {};
        const minutes = parseInt(msg.minutes);
        if (minutes && minutes > 0) {
          limits[pattern] = minutes;
        } else {
          delete limits[pattern];
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.WEEKLY_LIMITS]: limits });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Save extra time config (minutes per bypass click)
  if (msg.type === 'saveExtraTimeConfig') {
    (async () => {
      try {
        const minutes = Math.min(Math.max(parseInt(msg.minutes) || 5, 1), 30);
        await chrome.storage.local.set({ [STORAGE_KEYS.EXTRA_TIME_MIN]: minutes });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Get extra time config
  if (msg.type === 'getExtraTimeConfig') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.EXTRA_TIME_MIN);
        sendResponse({ minutes: data[STORAGE_KEYS.EXTRA_TIME_MIN] || 5 });
      } catch { sendResponse({ minutes: 5 }); }
    })();
    return true;
  }

  // Save entry challenge setting
  if (msg.type === 'saveEntryChallenge') {
    (async () => {
      try {
        await chrome.storage.local.set({
          [STORAGE_KEYS.ENTRY_CHALLENGE]: { enabled: !!msg.enabled }
        });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Pass entry challenge (mark site as passed for today)
  if (msg.type === 'passEntryChallenge') {
    (async () => {
      try {
        const pattern = sanitizePattern(msg.site);
        if (!pattern) { sendResponse({ error: 'Site inválido' }); return; }

        // Verify the request comes from our blocked page
        if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL('blocked.html'))) {
          sendResponse({ error: 'Requisição inválida' });
          return;
        }

        const sites = await getTrackedSites();
        if (!sites[pattern]) { sendResponse({ error: 'Site não rastreado' }); return; }

        const data = await chrome.storage.local.get(STORAGE_KEYS.ENTRY_PASSED);
        const passed = data[STORAGE_KEYS.ENTRY_PASSED] || {};
        passed[pattern] = Date.now();
        await chrome.storage.local.set({ [STORAGE_KEYS.ENTRY_PASSED]: passed });

        const redirect = `https://${pattern}`;
        sendResponse({ ok: true, redirectUrl: redirect });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  // Get weekly usage for a specific site
  if (msg.type === 'getGoals') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(STORAGE_KEYS.GOALS);
        sendResponse({ goals: data[STORAGE_KEYS.GOALS] || null });
      } catch { sendResponse({ goals: null }); }
    })();
    return true;
  }

  if (msg.type === 'setGoals') {
    (async () => {
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.GOALS]: msg.goals });
        sendResponse({ ok: true });
      } catch { sendResponse({ error: 'Internal error' }); }
    })();
    return true;
  }

  if (msg.type === 'getWeeklyUsage') {
    (async () => {
      try {
        const pattern = sanitizePattern(msg.site);
        if (!pattern) { sendResponse({ seconds: 0, used: 0, limit: 0 }); return; }
        const seconds = await getWeeklyUsage(pattern);
        const weeklyLimitData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
        const weeklyLimits = weeklyLimitData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
        const limitSeconds = (weeklyLimits[pattern] || 0) * 60;
        sendResponse({ seconds, used: seconds, limit: limitSeconds });
      } catch { sendResponse({ seconds: 0, used: 0, limit: 0 }); }
    })();
    return true;
  }

  if (msg.type === 'breathingCompleted') {
    (async () => {
      try {
        const bcData = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.BREATHING_COUNT, r));
        const count = (bcData[STORAGE_KEYS.BREATHING_COUNT] || 0) + 1;
        chrome.storage.local.set({ [STORAGE_KEYS.BREATHING_COUNT]: count });
        if (count >= 5) checkAndUnlockAchievement('breathe_5');
        sendResponse({ count });
      } catch { sendResponse({ count: 0 }); }
    })();
    return true;
  }

  if (msg.type === 'pomodoroCompleted') {
    (async () => {
      try {
        const pcData = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.POMODORO_COUNT, r));
        const count = (pcData[STORAGE_KEYS.POMODORO_COUNT] || 0) + 1;
        chrome.storage.local.set({ [STORAGE_KEYS.POMODORO_COUNT]: count });
        if (count >= 10) checkAndUnlockAchievement('pomodoro_10');
        sendResponse({ count });
      } catch { sendResponse({ count: 0 }); }
    })();
    return true;
  }

  if (msg.type === 'getAchievements') {
    (async () => {
      try {
        const aData = await new Promise(r => chrome.storage.local.get(STORAGE_KEYS.ACHIEVEMENTS, r));
        sendResponse({ achievements: aData[STORAGE_KEYS.ACHIEVEMENTS] || {}, definitions: ACHIEVEMENTS });
      } catch { sendResponse({ achievements: {}, definitions: ACHIEVEMENTS }); }
    })();
    return true;
  }

  if (msg.type === 'checkSitesAchievement') {
    (async () => {
      try {
        const sitesData = await chrome.storage.local.get(STORAGE_KEYS.SITES);
        const sites = sitesData[STORAGE_KEYS.SITES] || {};
        if (Object.keys(sites).length >= 5) checkAndUnlockAchievement('sites_5');
        sendResponse({ ok: true });
      } catch { sendResponse({ ok: false }); }
    })();
    return true;
  }
});

// ── Install & Alarms ──

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SITES);
  if (!data[STORAGE_KEYS.SITES]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SITES]: {
        'youtube.com': 30,
        'twitter.com': 15,
        'x.com': 15,
        'instagram.com': 15,
        'reddit.com': 20,
        'tiktok.com': 15
      },
      [STORAGE_KEYS.USAGE]: {},
      [STORAGE_KEYS.USAGE_DATE]: getToday(),
      [STORAGE_KEYS.ENABLED]: true,
      [STORAGE_KEYS.CHALLENGE]: { enabled: true, difficulty: 'medium' }
    });
  }

  const streakData = await chrome.storage.local.get(STORAGE_KEYS.STREAK);
  if (!streakData[STORAGE_KEYS.STREAK]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.STREAK]: { current: 0, best: 0, lastGoodDay: null }
    });
  }
});

// Re-evaluate tracking when sites list or enabled state changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local') return;
  if (STORAGE_KEYS.SITES in changes || STORAGE_KEYS.ENABLED in changes || STORAGE_KEYS.SCHEDULE in changes) {
    await startTracking();
  }
});

// Keep service worker alive + periodic tasks (only create if not existing)
async function ensureAlarms() {
  const keepAlive = await chrome.alarms.get('keepAlive');
  if (!keepAlive) chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
  const snapshot = await chrome.alarms.get('historySnapshot');
  if (!snapshot) chrome.alarms.create('historySnapshot', { periodInMinutes: 5 });
}
ensureAlarms();

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'keepAlive') {
    if (!trackingInterval) {
      await initActiveTab();
    }
    updateBadge();
  }

  if (alarm.name === 'historySnapshot') {
    await snapshotToday();
  }

  if (alarm.name === 'pauseEnd') {
    await chrome.storage.local.remove(STORAGE_KEYS.PAUSED);
    await initActiveTab();
    updateBadge();
  }

  if (alarm.name === 'nuclearEnd') {
    await chrome.storage.local.remove(STORAGE_KEYS.NUCLEAR);
    updateBadge();
    chrome.notifications.create('nuclear-end', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Focus Guard',
      message: 'Nuclear Option encerrada. Sites liberados.',
      priority: 1
    });
  }
});
