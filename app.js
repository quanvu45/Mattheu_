/* ================================================================
   THI KINH THÁNH – APP.JS   v3
   THREE MODES:
     luyen-tap  → selected topics, sequential, immediate feedback, persist
     thi-thu    → N mixed questions, timer, deferred feedback
     random     → N mixed questions, ephemeral, immediate feedback
   ================================================================ */

'use strict';

// ── META ──────────────────────────────────────────────────────
const BODE_META = {
  gioitre: { name: 'Giới trẻ, thiếu nhi', icon: '🌱' },
  giatruong: { name: 'Gia trưởng, hiền mẫu', icon: '👨‍👩‍👧‍👦' }
};

const SUBJECT_MAP = {
  gioitre: { sum: 'sum', bible: 'bible', his: 'his' },
  giatruong: { sum: 'sum1', bible: 'sum2', his: 'sum3' }
};

const PASS_PCT = 70;

// ── LOCAL STORAGE ──────────────
const LS = {
  K_SESSION: 'tkttb_session',
  K_HISTORY: 'tkttb_history',
  K_STATS: 'tkttb_stats',
  K_LASTRES: 'tkttb_lastresult',

  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); },

  saveSession(bode, s) { 
    let data = this.get(this.K_SESSION) || {};
    if (data.bode) data = { [data.bode]: data }; // migrate old format
    data[bode] = s;
    this.set(this.K_SESSION, data); 
  },
  loadSession(bode) { 
    let data = this.get(this.K_SESSION);
    if (!data) return null;
    if (data.bode) {
      if (data.bode === bode) return data;
      else return null;
    }
    return data[bode] || null;
  },
  clearSession(bode) { 
    let data = this.get(this.K_SESSION) || {};
    if (data.bode) data = { [data.bode]: data }; // migrate old format
    delete data[bode];
    this.set(this.K_SESSION, data); 
  },

  getHistory() { return this.get(this.K_HISTORY) || []; },
  pushHistory(e) { const h = this.getHistory(); h.unshift(e); this.set(this.K_HISTORY, h.slice(0, 30)); },

  saveLastResult(r) { this.set(this.K_LASTRES, r); },
  loadLastResult() { return this.get(this.K_LASTRES); },
};

// ── APP STATE ──────────────────────────────────────────────────
const App = {
  data: {},
  session: null,
  lastResult: null,
  timerInterval: null,

  cfg: {
    bode: 'gioitre',
    mode: 'luyen-tap', // luyen-tap, thi-thu, random
    count: 10,
    mixTypes: ['sum', 'bible', 'his']
  },
};

