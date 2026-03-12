const STORAGE_KEYS = {
  SITES: 'focusGuard_sites',
  USAGE: 'focusGuard_usage',
  USAGE_DATE: 'focusGuard_date',
  ENABLED: 'focusGuard_enabled',
  BYPASSED: 'focusGuard_bypassed',
  EXTRA: 'focusGuard_extra',
  HISTORY: 'focusGuard_history',
  NUCLEAR: 'focusGuard_nuclear',
  SCHEDULE: 'focusGuard_schedule',
  CHALLENGE: 'focusGuard_challenge',
  HIDE_SHORTS: 'focusGuard_hideShorts',
  HIDE_COMMENTS: 'focusGuard_hideComments',
  WEEKLY_LIMITS: 'focusGuard_weeklyLimits',
  EXTRA_TIME_MIN: 'focusGuard_extraTimeMin',
  ENTRY_CHALLENGE: 'focusGuard_entryChallenge'
};

// ── DOM Elements ──

const siteList = document.getElementById('siteList');
const enableToggle = document.getElementById('enableToggle');
const btnAdd = document.getElementById('btnAdd');
const btnReset = document.getElementById('btnReset');
const newSiteInput = document.getElementById('newSite');
const newLimitInput = document.getElementById('newLimit');
const newUnitSelect = document.getElementById('newUnit');
const newWeeklyLimitInput = document.getElementById('newWeeklyLimit');
const newWeeklyUnitSelect = document.getElementById('newWeeklyUnit');
const totalTimeEl = document.getElementById('totalTime');
const nuclearBanner = document.getElementById('nuclearBanner');
const nuclearTimeEl = document.getElementById('nuclearTime');

// Settings
const challengeToggle = document.getElementById('challengeToggle');
const challengeDifficulty = document.getElementById('challengeDifficulty');
const btnSaveChallenge = document.getElementById('btnSaveChallenge');
const entryChallengeToggle = document.getElementById('entryChallengeToggle');
const extraTimeMinutesInput = document.getElementById('extraTimeMinutes');
const btnSaveExtraTime = document.getElementById('btnSaveExtraTime');
const scheduleSiteSelect = document.getElementById('scheduleSite');
const scheduleEditor = document.getElementById('scheduleEditor');
const btnSaveSchedule = document.getElementById('btnSaveSchedule');
const btnClearSchedule = document.getElementById('btnClearSchedule');
const hideShortsToggle = document.getElementById('hideShortsToggle');
const hideCommentsToggle = document.getElementById('hideCommentsToggle');
const btnNuclear = document.getElementById('btnNuclear');
const nuclearHoursInput = document.getElementById('nuclearHours');

// History
const historyPanel = document.getElementById('historyPanel');
const sparklinesSection = document.getElementById('sparklinesSection');
const sparklinesGrid = document.getElementById('sparklinesGrid');

// ── Helpers ──

function formatTime(seconds) {
  if (seconds < 60) return seconds + 's';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? mins + 'min ' + secs + 's' : mins + 'min';
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? hrs + 'h ' + remainMins + 'min' : hrs + 'h';
}

function formatLimit(limitMinutes) {
  if (limitMinutes >= 60) {
    return limitMinutes % 60 === 0
      ? (limitMinutes / 60) + 'h'
      : Math.floor(limitMinutes / 60) + 'h' + (limitMinutes % 60) + 'min';
  }
  return limitMinutes + 'min';
}

function getBarClass(pct) {
  if (pct < 0.5) return 'fill-ok';
  if (pct < 0.8) return 'fill-warn';
  return 'fill-danger';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function faviconUrl(host) {
  var domain = host.split('/')[0];
  return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
}

function formatDateBR(dateStr) {
  var parts = dateStr.split('-');
  var days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  var date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return days[date.getDay()] + ' ' + parts[2] + '/' + parts[1];
}

// ── Tabs ──

document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'history') loadHistory();
    if (btn.dataset.tab === 'settings') loadSettings();
  });
});

// ── Nuclear Banner ──

var nuclearTimer = null;

