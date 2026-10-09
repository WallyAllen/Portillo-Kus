"""Pruebas del generador, con copias temporales: nunca modifican src/ real."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'src', self.root / 'src')
        (self.root / 'portillo-images').mkdir()
        (self.root / 'portillo-images' / 'fixture.jpg').write_bytes(b'fixture')

    def run_build(self, *args, site_url=None):
        env = {k: v for k, v in os.environ.items() if k != 'SITE_URL'}
        env['PYTHONUTF8'] = '1'
        if site_url is not None:
            env['SITE_URL'] = site_url
        return subprocess.run([sys.executable, str(self.root / 'src/build.py'), *args],
                              capture_output=True, text=True, encoding='utf-8', env=env)

    def change(self, lang, edit):
        path = self.root / 'src' / f'content.{lang}.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        edit(data)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

    def test_normal_output_and_site_url(self):
        result = self.run_build(site_url='https://example.pages.dev')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('ADVERTENCIA', result.stdout)
        for slug in ('', 'en', 'pt', 'ru', 'zh'):
            html = (self.root / 'dist' / slug / 'index.html').read_text(encoding='utf-8')
            self.assertIn('https://example.pages.dev/portillo-images/og-', html)
            self.assertIn('data-pending="ciudadania.step1"', html)
            self.assertNotIn('content="[PENDIENTE]', html)
            self.assertNotIn('{{', html)
            self.assertNotIn('vercel.app', html)
        self.assertEqual((self.root / 'dist/portillo-images/fixture.jpg').read_bytes(), b'fixture')
        self.assertFalse((self.root / 'index.html').exists())
        # A rebuild removes stale output, including obsolete language directories.
        (self.root / 'dist/obsolete.html').write_text('old', encoding='utf-8')
        self.assertEqual(self.run_build().returncode, 0)
        self.assertFalse((self.root / 'dist/obsolete.html').exists())

    def test_missing_and_extra_keys_are_reported_before_writing(self):
        self.change('pt', lambda d: d['nav'].pop('contacto'))
        self.change('en', lambda d: d['nav'].update(unused={}))
        result = self.run_build()
        self.assertEqual(result.returncode, 1)
        self.assertIn('pt: faltan claves: nav.contacto', result.stderr)
        self.assertIn('en: sobran claves: nav.unused', result.stderr)
        self.assertFalse((self.root / 'dist').exists())

    def test_production_reports_all_languages_and_preserves_previous_output(self):
        self.assertEqual(self.run_build().returncode, 0)
        before = (self.root / 'dist/index.html').read_bytes()
        result = self.run_build('--produccion')
        self.assertEqual(result.returncode, 1)
        for code in ('es', 'en', 'pt', 'ru', 'zh'):
            self.assertIn(f'{code}: estudio.tag_matricula', result.stderr)
            self.assertIn(f'{code}: hero.reviews_text', result.stderr)
            self.assertIn(f'{code}: opiniones.r4_text', result.stderr)
        self.assertIn('build.py: clients', result.stderr)
        self.assertIn('build.py: rating', result.stderr)
        self.assertEqual((self.root / 'dist/index.html').read_bytes(), before)

    def test_production_succeeds_only_after_resolving_pending_values(self):
        def resolve(data):
            for key, value in data.items():
                if isinstance(value, dict):
                    resolve(value)
                elif key == 'contact_languages':
                    data[key] = 'es,en,pt-BR'
                elif isinstance(value, str) and value.startswith('[PENDIENTE]'):
                    data[key] = value.removeprefix('[PENDIENTE] ').strip()
        for code in ('es', 'en', 'pt', 'ru', 'zh'):
            self.change(code, resolve)
        build = self.root / 'src/build.py'
        source = build.read_text(encoding='utf-8')
        self.assertIn('SIN_CONFIRMAR = {"reviews", "rating", "clients"}', source)
        build.write_text(source.replace('SIN_CONFIRMAR = {"reviews", "rating", "clients"}',
                                        'SIN_CONFIRMAR = set()'), encoding='utf-8')
        result = self.run_build('--produccion')
        self.assertEqual(result.returncode, 0, result.stderr)
        html = (self.root / 'dist/index.html').read_text(encoding='utf-8')
        self.assertNotIn('data-pending=', html)
        self.assertNotIn('[PENDIENTE]', html)

    def test_unknown_template_key_and_invalid_url_fail(self):
        path = self.root / 'src/template.html'
        with path.open('a', encoding='utf-8') as source:
            source.write('{{does.not.exist}}')
        result = self.run_build()
        self.assertEqual(result.returncode, 1)
        self.assertIn('does.not.exist', result.stderr)
        result = self.run_build(site_url='example.com?x=1')
        self.assertEqual(result.returncode, 1)
        self.assertIn('SITE_URL', result.stderr)


if __name__ == '__main__':
    unittest.main()
