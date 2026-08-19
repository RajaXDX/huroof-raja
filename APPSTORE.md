# نشر «صراع الحروف» على App Store

> دليل عملي لصاحب المشروع. ما جُهِّز في المستودع صار جاهزاً؛ الباقي خطوات
> يدوية في حسابك لا يستطيع أحد تنفيذها نيابةً عنك.

---

## الحقائق قبل أن تبدأ

| | |
|---|---|
| **التكلفة** | **99 دولاراً سنوياً** (~370 ريالاً) وتتجدّد. لو توقّفت عن الدفع يُحذف التطبيق من المتجر. |
| **Xcode** | حصري لـ macOS. أنت على ويندوز، لذلك نبني عبر **GitHub Actions** — أجهزة ماك سحابية مجانية للمستودعات العامة. |
| **مدة المراجعة** | من يوم إلى أسبوع عادةً لأول إصدار. |
| **العمر** | يجب أن تكون 18 سنة فأكثر لفتح حساب مطوّر. |

### الخطر الحقيقي: بند 4.2

آبل ترفض التطبيقات التي هي «موقع مغلَّف» فقط. لعبتنا مكتوبة بـ HTML/JS،
فالبند يخصّنا مباشرة.

**وضعنا جيد لأن:**
- كل ملفات اللعبة محزومة داخل التطبيق — لا يفتح رابطاً ولا يحتاج إنترنت
- 280 سؤالاً داخل التطبيق نفسه
- لعبة حقيقية بمنطق كامل، لا صفحة عرض

**ما يزيد فرص القبول:** ألا تذكر في وصف المتجر أنها «نسخة من الموقع»، وأن
تُظهر في اللقطات لعباً فعلياً لا شاشات إعدادات.

---

## ما جُهِّز في المستودع ✅

| الملف | الغرض |
|---|---|
| `capacitor.config.json` | هوية التطبيق: `com.rajaxdx.huroof` |
| `ios/` | مشروع Xcode كامل |
| `tools/build-www.py` | يجمع ملفات اللعبة في `www/` (794 KB) |
| `tools/make-icons.py` | يولّد الأيقونات وشاشة البداية، ومنها أيقونة آبل 1024 بلا شفافية |
| `.github/workflows/ios.yml` | يبني ويوقّع ويرفع من ماك سحابي |
| `privacy.html` | سياسة الخصوصية — **آبل تشترطها** |
| `ios/App/App/Info.plist` | لغة عربية + إقرار التشفير مسبقاً |

> **`ITSAppUsesNonExemptEncryption = false`** مضبوط مسبقاً. بدونه يسألك
> App Store Connect عن امتثال التصدير في **كل رفعة** ويوقف المعالجة حتى تجيب.

---

## الخطوات

### 1. جرّب البناء قبل أن تدفع شيئاً 🆓

السير يبني **بلا توقيع** بلا أي حساب. هذا يثبت أن المشروع يُترجم فعلاً على
ماك قبل أن تدفع 99 دولاراً.

1. افتح: `github.com/RajaXDX/huroof-raja/actions`
2. اختر **iOS** من القائمة على اليمين
3. **Run workflow** → اترك `upload` على `false` → **Run**
4. انتظر ~10 دقائق

نجح؟ الكود سليم. فشل؟ أرسل لي السجل قبل أن تدفع.

---

### 2. حساب المطوّر (99$)

1. `developer.apple.com/programs` → **Enroll**
2. سجّل بحساب آبل عليه **المصادقة الثنائية**
3. اختر **Individual** (فرد) — أبسط، ويظهر اسمك ناشراً.
   الشركة تحتاج رقم D-U-N-S وتأخذ أسابيع.
4. ادفع 99$ وانتظر التفعيل (ساعات إلى يومين)

---

### 3. سجّل التطبيق

في `developer.apple.com` → **Certificates, IDs & Profiles**:

**أ. المعرّف (App ID)**
- Identifiers → **+** → App IDs → App
- Bundle ID: `com.rajaxdx.huroof` — **صريح (Explicit)**
- ⚠️ **لا يتغيّر بعد أول رفعة أبداً.** لو أردت غيره، غيّره الآن في
  `capacitor.config.json` وفي إعدادات مشروع Xcode.

**ب. شهادة التوزيع**
- Certificates → **+** → **Apple Distribution**
- يطلب ملف `CSR`. أنشئه من `keychain` على ماك… ولا ماك عندك.
  **البديل بلا ماك:** أنشئ الـCSR بـ OpenSSL:
  ```bash
  MSYS_NO_PATHCONV=1 openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr -subj "/emailAddress=ramahasheer@gmail.com/CN=Ramah/C=SA"
  ```
  ⚠️ **`MSYS_NO_PATHCONV=1` ضرورية في Git Bash على ويندوز.** بدونها يرى
  الغلاف أن `/emailAddress=...` مسار يونكس فيترجمه إلى
  `C:/Program Files/Git/emailAddress=...`، ويردّ openssl بأن الاسم ليس
  بالصيغة المتوقّعة — **وقد جرّبناه فوقع فعلاً**. والمصيبة أنه ينشئ
  `dist.key` قبل أن يفشل، فتظنّ أن الأمر نجح جزئياً.
  ارفع `dist.csr`، نزّل `distribution.cer`، ثم حوّلهما إلى `.p12`:
  ```bash
  openssl x509 -in distribution.cer -inform DER -out dist.pem -outform PEM
  openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12 -legacy -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
  ```
  ⚠️ **الأعلام الأربعة الأخيرة ليست زينة.** OpenSSL 3 (وهو ما في Git Bash
  عندك — 3.5.7) يشفّر الـ`.p12` بـ AES-256 و PBKDF2، و`security import`
  على ماك السير يرفضها برسالة غامضة عن كلمة مرور خاطئة، فتظنّ أنك أخطأت
  في السرّ وتعيد كل شيء. الأعلام تفرض التشفير القديم الذي تقبله سلسلة
  مفاتيح آبل.

  اخترع كلمة مرور للـ`.p12` واحفظها — ستحتاجها في الأسرار.

  ⚠️ **ولّد هذه الملفات خارج مجلد المستودع** (مثلاً `~/apple-huroof`).
  المستودع عام، و`dist.key` أو `dist.p12` لو دخل commit صار مفتاح توقيعك
  بيد الجميع.