function updateNuclearBanner() {
  chrome.runtime.sendMessage({ type: 'getNuclearStatus' }, function(response) {
    if (chrome.runtime.lastError || !response) return;
    if (response.active) {
      nuclearBanner.classList.add('active');
      var remaining = response.until - Date.now();
      var h = Math.floor(remaining / 3600000);
      var m = Math.floor((remaining % 3600000) / 60000);
      nuclearTimeEl.textContent = h + 'h ' + m + 'min restantes';
      btnNuclear.disabled = true;
      btnNuclear.textContent = 'NUCLEAR ATIVA';
    } else {
      nuclearBanner.classList.remove('active');
      btnNuclear.disabled = false;
      btnNuclear.textContent = 'ATIVAR NUCLEAR OPTION';
    }
  });
}

function startNuclearTimer() {
  updateNuclearBanner();
  nuclearTimer = setInterval(updateNuclearBanner, 30000);
}

// ── Sites Tab ──

var _loadGeneration = 0;

async function loadData() {
  var gen = ++_loadGeneration;
  var data = await chrome.storage.local.get([
    STORAGE_KEYS.SITES, STORAGE_KEYS.USAGE, STORAGE_KEYS.ENABLED,
    STORAGE_KEYS.BYPASSED, STORAGE_KEYS.EXTRA, STORAGE_KEYS.SCHEDULE,
    STORAGE_KEYS.WEEKLY_LIMITS
  ]);

  if (gen !== _loadGeneration) return; // stale call

  var sites = data[STORAGE_KEYS.SITES] || {};
  var usage = data[STORAGE_KEYS.USAGE] || {};
  var enabled = data[STORAGE_KEYS.ENABLED] !== false;
  var bypassed = data[STORAGE_KEYS.BYPASSED] || {};
  var extra = data[STORAGE_KEYS.EXTRA] || {};
  var schedule = data[STORAGE_KEYS.SCHEDULE] || {};
  var weeklyLimits = data[STORAGE_KEYS.WEEKLY_LIMITS] || {};

  enableToggle.checked = enabled;

  var sorted = Object.entries(sites).sort(function(a, b) {
    return (usage[b[0]] || 0) - (usage[a[0]] || 0);
  });

  siteList.innerHTML = '';
  var totalSec = 0;

  if (sorted.length === 0) {
    siteList.innerHTML = '<div class="empty">Nenhum site configurado.<br>Adicione um site abaixo para começar.</div>';
  }

  // Check nuclear status
  var nuclearActive = false;
  var nuclearSites = null;
  try {
    var nuclearData = await chrome.storage.local.get(STORAGE_KEYS.NUCLEAR);
    var nuclear = nuclearData[STORAGE_KEYS.NUCLEAR];
    if (nuclear && nuclear.until && Date.now() < nuclear.until) {
      nuclearActive = true;
      nuclearSites = nuclear.sites;
    }
  } catch(e) {}

  if (gen !== _loadGeneration) return; // stale call

  for (var i = 0; i < sorted.length; i++) {
    var pattern = sorted[i][0];
    var limitMin = sorted[i][1];
    var used = usage[pattern] || 0;
    var extraSec = extra[pattern] || 0;
    var totalLimit = (limitMin * 60) + extraSec;
    var pct = Math.min(used / totalLimit, 1);
    var isBypassed = !!bypassed[pattern];
    var isBlocked = !isBypassed && used >= totalLimit;
    var hasSchedule = !!schedule[pattern];
    var isNuclear = nuclearActive && (nuclearSites === 'all' || (Array.isArray(nuclearSites) && nuclearSites.includes(pattern)));
    var weeklyLimit = weeklyLimits[pattern];

    totalSec += used;

    var badge = '';
    if (isNuclear) badge = '<span class="site-badge badge-nuclear">Nuclear</span>';
    else if (isBypassed) badge = '<span class="site-badge badge-bypassed">Liberado</span>';
    else if (isBlocked) badge = '<span class="site-badge badge-blocked">Bloqueado</span>';
    else if (hasSchedule) badge = '<span class="site-badge badge-scheduled">Horário</span>';

    var extraTxt = extraSec > 0 ? ' (+' + Math.floor(extraSec / 60) + 'min)' : '';
    var weeklyTxt = weeklyLimit ? '<div class="weekly-info">Semanal: ' + formatLimit(weeklyLimit) + '</div>' : '';
    var safe = escapeHtml(pattern);

    var card = document.createElement('div');
    card.className = 'site-card';
    card.dataset.pattern = pattern;
    card.innerHTML =
      '<div class="site-favicon">' +
        '<img src="' + faviconUrl(pattern) + '" alt="" class="fav-img">' +
      '</div>' +
      '<div class="site-body">' +
        '<div class="site-row">' +
          '<span class="site-host" title="' + safe + '">' + safe + '</span>' +
          '<span class="site-badge-slot">' + badge + '</span>' +
        '</div>' +
        '<div class="site-meta">' + formatTime(used) + ' / ' + formatLimit(limitMin) + extraTxt + '</div>' +
        weeklyTxt +
        '<div class="site-progress">' +
          '<div class="site-progress-fill ' + getBarClass(pct) + '" style="width:' + (pct * 100) + '%"></div>' +
        '</div>' +
      '</div>' +
      '<button class="site-del" data-site="' + safe + '" title="Remover">&times;</button>';
    siteList.appendChild(card);
  }

  totalTimeEl.textContent = formatTime(totalSec);

  // Favicon fallback
  document.querySelectorAll('.fav-img').forEach(function(img) {
    img.addEventListener('error', function() {
      this.style.display = 'none';
      this.parentElement.textContent = '🌐';
    });
  });

  // Remove buttons
  document.querySelectorAll('.site-del').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var site = btn.dataset.site;
      delete sites[site];
      await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: sites });

      // Clean up all related data for this site
      var cleanupKeys = [
        STORAGE_KEYS.WEEKLY_LIMITS, STORAGE_KEYS.USAGE,
        STORAGE_KEYS.EXTRA, STORAGE_KEYS.BYPASSED,
        STORAGE_KEYS.SCHEDULE, 'focusGuard_entryPassed'
      ];
      var cleanupData = await chrome.storage.local.get(cleanupKeys);
      var updates = {};
      for (var ci = 0; ci < cleanupKeys.length; ci++) {
        var key = cleanupKeys[ci];
        var obj = cleanupData[key];
        if (obj && typeof obj === 'object' && obj[site] !== undefined) {
          delete obj[site];
          updates[key] = obj;
        }
      }
      if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
      }
      loadData();
    });
  });

  // Update schedule site selector
  updateScheduleSiteOptions(sites);
}

