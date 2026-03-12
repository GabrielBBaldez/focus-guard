// ── Init ──
var params = new URLSearchParams(window.location.search);
var rawSite = params.get('site') || 'este site';
// Sanitize: remove anything after first space/newline, keep only domain+path chars
var site = rawSite.replace(/[\s<>"'`]/g, '').split('#')[0].split('?')[0].toLowerCase();
var isNuclear = params.get('nuclear') === '1';
var isEntryMode = params.get('entry') === '1';
var isWeeklyBlock = params.get('reason') === 'weekly';
var siteIsValid = false; // will be validated against storage
var configuredExtraMin = 5; // will be loaded from storage

document.getElementById('siteName').textContent = site;

// ── Entry Challenge Mode ──
if (isEntryMode) {
  document.getElementById('mainContainer').classList.add('entry-mode');
  document.querySelector('h1').textContent = 'Antes de acessar...';
  document.querySelector('.message').innerHTML =
    'Você precisa completar o desafio antes de acessar <strong>' + site + '</strong>.<br>' +
    '<strong>Isso ajuda você a ser intencional com seu tempo.</strong>';
  document.getElementById('countdown').style.display = 'none';
}

// ── Nuclear Mode ──
if (isNuclear) {
  document.getElementById('mainContainer').classList.add('nuclear-mode');
  document.getElementById('bypassSection').classList.add('hidden');
}

// Check nuclear status from background
chrome.runtime.sendMessage({ type: 'getNuclearStatus' }, function(response) {
  if (chrome.runtime.lastError || !response) return;
  if (response.active) {
    document.getElementById('mainContainer').classList.add('nuclear-mode');
    var until = new Date(response.until);
    var h = until.getHours().toString().padStart(2, '0');
    var m = until.getMinutes().toString().padStart(2, '0');
    document.getElementById('nuclearAlertTime').textContent = 'Sites bloqueados até ' + h + ':' + m;

    // Hide bypass buttons during nuclear
    document.getElementById('bypassSection').classList.add('hidden');
    document.getElementById('challengeSection').classList.remove('visible');
  }
});

// ── Quotes ──
var quotes = [
  '"Pessoas pensam que foco significa dizer sim para a coisa em que você vai focar. Mas não é nada disso. Significa dizer não para as centenas de outras boas ideias." \u2014 Steve Jobs',
  '"A disciplina é a ponte entre metas e realizações." \u2014 Jim Rohn',
  '"Você nunca muda sua vida até mudar algo que faz diariamente." \u2014 John C. Maxwell',
  '"Onde está o seu foco, está a sua realidade." \u2014 Qui-Gon Jinn',
  '"Não é que eu seja tão inteligente; é que fico com os problemas por mais tempo." \u2014 Albert Einstein',
  '"O sucesso é a soma de pequenos esforços repetidos dia após dia." \u2014 Robert Collier',
  '"A melhor maneira de prever o futuro é criá-lo." \u2014 Peter Drucker',
  '"Faça o que pode, com o que tem, onde estiver." \u2014 Theodore Roosevelt',
  '"Não é a vontade de vencer que importa. Todo mundo tem isso. É a vontade de se preparar para vencer que importa." \u2014 Bear Bryant',
  '"A persistência é o caminho do êxito." \u2014 Charles Chaplin',
  '"Não basta conquistar a sabedoria, é preciso usá-la." \u2014 Cícero',
  '"Grandes coisas não são feitas por impulso, mas por uma série de pequenas coisas reunidas." \u2014 Vincent van Gogh',
  '"A energia e a persistência conquistam todas as coisas." \u2014 Benjamin Franklin',
  '"O que não começou hoje nunca terminará amanhã." \u2014 Johann Wolfgang von Goethe',
  '"Comece fazendo o que é necessário, depois o que é possível, e de repente você estará fazendo o impossível." \u2014 São Francisco de Assis',
  '"Conhece-te a ti mesmo." \u2014 Sócrates',
  '"A mente que se abre a uma nova ideia jamais voltará ao seu tamanho original." \u2014 Oliver Wendell Holmes',
  '"Não espere por circunstâncias ideais. Nunca serão ideais." \u2014 Janet Stuart',
  '"Torna-te quem tu és." \u2014 Friedrich Nietzsche',
  '"Não é que temos pouco tempo, mas que perdemos muito." \u2014 Sêneca'
];
document.getElementById('quote').textContent = quotes[Math.floor(Math.random() * quotes.length)];

// ── Stats ──
function formatMin(seconds) {
  var m = Math.floor(seconds / 60);
  if (m < 60) return m + 'min';
  var h = Math.floor(m / 60);
  var r = m % 60;
  return r > 0 ? h + 'h' + r + 'min' : h + 'h';
}

chrome.runtime.sendMessage({ type: 'getUsage' }, function(response) {
  if (chrome.runtime.lastError || !response) return;

  var usage = response.usage || {};
  var sites = response.sites || {};
  var extra = response.extra || {};
  var weeklyLimits = response.weeklyLimits || {};

  // Load configured extra time
  configuredExtraMin = response.extraTimeMin || 5;
  var btnExtra = document.getElementById('btnExtra');
  btnExtra.textContent = '+' + configuredExtraMin + ' minutos';
  btnExtra.setAttribute('aria-label', 'Adicionar ' + configuredExtraMin + ' minutos extras');

  // Validate site is actually tracked (prevents open redirect)
  if (sites[site] !== undefined) {
    siteIsValid = true;
  }

  // Hide stats section in entry mode (no usage to show yet)
  if (isEntryMode) {
    document.querySelector('.stats').style.display = 'none';
    return;
  }

  // Update message based on block reason (daily vs weekly)
  var msgEl = document.querySelector('.message');
  if (isWeeklyBlock) {
    document.querySelector('h1').textContent = 'Limite semanal atingido!';
    msgEl.innerHTML = 'Você atingiu seu limite <strong>semanal</strong> nesse site.<br><strong>Volte a focar no que importa.</strong>';
  }

  var usedSec = usage[site] || 0;
  var limitMin = sites[site] || 0;
  var extraSec = extra[site] || 0;
  var totalLimitSec = (limitMin * 60) + extraSec;

  document.getElementById('statUsed').textContent = formatMin(usedSec);
  document.getElementById('statLimit').textContent = formatMin(totalLimitSec);

  // If weekly block, show weekly stats instead
  if (isWeeklyBlock && weeklyLimits[site]) {
    document.getElementById('statLimit').textContent = formatMin(weeklyLimits[site] * 60);
    document.querySelector('#statLimit + .stat-label').textContent = 'Limite semanal';
    document.querySelector('#statUsed + .stat-label').textContent = 'Usado hoje';
    // Fetch weekly usage to display
    chrome.runtime.sendMessage({ type: 'getWeeklyUsage', site: site }, function(weeklyResp) {
      if (weeklyResp && weeklyResp.seconds !== undefined) {
        document.getElementById('statTotal').textContent = formatMin(weeklyResp.seconds);
        document.querySelector('#statTotal + .stat-label').textContent = 'Usado semana';
      }
    });
  } else {
    var totalToday = 0;
    var keys = Object.keys(usage);
    for (var i = 0; i < keys.length; i++) {
      totalToday += usage[keys[i]] || 0;
    }
    document.getElementById('statTotal').textContent = formatMin(totalToday);
  }
});

// ── Challenge System ──
var challengeSection = document.getElementById('challengeSection');
var challengeText = document.getElementById('challengeText');
var challengeInput = document.getElementById('challengeInput');
var challengeHint = document.getElementById('challengeHint');
var btnChallengeVerify = document.getElementById('btnChallengeVerify');
var bypassSection = document.getElementById('bypassSection');
var challengePassed = false;
var originalChallengeText = '';

// Block paste
challengeInput.addEventListener('paste', function(e) {
  e.preventDefault();
  challengeHint.textContent = 'Copiar e colar não é permitido!';
  challengeHint.classList.add('error-text');
  setTimeout(function() {
    challengeHint.textContent = 'Copiar e colar está desabilitado. Digite manualmente.';
    challengeHint.classList.remove('error-text');
  }, 2000);
});

// Block drag
challengeInput.addEventListener('drop', function(e) {
  e.preventDefault();
});

// Load challenge
chrome.runtime.sendMessage({ type: 'getChallenge' }, function(response) {
  if (chrome.runtime.lastError || !response) return;

  if (response.enabled || isEntryMode) {
    // In entry mode, always show challenge
    challengeSection.classList.add('visible');

    if (!isEntryMode) {
      bypassSection.classList.add('hidden');
    }

    originalChallengeText = response.text || '';
    challengeText.textContent = response.text || '';

    // If challenge is disabled but entry mode is on, use a default text
    if (!response.enabled && isEntryMode) {
      challengeSection.querySelector('.challenge-label').textContent = 'Complete o desafio para acessar o site';
      // Get a challenge from background even if disabled
      originalChallengeText = 'Eu escolho ser intencional com meu tempo e uso consciente de tecnologia.';
      challengeText.textContent = originalChallengeText;
    } else if (isEntryMode) {
      challengeSection.querySelector('.challenge-label').textContent = 'Complete o desafio para acessar o site';
    }
  }
});

btnChallengeVerify.addEventListener('click', function() {
  var typed = challengeInput.value;

  chrome.runtime.sendMessage({
    type: 'verifyChallenge',
    original: originalChallengeText,
    typed: typed
  }, function(response) {
    if (chrome.runtime.lastError || !response) return;

    if (response.ok) {
      challengePassed = true;
      challengeInput.classList.remove('error');
      challengeInput.classList.add('success');

      if (isEntryMode) {
        challengeHint.textContent = 'Desafio completo! Você pode acessar o site.';
        challengeHint.classList.remove('error-text');
        // Enable entry proceed button
        var btnProceed = document.getElementById('btnEntryProceed');
        btnProceed.disabled = false;
      } else {
        challengeHint.textContent = 'Desafio completo! Botões de bypass liberados.';
        challengeHint.classList.remove('error-text');
        // Show bypass buttons
        bypassSection.classList.remove('hidden');
      }

      // Fade out challenge after a moment
      setTimeout(function() {
        challengeSection.style.opacity = '0.5';
      }, 1000);
    } else {
      challengeInput.classList.add('error');
      challengeInput.classList.remove('success');
      challengeHint.textContent = 'Texto incorreto! Verifique e tente novamente.';
      challengeHint.classList.add('error-text');
    }
  });
});

// Entry proceed button
document.getElementById('btnEntryProceed').addEventListener('click', function() {
  if (!challengePassed || !siteIsValid) return;

  var btn = this;
  btn.disabled = true;
  btn.textContent = 'Redirecionando...';

  chrome.runtime.sendMessage({
    type: 'passEntryChallenge',
    site: site
  }, function(response) {
    if (chrome.runtime.lastError) {
      btn.disabled = false;
      btn.textContent = 'Acessar site';
      return;
    }
    if (response && response.ok) {
      window.location.href = response.redirectUrl;
    } else {
      btn.disabled = false;
      btn.textContent = 'Acessar site';
      if (response && response.error) alert(response.error);
    }
  });
});

// ── Breathing Exercise ──
var breathToggle = document.getElementById('breathToggle');
var breathBox = document.getElementById('breathBox');
var breathOrb = document.getElementById('breathOrb');
var breathPhase = document.getElementById('breathPhase');
var breathCounter = document.getElementById('breathCounter');
var breathCycleTimer = null;
var breathCountTimer = null;

breathToggle.addEventListener('click', function() {
  var visible = breathBox.classList.toggle('visible');
  breathToggle.classList.toggle('active', visible);
  if (visible) startBreathing();
  else stopBreathing();
});

function stopBreathing() {
  clearTimeout(breathCycleTimer);
  clearInterval(breathCountTimer);
  breathCycleTimer = null;
  breathCountTimer = null;
  breathOrb.className = 'breath-orb';
  breathPhase.textContent = 'Pronto';
  breathCounter.textContent = '4';
}

function startBreathing() {
  stopBreathing();
  runPhase('inhale', 'Inspire', 4, function() {
    runPhase('hold', 'Segure', 4, function() {
      runPhase('exhale', 'Expire', 4, function() {
        startBreathing();
      });
    });
  });
}

function runPhase(className, label, duration, onDone) {
  breathOrb.className = 'breath-orb ' + className;
  breathPhase.textContent = label;
  var remaining = duration;
  breathCounter.textContent = remaining;

  breathCountTimer = setInterval(function() {
    remaining--;
    if (remaining > 0) {
      breathCounter.textContent = remaining;
    } else {
      clearInterval(breathCountTimer);
      breathCountTimer = null;
    }
  }, 1000);

  breathCycleTimer = setTimeout(function() {
    clearInterval(breathCountTimer);
    breathCountTimer = null;
    if (onDone) onDone();
  }, duration * 1000);
}

// ── Pomodoro Timer ──
var pomodoroToggle = document.getElementById('pomodoroToggle');
var pomodoroBox = document.getElementById('pomodoroBox');
var pomodoroTimeEl = document.getElementById('pomodoroTime');
var pomodoroLabelEl = document.getElementById('pomodoroLabel');
var pomodoroRing = document.getElementById('pomodoroRing');
var pomodoroCyclesEl = document.getElementById('pomodoroCycles');
var pomodoroStart = document.getElementById('pomodoroStart');
var pomodoroPause = document.getElementById('pomodoroPause');
var pomodoroReset = document.getElementById('pomodoroReset');

var POMODORO_FOCUS = 25 * 60; // 25 minutes
var POMODORO_BREAK = 5 * 60;  // 5 minutes
var RING_CIRCUMFERENCE = 2 * Math.PI * 70; // ~439.82

var pomodoroState = {
  running: false,
  paused: false,
  mode: 'focus', // 'focus' or 'break'
  remaining: POMODORO_FOCUS,
  total: POMODORO_FOCUS,
  cycles: 0,
  interval: null
};

pomodoroToggle.addEventListener('click', function() {
  var visible = pomodoroBox.classList.toggle('visible');
  pomodoroToggle.classList.toggle('active', visible);
  if (!visible && pomodoroState.running) {
    pausePomodoro();
  }
});

function updatePomodoroDisplay() {
  var mins = Math.floor(pomodoroState.remaining / 60);
  var secs = pomodoroState.remaining % 60;
  pomodoroTimeEl.textContent = mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');

  // Update ring progress
  var progress = 1 - (pomodoroState.remaining / pomodoroState.total);
  var offset = RING_CIRCUMFERENCE * (1 - progress);
  pomodoroRing.style.strokeDashoffset = offset;

  // Update label and ring color
  if (pomodoroState.mode === 'focus') {
    pomodoroLabelEl.textContent = 'FOCO';
    pomodoroLabelEl.className = 'pomodoro-label focus';
    pomodoroRing.setAttribute('stroke', '#22c55e');
  } else {
    pomodoroLabelEl.textContent = 'PAUSA';
    pomodoroLabelEl.className = 'pomodoro-label break';
    pomodoroRing.setAttribute('stroke', '#eab308');
  }

  pomodoroCyclesEl.textContent = 'Ciclos completos: ' + pomodoroState.cycles;
}

function startPomodoro() {
  if (pomodoroState.interval) {
    clearInterval(pomodoroState.interval);
    pomodoroState.interval = null;
  }
  pomodoroState.running = true;
  pomodoroState.paused = false;
  pomodoroStart.style.display = 'none';
  pomodoroPause.style.display = '';
  pomodoroPause.textContent = 'Pausar';

  pomodoroState.interval = setInterval(function() {
    pomodoroState.remaining--;
    updatePomodoroDisplay();

    if (pomodoroState.remaining <= 0) {
      clearInterval(pomodoroState.interval);
      pomodoroState.interval = null;

      // Play notification sound
      playPomodoroSound();

      if (pomodoroState.mode === 'focus') {
        pomodoroState.cycles++;
        pomodoroState.mode = 'break';
        pomodoroState.remaining = POMODORO_BREAK;
        pomodoroState.total = POMODORO_BREAK;
      } else {
        pomodoroState.mode = 'focus';
        pomodoroState.remaining = POMODORO_FOCUS;
        pomodoroState.total = POMODORO_FOCUS;
      }

      updatePomodoroDisplay();
      // Auto-start next phase
      startPomodoro();
    }
  }, 1000);
}

function pausePomodoro() {
  if (!pomodoroState.running) return;
  clearInterval(pomodoroState.interval);
  pomodoroState.interval = null;
  pomodoroState.paused = true;
  pomodoroPause.textContent = 'Continuar';
}

function resumePomodoro() {
  pomodoroState.paused = false;
  pomodoroPause.textContent = 'Pausar';
  startPomodoro();
}

function resetPomodoro() {
  clearInterval(pomodoroState.interval);
  pomodoroState.interval = null;
  pomodoroState.running = false;
  pomodoroState.paused = false;
  pomodoroState.mode = 'focus';
  pomodoroState.remaining = POMODORO_FOCUS;
  pomodoroState.total = POMODORO_FOCUS;
  pomodoroState.cycles = 0;
  pomodoroStart.style.display = '';
  pomodoroPause.style.display = 'none';
  updatePomodoroDisplay();
}

function playPomodoroSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  } catch(e) { /* Audio API not available */ }
}

