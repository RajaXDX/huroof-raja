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
     الجوال والشاشة الكبيرة)، والارتفاع من موضع الحاوية الحقيقي على الصفحة.
     التخمين برقم ثابت هنا كان يسبّب تجاوزاً أفقياً في بعض المقاسات. */
  const BAND_ALLOWANCE = 30;   // مساحة أشرطة الحواف البارزة خارج اللوحة

  function computeHexSize(rows, cols) {
    const stage = $('boardStage');
    if (!stage) return 40;

    const cs = getComputedStyle(stage);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

    const availW = stage.clientWidth - padX - BAND_ALLOWANCE;
    const availH = window.innerHeight - stage.getBoundingClientRect().top - padY - BAND_ALLOWANCE;

    const byWidth  = availW / ((cols + 0.5) * Math.sqrt(3));
    const byHeight = availH / (1.5 * rows + 0.5);

    return Math.max(20, Math.min(62, Math.floor(Math.min(byWidth, byHeight))));
  }

  /* ------------------------------------------------------------ اللوحة */

  function renderBoard() {
    const board = $('board');
    board.innerHTML = '';

    const size = computeHexSize(Game.rows, Game.cols);
    layoutCache = Hive.layout(Game.cells, Game.rows, Game.cols, size);

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
          fontSize: Math.round(size * 0.72) + 'px',
        },
      });

      hex.appendChild(el('span', { class: 'hex-letter' }, escapeHtml(Game.letters[c.index])));
      hex.addEventListener('click', () => selectCell(c.index));
      board.appendChild(hex);
      paintCell(c.index);
    });

    drawEdges(size);
  }

  /* أشرطة ملوّنة على الحواف الأربع تبيّن اتجاه كل فريق */
  function drawEdges(size) {
    const stage = $('boardStage');
    stage.querySelectorAll('.edge-band').forEach(n => n.remove());

    const vTeam = Game.axis.A === 'vertical' ? 'A' : 'B';
    const hTeam = otherTeam(vTeam);
    const thickness = Math.max(6, Math.round(size * 0.18));

    const bands = [
      { cls: 'edge-top',    team: vTeam },
      { cls: 'edge-bottom', team: vTeam },
      { cls: 'edge-right',  team: hTeam },
      { cls: 'edge-left',   team: hTeam },
    ];

    bands.forEach(b => {
      const band = el('div', { class: 'edge-band ' + b.cls });
      band.style.background = teamColor(b.team);
      if (b.cls === 'edge-top' || b.cls === 'edge-bottom') {
        band.style.height = thickness + 'px';
        band.style.width = layoutCache.width + 'px';
      } else {
        band.style.width = thickness + 'px';
        band.style.height = layoutCache.height + 'px';
      }
      $('board').appendChild(band);
    });
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
      setTimeout(() => hex.classList.remove('just-taken'), 500);
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
    const a = Hive.countCells(Game.owners, 'A');
    const b = Hive.countCells(Game.owners, 'B');

    $('scoreA').textContent = a;
    $('scoreB').textContent = b;
    $('nameA').textContent = SETTINGS.teamA.name;
    $('nameB').textContent = SETTINGS.teamB.name;
    $('winsA').textContent = '🏆 ' + Game.wins.A;
    $('winsB').textContent = '🏆 ' + Game.wins.B;

    $('teamCardA').style.setProperty('--team-color', SETTINGS.teamA.color);
    $('teamCardB').style.setProperty('--team-color', SETTINGS.teamB.color);

    $('teamCardA').classList.toggle('is-turn', Game.turn === 'A' && Game.phase === 'playing');
    $('teamCardB').classList.toggle('is-turn', Game.turn === 'B' && Game.phase === 'playing');

    $('dirA').textContent = Game.axis.A === 'vertical' ? '↕ عمودي' : '↔ أفقي';
    $('dirB').textContent = Game.axis.B === 'vertical' ? '↕ عمودي' : '↔ أفقي';

    $('roundLabel').textContent = 'الجولة ' + Game.round + ' من ' + SETTINGS.rounds;

    const turnBar = $('turnBar');
    turnBar.textContent = 'دور ' + teamName(Game.turn) + ' — اختر خلية';
    turnBar.style.background = teamColor(Game.turn);
  }

  function renderRound() {
    showScreen('screen-game');
    renderBoard();
    renderStatus();
  }

  /* ------------------------------------------------------ نافذة السؤال */

  function openQuestion(index) {
    const q = Game.questions[index];
    const modal = $('questionModal');

    $('qLetter').textContent = Game.letters[index];
    $('qLetter').style.background = teamColor(Game.turn);
    $('qTeam').textContent = 'دور ' + teamName(Game.turn);
    $('qTeam').style.color = teamColor(Game.turn);
    $('qText').textContent = q ? q.q : '(لا يوجد سؤال لهذا الحرف)';
    $('qHint').textContent = 'الإجابة تبدأ بحرف « ' + Game.letters[index] + ' »';

    $('qAnswer').textContent = q ? q.a : '—';
    $('qAnswer').classList.add('hidden');
    $('revealBtn').classList.remove('hidden');
    $('judgeRow').classList.add('hidden');

    modal.classList.add('show');
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
    const pct = Math.max(0, (seconds / SETTINGS.timer) * 100);
    $('qTimerFill').style.width = pct + '%';
    wrap.classList.toggle('urgent', seconds <= 5);
  }

  /* ------------------------------------------------------- نهاية الجولة */

  function showRoundResult() {
    highlightPath(Game.winPath);

    const isLast = Game.round >= SETTINGS.rounds ||
      Game.wins.A > SETTINGS.rounds / 2 || Game.wins.B > SETTINGS.rounds / 2;

    setTimeout(() => {
      const overlay = $('roundOverlay');
      const w = Game.winner;

      $('roundTitle').textContent = w
        ? 'فاز ' + teamName(w) + ' بالجولة ' + Game.round
        : 'الجولة ' + Game.round + ' انتهت بالتعادل';
      $('roundTitle').style.color = w ? teamColor(w) : 'var(--sand)';
      $('roundIcon').textContent = w ? '🎉' : '🤝';
      $('roundScore').textContent =
        SETTINGS.teamA.name + ' ' + Game.wins.A + '  —  ' + Game.wins.B + ' ' + SETTINGS.teamB.name;
      $('roundNextBtn').textContent = isLast ? 'النتيجة النهائية 🏆' : 'الجولة التالية ←';

      overlay.classList.add('show');
    }, (Game.winPath ? Game.winPath.length * 110 : 0) + 600);
  }

  function showMatchResult() {
    $('roundOverlay').classList.remove('show');
    showScreen('screen-end');

    const a = Game.wins.A, b = Game.wins.B;
    const w = a === b ? null : (a > b ? 'A' : 'B');

    $('endIcon').textContent = w ? '🏆' : '🤝';
    $('endTitle').textContent = w ? teamName(w) + ' بطل المباراة!' : 'تعادل!';
    $('endTitle').style.color = w ? teamColor(w) : 'var(--gold)';
    $('endScore').innerHTML =
      '<span style="color:' + SETTINGS.teamA.color + '">' + escapeHtml(SETTINGS.teamA.name) + ' ' + a + '</span>' +
      '<span class="end-dash">—</span>' +
      '<span style="color:' + SETTINGS.teamB.color + '">' + b + ' ' + escapeHtml(SETTINGS.teamB.name) + '</span>';

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
