# Handoff: واجهة لعبة "حروف مع رجا" (Horoof Hex Game UI)

## Overview
واجهة لعبة مسابقات عربية بلوحة سداسية (Hex / Honeycomb) لفريقين. ثلاث شاشات:
الرئيسية (Home) → إعدادات المباراة (Setup) → اللوحة (Game Board) + طبقة السؤال (Question Modal).
هدف اللعبة: كل فريق يصل بحروفه من طرف إلى الطرف المقابل (الفريق ١ عموديًا ↕، الفريق ٢ أفقيًا ↔).

النموذج المعتمد: **فحمي نيون (neon)** — رمادي فحمي داكن + أخضر نعناعي، فريق ١ سماوي، فريق ٢ وردي.
الملف يحتوي ٦ ثيمات كاملة (neon / ocean / night / clay / berry / emerald) قابلة للتبديل في وقت التشغيل.

## About the Design Files
الملف المرفق `game-ui.dc.html` هو **مرجع تصميمي مكتوب بـ HTML** — نموذج أولي يوضّح الشكل والسلوك المطلوب، وليس كودًا للإنتاج يُنسخ كما هو.
المطلوب: **إعادة بناء هذه الشاشات داخل بيئة المشروع الحالية** (React / Vue / Flutter / SwiftUI / إلخ) باتباع أنماط ومكتبات المشروع القائمة. إذا لم تكن هناك بيئة بعد، اختر الإطار الأنسب (مقترح: React + TypeScript + Vite مع CSS variables للثيمات) ونفّذ التصميم فيه.
اللغة عربية والاتجاه **RTL** — اضبط `dir="rtl"` على الجذر.

## Fidelity
**High-fidelity (hifi)**: الألوان والخطوط والمسافات نهائية ويجب مطابقتها بدقة، مع استخدام مكونات المشروع القائمة حيث أمكن.

## Design Tokens

### Fonts (Google Fonts)
- العناوين والأزرار: **Cairo** — 400 / 600 / 700 / 900
- النصوص الثانوية والوصف: **Almarai** — 300 / 400 / 700

### Theme: neon (المعتمد)
| Token | Value | الاستخدام |
|---|---|---|
| bg | `radial-gradient(120% 80% at 50% 0%, #22293A 0%, #141926 48%, #080B12 100%)` | خلفية الصفحة |
| surface1 / surface2 | `rgba(34,41,58,.92)` / `rgba(20,25,38,.92)` | تدرّج البطاقات |
| panel | `rgba(12,16,26,.62)` | الهيدر (+ blur 6px) |
| panelSolid | `rgba(28,35,50,.9)` | صفوف الإعدادات، الأزرار الثانوية |
| inputBg | `rgba(8,11,18,.85)` | الحقول، الأزرار غير المختارة |
| line / lineStrong | `rgba(134,239,172,.18)` / `rgba(134,239,172,.5)` | الحدود / الحدود عند hover |
| accent | `#86EFAC` | اللون الأساسي |
| accentLite / accentDeep | `#BBF7D0` / `#3FBF7F` | تدرّج الأزرار الأساسية |
| accentGlow | `rgba(134,239,172,.55)` | ظل الأزرار الأساسية |
| onAccent | `#08150E` | النص فوق اللون الأساسي |
| text / head | `#E8EEF6` / `#F6FAFF` | النص / العناوين |
| muted / faint | `#9FAFC4` / `#73849B` | نص ثانوي / باهت |
| cell / cellText | `#ECF2F8` / `#22293A` | خلية الحرف / حرفها |
| lock / lockText | `#2E3648` / `#73849B` | خلية مقفلة بعد خطأ |
| team1 / team2 | `#38BDF8` / `#F472B6` | لونا الفريقين (افتراضي) |
| overlay | `rgba(5,8,13,.8)` | خلفية المودال (+ blur 4px) |

### Team color swatches (اختيار المستخدم)
`#38BDF8, #F472B6, #86EFAC, #FDE047, #C084FC, #FB923C, #5EEAD4, #E2E8F0`

### الثيمات البديلة (نفس بنية المفاتيح)
- **ocean**: bg `#123A55 / #0A2438 / #05121D`، accent `#4FB8E8`، فرق `#22D3AE / #FB7185`، cell `#EAF4FA`
- **night**: bg `#2A1F52 / #170F33 / #0B0718`، accent `#A78BFA`، فرق `#5EEAD4 / #FDBA74`، cell `#F1ECFC`
- **clay**: bg `#3A241B / #241510 / #130A08`، accent `#EFA96B`، فرق `#4FB8A0 / #E05C5C`، cell `#F6E7D5`
- **berry**: bg `#4A1130 / #2C0A1E / #15040E`، accent `#FF8FA8`، فرق `#5ED3C0 / #FFB454`، cell `#FAE9EE`
- **emerald**: bg `#16382F / #0A231E / #05130F`، accent `#E8B93F`، فرق `#3FC2A3 / #E8763F`، cell `#F2E6CD`