pomodoroStart.addEventListener('click', function() {
  startPomodoro();
});

pomodoroPause.addEventListener('click', function() {
  if (pomodoroState.paused) {
    resumePomodoro();
  } else {
    pausePomodoro();
  }
});

pomodoroReset.addEventListener('click', function() {
  resetPomodoro();
});

// Set initial ring
pomodoroRing.style.strokeDasharray = RING_CIRCUMFERENCE;
pomodoroRing.style.strokeDashoffset = '0';
updatePomodoroDisplay();

// ── Bypass Buttons ──
function safeRedirect(url) {
  // Only redirect to validated sites from storage
  if (!siteIsValid) return;
  window.location.href = url;
}

function sendBypass(btn, message, attempt) {
  attempt = attempt || 1;
  if (btn.disabled && attempt === 1) return;
  btn.disabled = true;
  btn.classList.add('loading');

  var timeout = setTimeout(function() {
    btn.disabled = false;
    btn.classList.remove('loading');
  }, 8000);

  try {
    chrome.runtime.sendMessage(message, function(response) {
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        if (attempt < 3) {
          setTimeout(function() { sendBypass(btn, message, attempt + 1); }, 500);
        } else {
          btn.disabled = false;
          btn.classList.remove('loading');
          alert('Erro de comunicação. Tente novamente.');
        }
        return;
      }

      if (response && response.ok) {
        // Use the redirect URL from background (already validated there)
        window.location.href = response.redirectUrl;
      } else if (response && response.error) {
        btn.disabled = false;
        btn.classList.remove('loading');
        alert(response.error);
      } else {
        btn.disabled = false;
        btn.classList.remove('loading');
        alert('Erro inesperado. Tente novamente.');
      }
    });
  } catch (e) {
    clearTimeout(timeout);
    btn.disabled = false;
    btn.classList.remove('loading');
    alert('Erro de comunicação. Tente novamente.');
  }
}

document.getElementById('btnExtra').addEventListener('click', function() {
  sendBypass(this, { type: 'addExtraTime', site: site, minutes: configuredExtraMin });
});

document.getElementById('btnIgnore').addEventListener('click', function() {
  sendBypass(this, { type: 'bypassSite', site: site });
});

// ── Countdown to midnight ──
function updateCountdown() {
  var now = new Date();
  var midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  var diff = midnight - now;
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var countdownText = isWeeklyBlock
    ? 'Limite semanal reseta em ' + h + 'h ' + m + 'min'
    : 'Acesso liberado em ' + h + 'h ' + m + 'min';
  document.getElementById('countdown').textContent = countdownText;
}
if (!isEntryMode) {
  updateCountdown();
  setInterval(updateCountdown, 60000);
}