// ── Toggle ──

enableToggle.addEventListener('change', async function() {
  await chrome.storage.local.set({ [STORAGE_KEYS.ENABLED]: enableToggle.checked });
});

// ── Add site ──

// Clamp limit input on blur
function clampInput(input, min, max, fallback) {
  var v = parseInt(input.value);
  if (isNaN(v) || v < min) input.value = fallback;
  else if (v > max) input.value = max;
}

function getDailyMax() { return newUnitSelect.value === 'hrs' ? 24 : 1440; }

newLimitInput.addEventListener('blur', function() {
  clampInput(newLimitInput, 1, getDailyMax(), newUnitSelect.value === 'hrs' ? 1 : 30);
});
newWeeklyLimitInput.addEventListener('blur', function() {
  if (newWeeklyLimitInput.value === '') return;
  clampInput(newWeeklyLimitInput, 1, 168, '');
});

btnAdd.addEventListener('click', async function() {
  var site = newSiteInput.value.trim().toLowerCase();
  var raw = parseInt(newLimitInput.value) || 30;
  var unit = newUnitSelect.value;
  var maxDaily = unit === 'hrs' ? 24 : 1440;
  raw = Math.min(Math.max(raw, 1), maxDaily);
  var limitMin = unit === 'hrs' ? raw * 60 : raw;

  if (!site) return;

  // Clean URL parts but keep paths
  site = site.replace(/^(https?:\/\/)?(www\.)?/, '');
  site = site.replace(/[#?].*$/, '');
  site = site.replace(/\/+$/, '');

  // Validate
  var domainPart = site.split('/')[0];
  if (!domainPart.includes('.') || domainPart.length > 255) {
    newSiteInput.classList.add('input-error');
    setTimeout(function() { newSiteInput.classList.remove('input-error'); }, 1500);
    return;
  }

  // Validate weekly BEFORE saving anything
  var weeklyRaw = parseInt(newWeeklyLimitInput.value);
  var weeklyMin = 0;
  if (weeklyRaw > 0) {
    weeklyRaw = Math.min(weeklyRaw, 168);
    weeklyMin = weeklyRaw * 60; // always hrs now
    if (weeklyMin < limitMin) {
      var weeklyPill = newWeeklyLimitInput.closest('.limit-pill');
      weeklyPill.classList.add('input-error');
      setTimeout(function() { weeklyPill.classList.remove('input-error'); }, 1500);
      return;
    }
  }

  // Now save site
  var data = await chrome.storage.local.get(STORAGE_KEYS.SITES);
  var sites = data[STORAGE_KEYS.SITES] || {};
  sites[site] = limitMin;
  await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: sites });

  // Save weekly limit if provided
  if (weeklyMin > 0) {
    var wData = await chrome.storage.local.get(STORAGE_KEYS.WEEKLY_LIMITS);
    var weeklyLimits = wData[STORAGE_KEYS.WEEKLY_LIMITS] || {};
    weeklyLimits[site] = weeklyMin;
    await chrome.storage.local.set({ [STORAGE_KEYS.WEEKLY_LIMITS]: weeklyLimits });
  }

  newSiteInput.value = '';
  newLimitInput.value = '30';
  newUnitSelect.value = 'min';
  newWeeklyLimitInput.value = '';
});

