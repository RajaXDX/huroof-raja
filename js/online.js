/* ==========================================================================
   online.js — الوصل بين `Game` و`Net`
   --------------------------------------------------------------------------
   يقرّر «من يحقّ له أن يفعل ماذا»، ويترجم حالة اللعبة إلى ما يُبثّ والعكس.
   النقل كله في net.js والرسم كله في ui.js.

   نموذج اللعب أونلاين — مقصود ومبني على اللعبة كما هي:
   · **المضيف هو المقدّم والحَكَم**: يفتح الإجابة ويحكم صح/خطأ وينقل الجولات.
     اللعبة أصلاً بلا إدخال إجابة — تُقال بصوت عالٍ — فالحكم بيد إنسان لا
     بيد مطابق نصوص. (تُلعب مع مكالمة، وهذا واقعها.)
   · **صاحب الدور يختار الخلية من جهازه**: أي لاعب في الفريق صاحب الدور.
   · **الباقون يشاهدون** اللوحة لحظياً.
   ========================================================================== */

const Online = (function () {

  let active = false;          // هل نحن داخل روم؟
  let localSettingsBackup = null;
  let applying = false;        // نمنع البثّ أثناء تطبيق حالة واردة

  const ERRORS = {
    not_found:  'الروم ما عادت موجودة',
    not_member: 'ما عدت داخل هذي الروم',
    not_host:   'هذا الإجراء للمضيف وحده',
    full:       'الروم مكتملة — ثمانية لاعبين',
    started:    'المباراة بدأت، ما تقدر تدخل الآن',
    bad_team:   'فريق غير معروف',
    bad_token:  'تعذّر التعرّف على الجهاز',
    no_schema:  'الخادم غير مهيّأ بعد (شغّل supabase-huroof.sql)',
    offline:    'ما فيه اتصال — الأونلاين يحتاج إنترنت',
    network:    'تعذّر الاتصال — تأكد من الإنترنت',
    empty:      'ردّ فارغ من الخادم',
  };
  const msg = code => ERRORS[code] || 'صار خطأ غير متوقّع';

  /* ------------------------------------------------------- الصلاحيات */

  /* المضيف: يبدأ المباراة، ويكشف الإجابة، ويحكم، وينقل الجولة */
  function isJudge() { return !active || Net.isHost(); }

  /* اختيار خلية: أي لاعب في الفريق صاحب الدور. وفي المحلي الجميع. */
  function canPick() {
    if (!active) return true;
    return Net.myTeam() === Game.turn;
  }

  function whyCannotPick() {
    if (Net.myTeam() !== Game.turn) {
      return 'دور ' + teamName(Game.turn) + ' — انتظر دورك';
    }
    return '';
  }

  /* ----------------------------------------------- الحالة المُتبادَلة */

  /* ⚠️ لا نبثّ `timerId` (مؤقّت محلي لا معنى له عند غيرك) ولا `timeLeft`
     (يُشتقّ من `deadline`). والباقي كله يُبثّ لأن اللوحة يجب أن تكون
     **نفسها** عند الجميع: الحروف عشوائية والأسئلة مسحوبة عشوائياً، فلا
     يمكن لأي جهاز أن يعيد توليدها بنفسه ويصل لنفس النتيجة. */
  function snapshot() {
    return {
      phase: Game.phase,
      round: Game.round,
      wins: Game.wins,
      rows: Game.rows,
      cols: Game.cols,
      cells: Game.cells,
      owners: Game.owners,
      letters: Game.letters,
      questions: Game.questions,
      axis: Game.axis,
      turn: Game.turn,
      activeCell: Game.activeCell,
      answerShown: Game.answerShown,
      winner: Game.winner,
      winPath: Game.winPath,
      deadline: Game.deadline || 0,
      // إعدادات المضيف تحكم المباراة — والثيم شأن شخصي فلا يُبثّ
      settings: {
        teamA: SETTINGS.teamA,
        teamB: SETTINGS.teamB,
        size: SETTINGS.size,
        rounds: SETTINGS.rounds,
        timer: SETTINGS.timer,
        wrongRule: SETTINGS.wrongRule,
        swapSides: SETTINGS.swapSides,
      },
    };
  }

  function publish(status) {
    if (!active || applying) return;
    Net.push(snapshot(), status || (Game.phase === 'match-over' ? 'ended' : 'playing'));
  }

  /* يطبّق حالة واردة على اللعبة ثم يعيد الرسم */
  function apply(state) {
    if (!state) return;
    applying = true;
    try {
      /* ⚠️ إعدادات المضيف تُكتب في SETTINGS مباشرة **بلا حفظ**: كل مسار رسم
         في المشروع يقرأ منها (أسماء الفريقين وألوانهما وعدد الجولات…)،
         فتمريرها كنسخة موازية كان يعني تعديل ui.js كله. وعند الخروج من
         الروم نستعيد إعدادات اللاعب من التخزين — راجع `restoreSettings`. */
      if (state.settings) Object.assign(SETTINGS, state.settings);

      const wasPhase = Game.phase;
      const hadOpen = Game.activeCell;

      Object.assign(Game, {
        phase: state.phase, round: state.round, wins: state.wins,
        rows: state.rows, cols: state.cols, cells: state.cells,
        owners: state.owners, letters: state.letters, questions: state.questions,
        axis: state.axis, turn: state.turn, activeCell: state.activeCell,
        answerShown: state.answerShown, winner: state.winner, winPath: state.winPath,
        deadline: state.deadline || 0,
      });

      if (Game.phase === 'playing' || Game.phase === 'round-over') {
        // إعادة بناء اللوحة فقط عند تغيّر الجولة — وإلا وميض في كل بثّ
        const boardChanged = wasPhase === 'idle' || Game.round !== apply._round ||
                             document.querySelectorAll('.hex').length !== Game.cells.length;
        apply._round = Game.round;

        if (boardChanged) UI.renderRound();
        else { Game.owners.forEach((_, i) => UI.paintCell(i)); UI.renderStatus(); }
      }

      // نافذة السؤال تتبع `activeCell` عند الجميع
      if (Game.activeCell !== null) {
        UI.openQuestion(Game.activeCell);
        if (Game.answerShown) UI.showAnswer();
        UI.applyRole();
        startTimer();
      } else if (hadOpen !== null) {
        stopTimer();
        UI.closeQuestion();
      }

      if (Game.phase === 'round-over' && wasPhase !== 'round-over') UI.showRoundResult();
      if (Game.phase === 'match-over') UI.showMatchResult();
      if (Game.phase === 'playing') UI.applyRole();
    } finally {
      applying = false;
    }
  }

  /* ------------------------------------------------------ دورة الروم */

  function onRoom(room) {
    if (!room) return;
    UI.renderRoomBar();

    // ما زلنا في الردهة: لا مباراة بعد
    if (!room.state || !room.state.phase || room.state.phase === 'idle') {
      UI.renderLobby();
      if (!document.getElementById('screen-room').classList.contains('active') &&
          Game.phase === 'idle') {
        showScreen('screen-room');
        syncTabs();
      }
      return;
    }
    apply(room.state);
  }

  async function enter(fn, args) {
    const data = await fn.apply(null, args);
    if (data.error) { uiToast(msg(data.error)); return false; }
    localSettingsBackup = JSON.parse(JSON.stringify(loadJSON('huroof_settings', {})));
    active = true;
    onRoom(data);
    return true;
  }

  function restoreSettings() {
    if (!localSettingsBackup) return;
    Object.assign(SETTINGS, DEFAULT_SETTINGS, localSettingsBackup);
    localSettingsBackup = null;
  }

  async function leave() {
    await Net.leave();
    active = false;
    restoreSettings();
    stopTimer();
    Game.phase = 'idle';
    Game.activeCell = null;
    UI.closeQuestion();
    document.getElementById('roundOverlay').classList.remove('show');
    UI.renderRoomBar();
  }

  Net.onUpdate = onRoom;
  Net.onError = code => { uiToast(msg(code)); leave().then(goHome); };

  /* --------------------------------------------------------- الواجهة */

  return {
    active()  { return active; },
    isJudge, canPick, whyCannotPick, publish, apply, msg, leave,

    async create(name) { return enter(Net.createRoom, [name]); },
    async join(code, name) { return enter(Net.joinRoom, [code, name]); },
    async resume(code) { return enter(Net.resume, [code]); },
  };
})();
