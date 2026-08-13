/* ==========================================================================
   setup.js — شاشة الإعدادات والتنقّل والإقلاع
   ========================================================================== */

/* ------------------------------------------------------- بطاقات الثيم */

function renderThemeGrid() {
  const wrap = $('themeGrid');
  wrap.innerHTML = '';

  Object.keys(THEMES).forEach(key => {
    const t = THEMES[key];
    const btn = el('button', {
      class: 'theme-btn' + (key === SETTINGS.palette ? ' selected' : ''),
      type: 'button',
      style: {
        background: `linear-gradient(160deg, ${t.bg[0]}, ${t.bg[2]})`,
        borderColor: key === SETTINGS.palette ? t.accent : 'rgba(255,255,255,.08)',
      },
    }, `
      <div class="theme-name" style="color:${t.head}">${escapeHtml(t.label)}</div>
      <div class="theme-dots">
        <span class="theme-dot" style="background:${t.accent}"></span>
        <span class="theme-dot" style="background:${t.teams[0]}"></span>
        <span class="theme-dot" style="background:${t.teams[1]}"></span>
      </div>`);

    btn.onclick = () => {
      SETTINGS.palette = key;
      // تبديل الثيم يصفّر ألوان الفريقين إلى افتراضياته — وإلا بقي لون
      // مختار من ثيم سابق لا ينسجم مع اللوحة الجديدة.
      SETTINGS.teamA.color = null;
      SETTINGS.teamB.color = null;
      applyTheme(key);
      Sound.select();
      saveSettings();
      renderSetup();
    };

    wrap.appendChild(btn);
  });
}

/* ------------------------------------------------------- ألوان الفرق */

function renderColorPickers() {
  ['A', 'B'].forEach(team => {
    const wrap = $('colors' + team);
    wrap.innerHTML = '';

    const mine = teamColor(team);
    const other = teamColor(otherTeam(team));

    colorSwatches().forEach(value => {
      const dot = el('button', {
        class: 'color-dot' + (value === mine ? ' selected' : ''),
        type: 'button',
        title: value,
        'aria-label': 'لون ' + value,
        style: { background: value },
      });

      dot.onclick = () => {
        // لونان متطابقان يجعلان اللوحة غير مقروءة. نمنعه هنا بدل أن
        // يكتشف اللاعبون المشكلة في منتصف الجولة.
        if (value === other) {
          uiToast('اللون مستخدم من الفريق الآخر — اختر غيره');
          return;
        }
        (team === 'A' ? SETTINGS.teamA : SETTINGS.teamB).color = value;
        Sound.select();
        saveSettings();
        renderSetup();
      };

      wrap.appendChild(dot);
    });

    // حدّ الحقل ونقطته يتبعان لون الفريق
    const field = $('nameInput' + team);
    field.style.borderColor = mine;
    field.querySelector('.dot').style.background = mine;
  });
}

/* ------------------------------------------------------ أزرار الخيارات */

function renderChoiceGroup(containerId, options, currentValue, onPick) {
  const wrap = $(containerId);
  wrap.innerHTML = '';

  options.forEach(opt => {
    const btn = el('button', {
      class: 'choice' + (opt.value === currentValue ? ' selected' : ''),
      type: 'button',
    }, escapeHtml(opt.label));

    btn.onclick = () => {
      Sound.select();
      onPick(opt.value);
      saveSettings();
      renderSetup();
    };
    wrap.appendChild(btn);
  });
}

function renderSetup() {
  $('inputNameA').value = SETTINGS.teamA.name;
  $('inputNameB').value = SETTINGS.teamB.name;

  renderThemeGrid();
  renderColorPickers();

  renderChoiceGroup('sizeChoices', [
    { label: '٤×٤ صغيرة', value: 4 },
    { label: '٥×٥ متوسطة', value: 5 },
    { label: '٦×٦ كبيرة', value: 6 },
    { label: '٧×٧ ضخمة', value: 7 },
  ], SETTINGS.size, v => { SETTINGS.size = v; });

  renderChoiceGroup('roundChoices', [
    { label: 'جولة واحدة', value: 1 },
    { label: '٣ جولات', value: 3 },
    { label: '٥ جولات', value: 5 },
    { label: '٧ جولات', value: 7 },
  ], SETTINGS.rounds, v => { SETTINGS.rounds = v; });

  renderChoiceGroup('timerChoices', [
    { label: 'بلا مؤقت', value: 0 },
    { label: '١٥ ثانية', value: 15 },
    { label: '٣٠ ثانية', value: 30 },
    { label: '٤٥ ثانية', value: 45 },
  ], SETTINGS.timer, v => { SETTINGS.timer = v; });

  renderChoiceGroup('wrongChoices', [
    { label: 'للفريق الآخر', value: 'opponent' },
    { label: 'تُقفل الخلية', value: 'block' },
    { label: 'تبقى متاحة', value: 'free' },
  ], SETTINGS.wrongRule, v => { SETTINGS.wrongRule = v; });

  $('swapToggle').classList.toggle('on', SETTINGS.swapSides);
  $('soundToggle').classList.toggle('on', SETTINGS.sound);

  updateSetupPreview();
}

