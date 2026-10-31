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

  /* اختيار خلية: أي لاعب في الفريق صاحب الدور. وفي المحلي الجميع.
     ⚠️ والمضيف أيضاً حين يخلو الفريق صاحب الدور من لاعب متصل — خرج آخر
     لاعبيه أو انقطع. بلا هذا تتجمّد المباراة: الدور لفريق لا أحد فيه
     يستطيع الضغط، ولا أحد غيره مسموح له. */
  function turnTeamIsEmpty() {
    return !Net.teamMembers(Game.turn).some(p => p.online !== false);
  }

  function canPick() {
    if (!active) return true;
    if (Net.myTeam() === Game.turn) return true;
    return Net.isHost() && turnTeamIsEmpty();
  }

  function whyCannotPick() {
    if (Net.myTeam() !== Game.turn) {
      return 'دور ' + teamName(Game.turn) + ' — انتظر دورك';
    }
    return '';
  }

  /* ----------------------------------------------- الحالة المُتبادَلة */

  /* الحالة كلها تُبثّ لأن اللوحة يجب أن تكون **نفسها** عند الجميع: الحروف
     عشوائية والأسئلة مسحوبة عشوائياً، فلا يمكن لأي جهاز أن يعيد توليدها
     بنفسه ويصل لنفس النتيجة. الحقول نفسها التي يحفظها التراجع والمباراة
     المحلية — مصدر واحد في `serializeGame`. */
  function snapshot() {
    return Object.assign(serializeGame(), {
      // إعدادات المضيف تحكم المباراة — والثيم شأن شخصي فلا يُبثّ
      settings: {
        teamA: SETTINGS.teamA,
        teamB: SETTINGS.teamB,
        size: SETTINGS.size,
        rounds: SETTINGS.rounds,
        timer: SETTINGS.timer,
        wrongRule: SETTINGS.wrongRule,
        swapSides: SETTINGS.swapSides,
        answerMode: SETTINGS.answerMode,
        levelA: SETTINGS.levelA,
        levelB: SETTINGS.levelB,
      },
    });
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
      const hadQuestion = hadOpen !== null && Game.questions[hadOpen] ? Game.questions[hadOpen].q : null;
      const oldOwners = (Game.owners || []).slice();
      const oldTurn = Game.turn;
      const sameRound = Game.round === state.round && Game.cells.length === (state.cells || []).length;

      restoreGame(state);

      // كل سؤال يُعرض يُحفظ عند كل جهاز — فذاكرة الأسئلة واحدة في الروم
      if (Game.activeCell !== null) markSeen(Game.questions[Game.activeCell]);

      if (Game.phase === 'playing' || Game.phase === 'round-over') {
        /* إعادة بناء اللوحة عند تغيّر الجولة — وإلا وميض في كل بثّ.
           وعند الرجوع من «انتهت الجولة» إلى اللعب: تراجع المقدّم عن الحكم
           الحاسم، فيجب أن يختفي إبراز مسار الفوز والإعلان معاً. */
        const undone = wasPhase === 'round-over' && Game.phase === 'playing';
        const boardChanged = wasPhase === 'idle' || Game.round !== apply._round || undone ||
                             document.querySelectorAll('.hex').length !== Game.cells.length;
        apply._round = Game.round;

        if (undone) UI.hideRoundResult();
        if (boardChanged) UI.renderRound();
        else { Game.owners.forEach((_, i) => UI.paintCell(i)); UI.renderStatus(); }

        // من أخذ الخلية؟ يُعلَن عند المشاهدين كما عند المقدّم
        if (sameRound && !undone) {
          Game.owners.forEach((o, i) => {
            if (o !== oldOwners[i] && oldOwners[i] === null && o !== null) {
              UI.flashVerdict(i, o, oldTurn);
            }
          });
        }
      }

      // نافذة السؤال تتبع `activeCell` عند الجميع
      if (Game.activeCell !== null) {
        const q = Game.questions[Game.activeCell];
        const reopened = hadOpen !== Game.activeCell || !q || q.q !== hadQuestion;
        if (reopened || !UI.isQuestionOpen()) {
          UI.openQuestion(Game.activeCell);
        }
        if (Game.answerShown) UI.showAnswer();
        UI.applyRole();
        if (Game.picked !== null) {
          // ضيف اختار: الجميع يرى النتيجة، والمقدّم وحده يسوّيها
          stopTimer();
          UI.showPick();
          settlePick();
        } else if (Game.answerShown || !Game.deadline) {
          // الإجابة كُشفت: الساعة توقّفت عند المقدّم، فتتوقّف هنا أيضاً
          stopTimer();
          UI.updateTimer(null);
        } else {
          startTimer();
        }
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

    // في الردهة: لا مباراة بعد، أو أنهاها المقدّم وأرجع الجميع إليها
    if (!room.state || !room.state.phase || room.state.phase === 'idle') {
      /* ⚠️ كان الضيف ينتقل للردهة فقط إن كانت مباراته هو منتهية، فإذا
         أنهى المقدّم مباراة جارية بقي الضيف متجمّداً على لوحة قديمة. */
      if (Game.phase !== 'idle') {
        stopTimer();
        Game.phase = 'idle';
        Game.activeCell = null;
        UI.closeQuestion();
        UI.hideRoundResult();
        UI.hideUndo();
      }
      UI.renderLobby();
      if (!UI.isScreen('screen-room')) {
        showScreen('screen-room');
        syncTabs();
      }
      return;
    }
    apply(room.state);
  }

  async function enter(fn, args, asHost) {
    const data = await fn.apply(null, args);
    if (data.error) { uiToast(msg(data.error)); return false; }
    localSettingsBackup = JSON.parse(JSON.stringify(loadJSON('huroof_settings', {})));
    active = true;
    /* الأونلاين يبدأ بالاختيارات: اللاعبون في أماكن مختلفة لا يسمعون
       بعضهم، والتصحيح الآلي هو ما يجعل اللعب ممكناً بلا مكالمة. وللمقدّم
       تبديلها من الردهة لو كانوا على مكالمة. (في الذاكرة لا التخزين —
       إعداد اللاعب المحلي يعود كما كان عند الخروج.) */
    if (asHost) SETTINGS.answerMode = 'choices';
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
    UI.hideRoundResult();
    UI.hideUndo();
    UI.renderRoomBar();
  }

  Net.onUpdate = onRoom;
  Net.onError = code => { uiToast(msg(code)); leave().then(goHome); };

  /* --------------------------------------------------------- الواجهة */

  return {
    active()  { return active; },
    isJudge, canPick, whyCannotPick, publish, apply, msg, leave,

    async create(name) { return enter(Net.createRoom, [name], true); },
    async join(code, name) { return enter(Net.joinRoom, [code, name]); },
    async resume(code) { return enter(Net.resume, [code]); },
  };
})();