// Enter key
newSiteInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') btnAdd.click(); });
newLimitInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') btnAdd.click(); });

// Unit change — update value and max
newUnitSelect.addEventListener('change', function() {
  if (newUnitSelect.value === 'hrs') {
    newLimitInput.value = '1';
    newLimitInput.max = '24';
  } else {
    newLimitInput.value = '30';
    newLimitInput.max = '1440';
  }
});
newWeeklyUnitSelect.addEventListener('change', function() {
  if (newWeeklyLimitInput.value === '') return;
  clampInput(newWeeklyLimitInput, 1, 168, '');
});

// ── Reset ──

btnReset.addEventListener('click', function() {
  if (!confirm('Zerar todo o uso de hoje? Isso não pode ser desfeito.')) return;
  chrome.runtime.sendMessage({ type: 'resetUsage' }, function() {
    loadData();
  });
});

// ── History Tab ──

function loadHistory() {
  chrome.runtime.sendMessage({ type: 'getHistory' }, function(response) {
    if (chrome.runtime.lastError || !response) {
      historyPanel.innerHTML = '<div class="history-empty">Erro ao carregar histórico</div>';
      return;
    }

    var history = response.history || {};
    var dates = Object.keys(history).sort().reverse();

    if (dates.length === 0) {
      historyPanel.innerHTML = '<div class="history-empty">Nenhum histórico ainda.<br>O uso é salvo automaticamente a cada dia.</div>';
      sparklinesSection.style.display = 'none';
      return;
    }

    // Build sparklines from last 7 days
    buildSparklines(history, dates);

    var html = '';

    for (var d = 0; d < dates.length; d++) {
      var date = dates[d];
      var dayUsage = history[date];
      var entries = Object.entries(dayUsage).filter(function(e) { return e[1] > 0; }).sort(function(a, b) { return b[1] - a[1]; });
      if (entries.length === 0) continue;

      var dayTotal = entries.reduce(function(sum, e) { return sum + e[1]; }, 0);
      var maxSeconds = Math.max.apply(null, entries.map(function(e) { return e[1]; }));

      html += '<div class="history-day">';
      html += '<div class="history-date"><span>' + formatDateBR(date) + '</span><span class="history-date-total">' + formatTime(dayTotal) + '</span></div>';

      for (var j = 0; j < entries.length; j++) {
        var site = entries[j][0];
        var seconds = entries[j][1];
        var pct = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0;
        var barClass = seconds > 3600 ? 'fill-danger' : seconds > 1800 ? 'fill-warn' : 'fill-ok';
        html += '<div class="history-bar">' +
          '<span class="history-bar-label">' + escapeHtml(site) + '</span>' +
          '<div class="history-bar-track"><div class="history-bar-fill ' + barClass + '" style="width:' + pct + '%"></div></div>' +
          '<span class="history-bar-time">' + formatTime(seconds) + '</span>' +
        '</div>';
      }

      html += '</div>';
    }

    historyPanel.innerHTML = html;
  });
}