القيم الكاملة لكل ثيم (كل مفاتيح الجدول أعلاه) موجودة في كائن `THEMES` داخل `game-ui.dc.html`.

### Radii
`999px` أقراص · `24px` المودال · `20px` البطاقات الكبيرة · `18px` البطاقات والصفوف · `16px` بطاقة الثيم · `14px` الحقول والأزرار · `12px` أزرار الخيارات · `6px` أشرطة الحواف

### Spacing
مقياس 4px: 6 / 8 / 10 / 12 / 14 / 16 / 18 / 22 / 26 / 30 / 40 / 46 / 84.
أقصى عرض للمحتوى: الرئيسية 940px · الإعدادات 1040px · اللوحة 1080px.

### Hexagon
`clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)` (pointy-top).
height = width × 1.14 · حجم الحرف = width × 0.42.
مقاس الخلية حسب اللوحة: 4×4 → 106px · 5×5 → 94px · 6×6 → 82px · 7×7 → 72px.
فراغ أفقي 6px · إزاحة الصفوف الفردية = (width + 6) / 2 · تراكب رأسي = −height / 4.

## Screens / Views

### 1) Header (ثابت في كل الشاشات)
- شريط زخرفي أعلى الصفحة: ارتفاع 10px، `repeating-linear-gradient(135deg, accent 0 6px, line 6px 12px, team1 12px 18px, line 18px 24px)`، opacity .8
- الصف: padding 18px 32px، حد سفلي `line`، خلفية `panel` + `backdrop-filter: blur(6px)`
- يمينًا (RTL): سداسي 44×50 بتدرّج `linear-gradient(160deg, accentLite, accentDeep)` وداخله «ح» (Cairo 900، 22px، onAccent) + «حروف مع رجا» (Cairo 900، 19px، letter-spacing .5px، head) وتحته «خلية الحروف» (Almarai 12px، muted)
- يسارًا: مبدّل شاشات — حاوية pill (padding 5px، خلفية panelSolid، حد line، radius 999px) فيها ٣ أزرار: الرئيسية / الإعدادات / اللوحة. المختار: خلفية accent ونص onAccent؛ غيره: شفاف ونص muted. Cairo 700، 13px، padding 9px 18px.

### 2) الرئيسية (Home)
- padding أعلى 84px، محتوى مركزي، نص متوسّط
- ثلاثة سداسيات 40×46 بفراغ 8px: team1 · cell (بإزاحة margin-top 22px) · team2
- H1 «حروف مع رجا»: Cairo 900، 64px، line-height 1.1، تدرّج نصي `linear-gradient(180deg, head, accent)` مع `background-clip: text`
- الوصف: Almarai 18px، muted، أقصى عرض 460px، `text-wrap: pretty` — «صِل حروفك من طرف إلى طرف قبل خصمك — أربع جولات من الذكاء والسرعة.»
- زر أساسي «لعبة جديدة»: Cairo 900، 19px، padding 20px، radius 18px، `linear-gradient(165deg, accentLite, accent 55%, accentDeep)`، نص onAccent، ظل `0 16px 34px -16px accentGlow`، hover `translateY(-2px)` → الإعدادات
- زر ثانوي «دخول اللوحة مباشرة»: Cairo 700، 17px، padding 18px، خلفية panelSolid، حد line → hover lineStrong → اللوحة
- ثلاث بطاقات إحصاء (grid ٣ أعمدة، gap 16px، أقصى 560px، padding 20px 14px، تدرّج surface1→surface2، حد line): الفرق «فريقان» · الأسئلة «٢٨٠» · الحروف «٢٨» — التسمية Almarai 12px muted، القيمة Cairo 900 26px accent
- تذييل: «فريقان · لوحة سداسية · أسئلة عربية» Almarai 13px faint