/* معاينة مصغّرة تُظهر أثر الحجم واللون قبل البدء */
function updateSetupPreview() {
  const box = $('setupPreview');
  const n = SETTINGS.size;
  const cells = Hive.buildBoard(n, n);
  const lay = Hive.layout(cells, n, n, 30, 4);

  box.innerHTML = '';
  box.style.width = lay.width + 'px';
  box.style.height = lay.height + 'px';

  const t = theme();
  lay.cells.forEach(c => {
    // تلوين توضيحي: الصفان العلوي والسفلي للعمودي، والعمودان للأفقي
    let fill = t.cell;
    if (c.row === 0 || c.row === n - 1) fill = teamColor('A');
    else if (c.col === 0 || c.col === n - 1) fill = teamColor('B');

    box.appendChild(el('div', {
      class: 'mini-hex',
      style: {
        left: c.x + 'px', top: c.y + 'px',
        width: c.w + 'px', height: c.h + 'px',
        background: fill,
      },
    }));
  });

  $('previewNote').textContent = `${n}×${n} — ${n * n} خلية`;
}

/* ------------------------------------------------------------ التبديلات */

function toggleSwapSides() {
  SETTINGS.swapSides = !SETTINGS.swapSides;
  Sound.select();
  saveSettings();
  renderSetup();
}

function toggleSound() {
  SETTINGS.sound = !SETTINGS.sound;
  Sound.setEnabled(SETTINGS.sound);
  if (SETTINGS.sound) Sound.select();
  saveSettings();
  renderSetup();
}

/* ------------------------------------------------------------- التنقّل */

function goHome()  { Sound.click(); showScreen('screen-home'); syncTabs(); refreshResumeBox(); }
function goHowTo() { Sound.click(); showScreen('screen-howto'); syncTabs(); }

function goSetup() {
  Sound.click();
  showScreen('screen-setup');
  renderSetup();
  syncTabs();
}

/** تبويب «اللوحة» يعمل فقط أثناء مباراة قائمة — وإلا فلا لوحة يُرجع إليها */
function goBoard() {
  if (Game.phase === 'idle' || !Game.cells.length) {
    uiToast('ابدأ مباراة أولاً');
    return;
  }
  Sound.click();
  showScreen('screen-game');
  UI.renderBoard();
  UI.renderStatus();
  syncTabs();
}

/** يبرز التبويب المطابق للشاشة الظاهرة */
function syncTabs() {
  const active = document.querySelector('.screen.active');
  const id = active ? active.id : '';
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('selected', t.dataset.screen === id);
  });
  const boardTab = document.querySelector('.tab[data-screen="screen-game"]');
  if (boardTab) boardTab.classList.toggle('disabled', Game.phase === 'idle');
}

function commitNames() {
  SETTINGS.teamA.name = $('inputNameA').value.trim() || 'الفريق الأول';
  SETTINGS.teamB.name = $('inputNameB').value.trim() || 'الفريق الثاني';
  saveSettings();
}

function beginMatch() {
  commitNames();
  startMatch();
}

async function quitMatch() {
  if (Game.phase === 'playing' && !(await uiConfirm('تنهي المباراة وترجع للإعدادات؟'))) return;
  stopTimer();
  Game.phase = 'idle';
  $('roundOverlay').classList.remove('show');
  UI.closeQuestion();

  // أونلاين: العودة للردهة لا للإعدادات — الروم قائمة والباقون فيها
  if (Online.active()) {
    Online.publish('waiting');
    showScreen('screen-room');
    UI.renderLobby();
    syncTabs();
    return;
  }
  goSetup();
}

/* ------------------------------------------------------------- الأونلاين */

function goOnline() {
  Sound.click();
  $('onlineName').value = Net.savedName();
  showScreen('screen-online');
  syncTabs();
}

/** يمنع ضغطتين متتاليتين من إنشاء رومين — النداء يستغرق ثانية */
async function withBusy(id, fn) {
  const btn = $(id);
  if (btn.disabled) return false;
  btn.disabled = true;
  try { return await fn(); }
  finally { btn.disabled = false; }
}

async function hostCreateRoom() {
  const name = $('onlineName').value.trim();
  if (!name) { uiToast('اكتب اسمك أولاً'); return; }

  await withBusy('createRoomBtn', async () => {
    if (!(await Net.ensureLib())) { uiToast(Online.msg('offline')); return; }
    if (await Online.create(name)) {
      showScreen('screen-room');
      UI.renderLobby();
      syncTabs();
    }
  });
}

async function submitJoinRoom() {
  const name = $('onlineName').value.trim();
  const code = $('joinCode').value.trim().toUpperCase();
  if (!name) { uiToast('اكتب اسمك أولاً'); return; }
  if (code.length !== 6) { uiToast('الكود ست خانات'); return; }

  await withBusy('joinRoomBtn', async () => {
    if (!(await Net.ensureLib())) { uiToast(Online.msg('offline')); return; }
    if (await Online.join(code, name)) {
      showScreen('screen-room');
      UI.renderLobby();
      syncTabs();
    }
  });
}