// ── Sparklines ──

function buildSparklines(history, sortedDates) {
  // Get last 7 dates
  var today = new Date();
  var last7 = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var dateStr = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    last7.push(dateStr);
  }

  // Collect all sites that appear in the last 7 days
  var siteTotals = {};
  var siteDaily = {};
  for (var di = 0; di < last7.length; di++) {
    var dateKey = last7[di];
    var dayData = history[dateKey] || {};
    var siteKeys = Object.keys(dayData);
    for (var si = 0; si < siteKeys.length; si++) {
      var sk = siteKeys[si];
      if (!siteTotals[sk]) { siteTotals[sk] = 0; siteDaily[sk] = []; }
      siteTotals[sk] += dayData[sk] || 0;
    }
  }

  // Build daily arrays for each site
  var siteNames = Object.keys(siteTotals);
  for (var ni = 0; ni < siteNames.length; ni++) {
    var name = siteNames[ni];
    siteDaily[name] = [];
    for (var dj = 0; dj < last7.length; dj++) {
      var dd = history[last7[dj]] || {};
      siteDaily[name].push(dd[name] || 0);
    }
  }

  // Sort by total usage descending
  siteNames.sort(function(a, b) { return siteTotals[b] - siteTotals[a]; });

  if (siteNames.length === 0) {
    sparklinesSection.style.display = 'none';
    return;
  }

  sparklinesSection.style.display = '';
  sparklinesGrid.innerHTML = '';

  // Render up to 6 sparklines
  var maxToShow = Math.min(siteNames.length, 6);
  for (var ri = 0; ri < maxToShow; ri++) {
    var siteName = siteNames[ri];
    var dailyData = siteDaily[siteName];

    var row = document.createElement('div');
    row.className = 'sparkline-row';

    // Trend calculation
    var firstHalf = 0, secondHalf = 0;
    for (var th = 0; th < 3; th++) firstHalf += dailyData[th] || 0;
    for (var sh = 4; sh < 7; sh++) secondHalf += dailyData[sh] || 0;

    var trendClass = 'trend-flat';
    var trendIcon = '→';
    if (secondHalf > firstHalf * 1.15) { trendClass = 'trend-up'; trendIcon = '↑'; }
    else if (secondHalf < firstHalf * 0.85) { trendClass = 'trend-down'; trendIcon = '↓'; }

    // SVG sparkline
    var maxVal = Math.max.apply(null, dailyData);
    if (maxVal === 0) maxVal = 1;
    var svgWidth = 120;
    var svgHeight = 24;
    var padding = 2;
    var points = [];
    var areaPoints = [];

    for (var pi = 0; pi < dailyData.length; pi++) {
      var x = padding + (pi / (dailyData.length - 1)) * (svgWidth - padding * 2);
      var y = svgHeight - padding - ((dailyData[pi] / maxVal) * (svgHeight - padding * 2));
      points.push(x.toFixed(1) + ',' + y.toFixed(1));
      areaPoints.push(x.toFixed(1) + ',' + y.toFixed(1));
    }

    // Close area path
    var areaPath = 'M' + areaPoints[0];
    for (var ap = 1; ap < areaPoints.length; ap++) areaPath += ' L' + areaPoints[ap];
    areaPath += ' L' + (svgWidth - padding).toFixed(1) + ',' + svgHeight;
    areaPath += ' L' + padding + ',' + svgHeight + ' Z';

    var lineColor = trendClass === 'trend-up' ? '#ef4444' : trendClass === 'trend-down' ? '#22c55e' : '#6366f1';
    var fillColor = trendClass === 'trend-up' ? 'rgba(239,68,68,0.1)' : trendClass === 'trend-down' ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)';

    var avgMin = Math.round(siteTotals[siteName] / 7 / 60);
    var avgText = avgMin >= 60 ? Math.floor(avgMin / 60) + 'h' + (avgMin % 60 > 0 ? avgMin % 60 : '') : avgMin + 'm';

    row.innerHTML =
      '<span class="sparkline-site">' + escapeHtml(siteName) + '</span>' +
      '<svg class="sparkline-svg" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '" preserveAspectRatio="none">' +
        '<path d="' + areaPath + '" fill="' + fillColor + '"/>' +
        '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + lineColor + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<span class="sparkline-trend ' + trendClass + '">' + trendIcon + ' ' + avgText + '/d</span>';

    sparklinesGrid.appendChild(row);
  }
}

