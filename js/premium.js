/* ==========================================================================
   premium.js — اشتراك «صراع الحروف+»: ما هو مجاني وما هو مقفول
   --------------------------------------------------------------------------
   منطق خالص بلا DOM: يقول من يملك الاشتراك وما الذي يسمح به، ولا يرسم
   شيئاً. النافذة وأقفال الأزرار في `setup.js`.

   ⚠️ هذا الملف يحكم **الصلاحية** لا **الدفع**. الدفع الفعلي يمرّ عبر
   `Premium.provider` (StoreKit داخل التطبيق)، ولم يُوصَل بعد — راجع PLAN.md.
   وحتى يُوصَل، لا طريق للاشتراك إلا مفتاح المطوّر على localhost.

   ⚠️ الصلاحية تُخزَّن على الجهاز، فمن يعبث بالتخزين يفتحها. هذا مقبول للمزايا
   الشكلية (ثيمات، أحجام)، ولا يصلح لحماية شيء له كلفة على الخادم.
   ========================================================================== */

const Premium = (function () {
  const KEY = 'huroof_plus';

  /* ما هو مجاني دائماً. يجب أن يبقى كافياً للعب كامل ممتع:
     الاشتراك يوسّع اللعبة ولا يقتطع منها. */
  const FREE = {
    themes: ['neon', 'ocean'],
    maxSize: 5,
  };

  /* المزايا كما تظهر في نافذة الاشتراك. لا تُضف سطراً هنا قبل أن تعمل
     الميزة فعلاً — آبل ترفض وصفاً لا يطابق ما يحصل عليه المشترك. */
  const PERKS = [
    'الثيمات الستة كاملة',
    'لوحات ٦×٦ و٧×٧',
  ];

  /* يُملأ بمزوّد الشراء حين يتوفر (انظر `setProvider`):
       { purchase(): Promise<{until:number}|null>,
         restore():  Promise<{until:number}|null> }
     `until` ختم زمني بالميلي ثانية لانتهاء الفترة المدفوعة. */
  let provider = null;

  function read() {
    const v = loadJSON(KEY, null);
    return v && typeof v.until === 'number' ? v : { until: 0 };
  }

  function active() {
    return read().until > Date.now();
  }

  function grant(until) {
    saveJSON(KEY, { until });
  }

  return {
    FREE,
    PERKS,

    active,
    until() { return read().until; },

    hasProvider() { return !!provider; },
    setProvider(p) { provider = p; },

    canTheme(key) { return active() || FREE.themes.includes(key); },
    canSize(n)    { return active() || n <= FREE.maxSize; },

    /** يردّ الإعدادات إلى المجاني إذا انتهى الاشتراك. يعيد true إن غيّر شيئاً. */
    clamp(s) {
      if (active()) return false;
      let changed = false;
      if (!FREE.themes.includes(s.palette)) {
        s.palette = FREE.themes[0];
        s.teamA.color = null;
        s.teamB.color = null;
        changed = true;
      }
      if (s.size > FREE.maxSize) { s.size = FREE.maxSize; changed = true; }
      return changed;
    },

    /** true عند النجاح. المزوّد وحده يقرّر، ولا نمنح شيئاً بلا ردّه. */
    async subscribe() {
      if (!provider) return false;
      const r = await provider.purchase();
      if (!r || r.until <= Date.now()) return false;
      grant(r.until);
      return true;
    },

    async restore() {
      if (!provider) return false;
      const r = await provider.restore();
      if (!r || r.until <= Date.now()) return false;
      grant(r.until);
      return true;
    },

    /** مفتاح المطوّر للاختبار. يعمل على localhost وحده، لا في نسخة منشورة. */
    dev(on) {
      if (!['localhost', '127.0.0.1'].includes(location.hostname)) return false;
      grant(on ? Date.now() + 30 * 864e5 : 0);
      return true;
    },
  };
})();
