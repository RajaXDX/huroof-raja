/* ==========================================================================
   setup.js — شاشة الإعدادات وربط الأزرار
   ========================================================================== */

/* ----------------------------------------------------- بناء لوحة الألوان */

function renderColorPickers() {
  ['A', 'B'].forEach(team => {
    const wrap = $('colors' + team);
    wrap.innerHTML = '';

    COLOR_PRESETS.forEach(preset => {
      const dot = el('button', {
        class: 'color-dot',
        type: 'button',
        title: preset.name,
        'aria-label': preset.name,
        style: { background: preset.value },
      });

      dot.onclick = () => {
        const other = team === 'A' ? SETTINGS.teamB : SETTINGS.teamA;

        // لونان متطابقان يجعلان اللوحة غير مقروءة — نمنعه بدل أن نسمح به
        // ثم يكتشف اللاعبون المشكلة في منتصف الجولة.
        if (other.color === preset.value) {
          uiToast('اللون مستخدم من الفريق الآخر — اختر لوناً مختلفاً');
          return;
        }

        (team === 'A' ? SETTINGS.teamA : SETTINGS.teamB).color = preset.value;
        Sound.select();
        saveSettings();
        renderColorPickers();
        updateSetupPreview();
      };

      const current = (team === 'A' ? SETTINGS.teamA : SETTINGS.teamB).color;
      if (current === preset.value) dot.classList.add('selected');

      wrap.appendChild(dot);
    });
  });
}

/* ------------------------------------------------------- أزرار الخيارات */

function renderChoiceGroup(containerId, options, currentValue, onPick) {
  const wrap = $(containerId);
  wrap.innerHTML = '';

  options.forEach(opt => {
    const btn = el('button', { class: 'choice', type: 'button' }, escapeHtml(opt.label));
    if (opt.value === currentValue) btn.classList.add('selected');
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

  renderColorPickers();

  renderChoiceGroup('sizeChoices', [
    { label: '٤×٤ — صغيرة (16)', value: 4 },
    { label: '٥×٥ — متوسطة (25)', value: 5 },
    { label: '٦×٦ — كبيرة (36)', value: 6 },
    { label: '٧×٧ — ضخمة (49)', value: 7 },
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
    { label: 'الخلية للفريق الآخر', value: 'opponent' },
    { label: 'الخلية تُقفل', value: 'block' },
    { label: 'تبقى متاحة', value: 'free' },
  ], SETTINGS.wrongRule, v => { SETTINGS.wrongRule = v; });

  $('swapToggle').classList.toggle('on', SETTINGS.swapSides);
  $('soundToggle').classList.toggle('on', SETTINGS.sound);

  updateSetupPreview();
}

/* معاينة مصغّرة تُظهر أثر اختيار الحجم واللون قبل البدء */
function updateSetupPreview() {
  const box = $('setupPreview');
  const rows = SETTINGS.size, cols = SETTINGS.size;
  const cells = Hive.buildBoard(rows, cols);
  const lay = Hive.layout(cells, rows, cols, 13);

  box.innerHTML = '';
  box.style.width = lay.width + 'px';
  box.style.height = lay.height + 'px';

  lay.cells.forEach(c => {
    // تلوين توضيحي فقط: العمود الأول للفريق الأفقي والصف الأول للعمودي
    let fill = 'rgba(255,255,255,0.13)';
    if (c.row === 0 || c.row === rows - 1) fill = SETTINGS.teamA.color;
    else if (c.col === 0 || c.col === cols - 1) fill = SETTINGS.teamB.color;

    box.appendChild(el('div', {
      class: 'mini-hex',
      style: {
        left: c.x + 'px', top: c.y + 'px',
        width: c.w + 'px', height: c.h + 'px',
        background: fill,
      },
    }));
  });
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

function goHome() {
  Sound.click();
  showScreen('screen-home');
}

function goSetup() {
  Sound.click();
  showScreen('screen-setup');
  renderSetup();
}

function goHowTo() {
  Sound.click();
  showScreen('screen-howto');
}

function commitNames() {
  const a = $('inputNameA').value.trim();
  const b = $('inputNameB').value.trim();
  SETTINGS.teamA.name = a || 'الفريق الأول';
  SETTINGS.teamB.name = b || 'الفريق الثاني';
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
  goSetup();
}

/* --------------------------------------------------------------- الإقلاع */

document.addEventListener('DOMContentLoaded', async () => {
  Sound.setEnabled(SETTINGS.sound);

  await loadBank();
  const stats = bankStats();
  $('statLetters').textContent = stats.letters;
  $('statQuestions').textContent = stats.total;

  if (!stats.total) {
    $('bankWarning').classList.remove('hidden');
  }

  renderSetup();

  // إغلاق نافذة السؤال بالمفتاح Escape يعني تهرّب من السؤال — لا نسمح به.
  // لكن مسافة/Enter لكشف الإجابة اختصار مريح للمقدّم.
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