// ── DATA LOADING ───────────────────────────────────────────────
async function loadData() {
  try {
    await Promise.all(['bible', 'sum', 'his', 'sum1', 'sum2', 'sum3'].map(async id => {
      const r = await fetch(`data/${id}.json`);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${id}.json`);
      const j = await r.json();
      App.data[id] = (j.questions || []).map(q => ({ ...q, _uid: `${id}_${q.id}` }));
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
function fmtMMSS(s) { const m = Math.floor(s / 60), r = s % 60; return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`; }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}

// ══════════════════════════════════════════════════════════════
//  HOME
// ══════════════════════════════════════════════════════════════
function renderHome() {
  ['gioitre', 'giatruong'].forEach(bode => {
    const saved = LS.loadSession(bode);
    const resumeEl = $(`resume-${bode}`);
    if (saved && saved.questionIds && saved.mode === 'luyen-tap') {
      const rem = saved.questionIds.length - saved.currentIndex;
      resumeEl.textContent = `Đang làm dở: Câu ${saved.currentIndex + 1}/${saved.questionIds.length} (còn ${rem} câu)`;
      resumeEl.classList.remove('hidden');
    } else {
      if (resumeEl) resumeEl.classList.add('hidden');
    }
  });
  renderHistory();
}

function renderHistory() {
  const h = LS.getHistory();
  if (!h.length) { $('history-section').classList.add('hidden'); return; }
  $('history-section').classList.remove('hidden');
  $('history-list').innerHTML = h.slice(0, 6).map(e => {
    const m = BODE_META[e.bode] || {};
    const ok = e.pct >= PASS_PCT;
    return `
      <div class="history-item">
        <div>
          <p class="hi-group">${m.icon || ''} ${m.name || e.bode} (${e.mode})</p>
          <p class="hi-date">${fmtDate(e.date)}</p>
        </div>
        <span class="hi-score ${ok ? 'ok' : 'err'}">${e.score}/${e.total} (${e.pct}%)</span>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  SETTINGS SCREEN
// ══════════════════════════════════════════════════════════════
function openSettings(bode) {
  App.cfg.bode = bode;
  App.cfg.mode = 'luyen-tap';
  App.cfg.count = 10;
  
  const m = BODE_META[bode];
  $('settings-title').textContent = `${m.icon} ${m.name}`;

  activateModeTab('luyen-tap');
  refreshLtResume(bode);
  updatePillsMax();
  
  showScreen('settings');
}

function activateModeTab(mode) {
  App.cfg.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  $('panel-lt').classList.toggle('hidden', mode !== 'luyen-tap');
  $('panel-tt').classList.toggle('hidden', mode !== 'thi-thu');
  $('panel-rd').classList.toggle('hidden', mode !== 'random');
  updateInfoText();
}

function refreshLtResume(bode) {
  const saved = LS.loadSession();
  const box = $('lt-resume-box');
  if (saved && saved.bode === bode && saved.mode === 'luyen-tap') {
    const rem = saved.questionIds.length - saved.currentIndex;
    $('lt-resume-text').textContent = `Câu ${saved.currentIndex + 1}/${saved.questionIds.length} · còn ${rem} câu`;
    box.classList.remove('hidden');
    $('btn-start-lt').textContent = '🔄 Bắt Đầu Lại Từ Đầu';
  } else {
    box.classList.add('hidden');
    $('btn-start-lt').textContent = '🚀 Bắt Đầu Làm Bài';
  }
}

function updatePillsMax() {
  const maxQs = getSelectedQuestions().length;
  document.querySelectorAll('.pill').forEach(p => {
    const v = parseInt(p.dataset.val);
    p.disabled = v > maxQs;
  });
  updateInfoText();
}

function updateInfoText() {
  const maxQs = getSelectedQuestions().length;
  const n = Math.min(App.cfg.count, maxQs);
  $('tt-info').textContent = `Sẽ thi ${n} câu hỏi (trộn từ các phần đã chọn). Thời gian: ${Math.ceil(n*0.75)} phút.`;
  $('rd-info').textContent = `Sẽ chọn ngẫu nhiên ${n} câu từ ${maxQs} câu. Kết quả không lưu.`;
}

function getSelectedQuestions() {
  let pool = [];
  const map = SUBJECT_MAP[App.cfg.bode];
  
  // Read checked checkboxes
  App.cfg.mixTypes = [];
  ['sum', 'bible', 'his'].forEach(type => {
    if ($(`chk-${type}`).checked) App.cfg.mixTypes.push(type);
  });

  App.cfg.mixTypes.forEach(type => {
    pool = pool.concat(App.data[map[type]] || []);
  });
  return pool;
}

// ══════════════════════════════════════════════════════════════
//  BUILD SESSION
// ══════════════════════════════════════════════════════════════
function buildSession(mode) {
  const pool = getSelectedQuestions();
  if (!pool.length) {
    alert("Vui lòng chọn ít nhất một phần thi!");
    return null;
  }

  const { bode, count } = App.cfg;
  let finalQs = [];
  
  if (mode === 'luyen-tap') {
    finalQs = pool; // all sequential
  } else {
    finalQs = shuffle(pool).slice(0, Math.min(count, pool.length));
  }

  return {
    id: Date.now().toString(),
    bode,
    mode,
    questionIds: finalQs.map(q => q._uid),
    currentIndex: 0,
    answers: {},
    correct: [],
    wrong: [],
    flagged: [],
    startTime: Date.now(),
    durationLimit: mode === 'thi-thu' ? finalQs.length * 45 : 0 // 45s per question
  };
}

// ══════════════════════════════════════════════════════════════
//  QUIZ FLOW
// ══════════════════════════════════════════════════════════════
function startSession(mode) {
  if (mode === 'luyen-tap') LS.clearSession(App.cfg.bode);
  
  App.session = buildSession(mode);
  if (!App.session) return;
  
  if (mode === 'luyen-tap') LS.saveSession(App.cfg.bode, App.session);
  
  if (mode === 'thi-thu') {
    $('quiz-timer').classList.remove('hidden');
    startTimer();
  } else {
    $('quiz-timer').classList.add('hidden');
  }

  $('btn-submit-exam').classList.toggle('hidden', mode !== 'thi-thu');
  
  showScreen('quiz');
  renderTracker();
  renderQuestion();
}

function continueLuyenTap() {
  const saved = LS.loadSession(App.cfg.bode);
  if (!saved) { startSession('luyen-tap'); return; }
  App.session = saved;
  showScreen('quiz');
  renderTracker();
  renderQuestion();
}

function startTimer() {
  clearInterval(App.timerInterval);
  const update = () => {
    const elapsed = Math.floor((Date.now() - App.session.startTime) / 1000);
    const rem = App.session.durationLimit - elapsed;
    if (rem <= 0) {
      clearInterval(App.timerInterval);
      finishQuiz();
    } else {
      $('quiz-timer').textContent = `⏱ ${fmtMMSS(rem)}`;
    }
  };
  update();
  App.timerInterval = setInterval(update, 1000);
}

// ── Render question ────────────────────────────────────────────
function renderQuestion() {
  const { session } = App;
  const total = session.questionIds.length;
  const idx = session.currentIndex;
  const qId = session.questionIds[idx];
  
  // Find question data across all subjects in the bode
  const map = SUBJECT_MAP[session.bode];
  let q = null;
  let qType = '';
  for (let key in map) {
    q = App.data[map[key]].find(x => x._uid === qId);
    if (q) { qType = key; break; }
  }
  if (!q) { finishQuiz(); return; }

  const typeNames = { sum: 'Tổng hợp kiến thức', bible: 'Hoàn thiện Kinh Thánh', his: 'Lược sử' };
  const typeStr = typeNames[qType] || '';

  $('quiz-counter').textContent = `Câu ${idx + 1} / ${total}`;
  $('quiz-live-score').textContent = `✓ ${session.correct.length}`;
  $('quiz-live-score').classList.toggle('hidden', session.mode === 'thi-thu');
  $('prog-fill').style.width = `${(idx / total) * 100}%`;

  $('q-number').textContent = `Câu ${idx + 1} • ${typeStr}`;
  $('q-text').textContent = q.question;

  const isFlagged = session.flagged.includes(qId);
  const btnFlag = $('btn-flag');
  if (isFlagged) { btnFlag.classList.add('flagged'); btnFlag.innerHTML = `<span class="flag-icon">⚑</span> Đánh dấu`; }
  else { btnFlag.classList.remove('flagged'); btnFlag.innerHTML = `<span class="flag-icon">⚑</span> Đánh dấu`; }

  // Render options
  const opts = ['A', 'B', 'C', 'D'].filter(l => q.options[l] !== undefined && q.options[l] !== '');
  $('options').innerHTML = opts.map(l => `
    <button class="opt-btn" data-letter="${l}" id="opt-${l}">
      <span class="opt-letter">${l}</span>
      <span>${q.options[l]}</span>
    </button>`).join('');

  // Attach events to options
  document.querySelectorAll('.opt-btn').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(btn.dataset.letter));
  });

  const fb = $('feedback');
  fb.className = 'feedback hidden';
  fb.textContent = '';
  
  // Navigation buttons
  $('btn-prev').classList.toggle('hidden', idx === 0);
  
  if (session.mode === 'thi-thu') {
    $('btn-next').classList.toggle('hidden', idx === total - 1);
    $('btn-submit-exam').classList.remove('hidden');
  } else {
    $('btn-next').classList.remove('hidden');
    $('btn-submit-exam').classList.add('hidden');
  }

  // Restore state if answered
  const chosen = session.answers[qId];
  if (chosen) {
    if (session.mode === 'thi-thu') {
      $(`opt-${chosen}`).style.borderColor = 'var(--gold)';
      $(`opt-${chosen}`).style.background = 'var(--card-hover)';
    } else {
      // Show correct/wrong
      const isOk = chosen === q.answer;
      document.querySelectorAll('.opt-btn').forEach(btn => btn.disabled = true);
      $(`opt-${q.answer}`).classList.add('is-correct');
      if (!isOk) $(`opt-${chosen}`).classList.add('is-wrong');
      
      fb.classList.remove('hidden');
      if (isOk) { fb.className = 'feedback ok-fb'; fb.textContent = '✓ Chính xác!'; }
      else { fb.className = 'feedback err-fb'; fb.textContent = `✗ Sai rồi! Đáp án đúng: ${q.answer} – ${q.options[q.answer]}`; }
    }
  }

  updateTrackerGrid();
}

function getQuestionObj(qId, bode) {
  const map = SUBJECT_MAP[bode];
  for (let key in map) {
    let q = App.data[map[key]].find(x => x._uid === qId);
    if (q) return q;
  }
  return null;
}

function selectAnswer(chosen) {
  const { session } = App;
  const qId = session.questionIds[session.currentIndex];
  const q = getQuestionObj(qId, session.bode);

  // If luyen-tap or random and already answered, ignore
  if (session.mode !== 'thi-thu' && session.answers[qId] !== undefined) return;

  const isOk = chosen === q.answer;
  session.answers[qId] = chosen;

  if (session.mode === 'thi-thu') {
    // Just select visually
    document.querySelectorAll('.opt-btn').forEach(btn => {
      btn.style.borderColor = ''; btn.style.background = '';
    });
    $(`opt-${chosen}`).style.borderColor = 'var(--gold)';
    $(`opt-${chosen}`).style.background = 'var(--card-hover)';
    updateTrackerGrid();
    return;
  }

  // Evaluate for Luyen-tap / Random
  if (isOk) { if (!session.correct.includes(qId)) session.correct.push(qId); }
  else { if (!session.wrong.includes(qId)) session.wrong.push(qId); }

  if (session.mode === 'luyen-tap') LS.saveSession(session.bode, session);

  renderQuestion(); // Re-render to show feedback and disabled buttons
}

function toggleFlag() {
  const { session } = App;
  const qId = session.questionIds[session.currentIndex];
  const idx = session.flagged.indexOf(qId);
  if (idx > -1) session.flagged.splice(idx, 1);
  else session.flagged.push(qId);
  
  if (session.mode === 'luyen-tap') LS.saveSession(session.bode, session);
  
  renderQuestion();
}

// ── Navigation ──────────────────────────────────────────────
function goPrev() {
  if (App.session.currentIndex > 0) {
    App.session.currentIndex--;
    renderQuestion();
  }
}
function goNext() {
  const { session } = App;
  if (session.currentIndex < session.questionIds.length - 1) {
    session.currentIndex++;
    renderQuestion();
  } else if (session.mode !== 'thi-thu') {
    finishQuiz();
  }
}
function jumpTo(idx) {
  App.session.currentIndex = idx;
  renderQuestion();
  $('quiz-tracker').classList.remove('show');
}

// ── Tracker ──────────────────────────────────────────────
function renderTracker() {
  const { session } = App;
  const grid = $('tracker-grid');
  
  const qTypes = session.questionIds.map(qId => {
    const map = SUBJECT_MAP[session.bode];
    for (let key in map) {
      if (App.data[map[key]].find(x => x._uid === qId)) return key;
    }
    return '';
  });

  grid.innerHTML = session.questionIds.map((qId, idx) => `
    <div class="trk-bub" id="trk-${idx}" data-type="${qTypes[idx]}" onclick="jumpTo(${idx})">${idx + 1}</div>
  `).join('');
  
  // Show/Hide legend based on mode
  $('leg-ok').classList.toggle('hidden', session.mode === 'thi-thu');
  $('leg-wrong').classList.toggle('hidden', session.mode === 'thi-thu');
  
  applyTrackerFilter();
}

function applyTrackerFilter() {
  if (!$('tracker-grid')) return;
  const active = Array.from(document.querySelectorAll('#tracker-filters input:checked')).map(i => i.value);
  document.querySelectorAll('.trk-bub').forEach(el => {
    el.style.display = active.includes(el.dataset.type) ? 'flex' : 'none';
  });
}

function updateTrackerGrid() {
  const { session } = App;
  session.questionIds.forEach((qId, idx) => {
    const el = $(`trk-${idx}`);
    if (!el) return;
    el.className = 'trk-bub';
    if (idx === session.currentIndex) el.classList.add('current');
    
    if (session.flagged.includes(qId)) el.classList.add('flag');
    
    if (session.answers[qId]) {
      if (session.mode === 'thi-thu') {
        el.classList.add('done'); // Just answered, not evaluated
      } else {
        if (session.correct.includes(qId)) el.classList.add('ok');
        else if (session.wrong.includes(qId)) el.classList.add('wrong');
      }
    }
  });
}

// ── Finish quiz ────────────────────────────────────────────────
function finishQuiz() {
  clearInterval(App.timerInterval);
  const { session } = App;
  
  // For thi-thu, evaluate everything now
  if (session.mode === 'thi-thu') {
    session.correct = [];
    session.wrong = [];
    session.questionIds.forEach(qId => {
      const q = getQuestionObj(qId, session.bode);
      if (session.answers[qId] === q.answer) session.correct.push(qId);
      else if (session.answers[qId]) session.wrong.push(qId);
    });
  }

  const elapsed = Math.round((Date.now() - session.startTime) / 1000);
  const score = session.correct.length;
  const total = session.questionIds.length;
  const pct = total ? Math.round((score / total) * 100) : 0;

  const snapshot = {
    bode: session.bode,
    mode: session.mode,
    questionIds: session.questionIds,
    answers: session.answers,
    correct: session.correct,
    wrong: session.wrong,
    score, total, pct, elapsed,
  };

  App.lastResult = snapshot;

  if (session.mode === 'luyen-tap' || session.mode === 'thi-thu') {
    LS.pushHistory({ bode: session.bode, mode: session.mode, score, total, pct, elapsed, date: new Date().toISOString() });
    LS.clearSession(session.bode);
    LS.saveLastResult(snapshot);
  }

  App.session = null;
  $('quiz-tracker').classList.remove('show');
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

  const afterTitle = $('result-title');
  const existingBadge = afterTitle.nextElementSibling;
  if (existingBadge && existingBadge.id === 'mode-badge') existingBadge.remove();
  
  if (mode === 'random') {
    afterTitle.insertAdjacentHTML('afterend', `<div id="mode-badge"><span style="color:var(--text3);font-size:.8rem;display:block;margin-top:.3rem">🎲 Kết quả không được lưu</span></div>`);
  } else {
    afterTitle.insertAdjacentHTML('afterend', `<div id="mode-badge"><span style="color:var(--gold);font-size:.8rem;display:block;margin-top:.3rem">${mode === 'thi-thu' ? '⏱ Thi thử' : '📚 Luyện tập'}</span></div>`);
  }

  animNum($('res-score'), 0, score, 900);
  const ring = $('ring-arc');
  const C = 314.159;
  setTimeout(() => {
    ring.style.transition = 'stroke-dashoffset 1.2s ease';
    ring.style.strokeDashoffset = C - (pct / 100) * C;
  }, 200);

  $('btn-review').style.display = (r.wrong && r.wrong.length > 0) ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════
//  REVIEW SCREEN
// ══════════════════════════════════════════════════════════════
function renderReview() {
  const r = App.lastResult || LS.loadLastResult();
  if (!r) { showScreen('result'); return; }

  const wrongItems = r.questionIds
    .map((qId, idx) => {
      let q = null, qType = '';
      const map = SUBJECT_MAP[r.bode];
      for (let key in map) {
        q = App.data[map[key]].find(x => x._uid === qId);
        if (q) { qType = key; break; }
      }
      const typeNames = { sum: 'Tổng hợp kiến thức', bible: 'Hoàn thiện Kinh Thánh', his: 'Lược sử' };
      const typeStr = typeNames[qType] || '';
      
      const chosen = r.answers[qId];
      const isOk = q && chosen === q.answer;
      return { idx, q, typeStr, chosen, isOk };
    })
    .filter(x => x.q && !x.isOk);

  if (!wrongItems.length) {
    $('review-list').innerHTML = `<p style="text-align:center;color:var(--ok);padding:2.5rem;font-size:1.1rem">🎉 Tuyệt vời! Bạn trả lời đúng tất cả!</p>`;
  } else {
    $('review-list').innerHTML = wrongItems.map(({ idx, q, typeStr, chosen }) => `
      <div class="rev-item">
        <p class="rev-num">Câu ${idx + 1} • ${typeStr}</p>
        <p class="rev-q">${q.question}</p>
        <div class="rev-ans">
          ${chosen ? `<div class="rev-a wrong">✗ Bạn chọn ${chosen}: ${q.options[chosen] || ''}</div>` : `<div class="rev-a wrong">✗ Bỏ qua</div>`}
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
  clearInterval(App.timerInterval);
  if (App.session && (App.session.mode === 'random' || App.session.mode === 'thi-thu')) {
    App.session = null;
  }
  showScreen('home');
  renderHome();
}

// ══════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════════
function bindEvents() {
  document.querySelectorAll('.bode-card').forEach(card => card.addEventListener('click', () => openSettings(card.dataset.bode)));
  $('btn-settings-back').addEventListener('click', () => { showScreen('home'); renderHome(); });
  
  document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => { activateModeTab(tab.dataset.mode); }));
  
  document.querySelectorAll('.subject-lbl input').forEach(chk => {
    chk.addEventListener('change', () => { updatePillsMax(); });
  });

  document.querySelectorAll('#tracker-filters input').forEach(chk => {
    chk.addEventListener('change', applyTrackerFilter);
  });

  $('btn-start-lt').addEventListener('click', () => startSession('luyen-tap'));
  $('btn-lt-continue').addEventListener('click', continueLuyenTap);
  $('btn-start-tt').addEventListener('click', () => startSession('thi-thu'));
  $('btn-start-rd').addEventListener('click', () => startSession('random'));

  const handlePills = (containerId) => {
    $(containerId).addEventListener('click', e => {
      const p = e.target.closest('.pill');
      if (!p || p.disabled) return;
      document.querySelectorAll(`#${containerId} .pill`).forEach(el => el.classList.remove('active'));
      p.classList.add('active');
      App.cfg.count = parseInt(p.dataset.val);
      updateInfoText();
    });
  };
  handlePills('count-pills-tt');
  handlePills('count-pills-rd');

  $('btn-prev').addEventListener('click', goPrev);
  $('btn-next').addEventListener('click', goNext);
  $('btn-submit-exam').addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn nộp bài?')) finishQuiz();
  });
  $('btn-flag').addEventListener('click', toggleFlag);
  
  $('btn-toggle-tracker').addEventListener('click', () => $('quiz-tracker').classList.add('show'));
  $('btn-close-tracker').addEventListener('click', () => $('quiz-tracker').classList.remove('show'));

  $('btn-quit').addEventListener('click', showQuitModal);
  $('modal-cancel').addEventListener('click', hideQuitModal);
  $('modal-quit-ok').addEventListener('click', confirmQuit);
  $('modal-quit').addEventListener('click', e => { if (e.target === $('modal-quit')) hideQuitModal(); });

  $('btn-review').addEventListener('click', renderReview);
  $('btn-retry').addEventListener('click', () => {
    const lr = App.lastResult || LS.loadLastResult();
    if (lr) openSettings(lr.bode);
    else showScreen('home');
  });
  $('btn-home-from-result').addEventListener('click', () => { showScreen('home'); renderHome(); });
  $('btn-review-back').addEventListener('click', () => showScreen('result'));
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (App.session && $('screen-quiz').classList.contains('active')) {
      const k = e.key.toUpperCase();
      if (['A','B','C','D'].includes(k)) selectAnswer(k);
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
async function init() {
  const ok = await loadData();
  $('loading-screen').style.display = 'none';
  $('app').classList.remove('hidden');

  if (!ok) {
    $('app').innerHTML = `<div style="text-align:center;padding:3rem 1.5rem;color:#f87171;"><h2>Không tải được dữ liệu</h2></div>`;
    return;
  }
  App.lastResult = LS.loadLastResult();
  bindEvents();
  renderHome();
}

document.addEventListener('DOMContentLoaded', init);