// ── Settings Tab ──

async function loadSettings() {
  // Challenge
  var challengeData = await chrome.storage.local.get(STORAGE_KEYS.CHALLENGE);
  var challenge = challengeData[STORAGE_KEYS.CHALLENGE] || { enabled: false, difficulty: 'medium' };
  challengeToggle.checked = challenge.enabled;
  challengeDifficulty.value = challenge.difficulty;

  // Entry Challenge
  var entryData = await chrome.storage.local.get(STORAGE_KEYS.ENTRY_CHALLENGE);
  var entry = entryData[STORAGE_KEYS.ENTRY_CHALLENGE] || { enabled: false };
  entryChallengeToggle.checked = entry.enabled;

  // Extra Time Config
  var extraTimeData = await chrome.storage.local.get(STORAGE_KEYS.EXTRA_TIME_MIN);
  extraTimeMinutesInput.value = extraTimeData[STORAGE_KEYS.EXTRA_TIME_MIN] || 5;

  // Hide Shorts & Comments
  var shortsData = await chrome.storage.local.get([STORAGE_KEYS.HIDE_SHORTS, STORAGE_KEYS.HIDE_COMMENTS]);
  hideShortsToggle.checked = !!shortsData[STORAGE_KEYS.HIDE_SHORTS];
  hideCommentsToggle.checked = !!shortsData[STORAGE_KEYS.HIDE_COMMENTS];

  // Nuclear
  updateNuclearBanner();
}

// Challenge save
btnSaveChallenge.addEventListener('click', function() {
  chrome.runtime.sendMessage({
    type: 'saveChallenge',
    enabled: challengeToggle.checked,
    difficulty: challengeDifficulty.value
  }, function(response) {
    if (response && response.ok) {
      btnSaveChallenge.textContent = 'Salvo!';
      setTimeout(function() { btnSaveChallenge.textContent = 'Salvar'; }, 1500);
    }
  });
});

// Entry Challenge toggle
entryChallengeToggle.addEventListener('change', function() {
  chrome.runtime.sendMessage({
    type: 'saveEntryChallenge',
    enabled: entryChallengeToggle.checked
  });
});

// Extra Time save
btnSaveExtraTime.addEventListener('click', function() {
  chrome.runtime.sendMessage({
    type: 'saveExtraTimeConfig',
    minutes: parseInt(extraTimeMinutesInput.value) || 5
  }, function(response) {
    if (response && response.ok) {
      btnSaveExtraTime.textContent = 'Salvo!';
      setTimeout(function() { btnSaveExtraTime.textContent = 'Salvar'; }, 1500);
    }
  });
});

// Schedule
function updateScheduleSiteOptions(sites) {
  var current = scheduleSiteSelect.value;
  scheduleSiteSelect.innerHTML = '<option value="">Selecione um site...</option>';
  var keys = Object.keys(sites || {});
  for (var i = 0; i < keys.length; i++) {
    var opt = document.createElement('option');
    opt.value = keys[i];
    opt.textContent = keys[i];
    scheduleSiteSelect.appendChild(opt);
  }
  if (current && sites && sites[current]) {
    scheduleSiteSelect.value = current;
  }
}

