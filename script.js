/* =============================================
   SLEEP TRACKER — script.js
   ============================================= */

const STORAGE_KEY = 'sleep_log_v1';
const ACTIVE_KEY  = 'sleep_log_active';

let sessions    = [];   // array of {id, start, end} (ISO strings)
let activeStart = null; // Date when sleep started, null if awake
let elapsedTimer = null;

/* ──────────────────────────────────────────── */
/*  INIT                                        */
/* ──────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  startClock();

  // Restore an in-progress session across page reloads
  const saved = localStorage.getItem(ACTIVE_KEY);
  if (saved) {
    activeStart = new Date(saved);
    setActiveUI(true);
    startElapsedTimer();
  }

  render();
});

/* ──────────────────────────────────────────── */
/*  LIVE CLOCK                                  */
/* ──────────────────────────────────────────── */
function startClock() {
  const el = document.getElementById('liveClock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-GB');
  };
  tick();
  setInterval(tick, 1000);
}

/* ──────────────────────────────────────────── */
/*  PERSISTENCE                                 */
/* ──────────────────────────────────────────── */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    sessions = raw ? JSON.parse(raw) : [];
  } catch { sessions = []; }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/* ──────────────────────────────────────────── */
/*  SESSION CONTROL                             */
/* ──────────────────────────────────────────── */
function startSession() {
  if (activeStart) return;
  activeStart = new Date();
  localStorage.setItem(ACTIVE_KEY, activeStart.toISOString());
  setActiveUI(true);
  startElapsedTimer();
  showToast('😴  Sleep session started');
  render();
}

function finishSession() {
  if (!activeStart) return;
  const end = new Date();

  sessions.unshift({ id: Date.now(), start: activeStart.toISOString(), end: end.toISOString() });
  saveData();

  localStorage.removeItem(ACTIVE_KEY);
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  activeStart  = null;

  setActiveUI(false);
  showToast('☀️  Good morning! Session saved');
  render();
}

function clearAll() {
  if (!confirm('Delete ALL sleep sessions? This cannot be undone.')) return;
  sessions = [];
  saveData();
  if (activeStart) {
    activeStart = null;
    localStorage.removeItem(ACTIVE_KEY);
    clearInterval(elapsedTimer);
    elapsedTimer = null;
    setActiveUI(false);
  }
  showToast('All sessions cleared.');
  render();
}

/* ──────────────────────────────────────────── */
/*  ELAPSED TIMER                               */
/* ──────────────────────────────────────────── */
function startElapsedTimer() {
  const el = document.getElementById('elapsedVal');
  const tick = () => {
    if (!activeStart) return;
    el.textContent = formatDuration(Date.now() - activeStart.getTime());
    renderTimeline(); // keep live segment moving
  };
  tick();
  elapsedTimer = setInterval(tick, 1000);
}

/* ──────────────────────────────────────────── */
/*  UI STATE                                    */
/* ──────────────────────────────────────────── */
function setActiveUI(sleeping) {
  const dot      = document.getElementById('statusDot');
  const txt      = document.getElementById('statusText');
  const btnSleep = document.getElementById('btnSleep');
  const btnWake  = document.getElementById('btnWake');
  const meta     = document.getElementById('sessionMeta');
  const startVal = document.getElementById('startVal');

  if (sleeping) {
    dot.classList.add('sleeping');
    txt.classList.add('sleeping');
    txt.textContent   = 'SLEEPING';
    btnSleep.disabled = true;
    btnWake.disabled  = false;
    meta.style.display = 'flex';
    startVal.textContent = formatDateTime(activeStart);
  } else {
    dot.classList.remove('sleeping');
    txt.classList.remove('sleeping');
    txt.textContent   = 'AWAKE';
    btnSleep.disabled = false;
    btnWake.disabled  = true;
    meta.style.display = 'none';
    document.getElementById('elapsedVal').textContent = '00:00:00';
  }
}

/* ──────────────────────────────────────────── */
/*  RENDER (log + timeline)                     */
/* ──────────────────────────────────────────── */
function render() {
  renderLog();
  renderTimeline();
}

