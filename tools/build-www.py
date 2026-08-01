# -*- coding: utf-8 -*-
"""
يجمع ملفات اللعبة في مجلد www/ ليحزمها Capacitor داخل التطبيق.

لماذا مجلد منفصل بدل توجيه Capacitor إلى جذر المشروع:
  الجذر يحوي node_modules ومجلد ios ومستند التصميم وأدوات البناء. توجيه
  webDir إلى الجذر يحشرها كلها داخل التطبيق فينتفخ حجمه بعشرات الميغابايتات
  بلا فائدة، وقد يُدخل ملفات لا يصح شحنها.

هذا ليس أداة بناء للويب: ملفات اللعبة تبقى HTML/CSS/JS خاماً تعمل مباشرة
من الجذر بلا أي تجميع. هذا نسخ فقط، ولا يلزم إلا لبناء تطبيق iOS.

تشغيل:  python tools/build-www.py
"""

import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
WWW = ROOT / 'www'

# ما يُشحن داخل التطبيق. أي إضافة جديدة للعبة يجب أن تُسجَّل هنا،
# وإلا اشتغلت في المتصفح وغابت عن التطبيق — وهو عطل صامت يصعب تفسيره.
FILES = ['index.html', 'manifest.json']
DIRS = ['css', 'js', 'data', 'assets']

# عامل الخدمة لا يُشحن: التطبيق يحمّل من نظام الملفات المحلي أصلاً،
# فطبقة التخزين زائدة وقد تقدّم نسخة قديمة بعد تحديث التطبيق.
EXCLUDE_NAMES = {'sw.js'}


def main():
    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir(parents=True)

    count = 0
    total = 0

    for name in FILES:
        src = ROOT / name
        if not src.exists():
            raise SystemExit(f'ملف مفقود: {name}')
        shutil.copy2(src, WWW / name)
        count += 1
        total += src.stat().st_size

    for d in DIRS:
        src = ROOT / d
        if not src.is_dir():
            raise SystemExit(f'مجلد مفقود: {d}')
        dst = WWW / d
        shutil.copytree(src, dst)
        for f in dst.rglob('*'):
            if f.is_file():
                if f.name in EXCLUDE_NAMES:
                    f.unlink()
                    continue
                count += 1
                total += f.stat().st_size

    print(f'www/: {count} files, {total/1024:.0f} KB')


if __name__ == '__main__':
    main()
