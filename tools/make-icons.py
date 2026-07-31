# -*- coding: utf-8 -*-
"""
يولّد كل أيقونات التطبيق وشاشات البداية من تعريف واحد.

لماذا سكربت لا ملفات مرسومة يدوياً:
  الأيقونة مطلوبة بعشرة مقاسات لأربع منصات. تعديل اللون أو الشكل يدوياً
  يعني إعادة رسم عشرة ملفات وضمان تطابقها. هنا يُعدَّل ثابت واحد ويُعاد
  التشغيل.

التصميم: مسدس ذهبي مصمت على خلفية خضراء داكنة، وحرف «ح» أخضر داخله.
  التباين عالٍ عمداً — الأيقونة تُقرأ على 60 بكسل في شاشة الجوال.

تشغيل:  python .build/make_icons.py
"""

import math
import pathlib
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / '.build' / 'Tajawal-Bold.ttf'
OUT = ROOT / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

# ننزّل الخط عند الحاجة بدل حفظه في المستودع: ملف ثنائي 200 كيلوبايت
# لا يُقرأ ولا يُراجع في المراجعات، وهو متاح دائماً من مصدره الرسمي.
FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/tajawal/Tajawal-Bold.ttf'
if not FONT.exists():
    FONT.parent.mkdir(parents=True, exist_ok=True)
    print('downloading Tajawal-Bold.ttf ...')
    urllib.request.urlretrieve(FONT_URL, FONT)

# هوية «رجا» — نفس متغيّرات css/style.css
NIGHT = (10, 26, 20)
PANEL = (23, 63, 47)
GOLD = (212, 175, 55)
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
    x0, y0, x1, y1 = d.textbbox((0, 0), LETTER, font=font)
    d.text((s / 2 - (x0 + x1) / 2, s / 2 - (y0 + y1) / 2), LETTER, font=font, fill=NIGHT)

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

total = sum(f.stat().st_size for f in made)
for f in made:
    print(f'  {f.name:<26} {f.stat().st_size/1024:8.1f} KB')
print(f'\n{len(made)} files, {total/1024:.0f} KB total')