/* ── LOG TABLE ── */
function renderLog() {
  const container = document.getElementById('logContainer');
  const rows = getAllRows(); // completed + optional live

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-hint">No sleep sessions recorded yet.</div>';
    return;
  }

  let html = `
    <div class="log-header">
      <span>DATE</span>
      <span>SLEEP</span>
      <span>WAKE</span>
      <span>DURATION</span>
    </div>`;

  for (const row of rows) {
    const wakeCell = row.end
      ? `<span class="entry-finish">${formatTime(new Date(row.end))}</span>`
      : `<span class="entry-finish live">● sleeping</span>`;

    const dur = row.end
      ? formatDuration(new Date(row.end) - new Date(row.start))
      : '';

    html += `
      <div class="log-entry">
        <span class="entry-date">${formatDate(new Date(row.start))}</span>
        <span class="entry-start">${formatTime(new Date(row.start))}</span>
        ${wakeCell}
        <span class="entry-duration">${dur}</span>
      </div>`;
  }

  container.innerHTML = html;
}

/* ── TIMELINE ── */
function renderTimeline() {
  const container = document.getElementById('timelineContainer');
  const rows = getAllRows();

  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-hint">No sleep sessions recorded yet.</div>';
    return;
  }

  // Build a map: dateKey -> array of segments {startMin, endMin, tip, live}
  // dateKey = 'YYYY-MM-DD'
  const dayMap = new Map();

  const addSegment = (dateKey, startMin, endMin, tip, live = false) => {
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey).push({ startMin, endMin, tip, live });
  };

  for (const row of rows) {
    const start = new Date(row.start);
    const end   = row.end ? new Date(row.end) : new Date(); // live = now
    const live  = !row.end;

    const startDay = toDateKey(start);
    const endDay   = toDateKey(end);

    const startMin = timeToMinutes(start);
    const endMin   = timeToMinutes(end);
    const tip      = `${formatTime(start)} → ${row.end ? formatTime(end) : 'now'}`;

    if (startDay === endDay) {
      addSegment(startDay, startMin, endMin, tip, live);
    } else {
      // Crosses midnight — split across days
      addSegment(startDay, startMin, 1439, tip, false);
      // Walk through intermediate days (rare but correct)
      let cursor = new Date(start);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      while (toDateKey(cursor) !== endDay) {
        addSegment(toDateKey(cursor), 0, 1439, tip, false);
        cursor.setDate(cursor.getDate() + 1);
      }
      addSegment(endDay, 0, endMin, tip, live);
    }
  }

  // Sort days chronologically
  const sortedDays = Array.from(dayMap.keys()).sort();

  let html = '';
  for (const dateKey of sortedDays) {
    const segments = dayMap.get(dateKey);
    const label    = formatDayLabel(new Date(dateKey + 'T12:00:00')); // noon avoids tz issues

    let segmentsHtml = '';
    for (const seg of segments) {
      const left  = (seg.startMin / 1440 * 100).toFixed(4);
      const width = ((seg.endMin - seg.startMin) / 1440 * 100).toFixed(4);
      const liveClass = seg.live ? ' live' : '';
      segmentsHtml += `<div class="sleep-segment${liveClass}" style="left:${left}%;width:${width}%" data-tip="${escHtml(seg.tip)}"></div>`;
    }

    html += `
      <div class="timeline-day">
        <div class="day-label">${escHtml(label)}</div>
        <div class="day-track">${segmentsHtml}</div>
      </div>`;
  }

  container.innerHTML = html;
}

/* ──────────────────────────────────────────── */
/*  EXPORT CSV                                  */
/* ──────────────────────────────────────────── */
function exportCSV() {
  if (sessions.length === 0) { showToast('Nothing to export yet.'); return; }

  const header = 'Date,Sleep Time,Wake Time,Duration\n';
  const rows = sessions.map(s => {
    const start = new Date(s.start);
    const end   = s.end ? new Date(s.end) : null;
    const dur   = end ? formatDuration(end - start) : '';
    return `"${formatDate(start)}","${formatTime(start)}","${end ? formatTime(end) : ''}","${dur}"`;
  });

  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sleep-log-${toDateKey(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported ✓');
}

/* ──────────────────────────────────────────── */
/*  HELPERS                                     */
/* ──────────────────────────────────────────── */

/** Returns completed sessions + live session (no .end) if active */
function getAllRows() {
  const rows = [...sessions];
  if (activeStart) rows.unshift({ id: 'live', start: activeStart.toISOString(), end: null });
  return rows;
}

function timeToMinutes(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function toDateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d) {
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDayLabel(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── TOAST ── */
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}