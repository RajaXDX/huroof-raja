/* ==========================================================================
   game.js — حالة اللعبة ومنطق الجولات والأدوار
   --------------------------------------------------------------------------
   هذا الملف يقرّر «ماذا يحدث». الرسم كله في ui.js.
   الفصل مقصود: لو أضفنا لاحقاً وضع أونلاين، هذا الملف هو ما يُزامَن.
   ========================================================================== */

/* ------------------------------------------------------------ الإعدادات */

const COLOR_PRESETS = [
  { name: 'أخضر',    value: '#3FA796' },
  { name: 'ذهبي',    value: '#D4AF37' },
  { name: 'برتقالي', value: '#E8833A' },
  { name: 'أزرق',    value: '#4A90D9' },
  { name: 'أحمر',    value: '#D9534F' },
  { name: 'بنفسجي',  value: '#8E6FD6' },
  { name: 'وردي',    value: '#E06C9F' },
  { name: 'فيروزي',  value: '#2FC4B2' },
];

const DEFAULT_SETTINGS = {
  teamA: { name: 'الفريق الأول', color: '#3FA796' },
  teamB: { name: 'الفريق الثاني', color: '#E8833A' },
  size: 5,              // اللوحة size × size
  rounds: 3,            // عدد الجولات (فردي حتى لا تنتهي المباراة بتعادل)
  timer: 30,            // ثواني لكل سؤال، 0 = بلا مؤقت
  wrongRule: 'opponent',// opponent = الخلية للفريق الآخر | block = تُقفل | free = تبقى متاحة
  swapSides: true,      // تبديل الاتجاهات كل جولة (يلغي أفضلية الاتجاه العمودي)
  sound: true,
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS, loadJSON('huroof_settings', {}));

function saveSettings() {
  saveJSON('huroof_settings', SETTINGS);
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
  return Object.assign({ letter }, list[pick]);
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
  answerShown: false,
};

function teamName(t)  { return t === 'A' ? SETTINGS.teamA.name : SETTINGS.teamB.name; }
function teamColor(t) { return t === 'A' ? SETTINGS.teamA.color : SETTINGS.teamB.color; }
function otherTeam(t) { return t === 'A' ? 'B' : 'A'; }

/* --------------------------------------------------------- بدء المباراة */

function startMatch() {
  if (!Object.keys(BANK).length) {
    uiToast('بنك الأسئلة لم يُحمَّل. تأكد أنك تشغّل اللعبة عبر خادم وليس بفتح الملف مباشرة.');
    return;
  }

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

  UI.renderRound();
}

/* ------------------------------------------------------------- اللعب */

function selectCell(index) {
  if (Game.phase !== 'playing') return;
  if (Game.activeCell !== null) return;             // سؤال مفتوح بالفعل
  if (Game.owners[index] !== null) return;          // الخلية مأخوذة

  Game.activeCell = index;
  Game.answerShown = false;
  Sound.open();
  UI.openQuestion(index);
  startTimer();
}

function startTimer() {
  stopTimer();
  if (!SETTINGS.timer) { UI.updateTimer(null); return; }

  Game.timeLeft = SETTINGS.timer;
  UI.updateTimer(Game.timeLeft);

  Game.timerId = setInterval(() => {
    Game.timeLeft -= 1;
    UI.updateTimer(Game.timeLeft);
    if (Game.timeLeft <= 5 && Game.timeLeft > 0) Sound.tick();
    if (Game.timeLeft <= 0) {
      stopTimer();
      uiToast('انتهى الوقت!');
      resolveAnswer(false);
    }
  }, 1000);
}

function stopTimer() {
  if (Game.timerId) clearInterval(Game.timerId);
  Game.timerId = null;
}

function revealAnswer() {
  Game.answerShown = true;
  UI.showAnswer();
}

/**
 * يُنهي السؤال المفتوح ويوزّع الخلية حسب النتيجة والقاعدة المختارة.
 */
function resolveAnswer(correct) {
  if (Game.activeCell === null) return;
  stopTimer();

  const index = Game.activeCell;
  const answering = Game.turn;

  if (correct) {
    Game.owners[index] = answering;
    Sound.correct();
  } else {
    if (SETTINGS.wrongRule === 'opponent') {
      Game.owners[index] = otherTeam(answering);
    } else if (SETTINGS.wrongRule === 'block') {
      Game.owners[index] = 'blocked';
    }
    // 'free' تترك الخلية null فتبقى متاحة
    Sound.wrong();
  }

  Game.activeCell = null;
  UI.closeQuestion();
  UI.paintCell(index);
  UI.renderStatus();

  const finished = checkRoundEnd();
  if (!finished) {
    Game.turn = otherTeam(answering);
    UI.renderStatus();
  }
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
}
