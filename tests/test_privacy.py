"""Privacy routing, translated content and shared components of the static output."""
from html.parser import HTMLParser
import json
from pathlib import Path
import posixpath
import shutil
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ROUTES = {'es': 'privacidad', 'en': 'en/privacy', 'pt': 'pt/privacidade'}
HREFLANG_CODE = {'pt-BR': 'pt'}
sys.path.insert(0, str(ROOT / 'src'))
import build  # noqa: E402


class Links(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.tags = []
        self.feed(markup)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class PrivacyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        shutil.copytree(ROOT / 'src', cls.root / 'src')
        shutil.copytree(ROOT / 'site-fonts', cls.root / 'site-fonts')
        (cls.root / 'portillo-images').mkdir()
        Image.new('RGB', (150, 80), 'white').save(cls.root / 'portillo-images/logo.jpg')
        Image.new('RGBA', (150, 80), 'white').save(cls.root / 'portillo-images/logo.png')  # encabezado
        result = subprocess.run([sys.executable, str(cls.root / 'src/build.py'),
                                 '--base-url', 'https://example.com/site/'],
                                capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise AssertionError(result.stderr)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def page(self, slug):
        return (self.root / 'dist' / slug / 'index.html').read_text(encoding='utf-8')

    def test_local_links_and_language_selector_stay_on_privacy_pages(self):
        for code, slug in ROUTES.items():
            page = self.page(slug)
            links = Links(page).tags
            self.assertNotIn('{{', page)
            self.assertNotIn('<form', page)
            self.assertNotIn('<iframe', page)
            self.assertEqual(page.count('<h1>'), 1)
            selector = [attrs for tag, attrs in links if tag == 'a' and 'hreflang' in attrs]
            self.assertEqual(len(selector), len(ROUTES))
            for attrs in selector:
                target_code = HREFLANG_CODE.get(attrs['hreflang'], attrs['hreflang'])
                if target_code == code:
                    self.assertEqual(attrs['href'], '#top')
                else:
                    target = posixpath.normpath(posixpath.join(slug, attrs['href']))
                    self.assertEqual(target, ROUTES[target_code])
            # Every relative resource/link resolves to a generated file or directory.
            for tag, attrs in links:
                for attr in ('href', 'src'):
                    href = attrs.get(attr, '')
                    if not href or href.startswith(('#', 'https:', 'http:', 'mailto:', 'tel:')):
                        continue
                    self.assertTrue((self.root / 'dist' / slug / href.split('#')[0].split('?')[0]).exists(), href)

    def test_privacy_hreflang_and_default_use_privacy_routes(self):
        expected = {'es': 'privacidad/', 'en': 'en/privacy/', 'pt-BR': 'pt/privacidade/',
                    'x-default': 'privacidad/'}
        for slug in ROUTES.values():
            actual = {attrs['hreflang']: attrs['href'] for tag, attrs in Links(self.page(slug)).tags
                      if tag == 'link' and attrs.get('rel') == 'alternate'}
            self.assertEqual(actual, {key: 'https://example.com/site/' + route
                                      for key, route in expected.items()})

    def test_home_footer_privacy_links_are_localized(self):
        for code, home in {'es': '', 'en': 'en', 'pt': 'pt'}.items():
            content = json.loads((ROOT / 'src' / f'content.{code}.json').read_text(encoding='utf-8'))
            expected_href = posixpath.relpath(ROUTES[code], home or '.') + '/'
            self.assertIn(f'href="{expected_href}">{content["footer"]["privacy_label"]}</a>', self.page(home))
            self.assertIn(content['privacy']['title'], self.page(ROUTES[code]))
            self.assertIn(content['footer']['address'], self.page(ROUTES[code]))
            mails = [attrs for tag, attrs in Links(self.page(ROUTES[code])).tags
                     if tag == 'a' and attrs.get('href', '').startswith('mailto:')]
            self.assertEqual(len(mails), 2)
            self.assertTrue(all(a['href'] == 'mailto:' + build.ESTUDIO['email'] for a in mails))
            self.assertTrue(all(a['data-lang'] == code and a['data-button'] == 'privacidad'
                                and a['data-event'] == 'mail_click' for a in mails))

    def test_components_are_reused_from_the_home_source(self):
        source = self.root / 'src/template.html'
        markup = source.read_text(encoding='utf-8')
        markup = markup.replace('class="footer-logo"', 'class="footer-logo" data-shared="yes"')
        markup = markup.replace('</style>', '.shared-proof{color:inherit;}\n</style>', 1)
        source.write_text(markup, encoding='utf-8')
        try:
            result = subprocess.run([sys.executable, str(self.root / 'src/build.py')],
                                    capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(result.returncode, 0, result.stderr)
            for slug in ROUTES.values():
                self.assertIn('data-shared="yes"', self.page(slug))
                self.assertIn('.shared-proof{color:inherit;}', self.page(slug))
        finally:
            source.write_text(markup.replace(' data-shared="yes"', '').replace('.shared-proof{color:inherit;}\n', ''), encoding='utf-8')
            subprocess.run([sys.executable, str(self.root / 'src/build.py'),
                            '--base-url', 'https://example.com/site/'], capture_output=True)


if __name__ == '__main__':
    unittest.main()
