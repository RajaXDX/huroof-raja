# -*- coding: utf-8 -*-
"""
ينزّل خطوط الواجهة من Google Fonts ويحزمها داخل المشروع.

لماذا نحزمها بدل الربط بـ Google:
  التطبيق معروض كلعبة تعمل بلا إنترنت. رابط خارجي للخط يعني أن أول فتح
  بلا تغطية يُظهر اللعبة بخط بديل مكسور، وآبل ترفض ذلك ضمن بند 4.2.

يولّد: css/fonts.css + assets/fonts/*.woff2
تشغيل:  python tools/fetch-fonts.py
"""

import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / 'assets' / 'fonts'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

# الأوزان مأخوذة من مواصفة التصميم: Cairo للعناوين والأزرار، Almarai للنص
FAMILIES = {
    'Cairo': 'Cairo:wght@400;600;700;900',
    'Almarai': 'Almarai:wght@300;400;700',
}


def main():
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    for old in FONT_DIR.glob('*.woff2'):
        old.unlink()

    blocks, total, count = [], 0, 0

    for family, spec in FAMILIES.items():
        req = urllib.request.Request(
            f'https://fonts.googleapis.com/css2?family={spec}&display=swap',
            headers={'User-Agent': UA})
        css = urllib.request.urlopen(req).read().decode('utf-8')

        for face in re.findall(r'@font-face\s*\{(.*?)\}', css, re.S):
            weight = re.search(r'font-weight:\s*(\d+)', face).group(1)
            urange = re.search(r'unicode-range:\s*([^;]+);', face).group(1).strip()
            url = re.search(r'url\((https://[^)]+\.woff2)\)', face).group(1)

            # Cairo يُقدَّم في نطاقات كثيرة (لاتيني موسّع، يوناني...) لا نحتاجها.
            # نأخذ العربي واللاتيني الأساسي فقط — الباقي وزن ميت في التطبيق.
            if 'U+0600' in urange:
                kind = 'arabic'
            elif 'U+0000-00FF' in urange:
                kind = 'latin'
            else:
                continue

            name = f'{family.lower()}-{weight}-{kind}.woff2'
            data = urllib.request.urlopen(url).read()
            (FONT_DIR / name).write_bytes(data)
            total += len(data)
            count += 1

            blocks.append(f"""@font-face {{
  font-family: '{family}';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url('../assets/fonts/{name}') format('woff2');
  unicode-range: {urange};
}}""")

    (ROOT / 'css' / 'fonts.css').write_text(
        "/* خطوط Cairo و Almarai محزومة محلياً — التطبيق يجب أن يعمل بلا إنترنت.\n"
        "   مولَّدة من Google Fonts (رخصة SIL OFL) عبر tools/fetch-fonts.py.\n"
        "   لا تُعدَّل يدوياً — أعد تشغيل السكربت. */\n\n"
        + "\n\n".join(blocks) + "\n", encoding='utf-8')

    print(f'{count} font files, {total/1024:.0f} KB')


if __name__ == '__main__':
    main()
