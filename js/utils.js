/* ==========================================================================
   utils.js — أدوات عامة: الصوت، التخزين، الشاشات، النوافذ
   ========================================================================== */

/* ------------------------------------------------------------- المؤثرات */
/* نولّد النغمات برمجياً بدل ملفات صوت: لا تحميل، لا انتظار، ولا حقوق. */
const Sound = (function () {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, type, gainVal) {
    if (!enabled) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + start);
      gain.gain.setValueAtTime(0, c.currentTime + start);
      gain.gain.linearRampToValueAtTime(gainVal || 0.15, c.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + dur + 0.02);
    } catch (e) {
      /* المتصفح يمنع الصوت قبل أول نقرة — نتجاهل بهدوء */
    }
  }

  return {
    setEnabled(v) { enabled = v; },
    isEnabled() { return enabled; },
    click()   { tone(520, 0, 0.08, 'triangle', 0.12); },
    select()  { tone(440, 0, 0.06, 'square', 0.06); },
    open()    { tone(420, 0, 0.09, 'sine', 0.1); tone(620, 0.07, 0.12, 'sine', 0.1); },
    correct() { tone(659, 0, 0.1, 'triangle', 0.14); tone(880, 0.09, 0.2, 'triangle', 0.14); },
    wrong()   { tone(220, 0, 0.16, 'sawtooth', 0.09); tone(165, 0.14, 0.24, 'sawtooth', 0.09); },
    tick()    { tone(880, 0, 0.04, 'square', 0.04); },
    win()     { tone(523, 0, 0.12, 'triangle', 0.14); tone(659, 0.1, 0.12, 'triangle', 0.14);
                tone(784, 0.2, 0.12, 'triangle', 0.14); tone(1047, 0.3, 0.3, 'triangle', 0.16); },
    start()   { tone(392, 0, 0.1, 'triangle', 0.12); tone(494, 0.1, 0.1, 'triangle', 0.12);
                tone(587, 0.2, 0.1, 'triangle', 0.12); tone(784, 0.3, 0.25, 'triangle', 0.16); },
  };
})();

/* ------------------------------------------------------------- التخزين */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('فشل الحفظ:', e);
    return false;
  }
}

/* ------------------------------------------------------------- الشاشات */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('active');
    window.scrollTo(0, 0);
  }
}

/* --------------------------------------------------------------- نصوص */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------ مصفوفات */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ----------------------------------------------------------------- DOM */
function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  Object.keys(attrs).forEach(k => {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'style') Object.assign(node.style, attrs[k]);
    else node.setAttribute(k, attrs[k]);
  });
  if (html !== '' && html !== null && html !== undefined) node.innerHTML = html;
  return node;
}

function $(id) { return document.getElementById(id); }

/* ------------------------------------------------------------- نوافذ */
/* بدائل alert/confirm المصمّمة. السبب ليس الشكل فقط: بعض المتصفحات
   — خصوصاً iOS وداخل الإطارات — تحجب prompt() تماماً. */

function uiToast(message) {
  const wrap = $('uiToasts') ||
    document.body.appendChild(el('div', { id: 'uiToasts', class: 'ui-toasts' }));
  const toast = el('div', { class: 'ui-toast' },
    escapeHtml(String(message)).replace(/\n/g, '<br>'));
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  };
  toast.onclick = remove;
  setTimeout(remove, 3500);
}

function uiConfirm(message, okText = 'نعم', cancelText = 'إلغاء') {
  return new Promise(resolve => {
    const overlay = el('div', { class: 'ui-modal-overlay' });
    const box = el('div', { class: 'ui-modal' }, `
      <div class="ui-modal-msg">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
      <div class="ui-modal-actions">
        <button class="btn btn-ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button class="btn btn-primary" data-act="ok">${escapeHtml(okText)}</button>
      </div>`);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (val) => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
      else if (e.key === 'Escape') close(false);
    };

    box.querySelector('[data-act="ok"]').onclick = () => close(true);
    box.querySelector('[data-act="cancel"]').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => box.querySelector('[data-act="ok"]').focus(), 60);
  });
}