async function movePlayer(seat, team) {
  const data = await Net.setTeam(seat, team);
  if (data.error) uiToast(Online.msg(data.error));
  else UI.renderLobby();
}

function lobbyStart() {
  commitNames();
  startMatch();
}

async function leaveRoom() {
  if (Online.active() && Game.phase === 'playing' &&
      !(await uiConfirm('تخرج من الروم وتترك المباراة؟'))) return;
  await Online.leave();
  goHome();
}

// عنوان النسخة المنشورة — يلزم داخل التطبيق وحده (انظر `roomLink`)
const WEB_BASE = 'https://rajaxdx.github.io/huroof-raja/';

function roomLink() {
  const r = Net.room();
  /* ⚠️ داخل التطبيق `location.origin` هو `capacitor://localhost` — رابط
     دعوة به لا يفتح عند أحد إطلاقاً. فنرسل عنوان الويب المنشور، وهو يفتح
     عند كل من يستقبله سواء ثبّت التطبيق أو لا. */
  const base = isNativeApp() ? WEB_BASE : location.origin + location.pathname;
  return base + '?room=' + (r ? r.code : '');
}

async function copyRoomCode() {
  const text = roomLink();
  try {
    await navigator.clipboard.writeText(text);
    uiToast('نُسخ الرابط ✅');
  } catch (e) {
    // الحافظة ممنوعة خارج HTTPS — بديل يعمل في كل مكان
    const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    uiToast('نُسخ الرابط ✅');
  }
}

/** هل نحن داخل تطبيق مُحزَّم (Capacitor) لا في متصفح؟ */
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
            window.Capacitor.isNativePlatform());
}

function shareRoom() {
  const r = Net.room();
  const text = 'العب معي حروف مع رجا 🔤\nكود الروم: ' + (r ? r.code : '') + '\n' + roomLink();

  if (navigator.share) {
    navigator.share({ title: 'حروف مع رجا', text: text }).catch(() => {});
    return;
  }

  /* ⚠️ **لا `window.open` داخل التطبيق.** في WKWebView ينقل الرابط
     العرضَ نفسه إلى صفحة واتساب، فيخرج اللاعب من اللعبة بلا زر رجوع
     ويظنّ التطبيق تعطّل. في المتصفح لا بأس — وهناك الفتحة تبويب جديد. */
  if (isNativeApp()) {
    copyRoomCode();
    return;
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

function refreshResumeBox() {
  const s = Net.savedSession();
  const fresh = s && Date.now() - s.at < 6 * 3600 * 1000;
  $('resumeBox').classList.toggle('hidden', !fresh);
  if (fresh) $('resumeCode').textContent = s.code;
}

async function resumeRoom() {
  const s = Net.savedSession();
  if (!s) return;
  if (!(await Net.ensureLib())) { uiToast(Online.msg('offline')); return; }
  if (await Online.resume(s.code)) syncTabs();
  else refreshResumeBox();
}

function dropRoomSession() {
  Net.forgetSession();
  refreshResumeBox();
}

/* --------------------------------------------------------------- الإقلاع */

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(SETTINGS.palette);
  Sound.setEnabled(SETTINGS.sound);

  await loadBank();
  const stats = bankStats();
  $('statLetters').textContent = stats.letters;
  $('statQuestions').textContent = stats.total;
  if (!stats.total) $('bankWarning').classList.remove('hidden');

  renderSetup();
  syncTabs();

  // الكود يُكتب بأحرف كبيرة دائماً، ولا نقبل غير الحروف والأرقام
  $('joinCode').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  /* رابط دعوة `?room=CODE`: نملأ الكود ونفتح شاشة الأونلاين، وندخل مباشرة
     لمن سبق أن كتب اسمه. ثم يُنظَّف العنوان وإلا تكرّرت المحاولة عند
     كل تحديث للصفحة. */
  const invite = new URLSearchParams(location.search).get('room');
  if (invite) {
    history.replaceState({}, '', location.pathname);
    $('joinCode').value = invite.toUpperCase().slice(0, 6);
    $('onlineName').value = Net.savedName();
    showScreen('screen-online');
    syncTabs();
    if (Net.savedName()) submitJoinRoom();
  } else {
    refreshResumeBox();
  }

  // اختصارات المقدّم. لا نربط Escape بالإغلاق عمداً: إغلاق السؤال بلا حكم
  // يعني تهرّباً من الخلية، والدور لا يتقدّم — فتعلق اللعبة.
  document.addEventListener('keydown', (e) => {
    if (!$('questionModal').classList.contains('show')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!Game.answerShown) revealAnswer();
    } else if (e.key === '1') {
      resolveAnswer(true);
    } else if (e.key === '2') {
      resolveAnswer(false);
    }
  });
});
