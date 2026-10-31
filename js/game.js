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
  // host = يُقال بصوت عالٍ ويحكم المقدّم | choices = أربعة اختيارات تُصحَّح آلياً
  // ⚠️ الافتراضي المحلي «المقدّم يحكم» عمداً: الإجابة الحرّة بصوت عالٍ هي روح
  // خلية الحروف، والتعرّف على إجابة من أربع أسهل بكثير من استحضارها. أما
  // الأونلاين فيبدأ بالاختيارات (`Online.create`) لأنه لا يفترض مكالمة.
  answerMode: 'host',
  // مستوى أسئلة كل فريق: easy | medium | hard | mixed. لكل فريق مستواه حتى
  // يلعب الأطفال ضد الكبار — كل فريق يُسأل بمستواه حين يكون الدور له.
  levelA: 'mixed',
  levelB: 'mixed',
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

let BANK = {};        // { 'ب': [{q,a,d,choices,alt,cat}, ...], ... }

/* ذاكرة الأسئلة التي **عُرضت** فعلاً، محفوظة بين المباريات.
   كانت تُصفَّر مع كل مباراة، فتبدأ الإعادة في الليلة الثانية من اللعب.
   والمفتاح نصّ السؤال لا رقمه: الرقم يتغيّر كلما أُضيف سؤال للبنك.
   ⚠️ «عُرض» لا «سُحب»: الخلية التي لم تُفتح لا تستهلك سؤالاً. */
const SEEN_KEY = 'huroof_seen';
let SEEN = loadJSON(SEEN_KEY, {});   // { 'ب': ['نص سؤال', ...] }

function markSeen(q) {
  if (!q || !q.letter || !q.q) return;
  const list = SEEN[q.letter] || (SEEN[q.letter] = []);
  if (list.includes(q.q)) return;
  list.push(q.q);
  saveJSON(SEEN_KEY, SEEN);
}

/* المستويات المسموحة لكل اختيار، بترتيب التفضيل. «سهل» لا ينزلق إلى
   الأصعب إلا إن خلا الحرف من السهل تماماً — طفل يُعاد عليه سؤال سهل
   أهون من طفل يُسأل سؤالاً صعباً. */
const LEVEL_TIERS = {
  easy:   [[1], [2]],
  medium: [[2], [1, 3]],
  hard:   [[3], [2]],
  mixed:  [[1, 2, 3]],
};
function teamLevel(t) { return SETTINGS[t === 'A' ? 'levelA' : 'levelB'] || 'mixed'; }

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
 * يسحب سؤالاً لهذا الحرف بمستوى الفريق، مفضّلاً ما لم يُعرض قط.
 *
 * يُستدعى **عند فتح الخلية** لا عند بداية الجولة: فلا تستهلك الخلايا التي
 * لا يفتحها أحد أسئلة، ويُعرف حينها من يجيب فيُختار مستواه.
 *
 * لو عُرضت كل أسئلة المستوى نعيد تدوير ذلك المستوى وحده — لا ننسى ذاكرة
 * الحرف كلها، ولا نقفز لمستوى آخر ما دام في المستوى أسئلة.
 *
 * @param {string} letter
 * @param {string} [level] easy | medium | hard | mixed
 * @param {string} [avoid] نص سؤال لا يُعاد (عند «سؤال آخر»)
 */
function drawQuestion(letter, level, avoid) {
  const list = BANK[letter];
  if (!list || !list.length) return null;

  const seen = new Set(SEEN[letter] || []);
  const tiers = LEVEL_TIERS[level] || LEVEL_TIERS.mixed;
  const levelOf = q => q.d || 2;   // ما قبل المستويات كان كله متوسطاً

  for (const ds of tiers) {
    const pool = list.map((_, i) => i).filter(i => ds.includes(levelOf(list[i])));
    if (!pool.length) continue;

    let fresh = pool.filter(i => !seen.has(list[i].q) && list[i].q !== avoid);
    if (!fresh.length) {
      // المستوى نفد: ننسى ذاكرته هو فقط ونبدأ دورة جديدة فيه
      const tierQs = new Set(pool.map(i => list[i].q));
      SEEN[letter] = (SEEN[letter] || []).filter(t => !tierQs.has(t));
      saveJSON(SEEN_KEY, SEEN);
      fresh = pool.filter(i => list[i].q !== avoid);
      if (!fresh.length) fresh = pool;
    }

    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    const q = Object.assign({ letter }, list[pick]);
    q.options = buildOptions(q, list);
    return q;
  }
  return null;
}