**ج. ملف التزويد (Provisioning Profile)**
- Profiles → **+** → **App Store Connect**
- اختر App ID الذي أنشأته وشهادة التوزيع
- نزّل ملف `.mobileprovision`

---

### 4. أنشئ التطبيق في App Store Connect

`appstoreconnect.apple.com` → **My Apps** → **+** → New App

| الحقل | القيمة |
|---|---|
| Platform | iOS |
| Name | **صراع الحروف** |
| Primary Language | Arabic |
| Bundle ID | `com.rajaxdx.huroof` |
| SKU | `huroof-raja-001` |

ثم **Users and Access → Integrations → App Store Connect API** → أنشئ مفتاحاً
بصلاحية **App Manager**. نزّل ملف `.p8` — **يُنزَّل مرة واحدة فقط**. سجّل
`Issuer ID` و`Key ID`.

---

### 5. أضف الأسرار في GitHub

`github.com/RajaXDX/huroof-raja/settings/secrets/actions` → New repository secret

| الاسم | من أين |
|---|---|
| `BUILD_CERTIFICATE_BASE64` | `base64 -w0 dist.p12` |
| `P12_PASSWORD` | التي اخترعتها في الخطوة 3-ب |
| `PROVISIONING_PROFILE_BASE64` | `base64 -w0 profile.mobileprovision` |
| `KEYCHAIN_PASSWORD` | أي كلمة تخترعها الآن |
| `APPSTORE_ISSUER_ID` | من مفتاح API |
| `APPSTORE_KEY_ID` | من مفتاح API |
| `APPSTORE_PRIVATE_KEY` | محتوى ملف `.p8` كاملاً بسطوره |
| `TEAM_ID` | من Membership في حساب المطوّر |

> على ويندوز، بديل `base64 -w0`:
> ```bash
> certutil -encode dist.p12 tmp.txt && findstr /v /c:- tmp.txt > out.txt
> ```
> أو من Git Bash: `base64 -w0 dist.p12 > out.txt`

---

### 6. ارفع

Actions → iOS → **Run workflow** → `upload` = **true** → Run

بعد ~15 دقيقة تجد البناء في App Store Connect تحت **TestFlight**.
معالجة آبل تأخذ 10–30 دقيقة إضافية.

---

### 7. جهّز صفحة المتجر

**اللقطات — إلزامية.** آبل تطلب مقاسين على الأقل:
- iPhone 6.9" — **1320×2868**
- iPhone 6.5" — **1242×2688**

خذها من التطبيق على جهاز حقيقي، أو من متصفح بمقاس مطابق. **أظهر اللعب نفسه**
(اللوحة وسط مباراة، نافذة سؤال) لا شاشات الإعدادات — هذا يقوّي موقفك أمام
بند 4.2.

**سياسة الخصوصية**: `https://rajaxdx.github.io/huroof-raja/privacy.html`

**Privacy Nutrition Label**: اختر **No, we do not collect data** — وهذا صحيح
فعلاً، اللعبة لا تتصل بأي خادم.

**التصنيف العمري**: 4+ (لا يوجد محتوى حسّاس).

نصوص المتجر الجاهزة في [`store-listing.md`](store-listing.md).

---

## المشاكل المتوقّعة

| العطل | السبب والحل |
|---|---|
| `No signing certificate found` | الشهادة أو ملف التزويد لا يطابقان الـBundle ID |
| `Invalid Bundle` | أيقونة فيها شفافية — `make-icons.py` يحفظها RGB فلا يقع هذا |
| `redundant binary upload` | رقم البناء مكرر. السير يستخدم رقم التشغيل تلقائياً فلا يتكرر |
| رفض بند **4.2** | زد المحتوى واذكر في الردّ أن اللعبة تعمل كاملة بلا إنترنت |
| رفض **2.1** (Performance) | ينقص معلومات — جاوب على سؤالهم في Resolution Center |

---

## طريق أقصر بكثير

قبل الـ99 دولاراً: اللعبة **منشورة ومجانية الآن** على
`rajaxdx.github.io/huroof-raja` ويمكن تثبيتها على الشاشة الرئيسية من Safari
(زر المشاركة ← «إضافة إلى الشاشة الرئيسية»). تعمل بملء الشاشة وبلا إنترنت
وبأيقونة، والفرق الوحيد أنها لا تُبحث في المتجر.

**العبها مع أهلك أولاً.** لو صارت تُلعب فعلاً، الـ99 دولاراً استثمار.
لو لا، وفّرتها.
