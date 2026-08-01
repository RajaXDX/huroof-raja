# -*- coding: utf-8 -*-
"""
يولّد كل أيقونات التطبيق وشاشات البداية من تعريف واحد.

لماذا سكربت لا ملفات مرسومة يدوياً:
  الأيقونة مطلوبة بعشرة مقاسات لأربع منصات. تعديل اللون أو الشكل يدوياً
  يعني إعادة رسم عشرة ملفات وضمان تطابقها. هنا يُعدَّل ثابت واحد ويُعاد
  التشغيل.

التصميم: مسدس بلون الثيم الأساسي على خلفية داكنة، وحرف «ح» داخله بخط
  Cairo 900. الألوان مأخوذة من ثيم neon في js/themes.js، والتباين عالٍ
  عمداً — الأيقونة تُقرأ على 60 بكسل في شاشة الجوال.

تشغيل:  python tools/make-icons.py
"""

import math
import pathlib
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / '.build' / 'Cairo-Black.ttf'
OUT = ROOT / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

# ننزّل الخط عند الحاجة بدل حفظه في المستودع: ملف ثنائي 200 كيلوبايت
# لا يُقرأ ولا يُراجع في المراجعات، وهو متاح دائماً من مصدره الرسمي.
FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/cairo/Cairo%5Bslnt,wght%5D.ttf'
if not FONT.exists():
    FONT.parent.mkdir(parents=True, exist_ok=True)
    print('downloading Cairo ...')
    urllib.request.urlretrieve(FONT_URL, FONT)

# ثيم neon من js/themes.js — الأيقونة تتبع الثيم الافتراضي للتطبيق
NIGHT = (8, 11, 18)      # bg[2]
PANEL = (34, 41, 58)     # bg[0]
GOLD = (134, 239, 172)   # accent
ON_ACCENT = (8, 21, 14)  # onAccent — لون الحرف فوق اللون الأساسي
LETTER = 'ح'


def radial_bg(size):
    """خلفية متدرجة قطرياً: أفتح في الوسط وأغمق عند الحواف."""
    img = Image.new('RGB', (size, size), NIGHT)
    px = img.load()
    cx = cy = size / 2
    maxd = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            t = min(1.0, math.hypot(x - cx, y - cy) / maxd)
            t = t ** 0.85
            px[x, y] = tuple(int(PANEL[i] + (NIGHT[i] - PANEL[i]) * t) for i in range(3))
    return img


def hexagon(cx, cy, r):
    """مسدس مدبّب من الأعلى — نفس اتجاه خلايا اللوحة في اللعبة."""
    return [
        (cx + r * math.sin(math.radians(60 * i)),
         cy - r * math.cos(math.radians(60 * i)))
        for i in range(6)
    ]


def build(size, hex_ratio=0.78, supersample=4):
    """يرسم بأربعة أضعاف المقاس ثم يصغّر — يعطي حوافّ ناعمة بلا تسنين."""
    s = size * supersample
    img = radial_bg(size).resize((s, s), Image.LANCZOS)
    d = ImageDraw.Draw(img)

    r = s * hex_ratio / 2
    d.polygon(hexagon(s / 2, s / 2, r), fill=GOLD)

    # نقيس الحرف فعلياً ونتوسّط بصندوقه، لا بارتفاع السطر — وإلا بدا مزاحاً
    fs = int(r * 1.15)
    font = ImageFont.truetype(str(FONT), fs)

    # Cairo خط متغيّر، وبلا ضبط المحور يُرسم بالوزن العادي فيخرج الحرف
    # رفيعاً لا يُقرأ على 60 بكسل. المواصفة تطلب Cairo 900.
    try:
        font.set_variation_by_axes([900])
    except Exception:
        pass

    x0, y0, x1, y1 = d.textbbox((0, 0), LETTER, font=font)
    d.text((s / 2 - (x0 + x1) / 2, s / 2 - (y0 + y1) / 2), LETTER, font=font, fill=ON_ACCENT)

    return img.resize((size, size), Image.LANCZOS)


def splash(w, h):
    """شاشة بداية: الشعار في الوسط على خلفية سادة تملأ أي مقاس شاشة."""
    img = Image.new('RGB', (w, h), NIGHT)
    side = int(min(w, h) * 0.28)
    logo = build(side, hex_ratio=0.92)
    img.paste(logo, ((w - side) // 2, (h - side) // 2))
    return img


made = []

# ---- الأيقونة الرئيسية وكل مقاسات الويب و iOS ----
for n in (1024, 512, 192, 180, 152, 120, 76, 32, 16):
    p = OUT / f'icon-{n}.png'
    build(n).save(p, optimize=True)
    made.append(p)

# ---- أيقونة أندرويد القابلة للقص: المحتوى داخل 80% حتى لا يُقصّ ----
p = OUT / 'icon-maskable-512.png'
build(512, hex_ratio=0.60).save(p, optimize=True)
made.append(p)

# ---- شاشة البداية: مربعة 2732 تغطي كل أجهزة آبل بعد الاقتصاص ----
for name, (w, h) in {'splash-2732.png': (2732, 2732)}.items():
    p = OUT / name
    splash(w, h).save(p, optimize=True)
    made.append(p)

# ---- أصول iOS ----
# نولّدها هنا لا في أداة منفصلة: الأيقونة والشعار مصدر واحد، وأي تغيّر في
# الهوية يجب أن يصل الويب والتطبيق معاً وإلا اختلف شكلهما بلا أن ينتبه أحد.
IOS = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets'
if IOS.is_dir():
    # أيقونة التطبيق: آبل تطلب 1024×1024 مصمتة بلا شفافية ولا زوايا مدوّرة
    # (النظام يقصّها بنفسه). حفظها RGB يضمن غياب قناة ألفا.
    p = IOS / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'
    build(1024).convert('RGB').save(p, optimize=True)
    made.append(p)

    # شاشة البداية: مربّعة 2732 تُقصّ لأي مقاس شاشة. الملفات الثلاثة
    # المطلوبة في الكتالوج متطابقة عمداً — الفرق بينها في سلّم العرض فقط.
    splash_img = splash(2732, 2732)
    for name in ('splash-2732x2732.png',
                 'splash-2732x2732-1.png',
                 'splash-2732x2732-2.png'):
        p = IOS / 'Splash.imageset' / name
        splash_img.convert('RGB').save(p, optimize=True)
        made.append(p)

total = sum(f.stat().st_size for f in made)
for f in made:
    print(f'  {f.name:<26} {f.stat().st_size/1024:8.1f} KB')
print(f'\n{len(made)} files, {total/1024:.0f} KB total')
