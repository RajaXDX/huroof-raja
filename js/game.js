/* ==========================================================================
   game.js — حالة اللعبة ومنطق الجولات والأدوار
   --------------------------------------------------------------------------
   هذا الملف يقرّر «ماذا يحدث». الرسم كله في ui.js.
   الفصل مقصود: لو أضفنا لاحقاً وضع أونلاين، هذا الملف هو ما يُزامَن.
   ========================================================================== */

/* ------------------------------------------------------------ الإعدادات */

const DEFAULT_SETTINGS = {
  palette: 'neon',      // مفتاح من THEMES
  // color = null تعني «استخدم افتراضي الثيم». نخزّن null لا لوناً صريحاً
  // حتى يتبع الفريقان الثيم تلقائياً عند تبديله، ما لم يختر اللاعب لوناً.
  teamA: { name: 'الفريق الأول', color: null },
  teamB: { name: 'الفريق الثاني', color: null },
  size: 5,              // اللوحة size × size
  rounds: 3,            // عدد الجولات (فردي حتى لا تنتهي المباراة بتعادل)
  timer: 30,            // ثواني لكل سؤال، 0 = بلا مؤقت
  wrongRule: 'opponent',// opponent = الخلية للفريق الآخر | block = تُقفل | free = تبقى متاحة
  swapSides: true,      // تبديل الاتجاهات كل جولة (يلغي أفضلية الاتجاه العمودي)
  answerMode: 'choices',// choices = أربعة اختيارات تُصحَّح آلياً | host = يُقال بصوت عالٍ ويحكم المقدّم
  sound: true,
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS, loadJSON('huroof_settings', {}));

// الثيم قد يكون محذوفاً بعد تحديث — نرجع للافتراضي بدل شاشة بلا ألوان
if (!THEMES[SETTINGS.palette]) SETTINGS.palette = DEFAULT_SETTINGS.palette;

/* ترحيل الإعدادات المحفوظة من نسخة سابقة.
   النسخة الأولى خزّنت لوناً صريحاً لكل فريق من لوحة قديمة (أخضر/ذهبي).
   تلك الألوان غير موجودة في أي ثيم الآن، فمن لعب قبل التحديث كان سيرى
   لوحة بألوان لا تنتمي للثيم. نصفّر أي لون خارج لوحة الثيم الحالي. */
(function migrateTeamColors() {
  const allowed = new Set(
    Object.values(THEMES).flatMap(t => t.swatches.concat(t.teams))
  );
  ['teamA', 'teamB'].forEach(k => {
    if (SETTINGS[k] && SETTINGS[k].color && !allowed.has(SETTINGS[k].color)) {
      SETTINGS[k].color = null;
    }
  });
})();

function saveSettings() {
  saveJSON('huroof_settings', SETTINGS);
}

/** الثيم الفعّال حالياً */
function theme() {
  return THEMES[SETTINGS.palette] || THEMES.neon;
}

/** ألوان الفريقين المتاحة للاختيار — تتبع الثيم */
function colorSwatches() {
  return theme().swatches;
}

/* ------------------------------------------------------------ بنك الأسئلة */

let BANK = {};        // { 'ب': [{q,a}, ...], ... }
let usedQuestions = {}; // { 'ب': Set(indices) } — حتى لا يتكرر السؤال في نفس المباراة

async function loadBank() {
  try {
    const res = await fetch('data/questions.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    BANK = json.letters || {};
  } catch (e) {
    console.error('تعذّر تحميل بنك الأسئلة:', e);
    BANK = {};
  }

  // نستبعد أي حرف بلا أسئلة حتى لا تظهر خلية بلا سؤال
  Object.keys(BANK).forEach(k => {
    if (!Array.isArray(BANK[k]) || BANK[k].length === 0) delete BANK[k];
  });

  return BANK;
}

function bankStats() {
  const letters = Object.keys(BANK);
  const total = letters.reduce((n, k) => n + BANK[k].length, 0);
  return { letters: letters.length, total };
}

/**
 * يسحب سؤالاً غير مستخدم لهذا الحرف.
 * لو استُهلكت كل أسئلة الحرف نعيد التدوير بدل أن نعطّل الخلية.
 */
function drawQuestion(letter) {
  const list = BANK[letter];
  if (!list || !list.length) return null;

  if (!usedQuestions[letter]) usedQuestions[letter] = new Set();
  if (usedQuestions[letter].size >= list.length) usedQuestions[letter].clear();

  const available = list
    .map((_, i) => i)
    .filter(i => !usedQuestions[letter].has(i));

  const pick = available[Math.floor(Math.random() * available.length)];
  usedQuestions[letter].add(pick);
  const q = Object.assign({ letter }, list[pick]);
  q.options = buildOptions(q, list);
  return q;
}

/** توحيد كتابة الإجابة للمقارنة: بلا «ال» وبلا فروق الهمزة والتاء المربوطة */
function normalizeAnswer(s) {
  return String(s || '').trim()
    .replace(/[\u064B-\u0652\u0640]/g, '')   // التشكيل والتطويل
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/^ال/, '');
}

