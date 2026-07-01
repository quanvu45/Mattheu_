/* ================================================================
   THI KINH THÁNH – APP.JS   v2
   TWO MODES:
     luyen-tap  → full questions, sequential, localStorage persisted
     random     → N random questions, ephemeral (no storage)
   ================================================================ */

'use strict';

// ── META ──────────────────────────────────────────────────────
const META = {
  bible: { id: 'bible', name: 'Hoàn Tất Câu Kinh Thánh', short: 'Kinh Thánh', icon: '✝️' },
  sum: { id: 'sum', name: 'Kiến Thức Tổng Hợp', short: 'Tổng Hợp', icon: '📖' },
  his: { id: 'his', name: 'Lược Sử Giáo Phận Thái Bình', short: 'Lịch Sử', icon: '⛪' },
  sum1: { id: 'sum1', name: 'Kiến Thức Tổng Hợp', short: 'Tổng Hợp', icon: '📖' },
  sum2: { id: 'sum2', name: 'Hoàn Tất Câu Kinh Thánh', short: 'Kinh Thánh', icon: '✝️' },
  sum3: { id: 'sum3', name: 'Lược Sử Giáo Phận Thái Bình', short: 'Lịch Sử', icon: '⛪' },
};

const PASS_PCT = 70;

// ── LOCAL STORAGE (only used for luyen-tap mode) ──────────────
const LS = {
  K_SESSION: 'tkttb_session',
  K_HISTORY: 'tkttb_history',
  K_STATS: 'tkttb_stats',
  K_LASTRES: 'tkttb_lastresult',

  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); },

  saveSession(s) { this.set(this.K_SESSION, s); },
  loadSession() { return this.get(this.K_SESSION); },
  clearSession() { this.del(this.K_SESSION); },

  getHistory() { return this.get(this.K_HISTORY) || []; },
  pushHistory(e) { const h = this.getHistory(); h.unshift(e); this.set(this.K_HISTORY, h.slice(0, 30)); },

  getStats() { return this.get(this.K_STATS) || {}; },
  updateStats(gid, answeredIds, correctIds) {
    const s = this.getStats();
    if (!s[gid]) s[gid] = { answered: {}, correct: {} };
    answeredIds.forEach(id => { s[gid].answered[id] = true; });
    correctIds.forEach(id => { s[gid].correct[id] = true; });
    this.set(this.K_STATS, s);
  },
  getGroupStats(gid) { const s = this.getStats(); return s[gid] || { answered: {}, correct: {} }; },

  saveLastResult(r) { this.set(this.K_LASTRES, r); },
  loadLastResult() { return this.get(this.K_LASTRES); },
};

// ── APP STATE ──────────────────────────────────────────────────
const App = {
  data: {},    // { bible:[...], sum:[...], his:[...] }
  session: null,  // active session
  lastResult: null,  // for review screen

  cfg: {
    groupId: null,
    mode: 'luyen-tap',   // 'luyen-tap' | 'random'
    count: 10,            // only used for random mode
  },
};

// ── DATA LOADING ───────────────────────────────────────────────
async function loadData() {
  try {
    await Promise.all(['bible', 'sum', 'his', 'sum1', 'sum2', 'sum3'].map(async id => {
      const r = await fetch(`data/${id}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${id}.json`);
      const j = await r.json();
      App.data[id] = j.questions || [];
    }));
    return true;
  } catch (e) { console.error('Load error:', e); return false; }
}

