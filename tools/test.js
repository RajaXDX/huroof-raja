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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  page.on('pageerror', e => { fail++; failures.push('خطأ JS: ' + e.message); });

  await page.setCacheEnabled(false);
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(
    "typeof bankStats === 'function' && bankStats().total > 0", { timeout: 15000 });

  /* ---------------------------------------------------- بنك الأسئلة */
  console.log('\nبنك الأسئلة');
  const bank = await page.evaluate(() => {
    const first = a => {
      let s = a.trim();
      if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
      return 'أإآا'.includes(s[0]) ? 'ا' : s[0];
    };
    let bad = 0, total = 0;
    const qs = new Set();
    for (const [letter, items] of Object.entries(BANK)) {
      for (const it of items) {
        total++; qs.add(it.q);
        if (first(it.a) !== letter) bad++;
      }
    }
    return { letters: Object.keys(BANK).length, total, bad, unique: qs.size };
  });
  check('28 حرفاً', bank.letters === 28, `وجد ${bank.letters}`);
  check('280 سؤالاً', bank.total === 280, `وجد ${bank.total}`);
  check('كل إجابة تبدأ بحرفها', bank.bad === 0, `${bank.bad} مخالفة`);
  check('لا سؤال مكرر', bank.unique === bank.total);

  /* ------------------------------------------ تبديل السؤال غير المُجاب */
  console.log('\nتبديل السؤال حين لا يُجاب عليه');

  const refresh = await page.evaluate(async () => {
    const g = eval;
    const out = {};
    g("SETTINGS.timer=0; SETTINGS.size=5;");

    // إلغاء ثم إعادة فتح
    g("SETTINGS.wrongRule='opponent';");
    beginMatch();
    selectCell(0);
    const q1 = Game.questions[0].q, letter = Game.letters[0];
    cancelQuestion();
    selectCell(0);
    const q2 = document.getElementById('qText').textContent;
    cancelQuestion();
    out.cancel = { changed: q1 !== q2, sameLetter: Game.letters[0] === letter,
                   free: Game.owners[0] === null };

    // إجابة خاطئة مع قاعدة «تبقى متاحة»
    g("SETTINGS.wrongRule='free';");
    beginMatch();
    selectCell(3);
    const a1 = Game.questions[3].q;
    resolveAnswer(false);
    selectCell(3);
    const a2 = document.getElementById('qText').textContent;
    cancelQuestion();
    out.wrongFree = { changed: a1 !== a2, free: Game.owners[3] === null };

    // انتهاء الوقت يمر بنفس المسار
    g("SETTINGS.wrongRule='free'; SETTINGS.timer=1;");
    beginMatch();
    selectCell(7);
    const t1 = Game.questions[7].q;
    await new Promise(r => setTimeout(r, 1500));
    out.timeout = { changed: t1 !== Game.questions[7].q, free: Game.owners[7] === null };

    // إجابة صحيحة: الخلية تُؤخذ فلا يُستبدل سؤالها (لا هدر من البنك)
    g("SETTINGS.timer=0; SETTINGS.wrongRule='opponent';");
    beginMatch();
    selectCell(5);
    const b1 = Game.questions[5].q;
    resolveAnswer(true);
    out.correct = { kept: b1 === Game.questions[5].q, owned: Game.owners[5] !== null };

    // عشرة إلغاءات متتالية على نفس الخلية
    beginMatch();
    const seen = [];
    for (let i = 0; i < 10; i++) {
      selectCell(1); seen.push(Game.questions[1].q); cancelQuestion();
    }
    out.repeat = { distinct: new Set(seen).size, letter: Game.letters[1] };

    return out;
  });

  check('الإلغاء يبدّل السؤال', refresh.cancel.changed);
  check('الإلغاء لا يغيّر الحرف', refresh.cancel.sameLetter);
  check('الإلغاء يُبقي الخلية متاحة', refresh.cancel.free);
  check('الخطأ مع «تبقى متاحة» يبدّل السؤال', refresh.wrongFree.changed);
  check('انتهاء الوقت يبدّل السؤال', refresh.timeout.changed);
  check('الإجابة الصحيحة لا تهدر سؤالاً', refresh.correct.kept && refresh.correct.owned);
  check('10 إلغاءات تعطي 10 أسئلة مختلفة',
        refresh.repeat.distinct === 10, `وجد ${refresh.repeat.distinct} للحرف ${refresh.repeat.letter}`);

  /* ------------------------------------------------------- المباريات */
  console.log('\nمباريات كاملة');
  const matches = await page.evaluate(() => {
    const g = eval;
    g("SETTINGS.timer=0;");
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

  /* --------------------------------------------------------- التخطيط */
  console.log('\nالتخطيط');
  for (const [w, h, label] of [[440, 956, 'جوال'], [1440, 960, 'شاشة كبيرة']]) {
    await page.setViewport({ width: w, height: h });
    const lay = await page.evaluate(() => {
      const g = eval; const rows = {};
      for (const n of [4, 5, 6, 7]) {
        g(`SETTINGS.size=${n};`); beginMatch();
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
  }

  await browser.close();

  console.log(`\n${pass} نجح · ${fail} فشل`);
  if (fail) { console.log('الفاشل: ' + failures.join(' | ')); process.exit(1); }
})().catch(e => { console.error('تعذّر التشغيل:', e.message); process.exit(1); });