### 3) إعدادات المباراة (Setup)
- H2 «إعدادات المباراة» Cairo 900 30px head + شرح Almarai 13px muted
- **بطاقة «لون الواجهة»**: grid `repeat(auto-fit, minmax(158px, 1fr))`، gap 12px — ٦ أزرار ثيم: padding 14px، radius 16px، خلفية `linear-gradient(160deg, bg[0], bg[2])` للثيم، حد 2px = accent الثيم إن كان مختارًا وإلا `rgba(255,255,255,.08)`، اسم الثيم (Cairo 800 14px بلون head للثيم) + ٣ مربعات 22px radius 6px (accent، team1، team2)، hover `translateY(-2px)`. اختيار ثيم يصفّر ألوان الفريقين إلى افتراضياته.
- **grid عمودان `1fr 300px`، gap 18px**:
  - **بطاقة «الفريقان»** (padding 22px، radius 20px، تدرّج surface1→surface2، حد line، عنوان accent Cairo 800 16px بحد سفلي): لكل فريق تسمية Almarai 12px muted، حقل اسم (padding 14px 16px، radius 14px، خلفية inputBg، حد بلون الفريق، نقطة 10px radius 3px بلون الفريق، input بلا حدود Cairo 700 16px)، ثم ٨ دوائر لون 34px (حد 2px = head للمختار، hover `scale(1.08)`)
  - **بطاقة «معاينة اللوحة»**: شبكة 4×4 سداسيات 30×34، فراغ 4px، margin-top −8px، إزاحة الصفوف الفردية 17px، ألوان دورية team1/team2/cell + تعليق «N×N — M خلية» (Almarai 12px muted)
- **صفوف الخيارات** (padding 18px 22px، radius 18px، خلفية panelSolid، حد line؛ العنوان Cairo 800 15px head والشرح Almarai 12px faint؛ الأزرار Cairo 700 13px، padding 11px 16px، radius 12px — المختار: خلفية accent + نص onAccent + حد accent، وغيره: inputBg + text + حد line):
  1. **حجم اللوحة** — ٤×٤ صغيرة / ٥×٥ متوسطة / ٦×٦ كبيرة / ٧×٧ ضخمة — «عدد الخلايا في كل صف»
  2. **عدد الجولات** — جولة واحدة / ٣ / ٥ / ٧ — «من يحسم أكثر الجولات يفوز»
  3. **وقت السؤال** — بلا مؤقت / ١٥ / ٣٠ / ٤٥ ثانية — «المدة المتاحة للإجابة»
  4. **عند الإجابة الخاطئة** — الخلية تُقفل / الخلية للفريق الآخر — «مصير الخلية بعد الخطأ»
- **مفتاحان (toggles)** 54×30px، radius 999px، مقبض 22px، انتقال .18s: «تبديل الاتجاهات كل جولة» (يلغي الأفضلية الطفيفة للاتجاه العمودي) و«المؤثرات الصوتية» (نغمات عند الاختيار والفوز). مُشغّل: مسار accent + مقبض onAccent + `justify-content: flex-start`؛ مُطفأ: مسار inputBg + مقبض faint + flex-end.
- أزرار أسفل يسار: «رجوع» (شفاف، حد line → hover lineStrong، padding 15px 26px) و«ابدأ المباراة» (نمط الزر الأساسي، padding 15px 40px) — الأخير يصفّر اللوحة ويبدأ الدور من الفريق ١.

### 4) اللوحة (Game Board)
- grid `1fr 160px 1fr`، gap 14px: بطاقة الفريق ١ (يمين، محاذاة flex-start) / الوسط / بطاقة الفريق ٢ (يسار، flex-end)
- **بطاقة فريق**: padding 16px 20px، radius 18px، حد 2px = لون الفريق إن كان دوره وإلا line، خلفية surface1 إن كان دوره وإلا panelSolid؛ الاسم Cairo 800 16px head، النتيجة Cairo 900 30px بلون الفريق، الاتجاه «↕ عمودي» / «↔ أفقي» Almarai 12px muted
- الوسط: «الجولة ١ من N» Almarai 12px muted + زر «جولة جديدة» pill (panelSolid، حد line → hover lineStrong)
- **شريط الدور**: padding 14px 22px، radius 14px، خلفية = لون الفريق صاحب الدور، نص onAccent، Cairo 800 16px، توسيط، `animation: glow 2.4s ease-in-out infinite` (نبضة ظل خارجية من 0 إلى 10px ثم تلاشٍ). النص: «دور {اسم الفريق} — اختر خلية»
- **حدود الأهداف**: شريطان أفقيان أعلى/أسفل اللوحة بلون team1 (ارتفاع 10px، radius 6px) وشريطان رأسيان يمين/يسار بلون team2 (عرض 10px) — يمثّلان طرفي كل فريق
- **الخلايا**: بالمقاسات أعلاه، الحرف Cairo 900؛ حرّة = cell + cellText، مملوكة = لون الفريق + onAccent، مقفلة = lock + lockText؛ hover `filter: brightness(1.08)`، `cursor: pointer`
- تذييل Almarai 12px faint: «عمودي ↕ للفريق الأول» · «أفقي ↔ للفريق الثاني» · «N خلية متاحة»

