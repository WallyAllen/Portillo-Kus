"""Pruebas del generador, con copias temporales: nunca modifican src/ real."""
import json
import os
import re
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

    def test_home_pages_carry_valid_json_ld(self):
        self.assertEqual(self.run_build().returncode, 0)
        for slug, lang in (('', 'es'), ('en', 'en'), ('pt', 'pt-BR')):
            html = (self.root / 'dist' / slug / 'index.html').read_text(encoding='utf-8')
            blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            self.assertEqual(len(blocks), 1, slug)
            graph = {node['@type']: node for node in json.loads(blocks[0])['@graph']}
            self.assertEqual(graph['WebSite']['url'], 'https://portillokusestudio.com/')
            self.assertEqual(graph['WebSite']['inLanguage'], ['es', 'en', 'pt-BR'])
            self.assertEqual(graph['WebPage']['inLanguage'], lang)
            business = graph['LegalService']
            self.assertEqual(business['name'], 'Portillo Kus & Asociados')
            self.assertEqual(business['address']['postalCode'], 'C1035')
            self.assertEqual(len(business['sameAs']), 4)
            self.assertNotIn('aggregateRating', business)
            # Pie y JSON-LD leen la misma config: cada red del JSON-LD está enlazada en el pie.
            footer = html[html.index('<footer'):]
            self.assertTrue(all(f'href="{url}"' in footer for url in business['sameAs']))
            self.assertIn(business['email'], footer)

    def test_normal_output_and_site_url(self):
        result = self.run_build(site_url='https://example.pages.dev')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('ADVERTENCIA', result.stdout)
        for slug in ('', 'en', 'pt'):
            html = (self.root / 'dist' / slug / 'index.html').read_text(encoding='utf-8')
            self.assertIn('https://example.pages.dev/portillo-images/og-', html)
            # Una URL que no es la de producción nunca se indexa.
            self.assertIn('<meta name="robots" content="noindex, nofollow">', html)
            self.assertIn('data-pending="ciudadania.step1"', html)
            self.assertNotIn('content="[PENDIENTE]', html)
            # La vista previa muestra el texto base con una aclaración, sin el marcador.
            self.assertNotIn('[PENDIENTE]', html)
            self.assertIn('<span class="pending-flag">pendiente</span>', html)
            self.assertNotIn('{{', html)
            self.assertNotIn('vercel.app', html)
        self.assertEqual((self.root / 'dist/portillo-images/fixture.jpg').read_bytes(), b'fixture')
        self.assertFalse((self.root / 'index.html').exists())
        headers = (self.root / 'dist/_headers').read_text(encoding='utf-8')
        self.assertIn('/en/privacy/\n  Cache-Control: public, max-age=0, must-revalidate', headers)
        self.assertIn('/portillo-images/*\n  Cache-Control: public, max-age=604800', headers)
        self.assertNotIn('/*\n  Cache-Control:', headers.split('/portillo-images/*')[0])
        # A rebuild removes stale output, including obsolete language directories.
        (self.root / 'dist/obsolete.html').write_text('old', encoding='utf-8')
        self.assertEqual(self.run_build().returncode, 0)
        self.assertFalse((self.root / 'dist/obsolete.html').exists())

    def test_missing_headers_preserves_existing_output(self):
        self.assertEqual(self.run_build().returncode, 0)
        before = (self.root / 'dist/index.html').read_bytes()
        (self.root / 'src/_headers').unlink()
        result = self.run_build()
        self.assertEqual(result.returncode, 1)
        self.assertIn('_headers', result.stderr)
        self.assertEqual((self.root / 'dist/index.html').read_bytes(), before)

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
        for code in ('es', 'en', 'pt'):
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

    def test_production_head_is_indexable_with_canonical_and_alternates(self):
        result = self.run_build()
        self.assertEqual(result.returncode, 0, result.stderr)
        dist = self.root / 'dist'
        site = 'https://portillokusestudio.com/'
        pages = {'': ('es', 'es_AR', ''), 'en': ('en', 'en_US', 'en/'), 'pt': ('pt-BR', 'pt_BR', 'pt/'),
                 'privacidad': ('es', 'es_AR', 'privacidad/'), 'en/privacy': ('en', 'en_US', 'en/privacy/'),
                 'pt/privacidade': ('pt-BR', 'pt_BR', 'pt/privacidade/')}
        titles = set()
        for slug, (html_lang, locale, path) in pages.items():
            html = (dist / slug / 'index.html').read_text(encoding='utf-8')
            self.assertIn(f'<html lang="{html_lang}">', html)
            self.assertNotIn('name="robots"', html)
            self.assertIn(f'<link rel="canonical" href="{site}{path}">', html)
            self.assertIn(f'<meta property="og:url" content="{site}{path}">', html)
            self.assertIn(f'<meta property="og:locale" content="{locale}">', html)
            self.assertEqual(html.count('og:locale:alternate'), 2)
            self.assertIn(f'<meta property="og:image" content="{site}portillo-images/og-{html_lang[:2]}.jpg">', html)
            privacy = slug not in ('', 'en', 'pt')
            alternates = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', html)
            expected = ({'es': 'privacidad/', 'en': 'en/privacy/', 'pt-BR': 'pt/privacidade/', 'x-default': 'privacidad/'}
                        if privacy else {'es': '', 'en': 'en/', 'pt-BR': 'pt/', 'x-default': ''})
            self.assertEqual(dict(alternates), {k: site + v for k, v in expected.items()})
            titles.add(re.search(r'<title>(.*?)</title>', html).group(1))
        self.assertEqual(len(titles), len(pages))
        robots = (dist / 'robots.txt').read_text(encoding='utf-8')
        self.assertIn('Allow: /', robots)
        self.assertNotIn('Disallow', robots)
        self.assertIn(f'Sitemap: {site}sitemap.xml', robots)

    def test_edge_files_404_icons_and_redirects(self):
        (self.root / 'portillo-images' / 'notas.md').write_text('interno', encoding='utf-8')
        self.assertEqual(self.run_build().returncode, 0)
        dist = self.root / 'dist'
        page = (dist / '404.html').read_text(encoding='utf-8')
        self.assertIn('<meta name="robots" content="noindex">', page)
        self.assertNotIn('rel="canonical"', page)
        self.assertNotIn('hreflang="x-default"', page)
        self.assertIn('Esta página no existe', page)
        self.assertIn('href="/"', page)  # enlaces absolutos: la 404 se sirve desde cualquier ruta
        self.assertIn('href="https://wa.me/', page)
        for name in ('favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest'):
            self.assertTrue((dist / name).is_file(), name)
        for html in ('index.html', 'en/index.html', 'privacidad/index.html', '404.html'):
            head = (dist / html).read_text(encoding='utf-8')
            for rel in ('rel="icon"', 'rel="apple-touch-icon"', 'rel="manifest"'):
                self.assertIn(rel, head)
        manifest = json.loads((dist / 'site.webmanifest').read_text(encoding='utf-8'))
        self.assertEqual(manifest['theme_color'], '#F7F5F1')
        redirects = (dist / '_redirects').read_text(encoding='utf-8')
        for line in ('/index.html / 301', '/contacto /#contacto 301', '/servicios/ /#areas 301'):
            self.assertIn(line, redirects)
        self.assertFalse((dist / 'portillo-images' / 'notas.md').exists())
        sitemap = (dist / 'sitemap.xml').read_text(encoding='utf-8')
        self.assertEqual(sitemap.count('<lastmod>'), 6)
        self.assertEqual((dist / 'robots.txt').read_text(encoding='utf-8'),
                         'User-agent: *\nAllow: /\nSitemap: https://portillokusestudio.com/sitemap.xml\n')
        config = (ROOT / 'wrangler.jsonc').read_text(encoding='utf-8')
        self.assertIn('"not_found_handling": "404-page"', config)
        self.assertIn('"directory": "./dist"', config)

    def test_hidden_languages_are_not_published(self):
        self.assertEqual(self.run_build().returncode, 0)
        dist = self.root / 'dist'
        for slug in ('ru', 'zh'):
            self.assertFalse((dist / slug).exists())
        sitemap = (dist / 'sitemap.xml').read_text(encoding='utf-8')
        self.assertNotIn('/ru/', sitemap)
        self.assertNotIn('/zh/', sitemap)
        for slug in ('', 'en', 'pt', 'privacidad'):
            html = (dist / slug / 'index.html').read_text(encoding='utf-8')
            for hidden in ('hreflang="ru"', 'hreflang="zh-Hans"', 'ru_RU', 'zh_CN', '/ru/', '/zh/'):
                self.assertNotIn(hidden, html)
        # Su contenido sigue en el repo, listo para la etapa 2.
        for code in ('ru', 'zh'):
            self.assertTrue((self.root / 'src' / f'content.{code}.json').exists())

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