/** توحيد كتابة الإجابة للمقارنة: بلا «ال» وبلا فروق الهمزة والتاء المربوطة */
function normalizeAnswer(s) {
  // «ال» تُنزع قبل توحيد الهمزة، وإلا صارت «ألمنيوم» «المنيوم» فتُنزع منها
  return String(s || '').trim()
    .replace(/[\u064B-\u0652\u0640]/g, '')   // التشكيل والتطويل
    .replace(/^ال(?=..)/, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
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
  picked: null,       // رقم الاختيار في وضع الاختيارات، و-1 = «لا نعرف»
  firstVertical: 'A', // من أخذ العمودي في الجولة الأولى — قرعة عند بدء المباراة
  // لماذا انتهت الجولة: path = وصل · count = لا أحد يستطيع الوصل فحُسمت
  // بعدد الخلايا · draw = تعادل في العدد. يحتاجها إعلان الجولة ليقول الصدق.
  roundReason: null,
};

/* ------------------------------------------------- حفظ الحالة واستعادتها */

/* الحالة كلها كنص JSON واحد. يستعملها ثلاثة: البثّ أونلاين، وحفظ المباراة
   المحلية، والتراجع عن آخر حكم. مصدر واحد حتى لا ينسى أحدها حقلاً جديداً.
   ⚠️ لا `timerId` (مؤقّت محلي) ولا `timeLeft` (يُشتقّ من `deadline`). */
const GAME_FIELDS = ['phase', 'round', 'wins', 'rows', 'cols', 'cells', 'owners',
  'letters', 'questions', 'axis', 'turn', 'activeCell', 'answerShown', 'picked',
  'winner', 'winPath', 'deadline', 'firstVertical', 'roundReason'];

function serializeGame() {
  const out = {};
  GAME_FIELDS.forEach(k => { out[k] = Game[k]; });
  return JSON.parse(JSON.stringify(out));
}

function restoreGame(state) {
  GAME_FIELDS.forEach(k => { if (k in state) Game[k] = state[k]; });
  if (Game.picked === undefined) Game.picked = null;
  Game.deadline = Game.deadline || 0;
}

/* ------------------------------------------------- المباراة المحلية المحفوظة */

/* تحديث الصفحة كان يمسح المباراة بلا تحذير. نحفظها بعد كل حكم فتُستأنف
   من الرئيسية. المحلي وحده: الأونلاين له جدوله وعودته التلقائية. */
const MATCH_KEY = 'huroof_match';

function saveLocalMatch() {
  if (Online.active()) return;
  if (Game.phase !== 'playing' && Game.phase !== 'round-over') { clearLocalMatch(); return; }
  saveJSON(MATCH_KEY, { at: Date.now(), game: serializeGame(), settings: SETTINGS });
}
function clearLocalMatch() { try { localStorage.removeItem(MATCH_KEY); } catch (e) {} }
function savedLocalMatch() {
  const m = loadJSON(MATCH_KEY, null);
  if (!m || !m.game || !m.game.cells || !m.game.cells.length) return null;
  return m;
}

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
  // من يأخذ العمودي أولاً قرعة — كان الفريق الأول دائماً، فيأخذه في
  // الجولتين الأولى والثالثة من ثلاث
  Game.firstVertical = coin();
  lastVerdict = null;
  Sound.start();
  startRound();
}

/** قرعة عادلة بين الفريقين */
function coin() { return Math.random() < 0.5 ? 'A' : 'B'; }

