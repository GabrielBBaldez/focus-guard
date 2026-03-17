// defaults.js — Shared constants for Focus Guard
// Single source of truth for all default values.
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
  THEME: 'dark',
};