scheduleSiteSelect.addEventListener('change', async function() {
  var site = scheduleSiteSelect.value;
  if (!site) {
    scheduleEditor.style.display = 'none';
    return;
  }

  scheduleEditor.style.display = 'block';

  var data = await chrome.storage.local.get(STORAGE_KEYS.SCHEDULE);
  var schedules = data[STORAGE_KEYS.SCHEDULE] || {};
  var schedule = schedules[site];

  if (schedule) {
    document.querySelectorAll('.day-pill').forEach(function(pill) {
      var day = parseInt(pill.dataset.day);
      pill.classList.toggle('active', schedule.days.includes(day));
    });
    document.getElementById('schedStartH').value = schedule.startHour || 0;
    document.getElementById('schedStartM').value = schedule.startMin || 0;
    document.getElementById('schedEndH').value = schedule.endHour !== undefined ? schedule.endHour : 23;
    document.getElementById('schedEndM').value = schedule.endMin !== undefined ? schedule.endMin : 59;
  } else {
    document.querySelectorAll('.day-pill').forEach(function(pill) { pill.classList.add('active'); });
    document.getElementById('schedStartH').value = 0;
    document.getElementById('schedStartM').value = 0;
    document.getElementById('schedEndH').value = 23;
    document.getElementById('schedEndM').value = 59;
  }
});

// Day pills toggle
document.querySelectorAll('.day-pill').forEach(function(pill) {
  pill.addEventListener('click', function() {
    pill.classList.toggle('active');
  });
});

btnSaveSchedule.addEventListener('click', function() {
  var site = scheduleSiteSelect.value;
  if (!site) return;

  var days = [];
  document.querySelectorAll('.day-pill.active').forEach(function(pill) {
    days.push(parseInt(pill.dataset.day));
  });

  var startH = parseInt(document.getElementById('schedStartH').value);
  var startM = parseInt(document.getElementById('schedStartM').value);
  var endH = parseInt(document.getElementById('schedEndH').value);
  var endM = parseInt(document.getElementById('schedEndM').value);

  var schedule = {
    days: days,
    startHour: isNaN(startH) ? 0 : startH,
    startMin: isNaN(startM) ? 0 : startM,
    endHour: isNaN(endH) ? 23 : endH,
    endMin: isNaN(endM) ? 59 : endM
  };

  chrome.runtime.sendMessage({
    type: 'saveSchedule',
    site: site,
    schedule: schedule
  }, function(response) {
    if (response && response.ok) {
      btnSaveSchedule.textContent = 'Salvo!';
      setTimeout(function() { btnSaveSchedule.textContent = 'Salvar horário'; }, 1500);
      loadData();
    }
  });
});

btnClearSchedule.addEventListener('click', function() {
  var site = scheduleSiteSelect.value;
  if (!site) return;

  chrome.runtime.sendMessage({
    type: 'saveSchedule',
    site: site,
    schedule: null
  }, function(response) {
    if (response && response.ok) {
      scheduleEditor.style.display = 'none';
      scheduleSiteSelect.value = '';
      loadData();
    }
  });
});

// Hide Shorts
hideShortsToggle.addEventListener('change', async function() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.HIDE_SHORTS]: hideShortsToggle.checked
  });
});

// Hide Comments
hideCommentsToggle.addEventListener('change', async function() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.HIDE_COMMENTS]: hideCommentsToggle.checked
  });
});

// Nuclear Option
btnNuclear.addEventListener('click', function() {
  var hours = parseFloat(nuclearHoursInput.value) || 2;
  var msg = 'ATENÇÃO: Isso vai bloquear TODOS os sites rastreados por ' + hours + ' hora(s).\n\nEssa ação NÃO pode ser desfeita!\n\nTem certeza?';
  if (!confirm(msg)) return;
  if (!confirm('TEM CERTEZA MESMO? Não tem como voltar atrás!')) return;

  chrome.runtime.sendMessage({
    type: 'activateNuclear',
    hours: hours,
    sites: 'all'
  }, function(response) {
    if (response && response.ok) {
      updateNuclearBanner();
      loadData();
    } else if (response && response.error) {
      alert(response.error);
    }
  });
});

// ── Lightweight Usage Refresh (no DOM rebuild) ──