function startRound() {
  Game.round += 1;
  Game.rows = SETTINGS.size;
  Game.cols = SETTINGS.size;
  Game.cells = Hive.buildBoard(Game.rows, Game.cols);
  Game.owners = Game.cells.map(() => null);
  Game.winner = null;
  Game.winPath = null;
  Game.roundReason = null;
  Game.activeCell = null;
  Game.phase = 'playing';
  lastVerdict = null;
  // إعلان الجولة السابقة كان يُخفى بزرّ «الجولة التالية» وحده، فكل طريق
  // آخر للجولة الجديدة يتركه مفتوحاً فوق اللوحة — بل فوق الرئيسية أحياناً
  UI.hideRoundResult();
  UI.hideUndo();

  // ترتيب الحروف عشوائي في كل جولة — هذا مطلب أساسي في اللعبة.
  // والأسئلة تُسحب عند فتح كل خلية (`selectCell`) لا هنا.
  Game.letters = pickLetters(Game.cells.length);
  Game.questions = Game.letters.map(() => null);

  /* الاتجاهات: اللوحة المربعة تعطي العمودي أفضلية ~3% لأن السداسيات تتداخل
     رأسياً. التبديل كل جولة يلغيها على عدد زوجي من الجولات — أما الجولة
     الحاسمة (التعادل في آخر جولة ممكنة) فالتبديل وحده يعطيها لصاحب الجولة
     الأولى مرة ثانية، فتُحسم بقرعة. */
  const decider = Game.round > 1 && Game.round === SETTINGS.rounds &&
                  Game.wins.A === Game.wins.B;
  let vertical;
  if (decider) vertical = coin();
  else if (SETTINGS.swapSides && Game.round % 2 === 0) vertical = otherTeam(Game.firstVertical);
  else vertical = Game.firstVertical;
  Game.axis = vertical === 'A'
    ? { A: 'vertical',   B: 'horizontal' }
    : { A: 'horizontal', B: 'vertical' };

  // من يبدأ: الجولة الأولى قرعة، وبعدها يبدأ المتأخّر، وعند التعادل قرعة
  // — كانت تذهب للفريق الأول دائماً، أي في كل جولة حاسمة
  if (Game.round === 1 || Game.wins.A === Game.wins.B) {
    Game.turn = coin();
  } else {
    Game.turn = Game.wins.A > Game.wins.B ? 'B' : 'A';
  }

  Game.activeCell = null;
  Game.picked = null;
  Game.answerShown = false;
  Game.deadline = 0;
  UI.renderRound();
  UI.applyRole();
  saveLocalMatch();
  Online.publish('playing');
}

/* ------------------------------------------------------------- اللعب */

