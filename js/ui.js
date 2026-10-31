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

    /* على تلفاز أو شاشة كبيرة تكبر الخلية فوق مقاس المواصفة حتى تملأ
       الارتفاع: المواصفة صُمّمت لحاسوب على مكتب، والعائلة تجلس على بعد
       ثلاثة أمتار من التلفاز. نتمدّد بنسبة ارتفاع الشاشة إلى 900. */
    const tv = Math.max(1, Math.min(1.8, window.innerHeight / 900));
    const ideal = (IDEAL_WIDTH[cols] || 82) * tv;
    return Math.max(MIN_WIDTH, Math.floor(Math.min(ideal, byWidth, byHeight)));
  }

  /* ------------------------------------------------------------ اللوحة */

  function renderBoard() {
    const board = $('board');
    clearPathTimers();
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
      /* زر حقيقي لا `div`: يصل إليه المفتاح Tab ويُفتح بـEnter، ويقرؤه
         قارئ الشاشة «حرف ب، متاحة». كانت اللوحة كلها خارج متناول من لا
         يستعمل اللمس أو الفأرة. */
      const hex = el('div', {
        class: 'hex',
        'data-index': c.index,
        role: 'button',
        tabindex: '0',
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
      hex.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCell(c.index); }
      });
      board.appendChild(hex);
      paintCell(c.index);
    });

    drawEdges();
  }

  /** نصّ الخلية لقارئ الشاشة */
  function cellLabel(index) {
    const o = Game.owners[index];
    const state = o === 'A' || o === 'B' ? lam(teamName(o))
      : o === 'blocked' ? 'مقفلة' : 'متاحة';
    return 'حرف ' + Game.letters[index] + '، ' + state;
  }

  /* أشرطة ملوّنة تحيط اللوحة وتبيّن طرفي كل فريق.
     تُبنى كإخوة للوحة داخل إطار مرن، لا كعناصر مطلقة فوقها: هكذا تتمدّد
     تلقائياً مع اللوحة ولا تحتاج إعادة حساب عند تغيّر المقاس. */
  function drawEdges() {
    const vTeam = Game.axis.A === 'vertical' ? 'A' : 'B';
    const hTeam = otherTeam(vTeam);

    $('edgeTop').style.setProperty('--edge', teamColor(vTeam));
    $('edgeBottom').style.setProperty('--edge', teamColor(vTeam));
    $('edgeStart').style.setProperty('--edge', teamColor(hTeam));
    $('edgeEnd').style.setProperty('--edge', teamColor(hTeam));

    /* الفريق الثاني مخطّط في خلاياه وفي حافتيه — علامة لا تعتمد على اللون.
       بعض الثيمات يتشابه فريقاها عند عمى الألوان (المحيطي، النيون)، وفي
       الليلي تكاد الخلية المأخوذة تشبه الفارغة. */
    ['edgeTop', 'edgeBottom'].forEach(id => $(id).classList.toggle('striped', vTeam === 'B'));
    ['edgeStart', 'edgeEnd'].forEach(id => $(id).classList.toggle('striped', hTeam === 'B'));

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
    hex.setAttribute('aria-label', cellLabel(index));
  }

  /* مؤقّتات إبراز المسار تُلغى مع كل رسم جديد للوحة. كانت تبقى معلّقة،
     فإن بدأت جولة (أو جاء تراجع) قبل أن تنتهي أضاءت خلايا في اللوحة
     الجديدة لا علاقة لها بأي فوز — وُجدت اللوحة كلها تنبض في منتصف جولة. */
  let pathTimers = [];
  function clearPathTimers() { pathTimers.forEach(clearTimeout); pathTimers = []; }

  function highlightPath(path) {
    clearPathTimers();
    if (!path) return;
    path.forEach((idx, i) => {
      pathTimers.push(setTimeout(() => {
        const hex = document.querySelector('.hex[data-index="' + idx + '"]');
        if (hex) hex.classList.add('win-cell');
      }, i * 110));
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

    $('footA').textContent = dirText('A') + ' ' + lam(SETTINGS.teamA.name);
    $('footB').textContent = dirText('B') + ' ' + lam(SETTINGS.teamB.name);
    $('footFree').textContent = Game.owners.filter(o => o === null).length + ' خلية متاحة';
  }

  /* تبديل الاتجاهات بين الجولات كان صامتاً، فتظلّ العائلة الجديدة تطارد
     حافتي الجولة الماضية. يُعلن مرة واحدة لكل جولة، ويومض الشريطان. */
  let axisSeen = { round: 0, axisA: null };

  function renderRound() {
    showScreen('screen-game');
    renderBoard();
    renderStatus();
    syncTabs();

    if (Game.round !== axisSeen.round) {
      const changed = axisSeen.axisA && Game.round > 1 && axisSeen.axisA !== Game.axis.A;
      axisSeen = { round: Game.round, axisA: Game.axis.A };
      if (changed) announceSides();
    }
  }

  function announceSides() {
    const dir = t => Game.axis[t] === 'vertical' ? '↕ من فوق لتحت' : '↔ من اليمين لليسار';
    banner('انتبهوا! تبدّلت الاتجاهات — «' + teamName('A') + '» الآن ' + dir('A'),
           teamColor('A'), 3200);
    ['edgeTop', 'edgeBottom', 'edgeStart', 'edgeEnd'].forEach(id => {
      const e = $(id);
      e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash');
    });
  }

  /** شريط إعلان قصير فوق اللوحة، ويُقرأ لقارئ الشاشة أيضاً */
  let bannerTimer = null;
  function banner(text, color, ms) {
    const b = $('gameBanner');
    b.textContent = text;
    b.style.setProperty('--banner', color || 'var(--accent)');
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), ms || 1500);
    announce(text);
  }

  function announce(text) {
    const live = $('liveRegion');
    if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); }
  }

  /**
   * من أخذ الخلية ولماذا — للحاضرين حول التلفاز ولمن في الروم. كان الحكم
   * يحدث في ثوانٍ بلا أثر يُرى من بعيد.
   */
  function flashVerdict(index, owner, answering) {
    const L = Game.letters[index];
    if (owner === 'A' || owner === 'B') {
      const right = owner === answering;
      banner((right ? '✔ صح — ' : '✖ خطأ — ') + L + ' ' + lam(teamName(owner)), teamColor(owner));
    } else if (owner === 'blocked') {
      banner('✖ خطأ — ' + L + ' أُقفلت', 'var(--lock)');
    } else {
      banner('✖ خطأ — ' + L + ' تبقى متاحة', 'var(--muted)');
    }
  }

  /* ------------------------------------------------------------- التراجع */

  let undoTimer = null;
  function offerUndo() {
    const bar = $('undoBar');
    bar.classList.add('show');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 7000);
  }
  function hideUndo() {
    clearTimeout(undoTimer);
    const bar = $('undoBar');
    if (bar) bar.classList.remove('show');
  }

  function hideRoundResult() {
    clearTimeout(roundTimer);
    $('roundOverlay').classList.remove('show');
    document.querySelectorAll('.hex.win-cell').forEach(h => h.classList.remove('win-cell'));
  }

  function isQuestionOpen() { return $('questionModal').classList.contains('show'); }
  function isScreen(id) { const s = $(id); return !!s && s.classList.contains('active'); }

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
    $('judgeRow').classList.add('hidden');

    // وضع الاختيارات: أربعة أزرار بدل «اعرض الإجابة» وأزرار الحكم
    const choices = SETTINGS.answerMode === 'choices' && q && q.options;
    $('revealBtn').classList.toggle('hidden', !!choices);
    $('qHint').classList.remove('hint-right', 'hint-wrong');
    const row = $('choiceRow');
    row.innerHTML = '';
    row.classList.toggle('hidden', !choices);
    const mine = Online.canPick();
    $('giveUpBtn').classList.toggle('hidden', !(choices && mine));
    $('giveUpBtn').disabled = false;
    if (choices) {
      q.options.forEach((opt, i) => {
        const btn = el('button', { class: 'btn btn-choice', type: 'button' });
        btn.onclick = () => chooseOption(i);
        btn.disabled = !mine;
        btn.appendChild(el('span', { class: 'choice-num' }, String(i + 1)));
        btn.appendChild(document.createTextNode(opt));
        row.appendChild(btn);
      });
      $('qHint').textContent = mine
        ? 'اختاروا الإجابة — ضغطة واحدة فقط'
        : 'بانتظار اختيار ' + teamName(Game.turn) + '…';
    }

    // زر خطف النقطة يسمّي الفريق الآخر ويلبس لونه — «الآخر» وحدها تُربك
    // المقدّم وهو يحكم بسرعة بين فريقين
    const other = otherTeam(Game.turn);
    $('awardOtherBtn').textContent = 'النقطة لـ«' + teamName(other) + '»';
    $('awardOtherBtn').style.borderColor = teamColor(other);

    $('questionModal').classList.add('show');
  }

  function showAnswer() {
    $('qAnswer').classList.remove('hidden');
    $('revealBtn').classList.add('hidden');
    $('judgeRow').classList.remove('hidden');
  }

  /** يلوّن الاختيار المضغوط والإجابة الصحيحة، ويقفل الأزرار عند الجميع */
  function showPick() {
    const q = Game.questions[Game.activeCell];
    if (!q || Game.picked === null) return;
    const gaveUp = Game.picked === -1;
    const correct = !gaveUp && q.options[Game.picked] === q.a;

    [...$('choiceRow').children].forEach((btn, i) => {
      btn.disabled = true;
      btn.classList.toggle('is-right', q.options[i] === q.a);
      btn.classList.toggle('is-wrong', i === Game.picked && !correct);
    });
    $('giveUpBtn').disabled = true;
    $('qHint').textContent = correct ? '✔ إجابة صحيحة!'
      : gaveUp ? 'تخطّيتم — الإجابة: ' + q.a : '✖ إجابة خاطئة — الصحيحة: ' + q.a;
    $('qHint').classList.toggle('hint-right', correct);
    $('qHint').classList.toggle('hint-wrong', !correct);
    announce($('qHint').textContent);
  }

  function closeQuestion() {
    $('qHint').classList.remove('hint-right', 'hint-wrong');
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

  let roundTimer = null;

  function showRoundResult() {
    highlightPath(Game.winPath);

    const isLast = Game.round >= SETTINGS.rounds ||
      Game.wins.A > SETTINGS.rounds / 2 || Game.wins.B > SETTINGS.rounds / 2;

    clearTimeout(roundTimer);
    roundTimer = setTimeout(() => {
      const w = Game.winner;
      $('roundTitle').textContent = w
        ? 'فاز ' + teamName(w) + ' بالجولة ' + Game.round
        : 'الجولة ' + Game.round + ' انتهت بالتعادل';
      $('roundTitle').style.color = w ? teamColor(w) : 'var(--head)';
      $('roundIcon').textContent = w ? '🎉' : '🤝';

      /* لماذا انتهت؟ مع «تُقفل الخلية» قد تنتهي بلا مسار — يجب أن يُقال
         ذلك صراحةً، وإلا بدا الفوز اعتباطياً. */
      const a = Hive.countCells(Game.owners, 'A'), b = Hive.countCells(Game.owners, 'B');
      let reason = '';
      if (Game.roundReason === 'count') reason = 'لا أحد يستطيع الوصل — حُسمت بعدد الخلايا (' + Math.max(a, b) + ' مقابل ' + Math.min(a, b) + ')';
      else if (Game.roundReason === 'draw') reason = 'لا أحد يستطيع الوصل، وتساوت الخلايا (' + a + ' لكلٍّ)';
      $('roundReason').textContent = reason;
      $('roundReason').classList.toggle('hidden', !reason);

      // تنبيه الجولة القادمة: الاتجاهان سيتبدّلان
      const swapNext = !isLast && SETTINGS.swapSides;
      $('roundNextSides').classList.toggle('hidden', !swapNext);
      if (swapNext) $('roundNextSides').textContent = 'في الجولة القادمة تتبدّل الاتجاهات ↕↔';

      $('roundScore').textContent =
        SETTINGS.teamA.name + ' ' + Game.wins.A + '  —  ' + Game.wins.B + ' ' + SETTINGS.teamB.name;
      $('roundNextBtn').textContent = isLast ? 'النتيجة النهائية' : 'الجولة التالية';

      /* ⚠️ زر التقدّم للمقدّم وحده. `nextRound` محروسة أصلاً، لكن الزر
         يُغلق الإعلان **قبل** أن تُنادى — فكان الضيف يضغط فيختفي الإعلان
         عنده وتبقى المباراة واقفة، ويظنّها معطّلة. */
      const judge = Online.isJudge();
      $('roundNextBtn').classList.toggle('hidden', !judge);
      $('roundWait').classList.toggle('hidden', judge);

      /* شريط التراجع العائم يرسو في نفس الموضع أسفل الشاشة فيغطّي زر
         «الجولة التالية». فيُخفى، ويظهر التراجع داخل الإعلان نفسه. */
      hideUndo();
      $('roundUndoBtn').classList.toggle('hidden', !canUndo());

      /* الإعلان يرسو أسفل الشاشة بلا تعتيم: كان يغطّي اللوحة فلا يرى
         أحد مسار الفوز الذي صنعه لتوّه. */
      $('roundOverlay').classList.add('show', 'docked');
      announce($('roundTitle').textContent);
    }, (Game.winPath ? Game.winPath.length * 110 : 0) + 900);
  }

  function showMatchResult() {
    $('roundOverlay').classList.remove('show');
    showScreen('screen-end');
    syncTabs();

    // «مباراة جديدة» و«الإعدادات» للمقدّم وحده — غيره لا يملك بدء شيء
    const judge = Online.isJudge();
    document.querySelectorAll('#screen-end .nav .btn').forEach(b => {
      const home = /الرئيسية/.test(b.textContent);
      b.classList.toggle('hidden', !judge && !home);
    });

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

  /* ------------------------------------------------------------ الأونلاين */

  /* يعكس دورك على الشاشة: من يختار، ومن يحكم، ومن يشاهد.
     ⚠️ العرض فقط — المنع الحقيقي في `selectCell` و`resolveAnswer`. لو
     اكتُفي بإخفاء الأزرار لأمكن استدعاء الدوال من الكونسول. */
  function applyRole() {
    const online = Online.active();
    const judge = Online.isJudge();
    const canPick = Online.canPick();

    document.body.classList.toggle('is-online', online);
    document.body.classList.toggle('is-viewer', online && !canPick);
    // الضيف لا يرى «إنهاء» — كان أي ضيف يستطيع إنهاء المباراة على الجميع
    document.body.classList.toggle('is-guest', online && !judge);
    $('questionModal').classList.toggle('role-viewer', online && !judge);

    if (online && Game.phase === 'playing') {
      const bar = $('turnBar');
      const mine = Net.myTeam() === Game.turn;
      bar.textContent = mine
        ? 'دوركم — اختر خلية (' + teamName(Game.turn) + ')'
        : 'دور ' + teamName(Game.turn) + ' — انتظر';
      bar.style.background = teamColor(Game.turn);
    }
  }

  /* شريط صغير دائم يقول: أنت في روم كذا، وأنت في فريق كذا */
  function renderRoomBar() {
    const bar = $('roomBar');
    if (!bar) return;

    if (!Online.active()) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');

    const team = Net.myTeam();
    $('roomBarCode').textContent = Net.room().code;
    $('roomBarRole').textContent =
      (Net.isHost() ? 'المقدّم · ' : '') +
      (team ? teamName(team) : 'مشاهد');
    $('roomBarRole').style.color = team ? teamColor(team) : 'var(--muted)';
  }

  function renderLobby() {
    const room = Net.room();
    if (!room) return;

    $('roomCode').textContent = room.code;
    $('lobbyCount').textContent = room.players.length;

    const host = Net.isHost();
    $('lobbyHostBox').classList.toggle('hidden', !host);
    $('lobbyGuestBox').classList.toggle('hidden', host);

    ['A', 'B'].forEach(t => {
      const box = $('teamList' + t);
      box.innerHTML = '';
      $('teamTitle' + t).textContent = teamName(t);
      $('teamTitle' + t).style.color = teamColor(t);

      const members = room.players.filter(p => p.team === t);
      if (!members.length) {
        box.appendChild(el('div', { class: 'lobby-empty' }, 'لا أحد بعد'));
      }

      members.forEach(p => {
        const row = el('div', { class: 'lobby-player' + (p.seat === Net.seat() ? ' is-me' : '') });
        row.appendChild(el('span', { class: 'lp-dot' + (p.online ? ' on' : '') }));
        row.appendChild(el('span', { class: 'lp-name' },
          escapeHtml(p.name) + (p.seat === 0 ? ' <b>· المقدّم</b>' : '') +
          (p.seat === Net.seat() ? ' <i>(أنت)</i>' : '')));

        // المضيف وحده ينقل اللاعبين — والزر لا يظهر لغيره أصلاً
        if (host) {
          const move = el('button', { class: 'btn btn-ghost btn-tiny' },
            t === 'A' ? '→ ' + teamName('B') : '← ' + teamName('A'));
          move.onclick = () => movePlayer(p.seat, t === 'A' ? 'B' : 'A');
          row.appendChild(move);
        }
        box.appendChild(row);
      });
    });

    const ready = room.players.filter(p => p.team === 'A').length > 0 &&
                  room.players.filter(p => p.team === 'B').length > 0;
    if (host) {
      $('lobbyStartBtn').disabled = !ready;
      $('lobbyHint').textContent = ready
        ? 'الفريقان جاهزان — تقدر تبدأ'
        : 'كل فريق يحتاج لاعباً واحداً على الأقل';
      renderLobbyMode();
    }
  }

  /* طريقة الإجابة يختارها المقدّم من الردهة: الاختيارات لمن لا يسمع بعضهم،
     و«المقدّم يحكم» لمن على مكالمة. لم يكن لها مكان إلا شاشة الإعدادات
     المحلية، والأونلاين يتجاوزها. */
  function renderLobbyMode() {
    const wrap = $('lobbyModeChoices');
    if (!wrap) return;
    wrap.innerHTML = '';
    [['choices', 'اختيارات — بلا مكالمة'], ['host', 'المقدّم يحكم — على مكالمة']].forEach(([v, label]) => {
      const b = el('button', { class: 'choice' + (SETTINGS.answerMode === v ? ' selected' : ''), type: 'button' },
        escapeHtml(label));
      b.onclick = () => { SETTINGS.answerMode = v; Sound.select(); renderLobbyMode(); };
      wrap.appendChild(b);
    });
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
    openQuestion, showAnswer, showPick, closeQuestion, updateTimer,
    showRoundResult, hideRoundResult, showMatchResult,
    applyRole, renderLobby, renderRoomBar,
    flashVerdict, offerUndo, hideUndo, banner,
    isQuestionOpen, isScreen,
  };
})();