### 5) طبقة السؤال (Question Modal)
- خلفية `position: fixed; inset: 0` بلون overlay + blur 4px، z-index 40، توسيط، padding 24px
- البطاقة: أقصى عرض 520px، radius 24px، padding 30px، تدرّج surface1→surface2، حد lineStrong، ظل `0 40px 80px -30px rgba(0,0,0,.9)`، `animation: popIn .22s ease both` (من opacity 0 + `translateY(14px) scale(.97)`)
- أعلى: سداسي 52×60 بخلفية cell وحرف Cairo 900 26px cellText + «دور» (Almarai 12px muted) واسم الفريق (Cairo 800 16px بلون الفريق)؛ يسارًا دائرة مؤقت 58px بحد 3px lineStrong ورقم Cairo 900 19px accent (تظهر فقط إذا كان وقت السؤال > 0)
- نص السؤال: Cairo 700 21px، line-height 1.6، `text-wrap: pretty` + تلميح «الإجابة تبدأ بحرف X» (Almarai 13px muted)
- زران متساويان: «إجابة صحيحة» (خلفية team1، نص onAccent) و«إجابة خاطئة» (panelSolid، حد بلون team2، نص text) — Cairo 800 15px، padding 15px، radius 14px
- زر «إلغاء» نصي أسفل بعرض كامل (Almarai 13px faint، padding 8px)

## Interactions & Behavior
- التنقل بين الشاشات عبر مبدّل الهيدر أو أزرار CTA — بدون تحميل صفحة.
- الضغط على خلية حرّة يفتح المودال ويبدأ العد التنازلي من وقت السؤال المختار (كل ثانية، يتوقف عند 0، ولا يعمل إذا كان الوقت «بلا مؤقت»). الخلايا المملوكة أو المقفلة غير قابلة للضغط.
- «إجابة صحيحة» → الخلية تصبح ملك الفريق صاحب الدور، ثم تبديل الدور، وإغلاق المودال.
- «إجابة خاطئة» → حسب الإعداد: تُقفل الخلية (owner = `'x'`) أو تُمنح للفريق الآخر، ثم تبديل الدور.
- «إلغاء» يغلق المودال ويوقف المؤقت دون تغيير الملكية.
- «جولة جديدة» و«ابدأ المباراة» يصفّران الملكيات ويعيدان الدور للفريق ١.
- تغيير الثيم يبدّل كل الألوان فورًا (CSS variables على الجذر) ويعيد ألوان الفريقين لافتراضيات الثيم.
- Hover: أزرار الخيارات `brightness(1.12)`، الخلايا `brightness(1.08)`، الأزرار الثانوية تغيّر لون الحد إلى lineStrong، بطاقات الثيم ترتفع 2px. مدد الانتقال 0.14s–0.18s ease.
- يُستحسن في التنفيذ إضافة انتقال لوني عند تملّك الخلية.
- Responsive: التصميم مبني لسطح المكتب (لوحة تحكم مقدّم اللعبة). للجوال: تحويل grid الثلاثي في شاشة اللوحة إلى عمود واحد، وتقليص مقاس السداسي، والحد الأدنى لمساحة اللمس 44px.

## State Management
```
screen:   'home' | 'setup' | 'game'
palette:  'neon' | 'ocean' | 'night' | 'clay' | 'berry' | 'emerald'
size:     4 | 5 | 6 | 7                      // أبعاد اللوحة
rounds:   1 | 3 | 5 | 7
time:     0 | 15 | 30 | 45                   // 0 = بلا مؤقت
wrong:    'lock' | 'give'
names:    { 1: string, 2: string }
colors:   { 1: string|null, 2: string|null } // null = افتراضي الثيم
toggles:  { flip: boolean, sound: boolean }
turn:     1 | 2
owners:   Record<cellIndex, 1 | 2 | 'x'>
active:   number | null                      // الخلية المفتوحة في المودال
timeLeft: number
```
- الحروف مشتقة من مصفوفة الأبجدية العربية (٢٨ حرفًا) بالفهرس `index % 28`.
- النتيجة محسوبة (عدد الخلايا المملوكة)، ليست حالة مستقلة.
- **غير مُنفَّذ في النموذج ويحتاج تنفيذًا حقيقيًا**: كشف الفوز (مسار متصل من طرف إلى طرف — BFS/DFS على جيران السداسي)، تعدد الجولات فعليًا، شاشة النتيجة/الفوز، بنك أسئلة حقيقي (النموذج فيه سؤال تجريبي واحد لكل حرف)، تبديل الاتجاهات كل جولة، المؤثرات الصوتية، حفظ الإعدادات محليًا.

## Assets
لا صور ولا أيقونات ولا إيموجي — كل الأشكال CSS (clip-path سداسي + تدرّجات). الخطوط من Google Fonts: Cairo و Almarai.

## Files
- `game-ui.dc.html` — النموذج الكامل (٣ شاشات + المودال + ٦ ثيمات). القالب في `<x-dc>` والمنطق في الكلاس أسفل الملف؛ راجع كائن `THEMES` لقيم الألوان الدقيقة و`renderVals()` لمنطق العرض.