/**
 * أربعة اختيارات مخلوطة: الإجابة وثلاثة خاطئة.
 *
 * الخاطئة من `choices` في بنك الأسئلة إن وُجدت — مكتوبة لتبدأ بنفس الحرف
 * ومن نفس النوع، فلا يكشفها شكلها. وإلا تُستعار من إجابات أسئلة الحرف
 * نفسه: تبدأ بالحرف لكنها قد تختلف نوعاً (معركة بين أسماء حيوانات)، فهي
 * حلّ مؤقت إلى أن يُكمل البنك.
 *
 * تُحسب مرة واحدة عند السحب وتُحفظ في السؤال، فتُبثّ أونلاين بترتيبها
 * — لو خلط كل جهاز بنفسه لاختلف معنى «الاختيار الثاني» بين اللاعبين.
 */
function buildOptions(q, list) {
  const seen = new Set([normalizeAnswer(q.a)].concat((q.alt || []).map(normalizeAnswer)));
  const wrong = [];
  const take = s => {
    const n = normalizeAnswer(s);
    if (!n || seen.has(n) || wrong.length >= 3) return;
    seen.add(n);
    wrong.push(s);
  };

  (Array.isArray(q.choices) ? q.choices : []).forEach(take);
  shuffle(list.map(x => x.a)).forEach(take);

  return shuffle([q.a].concat(wrong));
}

/**
 * يختار حروف اللوحة عشوائياً.
 * لو عدد الخلايا أكبر من عدد الحروف المتاحة نكرّر الحروف، لكن كل خلية
 * تأخذ سؤالاً مختلفاً — فالتكرار في الحرف لا في السؤال.
 */
function pickLetters(count) {
  const pool = Object.keys(BANK);
  if (!pool.length) return [];

  let bag = [];
  while (bag.length < count) bag = bag.concat(shuffle(pool));
  return shuffle(bag.slice(0, count));
}

/* -------------------------------------------------------------- الحالة */

const Game = {
  phase: 'idle',      // idle | playing | round-over | match-over
  round: 0,
  wins: { A: 0, B: 0 },
  rows: 5,
  cols: 5,
  cells: [],
  owners: [],         // 'A' | 'B' | 'blocked' | null
  letters: [],
  questions: [],
  axis: { A: 'vertical', B: 'horizontal' },
  turn: 'A',
  activeCell: null,
  winner: null,
  winPath: null,
  timerId: null,
  timeLeft: 0,
  // ⚠️ ختم زمني مشترك لا عدّاد محلي. أونلاين، لو عدّ كل جهاز وحده لانحرفا:
  // من فتح السؤال متأخراً يرى وقتاً أطول، ومن جُمّد تبويبه يرى وقتاً متوقّفاً.
  deadline: 0,
  answerShown: false,
  picked: null,       // رقم الاختيار الذي ضغطه الفريق في وضع الاختيارات
};

function teamName(t) { return t === 'A' ? SETTINGS.teamA.name : SETTINGS.teamB.name; }
function otherTeam(t) { return t === 'A' ? 'B' : 'A'; }

/** لون الفريق: اختيار اللاعب إن وُجد، وإلا افتراضي الثيم */
function teamColor(t) {
  const chosen = t === 'A' ? SETTINGS.teamA.color : SETTINGS.teamB.color;
  return chosen || theme().teams[t === 'A' ? 0 : 1];
}

/* --------------------------------------------------------- بدء المباراة */