async function refreshUsage() {
  var cards = siteList.querySelectorAll('.site-card[data-pattern]');
  if (cards.length === 0) return; // nothing to update

  var data = await chrome.storage.local.get([
    STORAGE_KEYS.SITES, STORAGE_KEYS.USAGE,
    STORAGE_KEYS.BYPASSED, STORAGE_KEYS.EXTRA,
    STORAGE_KEYS.WEEKLY_LIMITS, STORAGE_KEYS.NUCLEAR
  ]);

  var sites = data[STORAGE_KEYS.SITES] || {};
  var usage = data[STORAGE_KEYS.USAGE] || {};
  var bypassed = data[STORAGE_KEYS.BYPASSED] || {};
  var extra = data[STORAGE_KEYS.EXTRA] || {};
  var weeklyLimits = data[STORAGE_KEYS.WEEKLY_LIMITS] || {};
  var nuclear = data[STORAGE_KEYS.NUCLEAR];
  var nuclearActive = nuclear && nuclear.until && Date.now() < nuclear.until;
  var nuclearSites = nuclearActive ? nuclear.sites : null;

  var totalSec = 0;

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var pattern = card.dataset.pattern;
    var limitMin = sites[pattern];
    if (limitMin === undefined) continue;

    var used = usage[pattern] || 0;
    var extraSec = extra[pattern] || 0;
    var totalLimit = (limitMin * 60) + extraSec;
    var pct = Math.min(used / totalLimit, 1);
    var isBypassed = !!bypassed[pattern];
    var isBlocked = !isBypassed && used >= totalLimit;
    var isNuclear = nuclearActive && (nuclearSites === 'all' || (Array.isArray(nuclearSites) && nuclearSites.includes(pattern)));

    totalSec += used;

    // Update usage text
    var extraTxt = extraSec > 0 ? ' (+' + Math.floor(extraSec / 60) + 'min)' : '';
    var meta = card.querySelector('.site-meta');
    if (meta) {
      var newText = formatTime(used) + ' / ' + formatLimit(limitMin) + extraTxt;
      if (meta.textContent !== newText) meta.textContent = newText;
    }

    // Update weekly info
    var weeklyEl = card.querySelector('.weekly-info');
    var weeklyLimit = weeklyLimits[pattern];
    if (weeklyEl) {
      var wantedTxt = weeklyLimit ? 'Semanal: ' + formatLimit(weeklyLimit) : '';
      if (weeklyEl.textContent !== wantedTxt) weeklyEl.textContent = wantedTxt;
    }

    // Update progress bar
    var fill = card.querySelector('.site-progress-fill');
    if (fill) {
      var newWidth = (pct * 100) + '%';
      var newClass = 'site-progress-fill ' + getBarClass(pct);
      if (fill.style.width !== newWidth) fill.style.width = newWidth;
      if (fill.className !== newClass) fill.className = newClass;
    }

    // Update badge
    var badgeSlot = card.querySelector('.site-badge-slot');
    if (badgeSlot) {
      var newBadge = '';
      if (isNuclear) newBadge = '<span class="site-badge badge-nuclear">Nuclear</span>';
      else if (isBypassed) newBadge = '<span class="site-badge badge-bypassed">Liberado</span>';
      else if (isBlocked) newBadge = '<span class="site-badge badge-blocked">Bloqueado</span>';
      if (badgeSlot.innerHTML !== newBadge && !badgeSlot.querySelector('.badge-scheduled')) {
        badgeSlot.innerHTML = newBadge;
      }
    }
  }

  if (totalTimeEl.textContent !== formatTime(totalSec)) {
    totalTimeEl.textContent = formatTime(totalSec);
  }
}

// ── Init ──

loadData();
startNuclearTimer();

// Lightweight usage refresh every 1.5s (only updates text + bar widths, no DOM rebuild)
setInterval(refreshUsage, 1500);

// Debounced loadData to prevent duplicate cards from concurrent async calls
var _loadDebounce = null;
function queueLoadData() {
  clearTimeout(_loadDebounce);
  _loadDebounce = setTimeout(loadData, 50);
}

// Full rebuild only for structural changes (sites added/removed, bypass toggled, etc.)
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local') {
    var structuralKeys = [STORAGE_KEYS.SITES, STORAGE_KEYS.ENABLED,
                STORAGE_KEYS.BYPASSED, STORAGE_KEYS.NUCLEAR,
                STORAGE_KEYS.SCHEDULE, STORAGE_KEYS.WEEKLY_LIMITS,
                STORAGE_KEYS.EXTRA];
    if (structuralKeys.some(function(k) { return k in changes; })) {
      queueLoadData();
    }
  }
});