function selectCell(index) {
  if (Game.phase !== 'playing') return;
  if (Game.activeCell !== null) return;             // سؤال مفتوح بالفعل
  if (Game.owners[index] !== null) return;          // الخلية مأخوذة

  // أونلاين: الاختيار لمن عليه الدور. المنع هنا لا في ui.js — ui لا يقرّر.
  if (!Online.canPick()) { uiToast(Online.whyCannotPick()); return; }

  // السؤال يُسحب الآن، بمستوى الفريق الذي سيجيب
  if (!Game.questions[index]) {
    Game.questions[index] = drawQuestion(Game.letters[index], teamLevel(Game.turn));
  }
  markSeen(Game.questions[index]);
  lastVerdict = null;   // حكم جديد قادم — التراجع عن السابق لم يعد منطقياً
  UI.hideUndo();

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
    if (Game.answerShown) return;       // الإجابة كُشفت — الحكم للمقدّم لا للساعة
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

/**
 * ⚠️ يوقف المؤقّت. المؤقّت يحدّ وقت **الإجابة** لا وقت حكم المقدّم: كان
 * يواصل العدّ بعد الكشف فيحكم بالخطأ وحده عند الصفر والعائلة ما زالت
 * تتناقش هل «الهادئ» تُقبل عن «المحيط الهادئ».
 */
function revealAnswer() {
  if (!Online.isJudge()) return;
  if (SETTINGS.answerMode === 'choices') return;   // الاختيارات تكشف نفسها
  stopTimer();
  Game.deadline = 0;
  UI.updateTimer(null);
  Game.answerShown = true;
  UI.showAnswer();
  Online.publish();
}

/**
 * «سؤال آخر»: يبدّل سؤال الخلية المفتوحة بسؤال جديد من نفس الحرف والمستوى،
 * والخلية تبقى مفتوحة والدور كما هو. للسؤال الغامض أو غير المناسب
 * للجالسين — كان الحلّ الوحيد إغلاق الخلية والتظاهر بأنها لم تُفتح.
 */
function replaceQuestion() {
  if (Game.activeCell === null || !Online.isJudge()) return;
  if (Game.picked !== null) return;   // اختاروا — الحكم جارٍ
  const index = Game.activeCell;
  const old = Game.questions[index];
  const next = drawQuestion(Game.letters[index], teamLevel(Game.turn), old && old.q);
  if (!next) return;
  Game.questions[index] = next;
  markSeen(next);
  Game.answerShown = false;
  Game.deadline = SETTINGS.timer ? Date.now() + SETTINGS.timer * 1000 : 0;
  UI.openQuestion(index);
  UI.applyRole();
  startTimer();
  Online.publish();
}

/**
 * يغلق السؤال ويعيد الخلية كما كانت بلا حكم ولا تبديل دور.
 * موجود لأن المقدّم قد يفتح خلية بالخطأ. سؤالها عُرض فيُنسى، والفتحة
 * التالية تسحب غيره.
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
  Game.questions[index] = null;
  UI.closeQuestion();
  saveLocalMatch();
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

  // -1 = «لا نعرف»: استسلام صريح بدل انتظار الثلاثين ثانية كاملة
  const q = Game.questions[Game.activeCell];
  if (!q || !q.options || !(i === -1 || (i >= 0 && i < q.options.length))) return;

  Game.picked = i;
  stopTimer();
  UI.showPick();
  Online.publish();
  settlePick();
}

/** هل الاختيار المضغوط هو الإجابة؟ */
function pickIsCorrect() {
  const q = Game.questions[Game.activeCell];
  return !!q && Game.picked >= 0 && q.options[Game.picked] === q.a;
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

  // لقطة قبل أي تغيير — للتراجع. ضغطة خاطئة كانت تسلّم خلية، بل قد تُنهي
  // الجولة، بلا أي رجعة.
  lastVerdict = serializeGame();

  const index = Game.activeCell;
  const answering = Game.turn;

  Game.owners[index] = owner;
  if (scored) Sound.correct(); else Sound.wrong();

  Game.activeCell = null;
  Game.picked = null;
  Game.answerShown = false;
  Game.deadline = 0;
  UI.closeQuestion();
  UI.paintCell(index);
  UI.renderStatus();
  UI.flashVerdict(index, owner, answering);

  // قاعدة «تبقى متاحة» تترك الخلية بلا مالك. سؤالها عُرض وكُشفت إجابته،
  // فنُفرغها لتسحب الفتحة التالية سؤالاً جديداً.
  if (Game.owners[index] === null) Game.questions[index] = null;

  const finished = checkRoundEnd();
  if (!finished) {
    Game.turn = otherTeam(answering);
    UI.renderStatus();
    UI.applyRole();
  }
  saveLocalMatch();
  if (Online.isJudge()) UI.offerUndo();
  // بثّة واحدة بعد استقرار الحالة — سواء انتهت الجولة أم تبدّل الدور
  Online.publish();
}

/* ------------------------------------------------------------- التراجع */

let lastVerdict = null;   // حالة اللعبة قبل آخر حكم، أو null

/** هل يوجد حكم يمكن التراجع عنه؟ للمقدّم وحده */
function canUndo() { return !!lastVerdict && Online.isJudge(); }

/**
 * يُرجع آخر حكم: الخلية تعود متاحة، والسؤال يُفتح من جديد كما كان،
 * والدور لصاحبه — حتى لو كان الحكم قد أنهى الجولة.
 * للمقدّم وحده، ولآخر حكم فقط، وقبل فتح أي خلية بعده.
 */
function undoVerdict() {
  if (!Online.isJudge() || !lastVerdict) return;
  const before = lastVerdict;
  lastVerdict = null;

  stopTimer();
  restoreGame(before);
  Game.picked = null;      // في الاختيارات: يعيدون الاختيار (ضغطة طفل بالخطأ)
  Game.deadline = 0;       // لا ساعة بعد التراجع — المقدّم يحكم على مهل
  UI.hideRoundResult();
  UI.hideUndo();
  UI.renderRound();

  if (Game.activeCell !== null) {
    UI.openQuestion(Game.activeCell);
    if (Game.answerShown) UI.showAnswer();
    UI.updateTimer(null);
  }
  UI.applyRole();
  saveLocalMatch();
  Online.publish('playing');
}

/** هل ما زال هذا الفريق قادراً على الوصل لو أخذ كل ما بقي متاحاً؟ */
function canStillConnect(team) {
  const hypothetical = Game.owners.map(o => o === null ? team : o);
  return !!Hive.findWinningPath(
    Game.cells, hypothetical, team, Game.axis[team], Game.rows, Game.cols);
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
      Game.roundReason = 'path';
      return endRound();
    }
  }

  /* لا فائز بعد. هل ما زال الوصل ممكناً لأحد؟
     مع قاعدة «تُقفل الخلية» تنقطع الطرق من الطرفين قبل أن تمتلئ اللوحة
     بكثير — في 90% من الجولات المحاكاة — وكانت اللعبة تواصل سبعة أسئلة
     في المتوسط لا معنى لها. الآن تُحسم لحظة يستحيل الوصل على الفريقين.
     (اللوحة بلا خلايا مقفلة تضمن وصل أحدهما دائماً — 200,000 لوحة.) */
  const playable = Game.owners.some(o => o === null);
  if (!playable || (!canStillConnect('A') && !canStillConnect('B'))) {
    const a = Hive.countCells(Game.owners, 'A');
    const b = Hive.countCells(Game.owners, 'B');
    Game.winner = a === b ? null : (a > b ? 'A' : 'B');
    Game.winPath = null;
    Game.roundReason = a === b ? 'draw' : 'count';
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
  lastVerdict = null;
  UI.hideUndo();
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
  clearLocalMatch();
  UI.showMatchResult();
  Online.publish('ended');
}