function startMatch() {
  if (!Object.keys(BANK).length) {
    uiToast('بنك الأسئلة لم يُحمَّل. تأكد أنك تشغّل اللعبة عبر خادم وليس بفتح الملف مباشرة.');
    return;
  }
  if (!Online.isJudge()) { uiToast('المضيف هو من يبدأ المباراة'); return; }

  Game.round = 0;
  Game.wins = { A: 0, B: 0 };
  usedQuestions = {};
  Sound.start();
  startRound();
}

function startRound() {
  Game.round += 1;
  Game.rows = SETTINGS.size;
  Game.cols = SETTINGS.size;
  Game.cells = Hive.buildBoard(Game.rows, Game.cols);
  Game.owners = Game.cells.map(() => null);
  Game.winner = null;
  Game.winPath = null;
  Game.activeCell = null;
  Game.phase = 'playing';

  // ترتيب الحروف عشوائي في كل جولة — هذا مطلب أساسي في اللعبة
  Game.letters = pickLetters(Game.cells.length);
  Game.questions = Game.letters.map(l => drawQuestion(l));

  // تبديل الاتجاهات: اللوحة المربعة تعطي الاتجاه العمودي أفضلية ~3%
  // لأن السداسيات تتداخل رأسياً فتصير اللوحة أعرض من كونها عالية.
  // التبديل كل جولة يلغي هذه الأفضلية على مدى المباراة.
  const swap = SETTINGS.swapSides && (Game.round % 2 === 0);
  Game.axis = swap
    ? { A: 'horizontal', B: 'vertical' }
    : { A: 'vertical',   B: 'horizontal' };

  // من يبدأ: الجولة الأولى قرعة، وبعدها يبدأ الخاسر
  if (Game.round === 1) {
    Game.turn = Math.random() < 0.5 ? 'A' : 'B';
  } else {
    Game.turn = Game.wins.A > Game.wins.B ? 'B' : 'A';
  }

  Game.activeCell = null;
  Game.picked = null;
  Game.deadline = 0;
  UI.renderRound();
  UI.applyRole();
  Online.publish('playing');
}

/* ------------------------------------------------------------- اللعب */

function selectCell(index) {
  if (Game.phase !== 'playing') return;
  if (Game.activeCell !== null) return;             // سؤال مفتوح بالفعل
  if (Game.owners[index] !== null) return;          // الخلية مأخوذة

  // أونلاين: الاختيار لمن عليه الدور. المنع هنا لا في ui.js — ui لا يقرّر.
  if (!Online.canPick()) { uiToast(Online.whyCannotPick()); return; }

  Game.activeCell = index;
  Game.answerShown = false;
  Game.picked = null;
  Game.deadline = SETTINGS.timer ? Date.now() + SETTINGS.timer * 1000 : 0;
  Sound.open();
  UI.openQuestion(index);
  UI.applyRole();
  startTimer();
  Online.publish();
}

/**
 * المؤقّت يعرض ما بقي من `Game.deadline`، ولا يعدّ بنفسه.
 *
 * ⚠️ **الحكم عند انتهاء الوقت للمقدّم وحده.** لو حكم كل جهاز عند بلوغ
 * الصفر لَنُفِّذت الإجابة الخاطئة مرات بعدد اللاعبين، وكل واحدة تبثّ حالة
 * فتتسابق النسخ. عند الجميع يتوقّف العدّ وحسب.
 */
function startTimer() {
  stopTimer();
  if (!SETTINGS.timer || !Game.deadline) { UI.updateTimer(null); return; }

  tickTimer();
  Game.timerId = setInterval(tickTimer, 250);
}

function tickTimer() {
  const left = Math.max(0, Math.ceil((Game.deadline - Date.now()) / 1000));

  if (left !== Game.timeLeft) {
    Game.timeLeft = left;
    UI.updateTimer(left);
    if (left <= 5 && left > 0) Sound.tick();
  }

  if (Date.now() >= Game.deadline) {
    stopTimer();
    if (Game.picked !== null) return;   // اختاروا قبل الصفر — التسوية جارية
    if (Online.isJudge()) {
      uiToast('انتهى الوقت!');
      resolveAnswer(false);
    }
  }
}

function stopTimer() {
  if (Game.timerId) clearInterval(Game.timerId);
  Game.timerId = null;
}

function revealAnswer() {
  if (!Online.isJudge()) return;
  if (SETTINGS.answerMode === 'choices') return;   // الاختيارات تكشف نفسها
  Game.answerShown = true;
  UI.showAnswer();
  Online.publish();
}

