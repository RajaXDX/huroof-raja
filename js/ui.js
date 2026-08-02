/* ==========================================================================
   ui.js — كل ما يلمس الشاشة
   --------------------------------------------------------------------------
   game.js يقرّر، وهذا الملف يرسم. لا يوجد هنا أي قرار يخص قواعد اللعبة.
   ========================================================================== */

const UI = (function () {

  let layoutCache = null;

  /* ------------------------------------------------------- حجم السداسي */
  /* نحسب الحجم من المساحة المتاحة فعلياً بدل قيمة ثابتة، حتى تعمل اللوحة
     على جوال 360px وعلى شاشة كبيرة بنفس الكود.

     المساحة تُقاس ولا تُخمَّن: الحشوة تُقرأ من التنسيق المطبَّق (تختلف بين
     الجوال والشاشة الكبيرة)، والارتفاع من موضع الحاوية الحقيقي على الصفحة. */
  const GAP = 6;          // الفراغ بين الخلايا — من المواصفة
  const BAND = 10;        // سمك شريط الحافة
  const BAND_GAP = 12;    // المسافة بين الشريط واللوحة
  const FRAME = (BAND + BAND_GAP) * 2;   // ما تستهلكه الأشرطة على كل محور

  /* عرض الخلية المثالي لكل مقاس لوحة — من مواصفة التصميم مباشرة.
     نبدأ منه وننزل فقط إن ضاقت الشاشة، فلا تخرج اللوحة أكبر مما صُمّمت له. */
  const IDEAL_WIDTH = { 4: 106, 5: 94, 6: 82, 7: 72 };
  const MIN_WIDTH = 30;

  function computeHexWidth(rows, cols) {
    const stage = $('boardStage');
    if (!stage) return IDEAL_WIDTH[cols] || 82;

    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

    const availW = stage.clientWidth - padX - FRAME;

    /* المساحة الرأسية نسألها من الحاوية نفسها لا نحسبها من ارتفاع النافذة.
       الحاوية عنصر مرن (flex: 1) فارتفاعها محسوم قبل أن نرسم اللوحة، وطرح
       الهيدر والتذييل يدوياً كان يخطئ بعشرات البكسلات فيظهر تمرير رأسي
       أثناء اللعب. clientHeight يشمل الحشوة فنطرحها. */
    let availH = stage.clientHeight - padY - FRAME;

    // احتياط لو استُدعيت قبل أن تُحسب أبعاد الحاوية (شاشة مخفية مثلاً)
    if (availH <= 0) {
      availH = window.innerHeight - stage.getBoundingClientRect().top - padY - FRAME;
    }

    // عرض اللوحة = cols×(w+gap) − gap + (w+gap)/2
    const byWidth = (availW + GAP - GAP / 2) / (cols + 0.5) - GAP;
    // ارتفاع اللوحة = ((rows−1)×0.75 + 1) × 1.14 × w
    const byHeight = availH / (((rows - 1) * 0.75 + 1) * 1.14);

    const ideal = IDEAL_WIDTH[cols] || 82;
    return Math.max(MIN_WIDTH, Math.floor(Math.min(ideal, byWidth, byHeight)));
  }

  /* ------------------------------------------------------------ اللوحة */

  function renderBoard() {
    const board = $('board');
    board.innerHTML = '';

    /* نصفّر مقاس اللوحة قبل قياس الحاوية. اللوحة عنصر مرن بمقاس صريح
       بالبكسل، فما دامت تحمل مقاس الرسم السابق تمنع الحاوية من الانكماش
       ونقيس مساحة أكبر من الحقيقية — حلقة تنتهي بتمرير رأسي دائم. */
    board.style.width = '0px';
    board.style.height = '0px';

    const w = computeHexWidth(Game.rows, Game.cols);
    layoutCache = Hive.layout(Game.cells, Game.rows, Game.cols, w, GAP);

    board.style.width  = layoutCache.width + 'px';
    board.style.height = layoutCache.height + 'px';

    layoutCache.cells.forEach(c => {
      const hex = el('div', {
        class: 'hex',
        'data-index': c.index,
        style: {
          left:   c.x + 'px',
          top:    c.y + 'px',
          width:  c.w + 'px',
          height: c.h + 'px',
          // مواصفة التصميم: حجم الحرف = عرض الخلية × 0.42
          fontSize: Math.round(c.w * 0.42) + 'px',
        },
      }, escapeHtml(Game.letters[c.index]));

      hex.addEventListener('click', () => selectCell(c.index));
      board.appendChild(hex);
      paintCell(c.index);
    });

    drawEdges();
  }

  /* أشرطة ملوّنة تحيط اللوحة وتبيّن طرفي كل فريق.
     تُبنى كإخوة للوحة داخل إطار مرن، لا كعناصر مطلقة فوقها: هكذا تتمدّد
     تلقائياً مع اللوحة ولا تحتاج إعادة حساب عند تغيّر المقاس. */
  function drawEdges() {
    const vTeam = Game.axis.A === 'vertical' ? 'A' : 'B';
    const hTeam = otherTeam(vTeam);

    $('edgeTop').style.background    = teamColor(vTeam);
    $('edgeBottom').style.background = teamColor(vTeam);
    $('edgeStart').style.background  = teamColor(hTeam);
    $('edgeEnd').style.background    = teamColor(hTeam);

    $('boardCol').style.width = layoutCache.width + 'px';
  }

  /** يلوّن خلية واحدة حسب مالكها */
  function paintCell(index) {
    const hex = document.querySelector('.hex[data-index="' + index + '"]');
    if (!hex) return;

    const owner = Game.owners[index];
    hex.classList.remove('owned-a', 'owned-b', 'blocked', 'just-taken');

    if (owner === 'A' || owner === 'B') {
      hex.classList.add(owner === 'A' ? 'owned-a' : 'owned-b');
      hex.style.setProperty('--hex-fill', teamColor(owner));
      hex.classList.add('just-taken');
      setTimeout(() => hex.classList.remove('just-taken'), 450);
    } else if (owner === 'blocked') {
      hex.classList.add('blocked');
      hex.style.removeProperty('--hex-fill');
    } else {
      hex.style.removeProperty('--hex-fill');
    }
  }

  function highlightPath(path) {
    if (!path) return;
    path.forEach((idx, i) => {
      setTimeout(() => {
        const hex = document.querySelector('.hex[data-index="' + idx + '"]');
        if (hex) hex.classList.add('win-cell');
      }, i * 110);
    });
  }

  /* ------------------------------------------------------------- الحالة */

  function renderStatus() {
    const cA = teamColor('A'), cB = teamColor('B');

    $('scoreA').textContent = Hive.countCells(Game.owners, 'A');
    $('scoreB').textContent = Hive.countCells(Game.owners, 'B');
    $('nameA').textContent = SETTINGS.teamA.name;
    $('nameB').textContent = SETTINGS.teamB.name;
    $('winsA').textContent = '🏆 ' + Game.wins.A;
    $('winsB').textContent = '🏆 ' + Game.wins.B;

    $('teamCardA').style.setProperty('--team-color', cA);
    $('teamCardB').style.setProperty('--team-color', cB);
    $('teamCardA').classList.toggle('is-turn', Game.turn === 'A' && Game.phase === 'playing');
    $('teamCardB').classList.toggle('is-turn', Game.turn === 'B' && Game.phase === 'playing');

    const dirText = t => Game.axis[t] === 'vertical' ? '↕ عمودي' : '↔ أفقي';
    $('dirA').textContent = dirText('A');
    $('dirB').textContent = dirText('B');

    $('roundLabel').textContent = 'الجولة ' + Game.round + ' من ' + SETTINGS.rounds;

    const turnBar = $('turnBar');
    turnBar.textContent = 'دور ' + teamName(Game.turn) + ' — اختر خلية';
    turnBar.style.background = teamColor(Game.turn);

    $('footA').textContent = dirText('A') + ' لـ' + SETTINGS.teamA.name;
    $('footB').textContent = dirText('B') + ' لـ' + SETTINGS.teamB.name;
    $('footFree').textContent = Game.owners.filter(o => o === null).length + ' خلية متاحة';
  }

  function renderRound() {
    showScreen('screen-game');
    renderBoard();
    renderStatus();
    syncTabs();
  }

  /* ------------------------------------------------------ نافذة السؤال */

  function openQuestion(index) {
    const q = Game.questions[index];

    $('qLetter').textContent = Game.letters[index];
    $('qTeam').textContent = teamName(Game.turn);
    $('qTeam').style.color = teamColor(Game.turn);
    $('qText').textContent = q ? q.q : '(لا يوجد سؤال لهذا الحرف)';
    $('qHint').textContent = 'الإجابة تبدأ بحرف « ' + Game.letters[index] + ' »';

    $('qAnswer').textContent = q ? q.a : '—';
    $('qAnswer').classList.add('hidden');
    $('revealBtn').classList.remove('hidden');
    $('judgeRow').classList.add('hidden');

    $('questionModal').classList.add('show');
  }

  function showAnswer() {
    $('qAnswer').classList.remove('hidden');
    $('revealBtn').classList.add('hidden');
    $('judgeRow').classList.remove('hidden');
  }

  function closeQuestion() {
    $('questionModal').classList.remove('show');
  }

  function updateTimer(seconds) {
    const wrap = $('qTimer');
    if (seconds === null) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    $('qTimerText').textContent = seconds;
    wrap.classList.toggle('urgent', seconds <= 5);
  }

  /* ------------------------------------------------------- نهاية الجولة */

  function showRoundResult() {
    highlightPath(Game.winPath);

    const isLast = Game.round >= SETTINGS.rounds ||
      Game.wins.A > SETTINGS.rounds / 2 || Game.wins.B > SETTINGS.rounds / 2;

    setTimeout(() => {
      const w = Game.winner;
      $('roundTitle').textContent = w
        ? 'فاز ' + teamName(w) + ' بالجولة ' + Game.round
        : 'الجولة ' + Game.round + ' انتهت بالتعادل';
      $('roundTitle').style.color = w ? teamColor(w) : 'var(--head)';
      $('roundIcon').textContent = w ? '🎉' : '🤝';
      $('roundScore').textContent =
        SETTINGS.teamA.name + ' ' + Game.wins.A + '  —  ' + Game.wins.B + ' ' + SETTINGS.teamB.name;
      $('roundNextBtn').textContent = isLast ? 'النتيجة النهائية' : 'الجولة التالية';
      $('roundOverlay').classList.add('show');
    }, (Game.winPath ? Game.winPath.length * 110 : 0) + 600);
  }

  function showMatchResult() {
    $('roundOverlay').classList.remove('show');
    showScreen('screen-end');
    syncTabs();

    const a = Game.wins.A, b = Game.wins.B;
    const w = a === b ? null : (a > b ? 'A' : 'B');

    $('endIcon').textContent = w ? '🏆' : '🤝';
    $('endTitle').textContent = w ? teamName(w) + ' بطل المباراة!' : 'تعادل!';
    $('endTitle').style.color = w ? teamColor(w) : 'var(--accent)';
    $('endScore').innerHTML =
      '<span style="color:' + teamColor('A') + '">' + escapeHtml(SETTINGS.teamA.name) + ' ' + a + '</span>' +
      '<span class="end-dash">—</span>' +
      '<span style="color:' + teamColor('B') + '">' + b + ' ' + escapeHtml(SETTINGS.teamB.name) + '</span>';

    Sound.win();
  }

  /* ---------------------------------------------------------- استجابة */

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (Game.phase !== 'playing' && Game.phase !== 'round-over') return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderBoard();
      if (Game.winPath) highlightPath(Game.winPath);
    }, 150);
  });

  return {
    renderBoard, renderStatus, renderRound, paintCell, highlightPath,
    openQuestion, showAnswer, closeQuestion, updateTimer,
    showRoundResult, showMatchResult,
  };
})();
