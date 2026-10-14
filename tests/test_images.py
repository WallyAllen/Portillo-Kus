"""Variantes decodificables, dimensiones reales, idiomas y assets locales."""
from html.parser import HTMLParser
from io import BytesIO
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from images import prepare_images, render_images


class ImagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'portillo-images'
        self.source.mkdir()

    def test_formats_dimensions_and_no_upscale(self):
        Image.new('RGB', (1000, 500), '#36597c').save(self.source / 'hero-diagonal.jpg')
        template = '<img src="portillo-images/hero-diagonal.jpg" alt="Buenos Aires" loading="eager" fetchpriority="high">'
        assets, files = prepare_images(self.source, template)
        self.assertEqual(assets['hero-diagonal.jpg']['width'], 1000)
        self.assertEqual(assets['hero-diagonal.jpg']['height'], 500)
        self.assertEqual(len(files), 6)
        for name, data in files.items():
            target = int(name.rsplit('-', 1)[1].split('.')[0])
            image = Image.open(BytesIO(data))
            self.assertEqual(image.size, (target, target // 2))
            self.assertIn(image.format, ('AVIF', 'WEBP'))
            self.assertLessEqual(image.width, 1000)
        markup = render_images(template, assets)
        self.assertIn('type="image/avif"', markup)
        self.assertIn('type="image/webp"', markup)
        self.assertIn('sizes="100vw"', markup)
        self.assertIn('width="1000" height="500"', markup)
        self.assertIn('alt="Buenos Aires" loading="eager" fetchpriority="high"', markup)
        self.assertIn('src="portillo-images/hero-diagonal.jpg"', markup)

    def test_small_logo_is_not_upscaled_and_fixture_bytes_remain_untouched(self):
        Image.new('RGB', (150, 80), 'white').save(self.source / 'logo.jpg')
        (self.source / 'fixture.jpg').write_bytes(b'fixture')
        template = '<img src="../portillo-images/logo.jpg" alt="" loading="lazy">'
        assets, files = prepare_images(self.source, template)
        self.assertEqual(files, {})
        self.assertIn('width="150" height="80"', render_images(template, assets))
        self.assertEqual((self.source / 'fixture.jpg').read_bytes(), b'fixture')

    def test_real_photo_corruption_is_reported(self):
        (self.source / 'hero-diagonal.jpg').write_bytes(b'not-an-image')
        with self.assertRaises(OSError):
            prepare_images(self.source, '<img src="portillo-images/hero-diagonal.jpg">')

    def test_all_routes_use_existing_local_fonts_and_homes_use_variants(self):
        shutil.copytree(ROOT / 'src', self.root / 'src')
        shutil.copytree(ROOT / 'site-fonts', self.root / 'site-fonts')
        template = (ROOT / 'src/template.html').read_text(encoding='utf-8')
        names = set(re.findall(r'<img\b[^>]*\bsrc="[^" ]*portillo-images/([^"/]+)"', template))
        for name in names:
            size = (150, 80) if name.startswith('logo.') else (640, 480)
            Image.new('RGB', size, '#36597c').save(self.source / name)
        env = {key: value for key, value in os.environ.items() if key not in ('UMAMI_ID','SITE_URL')}
        env['PYTHONUTF8'] = '1'
        result = subprocess.run([sys.executable, str(self.root / 'src/build.py')],
                                capture_output=True, text=True, encoding='utf-8', env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        for route in ('', 'en', 'pt', 'ru', 'zh', 'privacidad', 'en/privacy', 'pt/privacidade',
                      'ru/privacy', 'zh/privacy'):
            output = self.root / 'dist' / route / 'index.html'
            markup = output.read_text(encoding='utf-8')
            self.assertNotIn('fonts.googleapis.com', markup)
            self.assertNotIn('fonts.gstatic.com', markup)
            paths = re.findall(r'(?:href="|url\(\x27)([^"\x27]+\.woff2)', markup)
            self.assertTrue(paths)
            for font_path in paths:
                self.assertTrue((output.parent / font_path).resolve().is_file(), font_path)
                self.assertRegex(font_path, r'(?:^|/)fonts/[^/]+-[a-f0-9]{8}\.woff2$')
            preloads = re.findall(r'<link rel="preload" href="[^"]*fonts/([a-z-]+)-[a-f0-9]{8}\.woff2"', markup)
            title_font = 'cormorant-garamond-normal-' + ('cyrillic' if route.startswith('ru') else 'latin')
            self.assertEqual(preloads[0], title_font)  # la del título (LCP) primero
            self.assertEqual('karla-normal-latin' in preloads, not route.startswith('ru'))
            if route in ('', 'en', 'pt', 'ru', 'zh'):
                logos = sum(name.startswith('logo.') for name in names)  # 150 px: sin variantes
                self.assertEqual(markup.count('<source type="image/avif"'), len(names)-logos)
                self.assertEqual(markup.count('<source type="image/webp"'), len(names)-logos)
                parser = ImageTags()
                parser.feed(markup)
                for tag in parser.images:
                    self.assertGreater(int(tag['width']), 0)
                    self.assertGreater(int(tag['height']), 0)
                    self.assertIn('alt', tag)
                hero = next(tag for tag in parser.images if 'hero-diagonal.jpg' in tag['src'])
                self.assertEqual(hero['loading'], 'eager')
                # En móvil el hero es fondo y el LCP es el título: prioridad baja para
                # no competir con sus fuentes. En escritorio la foto es el LCP: un
                # preload AVIF con media le da prioridad alta sólo ahí.
                self.assertEqual(hero['fetchpriority'], 'low')
                self.assertNotIn('data-preload-media', markup)
                preload = re.search(r'<link rel="preload" as="image"[^>]*>', markup).group(0)
                self.assertIn('media="(min-width: 900px)"', preload)
                self.assertIn('fetchpriority="high"', preload)
                self.assertIn('hero-diagonal-', preload)
                self.assertLess(markup.index(preload), markup.index('hero-diagonal.jpg'))
        manifest = json.loads((self.root/'dist/fonts/sources.json').read_text(encoding='utf-8'))
        self.assertEqual(len({item['file'] for item in manifest}), 5)


class ImageTags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            self.images.append(dict(attrs))


if __name__ == '__main__':
    unittest.main()