/**
 * يستبدل سؤال الخلية بسؤال آخر من نفس الحرف.
 *
 * يُستدعى كلما فُتح سؤال ثم بقيت الخلية متاحة بلا مالك. السبب: السؤال
 * عُرض على الطاولة وربما كُشفت إجابته، فإعادة عرضه نفسه يجعل الفتحة
 * الثانية بلا معنى — الجميع يعرف الجواب.
 *
 * `drawQuestion` تتجنّب المكرر داخل المباراة أصلاً، فالسؤال الجديد مختلف
 * ما لم تنفد أسئلة الحرف فتُعاد دورتها.
 */
function refreshQuestion(index) {
  const next = drawQuestion(Game.letters[index]);
  if (next) Game.questions[index] = next;
}

/**
 * يغلق السؤال ويعيد الخلية كما كانت بلا حكم ولا تبديل دور.
 * موجود لأن المقدّم قد يفتح خلية بالخطأ، أو يجد السؤال غامضاً.
 */
function cancelQuestion() {
  if (Game.activeCell === null) return;
  if (!Online.isJudge()) return;
  stopTimer();

  const index = Game.activeCell;
  Game.activeCell = null;
  Game.answerShown = false;
  Game.picked = null;
  Game.deadline = 0;
  UI.closeQuestion();
  refreshQuestion(index);
  Online.publish();
}

/* ------------------------------------------------- وضع الاختيارات */

/**
 * الفريق صاحب الدور يضغط اختياراً.
 *
 * الحكم آلي: الاختيار يطابق الإجابة أو لا. وهذا ما يجعل الأونلاين قابلاً
 * للعب بلا مكالمة — لا أحد يحتاج أن يسمع أحداً.
 *
 * ⚠️ الضاغط يسجّل اختياره ويبثّه فقط، و**التسوية عند المقدّم** كما في كل
 * حكم (`settlePick`). لو سوّى كل جهاز بنفسه لتسابقت النسخ — نفس سبب
 * حصر الحكم عند انتهاء الوقت بالمقدّم.
 */
function chooseOption(i) {
  if (SETTINGS.answerMode !== 'choices') return;
  if (Game.phase !== 'playing' || Game.activeCell === null) return;
  if (Game.picked !== null) return;                 // اختيار واحد لكل سؤال
  if (!Online.canPick()) { uiToast(Online.whyCannotPick()); return; }

  const q = Game.questions[Game.activeCell];
  if (!q || !q.options || !(i >= 0 && i < q.options.length)) return;

  Game.picked = i;
  stopTimer();
  UI.showPick();
  Online.publish();
  settlePick();
}

/** هل الاختيار المضغوط هو الإجابة؟ */
function pickIsCorrect() {
  const q = Game.questions[Game.activeCell];
  return !!q && q.options[Game.picked] === q.a;
}

/**
 * المقدّم يسوّي الاختيار بعد مهلة قصيرة يرى فيها الجميع الأخضر والأحمر.
 * تُنادى من `chooseOption` عند الضاغط، ومن `Online.apply` عند المقدّم
 * حين يصله اختيار ضيف. والختم يمنع تسوية مزدوجة لو وصلت البثّة مرتين.
 */
let pendingPick = null;
function settlePick() {
  if (!Online.isJudge() || Game.picked === null) return;
  const key = Game.round + ':' + Game.activeCell;
  if (pendingPick === key) return;
  pendingPick = key;

  setTimeout(() => {
    pendingPick = null;
    if (Game.round + ':' + Game.activeCell !== key || Game.picked === null) return;
    resolveAnswer(pickIsCorrect());
  }, 1600);
}

/**
 * يُنهي السؤال المفتوح ويوزّع الخلية حسب النتيجة والقاعدة المختارة.
 */
function resolveAnswer(correct) {
  if (Game.activeCell === null) return;
  if (!Online.isJudge()) return;

  const answering = Game.turn;
  let owner = null;   // 'free' تترك الخلية بلا مالك فتبقى متاحة

  if (correct) {
    owner = answering;
  } else if (SETTINGS.wrongRule === 'opponent') {
    owner = otherTeam(answering);
  } else if (SETTINGS.wrongRule === 'block') {
    owner = 'blocked';
  }

  settleQuestion(owner, correct);
}

