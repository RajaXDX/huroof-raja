/* ==========================================================================
   hive.js — هندسة الخلية السداسية وكشف الاتصال
   --------------------------------------------------------------------------
   هذا الملف منطق خالص: لا يلمس الـ DOM ولا يعرف شيئاً عن اللعبة.
   السبب: يمكن اختباره وحده من الكونسول، وأي باق في اللعبة نعرف فوراً
   إن كان هنا أو في مكان آخر.

   نظام الإحداثيات
   ---------------
   الشبكة تُخزَّن بصفوف مُزاحة (odd-r offset) لأن هذا ما يطابق الشكل
   المرسوم: كل صف فردي يُزاح نصف خلية لليمين.

   لكن حساب الجيران في الإحداثيات المُزاحة مليء بالحالات الخاصة
   (الجار يختلف حسب فردية الصف)، وهذا مصدر أخطاء كلاسيكي. لذلك نحوّل
   كل خلية إلى إحداثيات محورية (axial) حيث الجيران ستة اتجاهات ثابتة
   لا تتغيّر أبداً. التحويل يتم مرة واحدة عند بناء اللوحة.

       axial.q = col - floor(row / 2)      (لصفوف odd-r)
       axial.r = row
   ========================================================================== */

const Hive = (function () {

  /* الاتجاهات الستة في الإحداثيات المحورية — ثابتة لكل الخلايا بلا استثناء */
  const AXIAL_DIRECTIONS = [
    [+1,  0], [-1,  0],
    [ 0, +1], [ 0, -1],
    [+1, -1], [-1, +1],
  ];

  /* ---------------------------------------------------------------- بناء */

  /**
   * يبني لوحة بصفوف مُزاحة.
   * @param {number} rows عدد الصفوف
   * @param {number} cols عدد الأعمدة
   * @returns {Array<{index,row,col,q,r}>} الخلايا مرتّبة صفاً صفاً
   */
  function buildBoard(rows, cols) {
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cells.push({
          index: cells.length,
          row,
          col,
          q: col - Math.floor(row / 2),
          r: row,
        });
      }
    }
    return cells;
  }

  /**
   * يبني خريطة "q,r" → index لبحث الجيران في زمن ثابت.
   * بدونها يصير كشف الفوز O(n²) وهو ما لا نريده على لوحة كبيرة.
   */
  function buildLookup(cells) {
    const map = new Map();
    cells.forEach(c => map.set(c.q + ',' + c.r, c.index));
    return map;
  }

  /**
   * جيران خلية معيّنة — فقط الموجودون فعلاً داخل اللوحة.
   * @returns {number[]} مصفوفة فهارس
   */
  function neighborsOf(cell, lookup) {
    const out = [];
    for (const [dq, dr] of AXIAL_DIRECTIONS) {
      const hit = lookup.get((cell.q + dq) + ',' + (cell.r + dr));
      if (hit !== undefined) out.push(hit);
    }
    return out;
  }

  /* ------------------------------------------------------------ كشف الفوز */

  /**
   * هل يملك الفريق سلسلة متّصلة تصل بين الحافتين المقابلتين؟
   *
   * 'vertical'   = الصف العلوي ↔ الصف السفلي
   * 'horizontal' = العمود الأيمن ↔ العمود الأيسر
   *
   * ملاحظة على الاتجاه: لا يهم من أي طرف نبدأ. "من اليمين لليسار" و
   * "من اليسار لليمين" نفس الشرط رياضياً — المهم أن السلسلة تلمس
   * الحافتين. لذلك لا يوجد في هذا الملف أي تعامل مع RTL إطلاقاً،
   * وهذا مقصود: خلط اتجاه العرض بمنطق اللعبة مصدر أخطاء لا ينتهي.
   *
   * @param {Array}  cells   خلايا اللوحة
   * @param {Array}  owners  owners[i] = 'A' | 'B' | null
   * @param {string} team    الفريق المطلوب فحصه
   * @param {string} axis    'vertical' | 'horizontal'
   * @param {number} rows
   * @param {number} cols
   * @returns {number[]|null} فهارس الخلايا المكوِّنة للمسار، أو null
   */
  function findWinningPath(cells, owners, team, axis, rows, cols) {
    const lookup = buildLookup(cells);

    const isStart = (c) => axis === 'vertical' ? c.row === 0 : c.col === 0;
    const isGoal  = (c) => axis === 'vertical' ? c.row === rows - 1 : c.col === cols - 1;

    // حالة حدّية: لوحة بصف واحد (أو عمود واحد) — الخلية نفسها بداية ونهاية
    const queue = [];
    const cameFrom = new Map();

    for (const c of cells) {
      if (owners[c.index] === team && isStart(c)) {
        queue.push(c.index);
        cameFrom.set(c.index, null);
      }
    }

    while (queue.length) {
      const idx = queue.shift();
      const cell = cells[idx];

      if (isGoal(cell)) return reconstruct(cameFrom, idx);

      for (const nb of neighborsOf(cell, lookup)) {
        if (cameFrom.has(nb)) continue;      // زُرناه من قبل
        if (owners[nb] !== team) continue;   // ليس للفريق
        cameFrom.set(nb, idx);
        queue.push(nb);
      }
    }

    return null;
  }

  function reconstruct(cameFrom, endIndex) {
    const path = [];
    let cur = endIndex;
    while (cur !== null && cur !== undefined) {
      path.push(cur);
      cur = cameFrom.get(cur);
    }
    return path.reverse();
  }

  /* -------------------------------------------------------------- الرسم */

  /**
   * يحسب موضع كل خلية بالبكسل ومقاس الحاوية.
   *
   * سداسي مدبّب من الأعلى. مواصفة التصميم تحدّد:
   *   الارتفاع = العرض × 1.14
   *   فراغ أفقي 6px بين الخلايا
   *   إزاحة الصف الفردي = (العرض + الفراغ) ÷ 2
   *   تراكب رأسي = −الارتفاع ÷ 4، أي الخطوة الرأسية = ¾ الارتفاع
   *
   * الفراغ ليس تجميلاً فقط: بلا فصل تبدو الخلايا كتلة واحدة ويصعب تتبّع
   * السلسلة المتّصلة بصرياً، وهي جوهر اللعبة.
   *
   * @param {number} w   عرض السداسي بالبكسل
   * @param {number} gap الفراغ بين الخلايا
   */
  function layout(cells, rows, cols, w, gap = 6) {
    const h = w * 1.14;
    const stepX = w + gap;
    const stepY = h * 0.75;

    const positioned = cells.map(c => ({
      ...c,
      x: c.col * stepX + (c.row % 2 ? stepX / 2 : 0),
      y: c.row * stepY,
      w,
      h,
    }));

    return {
      cells: positioned,
      width: cols * stepX - gap + (rows > 1 ? stepX / 2 : 0),
      height: (rows - 1) * stepY + h,
      hexWidth: w,
      hexHeight: h,
    };
  }

  /* ------------------------------------------------------------ مساعدات */

  /** هل امتلأت اللوحة؟ */
  function isFull(owners) {
    return owners.every(o => o !== null);
  }

  /** عدد خلايا فريق */
  function countCells(owners, team) {
    return owners.reduce((n, o) => n + (o === team ? 1 : 0), 0);
  }

  return {
    AXIAL_DIRECTIONS,
    buildBoard,
    buildLookup,
    neighborsOf,
    findWinningPath,
    layout,
    isFull,
    countCells,
  };
})();
