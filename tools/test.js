/* ==========================================================================
   test.js — اختبارات اللعبة في متصفح حقيقي
   --------------------------------------------------------------------------
   لا يوجد إطار اختبارات في المشروع، والتحقق كان يدوياً من كونسول المتصفح.
   المشكلة أن المتصفح يخبّئ الملفات، فتُقرأ نسخة قديمة ويبدو التعديل بلا أثر
   — ضاع وقت طويل في مطاردة ذلك مرتين.

   Puppeteer يفتح ملفاً شخصياً نظيفاً بلا كاش في كل تشغيل، فما يُقاس هنا هو
   الكود الموجود على القرص فعلاً.

   تشغيل:
     python -m http.server 8177 --bind 127.0.0.1     (في نافذة أخرى)
     node tools/test.js
   ========================================================================== */

const puppeteer = require('puppeteer');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8177';

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++; failures.push(name);
    console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`);
  }
}

/* يبدأ مباراة جديدة بلا نافذة «عندكم مباراة جارية؟». `beginMatch` تسأل قبل
   أن تمسح مباراة قائمة، والاختبارات تبدأ مباريات متتالية عمداً. */
const FRESH = "Game.phase='idle'; beginMatch();";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; failures.push('خطأ JS: ' + e.message); });
  // نافذة «مغادرة الصفحة؟» أثناء مباراة — نقبلها في اختبار إعادة التحميل
  page.on('dialog', d => d.accept());

  await page.setCacheEnabled(false);
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    "typeof bankStats === 'function' && bankStats().total > 0", { timeout: 15000 });
  // ذاكرة الأسئلة ومباراة محفوظة من تشغيل سابق تُفسد المقارنات
  await page.evaluate(() => {
    localStorage.removeItem('huroof_seen'); localStorage.removeItem('huroof_match');
    eval("SEEN = {};");
  });

  /* ---------------------------------------------------- بنك الأسئلة */
  console.log('\nبنك الأسئلة');
  const bank = await page.evaluate(() => {
    const first = a => {
      let s = a.trim();
      if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
      return 'أإآا'.includes(s[0]) ? 'ا' : s[0];
    };
    let bad = 0, total = 0, badChoices = 0, thin = 0, giveaway = 0, noLevel = 0;
    const qs = new Set();
    for (const [letter, items] of Object.entries(BANK)) {
      if (items.length < 30) thin++;
      for (const it of items) {
        total++; qs.add(it.q);
        if (first(it.a) !== letter) bad++;
        if (![1, 2, 3].includes(it.d)) noLevel++;
        // الخيارات الخاطئة: ثلاثة، تبدأ بالحرف، ولا يطابق أيّها الإجابة
        const ch = it.choices || [];
        const norm = new Set([it.a].concat(ch).map(normalizeAnswer));
        if (ch.length !== 3 || norm.size !== 4 ||
            ch.some(c => first(c) !== letter)) badChoices++;
        // الإجابة كلمة واحدة وخياران خاطئان هما الكلمة نفسها مع إضافة
        // («ظرف» بين «ظرف زمان» و«ظرف مكان») — تُعرف بلا معرفة
        if (it.a.trim().split(/\s+/).length === 1 &&
            ch.filter(c => c.split(/\s+/)[0] === it.a.trim() && c.split(/\s+/).length > 1).length >= 2) giveaway++;
      }
    }
    return { letters: Object.keys(BANK).length, total, bad, badChoices, thin, giveaway, noLevel,
             unique: qs.size };
  });
  check('28 حرفاً', bank.letters === 28, `وجد ${bank.letters}`);
  check('30 سؤالاً على الأقل لكل حرف', bank.thin === 0, `${bank.thin} حرف ناقص`);
  check('كل إجابة تبدأ بحرفها', bank.bad === 0, `${bank.bad} مخالفة`);
  check('ثلاثة خيارات خاطئة صالحة لكل سؤال', bank.badChoices === 0, `${bank.badChoices} مخالفة`);
  check('لا خيارات تكشف الإجابة بشكلها', bank.giveaway === 0, `${bank.giveaway} سؤال`);
  check('لكل سؤال مستوى', bank.noLevel === 0, `${bank.noLevel} بلا مستوى`);
  check('لا سؤال مكرر', bank.unique === bank.total);

  /* ------------------------------------------------- سحب الأسئلة وذاكرتها */
  console.log('\nسحب الأسئلة وذاكرتها');

  const draw = await page.evaluate(async () => {
    const g = eval;
    const out = {};
    g("SETTINGS.timer=0; SETTINGS.size=5; SETTINGS.wrongRule='opponent'; SETTINGS.answerMode='host'; SETTINGS.levelA='mixed'; SETTINGS.levelB='mixed';");
    g("Game.phase='idle'; beginMatch();");
    // لا سؤال قبل الفتح: الخلايا التي لا تُفتح لا تستهلك البنك
    out.lazy = Game.questions.every(q => q === null);
    selectCell(0);
    out.onOpen = !!Game.questions[0] && Game.questions[0].letter === Game.letters[0];
    out.seenAfterOpen = (SEEN[Game.letters[0]] || []).includes(Game.questions[0].q);
    cancelQuestion();

    // الذاكرة تبقى بين المباريات: نفس الحرف لا يكرّر سؤالاً حتى ينفد
    const L = Object.keys(BANK).find(k => BANK[k].length >= 30);
    g("SEEN = {};");
    const got = [];
    for (let i = 0; i < 30; i++) {
      // مباراة جديدة كل خمس سحبات — كانت الذاكرة تُصفَّر هنا
      if (i % 5 === 0) g("Game.phase='idle'; beginMatch();");
      const q = drawQuestion(L, 'mixed'); markSeen(q); got.push(q.q);
    }
    out.acrossMatches = new Set(got).size;
    out.persisted = JSON.parse(localStorage.getItem('huroof_seen'))[L].length;
    return out;
  });
  check('لا يُسحب سؤال قبل فتح الخلية', draw.lazy);
  check('السؤال يُسحب عند الفتح وبحرف الخلية', draw.onOpen);
  check('السؤال المعروض يُحفظ في الذاكرة', draw.seenAfterOpen);
  check('30 سحبة عبر 6 مباريات بلا تكرار', draw.acrossMatches === 30, `وجد ${draw.acrossMatches} مختلفاً`);
  check('الذاكرة محفوظة في التخزين', draw.persisted === 30, `وجد ${draw.persisted}`);

  /* ---------------------------------------------------------- المستوى */
  console.log('\nمستوى كل فريق');
  const lvl = await page.evaluate(() => {
    const g = eval;
    g("SEEN = {};");
    const levels = { easy: new Set(), hard: new Set() };
    for (const L of Object.keys(BANK)) {
      for (let i = 0; i < 4; i++) levels.easy.add(drawQuestion(L, 'easy').d);
      const hasHard = BANK[L].some(q => q.d === 3);
      const d = drawQuestion(L, 'hard').d;
      levels.hard.add(hasHard ? d : 'fallback-' + d);
    }
    // الفريق يُسأل بمستواه هو حين يكون الدور له
    g("SETTINGS.levelA='easy'; SETTINGS.levelB='hard'; SETTINGS.size=7; Game.phase='idle'; beginMatch();");
    const byTeam = { A: new Set(), B: new Set() };
    for (let i = 0; i < 20; i++) {
      const free = Game.owners.findIndex((o, k) => o === null && !Game.questions[k]);
      const t = Game.turn;
      selectCell(free);
      byTeam[t].add(Game.questions[free].d);
      cancelQuestion();
      Game.turn = otherTeam(Game.turn);
    }
    g("SETTINGS.levelA='mixed'; SETTINGS.levelB='mixed';");
    return { easy: [...levels.easy], hard: [...levels.hard], A: [...byTeam.A], B: [...byTeam.B] };
  });
  check('«سهل» لا يعطي إلا سهلاً', lvl.easy.length === 1 && lvl.easy[0] === 1, JSON.stringify(lvl.easy));
  check('«صعب» صعب، أو متوسط إن خلا الحرف من الصعب', lvl.hard.every(d => d === 3 || d === 'fallback-2'), JSON.stringify(lvl.hard));
  check('كل فريق يُسأل بمستواه', lvl.A.every(d => d === 1) && lvl.B.every(d => d === 3 || d === 2),
        `A ${JSON.stringify(lvl.A)} B ${JSON.stringify(lvl.B)}`);

  /* ------------------------------------------ تبديل السؤال غير المُجاب */
  console.log('\nتبديل السؤال حين لا يُجاب عليه');

  const refresh = await page.evaluate(async () => {
    const g = eval;
    const out = {};
    g("SETTINGS.timer=0; SETTINGS.size=5; SEEN = {};");

    // إغلاق بلا حكم ثم إعادة فتح
    g("SETTINGS.wrongRule='opponent'; Game.phase='idle'; beginMatch();");
    selectCell(0);
    const q1 = Game.questions[0].q, letter = Game.letters[0], turn = Game.turn;
    cancelQuestion();
    selectCell(0);
    const q2 = Game.questions[0].q;
    cancelQuestion();
    out.cancel = { changed: q1 !== q2, sameLetter: Game.letters[0] === letter,
                   free: Game.owners[0] === null, sameTurn: Game.turn === turn };

    // «سؤال آخر»: سؤال جديد والخلية مفتوحة والدور كما هو
    selectCell(2);
    const r1 = Game.questions[2].q, rt = Game.turn;
    replaceQuestion();
    out.replace = { changed: Game.questions[2].q !== r1, open: Game.activeCell === 2,
                    sameTurn: Game.turn === rt, shown: document.getElementById('qText').textContent === Game.questions[2].q };
    cancelQuestion();

    // إجابة خاطئة مع قاعدة «تبقى متاحة»
    g("SETTINGS.wrongRule='free'; Game.phase='idle'; beginMatch();");
    selectCell(3);
    const a1 = Game.questions[3].q;
    resolveAnswer(false);
    selectCell(3);
    const a2 = Game.questions[3].q;
    cancelQuestion();
    out.wrongFree = { changed: a1 !== a2, free: Game.owners[3] === null };

    // انتهاء الوقت يمر بنفس المسار
    g("SETTINGS.wrongRule='free'; SETTINGS.timer=1; Game.phase='idle'; beginMatch();");
    selectCell(7);
    const t1 = Game.questions[7].q;
    await new Promise(r => setTimeout(r, 1500));
    const freeAfter = Game.owners[7] === null;
    g("SETTINGS.timer=0;");
    selectCell(7);
    out.timeout = { changed: t1 !== Game.questions[7].q, free: freeAfter };
    cancelQuestion();

    // إجابة صحيحة: الخلية تُؤخذ وسؤالها يبقى عليها
    g("SETTINGS.wrongRule='opponent'; Game.phase='idle'; beginMatch();");
    selectCell(5);
    const b1 = Game.questions[5].q;
    resolveAnswer(true);
    out.correct = { kept: b1 === Game.questions[5].q, owned: Game.owners[5] !== null };

    // عشرة إغلاقات متتالية على نفس الخلية
    g("Game.phase='idle'; beginMatch();");
    const seen = [];
    for (let i = 0; i < 10; i++) {
      selectCell(1); seen.push(Game.questions[1].q); cancelQuestion();
    }
    out.repeat = { distinct: new Set(seen).size, letter: Game.letters[1] };

    return out;
  });

  check('الإغلاق ثم الفتح يعطي سؤالاً جديداً', refresh.cancel.changed);
  check('الإغلاق لا يغيّر الحرف ولا الدور', refresh.cancel.sameLetter && refresh.cancel.sameTurn);
  check('الإغلاق يُبقي الخلية متاحة', refresh.cancel.free);
  check('«سؤال آخر» يبدّل السؤال والخلية مفتوحة والدور كما هو',
        refresh.replace.changed && refresh.replace.open && refresh.replace.sameTurn && refresh.replace.shown);
  check('الخطأ مع «تبقى متاحة» يبدّل السؤال', refresh.wrongFree.changed && refresh.wrongFree.free);
  check('انتهاء الوقت يبدّل السؤال', refresh.timeout.changed && refresh.timeout.free);
  check('الإجابة الصحيحة لا تهدر سؤالاً', refresh.correct.kept && refresh.correct.owned);
  check('10 إغلاقات تعطي 10 أسئلة مختلفة',
        refresh.repeat.distinct === 10, `وجد ${refresh.repeat.distinct} للحرف ${refresh.repeat.letter}`);

  /* ------------------------------------------------ المؤقّت والمفاتيح */
  console.log('\nالمؤقّت ومفاتيح المقدّم');
  const keys = await page.evaluate(async () => {
    const g = eval;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const press = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const out = {};
    g("SETTINGS.answerMode='host'; SETTINGS.wrongRule='opponent'; SETTINGS.timer=1; Game.phase='idle'; beginMatch();");

    // الكشف يوقف المؤقّت، والصفر بعده لا يحكم
    selectCell(0);
    revealAnswer();
    out.stopped = Game.timerId === null && Game.deadline === 0;
    await wait(1500);
    out.noAutoJudge = Game.activeCell === 0 && Game.owners[0] === null;
    cancelQuestion();

    // 1 و2 و3 لا تفعل شيئاً قبل الكشف
    g("SETTINGS.timer=0;");
    selectCell(1);
    press('1'); press('2'); press('3');
    out.keysBlocked = Game.activeCell === 1 && Game.owners[1] === null;
    // وبعد الكشف تعمل
    press(' ');
    const t = Game.turn;
    press('1');
    out.keysAfter = Game.owners[1] === t && Game.activeCell === null;
    return out;
  });
  check('«اعرض الإجابة» يوقف المؤقّت', keys.stopped);
  check('انتهاء الوقت بعد الكشف لا يحكم وحده', keys.noAutoJudge);
  check('1 و2 و3 لا تعمل قبل الكشف', keys.keysBlocked);
  check('وبعد الكشف تعمل', keys.keysAfter);

  /* ------------------------------------------------------------- التراجع */
  console.log('\nالتراجع عن آخر حكم');
  const undo = await page.evaluate(async () => {
    const g = eval;
    const out = {};
    g("SETTINGS.answerMode='host'; SETTINGS.timer=0; SETTINGS.wrongRule='opponent'; SETTINGS.size=4; SETTINGS.rounds=3; Game.phase='idle'; beginMatch();");

    selectCell(0); revealAnswer();
    const turn = Game.turn, q = Game.questions[0].q;
    resolveAnswer(false);
    out.offered = document.getElementById('undoBar').classList.contains('show');
    undoVerdict();
    out.restored = Game.owners[0] === null && Game.turn === turn && Game.activeCell === 0 &&
                   Game.questions[0].q === q && Game.answerShown && UI.isQuestionOpen();
    resolveAnswer(true);
    out.rejudged = Game.owners[0] === turn;

    // تراجع عن حكم أنهى الجولة
    g("Game.phase='idle'; beginMatch();");
    let guard = 0;
    while (Game.phase === 'playing' && guard++ < 40) {
      const free = Game.owners.findIndex(o => o === null);
      selectCell(free); revealAnswer();
      // نعطي الخلايا كلها للفريق صاحب الدور حتى يصل أحدهما
      resolveAnswer(true);
    }
    const winsBefore = JSON.stringify(Game.wins);
    out.roundEnded = Game.phase === 'round-over';
    undoVerdict();
    out.roundUndone = Game.phase === 'playing' && Game.activeCell !== null &&
                      Game.wins.A + Game.wins.B === 0 && winsBefore !== JSON.stringify(Game.wins) &&
                      !document.getElementById('roundOverlay').classList.contains('show');

    // التراجع لا يعمل بعد فتح خلية جديدة
    resolveAnswer(true);
    if (Game.phase === 'round-over') nextRound();
    const f = Game.owners.findIndex(o => o === null);
    selectCell(f);
    out.expired = lastVerdict === null;
    cancelQuestion();
    return out;
  });
  check('يظهر زر التراجع بعد الحكم', undo.offered);
  check('التراجع يعيد الخلية والدور والسؤال نفسه مفتوحاً', undo.restored);
  check('ويُحكم من جديد', undo.rejudged);
  check('التراجع عن حكم أنهى الجولة يُرجعها', undo.roundEnded && undo.roundUndone);
  check('لا تراجع بعد فتح خلية جديدة', undo.expired);

  /* -------------------------------------------------- وضع الاختيارات */
  console.log('\nوضع الاختيارات');

  const mc = await page.evaluate(async () => {
    const g = eval;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    g("SETTINGS.timer=0; SETTINGS.size=5; SETTINGS.wrongRule='opponent'; SETTINGS.answerMode='choices'; Game.phase='idle'; beginMatch();");

    // كل سؤال يُفتح: أربعة اختيارات مختلفة بعد التوحيد، والإجابة بينها
    let okOpts = true;
    for (let i = 10; i < 20; i++) {
      selectCell(i);
      const q = Game.questions[i];
      okOpts = okOpts && q.options.length === 4 && q.options.includes(q.a) &&
               new Set(q.options.map(normalizeAnswer)).size === 4;
      cancelQuestion();
    }
    out.options = okOpts;

    // صحيح: الخلية لصاحب الدور
    selectCell(0);
    let t = Game.turn, q = Game.questions[0];
    out.buttons = document.querySelectorAll('#choiceRow button').length;
    chooseOption(q.options.indexOf(q.a));
    await wait(1800);
    out.right = Game.owners[0] === t && Game.activeCell === null;

    // خاطئ: للفريق الآخر، والضغطة الثانية لا تُحتسب
    selectCell(1);
    t = Game.turn; q = Game.questions[1];
    chooseOption(q.options.findIndex(o => o !== q.a));
    chooseOption(q.options.indexOf(q.a));
    await wait(1800);
    out.wrong = Game.owners[1] === otherTeam(t);

    // «لا نعرف»: خطأ صريح، والإجابة تُعرض
    selectCell(4);
    t = Game.turn;
    out.giveUpVisible = !document.getElementById('giveUpBtn').classList.contains('hidden');
    chooseOption(-1);
    out.giveUpHint = document.getElementById('qHint').textContent.includes(Game.questions[4].a);
    await wait(1800);
    out.giveUp = Game.owners[4] === otherTeam(t);

    // اختيار ضيف يصل في بثّة: المقدّم يسوّيه
    selectCell(2);
    t = Game.turn; q = Game.questions[2];
    const s = serializeGame();
    s.picked = q.options.indexOf(q.a); s.settings = null;
    Online.apply(s);
    await wait(1800);
    out.guest = Game.owners[2] === t;

    // الحكم اليدوي لا يتجاوز الاختيارات
    selectCell(3);
    revealAnswer();
    out.noReveal = !Game.answerShown;
    cancelQuestion();
    g("SETTINGS.answerMode='host';");
    return out;
  });

  check('أربعة اختيارات مختلفة والإجابة بينها', mc.options);
  check('أربعة أزرار تظهر', mc.buttons === 4, `وجد ${mc.buttons}`);
  check('الاختيار الصحيح يعطي الخلية لصاحب الدور', mc.right);
  check('الخاطئ يعطيها للآخر، والضغطة الثانية لا تُحتسب', mc.wrong);
  check('«لا نعرف» يُحتسب خطأً ويعرض الإجابة', mc.giveUpVisible && mc.giveUpHint && mc.giveUp);
  check('اختيار الضيف يسوّيه المقدّم', mc.guest);
  check('«اعرض الإجابة» معطّل في وضع الاختيارات', mc.noReveal);

  /* ------------------------------------------------------------ العدالة */
  console.log('\nالعدالة بين الفريقين');
  const fair = await page.evaluate(() => {
    const g = eval;
    g("SETTINGS.timer=0; SETTINGS.size=4; SETTINGS.rounds=3; SETTINGS.swapSides=true;");
    const N = 2000;
    let firstVertA = 0, tieStartA = 0, ties = 0, deciderVertA = 0, deciders = 0, alternates = 0;
    for (let i = 0; i < N; i++) {
      startMatch();
      if (Game.axis.A === 'vertical') firstVertA++;
      const r1 = Game.axis.A;
      // جولة ثانية بعد فوز كلٍّ بجولة → تعادل 1–1 ثم الحاسمة
      Game.wins = { A: 1, B: 0 }; startRound();
      if (Game.axis.A !== r1) alternates++;
      Game.wins = { A: 1, B: 1 }; startRound();
      ties++; if (Game.turn === 'A') tieStartA++;
      deciders++; if (Game.axis.A === 'vertical') deciderVertA++;
    }
    return { firstVertA: firstVertA / N, tieStartA: tieStartA / ties, deciderVertA: deciderVertA / deciders,
             alternates: alternates / N };
  });
  const near = (x) => x > 0.45 && x < 0.55;
  check('العمودي في الجولة الأولى قرعة (~50%)', near(fair.firstVertA), (fair.firstVertA * 100).toFixed(1) + '%');
  check('الجولة الثانية تبدّل الاتجاه', fair.alternates === 1, (fair.alternates * 100).toFixed(1) + '%');
  check('من يبدأ عند التعادل قرعة (~50%)', near(fair.tieStartA), (fair.tieStartA * 100).toFixed(1) + '% للأول');
  check('اتجاه الجولة الحاسمة قرعة (~50%)', near(fair.deciderVertA), (fair.deciderVertA * 100).toFixed(1) + '%');

  /* ------------------------------------------------ قاعدة «تُقفل الخلية» */
  console.log('\nقاعدة «تُقفل الخلية»');
  const block = await page.evaluate(() => {
    const g = eval;
    g("SETTINGS.timer=0; SETTINGS.size=5; SETTINGS.rounds=1; SETTINGS.wrongRule='block'; SETTINGS.answerMode='host';");
    let rounds = 0, stuckQuestions = 0, endedEarly = 0, wrongWinner = 0;
    for (let m = 0; m < 300; m++) {
      g("Game.phase='idle'; beginMatch();");
      let guard = 0;
      while (Game.phase === 'playing' && guard++ < 60) {
        // بعد أن يستحيل الوصل على الفريقين، أي سؤال إضافي هدر
        if (!canStillConnect('A') && !canStillConnect('B')) stuckQuestions++;
        const free = Game.owners.map((o, i) => o === null ? i : -1).filter(i => i >= 0);
        selectCell(free[Math.floor(Math.random() * free.length)]);
        resolveAnswer(Math.random() < 0.45);
      }
      rounds++;
      if (Game.owners.some(o => o === null)) endedEarly++;
      if (Game.roundReason === 'count') {
        const a = Hive.countCells(Game.owners, 'A'), b = Hive.countCells(Game.owners, 'B');
        if ((a > b ? 'A' : 'B') !== Game.winner) wrongWinner++;
      }
    }
    g("SETTINGS.wrongRule='opponent'; SETTINGS.rounds=3;");
    return { rounds, stuckQuestions, endedEarly, wrongWinner };
  });
  check('لا سؤال واحد بعد أن يستحيل الوصل', block.stuckQuestions === 0, `${block.stuckQuestions} سؤال هدر`);
  check('الجولة المسدودة تُحسم قبل امتلاء اللوحة', block.endedEarly > 0, `${block.endedEarly} من ${block.rounds}`);
  check('الحسم بالعدد يعطي الأكثر خلايا', block.wrongWinner === 0);

  /* ------------------------------------------------------- المباريات */
  console.log('\nمباريات كاملة');
  const matches = await page.evaluate(() => {
    const g = eval;
    g("SETTINGS.timer=0; SETTINGS.size=5; SETTINGS.wrongRule='opponent';");
    let done = 0, qs = 0;
    for (let m = 0; m < 100; m++) {
      startMatch();
      let guard = 0;
      while (Game.phase !== 'match-over' && guard++ < 900) {
        if (Game.phase === 'round-over') { nextRound(); continue; }
        const free = Game.owners.map((o, i) => o === null ? i : -1).filter(i => i >= 0);
        selectCell(free[Math.floor(Math.random() * free.length)]);
        qs++;
        resolveAnswer(Math.random() < 0.7);
      }
      if (Game.phase === 'match-over') done++;
    }
    return { done, qs };
  });
  check('100 مباراة تكتمل', matches.done === 100, `اكتمل ${matches.done}`);
  console.log(`    (${matches.qs} سؤال)`);

  /* -------------------------------------------- حفظ المباراة المحلية */
  console.log('\nحفظ المباراة المحلية');
  await page.evaluate(() => {
    eval("SETTINGS.timer=0; SETTINGS.size=5; SETTINGS.rounds=3; Game.phase='idle'; beginMatch();");
    for (let i = 0; i < 4; i++) {
      const f = Game.owners.findIndex(o => o === null);
      selectCell(f); resolveAnswer(true);
    }
    window.__before = JSON.stringify({ owners: Game.owners, letters: Game.letters, turn: Game.turn });
    sessionStorage.setItem('before', window.__before);
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction("typeof bankStats === 'function' && bankStats().total > 0");
  const saved = await page.evaluate(() => {
    const box = !document.getElementById('localResumeBox').classList.contains('hidden');
    resumeLocalMatch();
    const now = JSON.stringify({ owners: Game.owners, letters: Game.letters, turn: Game.turn });
    return { box, same: now === sessionStorage.getItem('before'), screen: UI.isScreen('screen-game'),
             hexes: document.querySelectorAll('.hex').length };
  });
  check('بعد تحديث الصفحة يظهر «أكملوها»', saved.box);
  check('الاستئناف يعيد اللوحة والدور كما كانا', saved.same && saved.screen && saved.hexes === 25);

  /* ------------------------------------------------------ الوصول والألوان */
  console.log('\nالوصول وعمى الألوان');
  const a11y = await page.evaluate(() => {
    const hexes = [...document.querySelectorAll('.hex')];
    const roles = hexes.every(h => h.getAttribute('role') === 'button' && h.tabIndex === 0 &&
                                   /^حرف /.test(h.getAttribute('aria-label') || ''));
    const b = document.querySelector('.hex.owned-b');
    const a = document.querySelector('.hex.owned-a');
    const bg = el => getComputedStyle(el, '::after').backgroundImage;
    return { roles,
             bStriped: b ? /repeating-linear-gradient/.test(bg(b)) : null,
             aPlain: a ? !/repeating-linear-gradient/.test(bg(a)) : null,
             ownedRing: a ? /linear-gradient/.test(getComputedStyle(a).backgroundImage) : null };
  });
  check('كل خلية زر بعنوان مقروء', a11y.roles);
  check('خلايا الفريق الثاني مخطّطة والأول مصمت', a11y.bStriped !== false && a11y.aPlain !== false,
        JSON.stringify(a11y));
  check('الخلية المأخوذة بإطار يميّزها عن الفارغة', a11y.ownedRing !== false);

  /* ------------------------------------------------------------ الواجهة */
  console.log('\nالواجهة');
  const ui = await page.evaluate(async () => {
    const g = eval;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // لام الجر: «للفريق» لا «لـالفريق»
    out.lam = [lam('الفريق الأول'), lam('سارة'), lam('النمور')];

    // إعلان الجولة لا يبقى فوق الجولة التالية، وإن جاءت من غير زرّه
    g("SETTINGS.timer=0; SETTINGS.size=4; SETTINGS.rounds=3; SETTINGS.answerMode='host'; SETTINGS.wrongRule='opponent'; Game.phase='idle'; beginMatch();");
    let guard = 0;
    while (Game.phase === 'playing' && guard++ < 30) {
      const f = Game.owners.findIndex(o => o === null); selectCell(f); revealAnswer(); resolveAnswer(true);
    }
    await wait(2600);
    out.roundShown = document.getElementById('roundOverlay').classList.contains('show');
    out.undoInPanel = !document.getElementById('roundUndoBtn').classList.contains('hidden');
    out.floatingUndoHidden = !document.getElementById('undoBar').classList.contains('show');
    nextRound();
    out.roundHiddenNext = !document.getElementById('roundOverlay').classList.contains('show');

    // شريط التراجع لا يتبع اللاعب إلى الرئيسية
    const f = Game.owners.findIndex(o => o === null); selectCell(f); revealAnswer(); resolveAnswer(true);
    const shownOnBoard = document.getElementById('undoBar').classList.contains('show');
    goHome();
    out.undoLeavesWithBoard = shownOnBoard && !document.getElementById('undoBar').classList.contains('show');

    // «الفريق الثاني» يظهر بإعلان صحيح لغوياً
    out.footer = document.getElementById('footA').textContent;
    return out;
  });
  check('لام الجر: «للفريق» و«لـسارة» و«للنمور»',
        JSON.stringify(ui.lam) === JSON.stringify(['للفريق الأول', 'لـسارة', 'للنمور']), JSON.stringify(ui.lam));
  check('نهاية الجولة: التراجع داخل الإعلان والعائم مخفي', ui.roundShown && ui.undoInPanel && ui.floatingUndoHidden);
  check('إعلان الجولة يُخفى عند بدء التالية مهما كان الطريق', ui.roundHiddenNext);
  check('شريط التراجع لا يظهر خارج اللوحة', ui.undoLeavesWithBoard);
  check('تذييل اللوحة بلا «لـال»', !/لـال/.test(ui.footer), ui.footer);

  /* --------------------------------------------------------- التخطيط */
  console.log('\nالتخطيط');
  for (const [w, h, label] of [[440, 956, 'جوال'], [375, 812, 'جوال صغير'], [1440, 960, 'شاشة كبيرة'], [1920, 1080, 'تلفاز']]) {
    await page.setViewport({ width: w, height: h });
    const lay = await page.evaluate(() => {
      const g = eval; const rows = {};
      for (const n of [4, 5, 6, 7]) {
        g(`SETTINGS.size=${n}; Game.phase='idle'; beginMatch();`);
        const doc = document.documentElement;
        rows[n] = {
          hex: Math.round(document.querySelector('.hex').getBoundingClientRect().width),
          vOver: doc.scrollHeight - doc.clientHeight,
          hOver: doc.scrollWidth > doc.clientWidth,
        };
      }
      return rows;
    });
    for (const n of [4, 5, 6, 7]) {
      check(`${label} ${n}×${n}: بلا تجاوز`,
            !lay[n].hOver && lay[n].vOver <= 0,
            `رأسي ${lay[n].vOver} أفقي ${lay[n].hOver}`);
    }
    if (label === 'تلفاز') {
      const tv = await page.evaluate(() => {
        selectCell(0);
        const r = {
          box: Math.round(document.querySelector('#questionModal .q-box').getBoundingClientRect().width),
          text: parseFloat(getComputedStyle(document.getElementById('qText')).fontSize),
        };
        cancelQuestion();
        return r;
      });
      check('التلفاز: صندوق السؤال أعرض من 520', tv.box > 700, `${tv.box}px`);
      check('التلفاز: نصّ السؤال 30px فأكبر', tv.text >= 30, `${tv.text}px`);
      check('التلفاز: خلية 7×7 أكبر من مقاس المواصفة (72)', lay[7].hex > 72, `${lay[7].hex}px`);
    }
  }

  await browser.close();

  console.log(`\n${pass} نجح · ${fail} فشل`);
  if (fail) { console.log('الفاشل: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error('تعذّر التشغيل:', e.message); process.exit(1); });