// ── UTILITIES ──────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function animNum(el, from, to, ms = 800) {
  const t0 = Date.now();
  const tick = () => {
    const p = Math.min((Date.now() - t0) / ms, 1);
    el.textContent = Math.round(from + (to - from) * easeOut(p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function fmtTime(s) { const m = Math.floor(s / 60), r = s % 60; return m > 0 ? `${m} phút ${r} giây` : `${r} giây`; }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function $(id) { return document.getElementById(id); }

// ── SCREEN SWITCHING ───────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════════════════════
function renderHome() {
  // Global resume banner (luyen-tap session in progress)
  const saved = LS.loadSession();
  if (saved && App.data[saved.groupId]) {
    App.session = saved;
    const m = META[saved.groupId];
    const rem = saved.questionIds.length - saved.currentIndex;
    $('resume-desc').textContent =
      `${m.short} · Câu ${saved.currentIndex + 1}/${saved.questionIds.length} (còn ${rem} câu)`;
    $('resume-banner').classList.remove('hidden');
  } else {
    $('resume-banner').classList.add('hidden');
    if (!saved) App.session = null;
  }

  // Group card progress (only meaningful for luyen-tap)
  ['bible', 'sum', 'his', 'sum1', 'sum2', 'sum3'].forEach(gid => {
    const qs = App.data[gid] || [];
    const stats = LS.getGroupStats(gid);
    const done = Object.keys(stats.answered).length;
    const pct = qs.length ? (done / qs.length) * 100 : 0;
    $(`sub-${gid}`).textContent = `${done} / ${qs.length} câu đã luyện tập`;
    $(`bar-${gid}`).style.width = `${pct}%`;
  });

  renderHistory();
}

function renderHistory() {
  const h = LS.getHistory();
  if (!h.length) { $('history-section').classList.add('hidden'); return; }
  $('history-section').classList.remove('hidden');
  $('history-list').innerHTML = h.slice(0, 6).map(e => {
    const m = META[e.groupId] || {};
    const ok = e.pct >= PASS_PCT;
    return `
      <div class="history-item">
        <div>
          <p class="hi-group">${m.icon || ''} ${m.short || e.groupId}</p>
          <p class="hi-date">${fmtDate(e.date)}</p>
        </div>
        <span class="hi-score ${ok ? 'ok' : 'err'}">${e.score}/${e.total} (${e.pct}%)</span>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS SCREEN
// ══════════════════════════════════════════════════════════════
function openSettings(groupId) {
  App.cfg.groupId = groupId;
  App.cfg.mode = 'luyen-tap';
  App.cfg.count = 10;

  const m = META[groupId];
  const qs = App.data[groupId] || [];
  $('settings-title').textContent = `${m.icon} ${m.short}`;

  // Activate luyện tập tab by default
  activateModeTab('luyen-tap');

  // Populate luyện tập panel info
  $('lt-info').textContent =
    `Luyện tập toàn bộ ${qs.length} câu hỏi theo thứ tự. Tiến trình được tự động lưu lại.`;

  // Show resume box if there's a saved session for this group
  refreshLtResume(groupId);

  // Reset random count pills
  setPillActive('count-pills', '10');
  // Disable 100-pill if not enough questions
  document.querySelectorAll('#count-pills .pill').forEach(p => {
    const v = parseInt(p.dataset.val);
    p.disabled = v > qs.length;
  });
  updateRandomInfo();

  showScreen('settings');
}

function activateModeTab(mode) {
  App.cfg.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode));
  $('panel-lt').classList.toggle('hidden', mode !== 'luyen-tap');
  $('panel-rd').classList.toggle('hidden', mode !== 'random');
}

function refreshLtResume(groupId) {
  const saved = LS.loadSession();
  const box = $('lt-resume-box');
  if (saved && saved.groupId === groupId && saved.mode === 'luyen-tap') {
    const rem = saved.questionIds.length - saved.currentIndex;
    $('lt-resume-text').textContent =
      `Câu ${saved.currentIndex + 1}/${saved.questionIds.length} · còn ${rem} câu`;
    box.classList.remove('hidden');
    $('btn-start-lt').textContent = '🔄 Bắt Đầu Lại Từ Đầu';
  } else {
    box.classList.add('hidden');
    $('btn-start-lt').textContent = '🚀 Bắt Đầu Làm Bài';
  }
}

function setPillActive(containerId, val) {
  document.querySelectorAll(`#${containerId} .pill`).forEach(p =>
    p.classList.toggle('active', p.dataset.val === val));
}

function updateRandomInfo() {
  const qs = App.data[App.cfg.groupId] || [];
  const n = Math.min(App.cfg.count, qs.length);
  $('rd-info').textContent =
    `Sẽ chọn ngẫu nhiên ${n} câu từ ${qs.length} câu trong nhóm. Kết quả không lưu.`;
}

// ══════════════════════════════════════════════════════════════
//  BUILD SESSION
// ══════════════════════════════════════════════════════════════
function buildSession(mode) {
  const { groupId, count } = App.cfg;
  const qs = App.data[groupId] || [];
  if (!qs.length) return null;

  if (mode === 'luyen-tap') {
    // All questions, sequential order
    return {
      id: Date.now().toString(),
      groupId,
      mode: 'luyen-tap',
      questionIds: qs.map(q => q.id),
      currentIndex: 0,
      answers: {},
      correct: [],
      wrong: [],
      startTime: Date.now(),
    };
  } else {
    // Random N questions, ephemeral
    const pool = shuffle(qs).slice(0, Math.min(count, qs.length));
    return {
      id: Date.now().toString(),
      groupId,
      mode: 'random',
      questionIds: pool.map(q => q.id),
      currentIndex: 0,
      answers: {},
      correct: [],
      wrong: [],
      startTime: Date.now(),
    };
  }
}

// ══════════════════════════════════════════════════════════════
//  QUIZ FLOW
// ══════════════════════════════════════════════════════════════
function startLuyenTap() {
  // Clear any existing session for fresh start
  LS.clearSession();
  App.session = buildSession('luyen-tap');
  if (!App.session) return;
  LS.saveSession(App.session);
  showScreen('quiz');
  renderQuestion();
}

function continueLuyenTap() {
  // App.session already loaded from LS in renderHome / refreshLtResume
  const saved = LS.loadSession();
  if (!saved) { startLuyenTap(); return; }
  App.session = saved;
  showScreen('quiz');
  renderQuestion();
}

function resumeFromHome() {
  if (App.session) {
    showScreen('quiz');
    renderQuestion();
  }
}

function startRandom() {
  App.session = buildSession('random');
  if (!App.session) return;
  // Do NOT save to localStorage
  showScreen('quiz');
  renderQuestion();
}

// ── Render question ────────────────────────────────────────────
function renderQuestion() {
  const { session } = App;
  const total = session.questionIds.length;
  const idx = session.currentIndex;
  const qId = session.questionIds[idx];
  const q = App.data[session.groupId].find(x => x.id === qId);

  if (!q) { finishQuiz(); return; }

  // Badge: show mode in counter
  const modeBadge = session.mode === 'random' ? ' 🎲' : '';
  $('quiz-counter').textContent = `Câu ${idx + 1} / ${total}${modeBadge}`;
  $('quiz-live-score').textContent = `✓ ${session.correct.length}`;
  $('prog-fill').style.width = `${(idx / total) * 100}%`;

  $('q-number').textContent = `Câu ${idx + 1}`;
  $('q-text').textContent = q.question;

  // Render options
  const opts = ['A', 'B', 'C', 'D'].filter(l => q.options[l] !== undefined && q.options[l] !== '');
  $('options').innerHTML = opts.map(l => `
    <button class="opt-btn" data-letter="${l}" onclick="selectAnswer('${l}')">
      <span class="opt-letter">${l}</span>
      <span>${q.options[l]}</span>
    </button>`).join('');

  // Reset UI
  const fb = $('feedback');
  fb.className = 'feedback hidden';
  fb.textContent = '';
  $('btn-next').classList.add('hidden');
}

// ── Answer selection ───────────────────────────────────────────
function selectAnswer(chosen) {
  const { session } = App;
  const qId = session.questionIds[session.currentIndex];
  const q = App.data[session.groupId].find(x => x.id === qId);

  if (session.answers[qId] !== undefined) return; // already answered

  const isOk = chosen === q.answer;
  session.answers[qId] = chosen;
  if (isOk) { if (!session.correct.includes(qId)) session.correct.push(qId); }
  else { if (!session.wrong.includes(qId)) session.wrong.push(qId); }

  // Persist only for luyện tập
  if (session.mode === 'luyen-tap') LS.saveSession(session);

  // Highlight
  document.querySelectorAll('.opt-btn').forEach(btn => {
    btn.disabled = true;
    const l = btn.dataset.letter;
    if (l === q.answer) btn.classList.add('is-correct');
    if (l === chosen && !isOk) btn.classList.add('is-wrong');
  });

  // Feedback
  const fb = $('feedback');
  fb.classList.remove('hidden');
  if (isOk) {
    fb.className = 'feedback ok-fb';
    fb.textContent = '✓ Chính xác!';
  } else {
    fb.className = 'feedback err-fb';
    fb.textContent = `✗ Sai rồi! Đáp án đúng: ${q.answer} – ${q.options[q.answer]}`;
  }
  $('quiz-live-score').textContent = `✓ ${session.correct.length}`;

  // Next button
  const isLast = session.currentIndex >= session.questionIds.length - 1;
  const btn = $('btn-next');
  btn.textContent = isLast ? '📊 Xem Kết Quả' : 'Câu tiếp theo →';
  btn.classList.remove('hidden');
}

// ── Next question ──────────────────────────────────────────────
function goNext() {
  App.session.currentIndex++;
  if (App.session.mode === 'luyen-tap') LS.saveSession(App.session);

  if (App.session.currentIndex >= App.session.questionIds.length) {
    finishQuiz();
  } else {
    renderQuestion();
    window.scrollTo(0, 0);
  }
}

// ── Finish quiz ────────────────────────────────────────────────
function finishQuiz() {
  const { session } = App;
  const elapsed = Math.round((Date.now() - session.startTime) / 1000);
  const score = session.correct.length;
  const total = session.questionIds.length;
  const pct = total ? Math.round((score / total) * 100) : 0;

  const snapshot = {
    groupId: session.groupId,
    mode: session.mode,
    questionIds: session.questionIds,
    answers: session.answers,
    correct: session.correct,
    wrong: session.wrong,
    score, total, pct, elapsed,
  };

  App.lastResult = snapshot;

  if (session.mode === 'luyen-tap') {
    // Persist history, stats, last result
    LS.pushHistory({ groupId: session.groupId, score, total, pct, elapsed, date: new Date().toISOString() });
    LS.updateStats(session.groupId, session.questionIds, session.correct);
    LS.clearSession();
    LS.saveLastResult(snapshot);
  }
  // For random mode: keep snapshot in App.lastResult (memory only, lost on refresh - by design)

  App.session = null;
  showScreen('result');
  renderResult(snapshot);
}

// ══════════════════════════════════════════════════════════════
//  RESULT SCREEN
// ══════════════════════════════════════════════════════════════
function renderResult(r) {
  const { score, total, pct, elapsed, mode } = r;
  let emoji, title;
  if (pct === 100) { emoji = '🏆'; title = 'Xuất sắc!'; }
  else if (pct >= 90) { emoji = '🌟'; title = 'Tuyệt vời!'; }
  else if (pct >= 80) { emoji = '⭐'; title = 'Giỏi lắm!'; }
  else if (pct >= PASS_PCT) { emoji = '👍'; title = 'Đạt yêu cầu!'; }
  else if (pct >= 50) { emoji = '📚'; title = 'Cần ôn thêm!'; }
  else { emoji = '🙏'; title = 'Hãy cố gắng hơn!'; }

  $('result-emoji').textContent = emoji;
  $('result-title').textContent = title;
  $('res-denom').textContent = `/${total}`;
  $('stat-ok').textContent = `${score} câu đúng`;
  $('stat-err').textContent = `${total - score} câu sai`;
  $('stat-time').textContent = fmtTime(elapsed);

  // Mode badge under score
  const modeLbl = mode === 'random'
    ? '<span style="color:var(--text3);font-size:.8rem;display:block;margin-top:.3rem">🎲 Kết quả không được lưu</span>'
    : '';
  // Inject after title (if element exists, skip if not)
  const afterTitle = $('result-title');
  const existingBadge = afterTitle.nextElementSibling;
  if (existingBadge && existingBadge.id === 'mode-badge') existingBadge.remove();
  if (modeLbl) {
    afterTitle.insertAdjacentHTML('afterend', `<div id="mode-badge">${modeLbl}</div>`);
  }

  animNum($('res-score'), 0, score, 900);

  // Ring animation
  const ring = $('ring-arc');
  const C = 314.159;
  setTimeout(() => {
    ring.style.transition = 'stroke-dashoffset 1.2s ease';
    ring.style.strokeDashoffset = C - (pct / 100) * C;
  }, 200);

  // Review button: show if there are wrong answers
  $('btn-review').style.display = (r.wrong && r.wrong.length > 0) ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  REVIEW SCREEN
// ══════════════════════════════════════════════════════════════
function renderReview() {
  // Use in-memory lastResult (for random too, works in same session)
  const r = App.lastResult || LS.loadLastResult();
  if (!r) { showScreen('result'); return; }

  const groupData = App.data[r.groupId] || [];

  const wrongItems = r.questionIds
    .map((qId, idx) => {
      const q = groupData.find(x => x.id === qId);
      const chosen = r.answers[qId];
      const isOk = q && chosen === q.answer;
      return { idx, q, chosen, isOk };
    })
    .filter(x => x.q && !x.isOk);

  if (!wrongItems.length) {
    $('review-list').innerHTML = `
      <p style="text-align:center;color:var(--ok);padding:2.5rem;font-size:1.1rem">
        🎉 Tuyệt vời! Bạn trả lời đúng tất cả!
      </p>`;
  } else {
    $('review-list').innerHTML = wrongItems.map(({ idx, q, chosen }) => `
      <div class="rev-item">
        <p class="rev-num">Câu ${idx + 1}</p>
        <p class="rev-q">${q.question}</p>
        <div class="rev-ans">
          ${chosen
        ? `<div class="rev-a wrong">✗ Bạn chọn ${chosen}: ${q.options[chosen] || ''}</div>`
        : `<div class="rev-a wrong">✗ Bỏ qua</div>`}
          <div class="rev-a right">✓ Đúng: ${q.answer} – ${q.options[q.answer]}</div>
        </div>
      </div>`).join('');
  }

  showScreen('review');
}

// ══════════════════════════════════════════════════════════════
//  QUIT MODAL
// ══════════════════════════════════════════════════════════════
function showQuitModal() { $('modal-quit').classList.remove('hidden'); }
function hideQuitModal() { $('modal-quit').classList.add('hidden'); }
function confirmQuit() {
  hideQuitModal();
  // Session already persisted (or ephemeral for random) — just go home
  if (App.session && App.session.mode === 'random') {
    App.session = null; // discard random session
  }
  showScreen('home');
  renderHome();
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════════
function bindEvents() {
  // Home: group cards
  document.querySelectorAll('.group-card').forEach(card =>
    card.addEventListener('click', () => openSettings(card.dataset.group)));

  // Home: global resume banner
  $('btn-resume').addEventListener('click', resumeFromHome);

  // Settings: back
  $('btn-settings-back').addEventListener('click', () => { showScreen('home'); renderHome(); });

  // Settings: mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab =>
    tab.addEventListener('click', () => {
      activateModeTab(tab.dataset.mode);
      if (tab.dataset.mode === 'luyen-tap') refreshLtResume(App.cfg.groupId);
    }));

  // Settings: luyện tập – start fresh
  $('btn-start-lt').addEventListener('click', startLuyenTap);

  // Settings: luyện tập – continue saved session
  $('btn-lt-continue').addEventListener('click', continueLuyenTap);

  // Settings: random – count pills
  $('count-pills').addEventListener('click', e => {
    const p = e.target.closest('.pill');
    if (!p || p.disabled) return;
    setPillActive('count-pills', p.dataset.val);
    App.cfg.count = parseInt(p.dataset.val);
    updateRandomInfo();
  });

  // Settings: random – start
  $('btn-start-rd').addEventListener('click', startRandom);

  // Quiz: next
  $('btn-next').addEventListener('click', goNext);

  // Quiz: quit
  $('btn-quit').addEventListener('click', showQuitModal);

  // Modal
  $('modal-cancel').addEventListener('click', hideQuitModal);
  $('modal-quit-ok').addEventListener('click', confirmQuit);
  $('modal-quit').addEventListener('click', e => { if (e.target === $('modal-quit')) hideQuitModal(); });

  // Result: review wrong
  $('btn-review').addEventListener('click', renderReview);

  // Result: retry (back to settings same group)
  $('btn-retry').addEventListener('click', () => {
    const lr = App.lastResult || LS.loadLastResult();
    if (lr) openSettings(lr.groupId);
    else showScreen('home');
  });

  // Result: home
  $('btn-home-from-result').addEventListener('click', () => { showScreen('home'); renderHome(); });

  // Review: back to result
  $('btn-review-back').addEventListener('click', () => showScreen('result'));
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
async function init() {
  const ok = await loadData();

  $('loading-screen').style.display = 'none';
  $('app').classList.remove('hidden');

  if (!ok) {
    $('app').innerHTML = `
      <div style="text-align:center;padding:3rem 1.5rem;color:#f87171;">
        <p style="font-size:3rem;margin-bottom:1rem;">⚠️</p>
        <h2 style="margin-bottom:.75rem;color:#fff">Không tải được dữ liệu</h2>
        <p style="color:rgba(255,255,255,.6);line-height:1.7;font-size:.9rem">
          Ứng dụng cần chạy qua web server.<br>
          Dùng <strong>VS Code Live Server</strong><br>
          hoặc: <code style="background:#1e2845;padding:.2rem .5rem;border-radius:4px">python -m http.server</code><br>
          rồi mở <strong>http://localhost:8000</strong>
        </p>
      </div>`;
    return;
  }

  App.lastResult = LS.loadLastResult();
  bindEvents();
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
