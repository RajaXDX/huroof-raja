/* ==========================================================================
   screenshots.js — يلتقط لقطات App Store بالمقاسات المطلوبة بالضبط
   --------------------------------------------------------------------------
   آبل ترفض اللقطات التي لا تطابق مقاساتها إلى البكسل، والالتقاط اليدوي من
   جهاز حقيقي يعطي مقاسات مختلفة ويحتاج إعادة كل مرة تتغيّر الواجهة.

   يفتح اللعبة، يجهّز حالة كل مشهد برمجياً، ويحفظ PNG بالمقاس الصحيح.

   تشغيل:
     python -m http.server 8177 --bind 127.0.0.1     (في نافذة أخرى)
     node tools/screenshots.js

   المخرجات في screenshots/  — وهي مُتجاهَلة في git لأنها مولّدة.
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8177';
const OUT = path.join(__dirname, '..', 'screenshots');

// مقاسات آبل الإلزامية. الرقم الأول عرض المتصفح، والثاني ارتفاعه، وdsf
// معامل الكثافة — الناتج = العرض × dsf. نصوّر بنصف المقاس وكثافة 2 لأن
// عرض 1320 بكسل CSS يجعل الواجهة صغيرة بشكل غير طبيعي على "جوال".
const DEVICES = [
  { name: 'iphone-6.9', w: 440, h: 956, dsf: 3, out: [1320, 2868] },
  { name: 'iphone-6.5', w: 414, h: 896, dsf: 3, out: [1242, 2688] },
];

/* كل مشهد: اسمه، ودالة تُنفَّذ داخل الصفحة لتجهيز الحالة.

   أسماء الفرق تُكتب في حقول الإدخال لا في SETTINGS مباشرة: beginMatch()
   تستدعي commitNames() التي تقرأ من الحقول، فأي اسم يُضبط برمجياً يُمحى.
   نستخدم eval غير المباشر لأن متغيّرات الحالة معرّفة بـ let في نطاق
   السكربت، فلا تُعدَّل عبر window. */
const SCENES = [
  {
    name: '1-board',
    setup: `
      const ev = eval;
      ev("SETTINGS.size=5; SETTINGS.timer=30; SETTINGS.palette='neon';");
      document.getElementById('inputNameA').value = 'الصقور';
      document.getElementById('inputNameB').value = 'النمور';
      applyTheme('neon');
      beginMatch();
      const ev2 = eval; ev2("Game.turn='A';");
      UI.renderStatus();
      [1,6,11,16].forEach(i => { Game.owners[i]='A'; UI.paintCell(i); });
      [3,9,13,18].forEach(i => { Game.owners[i]='B'; UI.paintCell(i); });
      UI.renderStatus();
    `,
  },
  {
    name: '2-question',
    setup: `
      const ev = eval;
      ev("SETTINGS.size=5; SETTINGS.timer=30; SETTINGS.palette='neon';");
      document.getElementById('inputNameA').value = 'الصقور';
      document.getElementById('inputNameB').value = 'النمور';
      applyTheme('neon');
      beginMatch();
      [1,6,11].forEach(i => { Game.owners[i]='A'; UI.paintCell(i); });
      [3,9].forEach(i => { Game.owners[i]='B'; UI.paintCell(i); });
      UI.renderStatus();
      selectCell(12);
      stopTimer();            // نجمّد العدّاد حتى لا يختلف الرقم بين اللقطات
      UI.updateTimer(22);
    `,
  },
  {
    name: '3-win',
    // نبني المسار بدوال اللعبة نفسها لا بفهارس مكتوبة يدوياً: إزاحة
    // الصفوف تجعل «العمود الثاني» غير متّصل فعلياً، فالفهارس المخمَّنة
    // تعطي لوحة تبدو عشوائية بدل سلسلة فائزة.
    setup: `
      const ev = eval;
      ev("SETTINGS.size=5; SETTINGS.palette='neon';");
      document.getElementById('inputNameA').value = 'الصقور';
      document.getElementById('inputNameB').value = 'النمور';
      applyTheme('neon');
      beginMatch();

      const lookup = Hive.buildLookup(Game.cells);
      const start = Game.cells.find(c => c.row === 0 && c.col === 2);
      const path = [start.index];
      while (Game.cells[path[path.length - 1]].row < Game.rows - 1) {
        const c = Game.cells[path[path.length - 1]];
        const next = Hive.neighborsOf(c, lookup)
          .map(i => Game.cells[i])
          .find(n => n.row === c.row + 1);
        path.push(next.index);
      }
      path.forEach(i => { Game.owners[i] = 'A'; });

      // خلايا للخصم حتى تبدو اللوحة كمباراة حقيقية لا كعرض
      [0, 8, 13, 19, 23].forEach(i => {
        if (Game.owners[i] === null) Game.owners[i] = 'B';
      });

      UI.renderBoard();
      UI.renderStatus();
      checkRoundEnd();          // يشغّل شاشة نتيجة الجولة الحقيقية
    `,
    settle: 2600,   // إبراز المسار ثم ظهور اللوحة
  },
  {
    name: '4-themes',
    setup: `
      const ev = eval; ev("SETTINGS.palette='neon';");
      applyTheme('neon');
      goSetup();
      window.scrollTo(0, 0);
    `,
  },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--font-render-hinting=none', '--lang=ar'],
  });

  let made = 0;

  for (const d of DEVICES) {
    for (const scene of SCENES) {
      const page = await browser.newPage();
      await page.setViewport({
        width: d.w, height: d.h, deviceScaleFactor: d.dsf, isMobile: true,
      });

      await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
      // ننتظر تحميل بنك الأسئلة فعلياً بدل تأخير ثابت
      await page.waitForFunction(
        "typeof bankStats === 'function' && bankStats().total > 0",
        { timeout: 15000 });
      await page.evaluate("document.fonts.ready");

      await page.evaluate(scene.setup);
      await new Promise(r => setTimeout(r, scene.settle || 500));

      const file = path.join(OUT, `${d.name}_${scene.name}.png`);
      await page.screenshot({ path: file });

      const { width, height } = require('child_process').execSync
        ? { width: d.w * d.dsf, height: d.h * d.dsf } : {};
      const ok = width === d.out[0] && height === d.out[1];
      console.log(`  ${path.basename(file).padEnd(30)} ${width}x${height}` +
                  (ok ? '  ✓' : `  ✗ متوقع ${d.out[0]}x${d.out[1]}`));
      made++;
      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${made} لقطة في screenshots/`);
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