/**
 * يمنح الخلية للفريق الآخر صراحةً مهما كانت قاعدة الخطأ.
 *
 * الحاجة إليه عملية: السؤال يُقال بصوت عالٍ، فيخطئ صاحب الدور ويخطفها
 * الخصم فوراً. «إجابة خاطئة» وحدها لا تكفي — نتيجتها تتبع قاعدة المباراة،
 * فمع «تُقفل» أو «تبقى متاحة» يضيع ما كسبه الخصم فعلاً، ولا حيلة للمقدّم
 * إلا تغيير قاعدة المباراة كلها من أجل خلية واحدة.
 *
 * والدور بعده ينتقل للخاطف تماماً كما في قاعدة «الخلية للفريق الآخر» —
 * نفس الحكم يعطي نفس النتيجة أيّاً كان الزر الذي أوصل إليه.
 */
function awardOther() {
  if (Game.activeCell === null) return;
  if (!Online.isJudge()) return;

  settleQuestion(otherTeam(Game.turn), true);
}

/**
 * الذيل المشترك لكل حكم: يسلّم الخلية، ثم يبدّل الدور ما لم تنتهِ الجولة.
 *
 * ⚠️ مشترك عمداً. كل حكم جديد يُكتب خارجه ينسى شيئاً من هذه السبعة
 * (المؤقّت، الرسم، الحالة، تبديل السؤال، فحص نهاية الجولة، الدور، البثّ)
 * فيظهر العطل بعد جولات لا عند الضغطة.
 *
 * @param {('A'|'B'|'blocked'|null)} owner مالك الخلية بعد الحكم
 * @param {boolean} scored هل كُسبت نقطة؟ (الصوت وحده يتبعه)
 */
function settleQuestion(owner, scored) {
  stopTimer();

  const index = Game.activeCell;
  const answering = Game.turn;

  Game.owners[index] = owner;
  if (scored) Sound.correct(); else Sound.wrong();

  Game.activeCell = null;
  Game.picked = null;
  Game.deadline = 0;
  UI.closeQuestion();
  UI.paintCell(index);
  UI.renderStatus();

  // قاعدة «تبقى متاحة» تترك الخلية بلا مالك. سؤالها عُرض وكُشفت إجابته،
  // فنبدّله حتى لا تكون الفتحة التالية مجرد إعادة لما سمعه الجميع.
  if (Game.owners[index] === null) refreshQuestion(index);

  const finished = checkRoundEnd();
  if (!finished) {
    Game.turn = otherTeam(answering);
    UI.renderStatus();
    UI.applyRole();
  }
  // بثّة واحدة بعد استقرار الحالة — سواء انتهت الجولة أم تبدّل الدور
  Online.publish();
}

/**
 * @returns {boolean} هل انتهت الجولة؟
 */
function checkRoundEnd() {
  for (const team of ['A', 'B']) {
    const path = Hive.findWinningPath(
      Game.cells, Game.owners, team, Game.axis[team], Game.rows, Game.cols
    );
    if (path) {
      Game.winner = team;
      Game.winPath = path;
      return endRound();
    }
  }

  // لا فائز بعد. هل بقيت خلايا يمكن اللعب عليها؟
  const playable = Game.owners.some(o => o === null);
  if (!playable) {
    // يحدث فقط مع قاعدة «تُقفل الخلية» حيث تختفي خلايا من الطرفين.
    // اللوحة المعبّأة بالكامل بفريقين تضمن فائزاً واحداً دائماً
    // (تم التحقق بمحاكاة 200,000 لوحة: صفر تعادل).
    const a = Hive.countCells(Game.owners, 'A');
    const b = Hive.countCells(Game.owners, 'B');
    Game.winner = a === b ? null : (a > b ? 'A' : 'B');
    Game.winPath = null;
    return endRound();
  }

  return false;
}

function endRound() {
  Game.phase = 'round-over';
  stopTimer();
  if (Game.winner) Game.wins[Game.winner] += 1;
  Sound.win();
  UI.showRoundResult();
  return true;
}

function nextRound() {
  if (!Online.isJudge()) return;
  const needed = Math.floor(SETTINGS.rounds / 2) + 1;

  // نُنهي المباراة مبكراً لو حسم أحدهم أغلبية الجولات
  if (Game.wins.A >= needed || Game.wins.B >= needed || Game.round >= SETTINGS.rounds) {
    endMatch();
  } else {
    startRound();
  }
}

function endMatch() {
  Game.phase = 'match-over';
  UI.showMatchResult();
  Online.publish('ended');
}
