"""_headers del Worker: seguridad, caché, CSP por hash y versionado de imágenes."""
import base64
import hashlib
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from headers import build_csp
from images import version_images


def blocks(text):
    """{ruta: [líneas de encabezado]} del _headers."""
    result = {}
    for block in re.split(r'\n\s*\n', text.strip()):
        lines = [l for l in block.splitlines() if not l.startswith('#')]
        result[lines[0]] = [l.strip() for l in lines[1:]]
    return result


class HeadersTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'src/build.py')], check=True, capture_output=True)
        cls.dist = ROOT / 'dist'
        cls.rules = blocks((cls.dist / '_headers').read_text(encoding='utf-8'))

    def test_global_security_headers(self):
        glob = self.rules['/*']
        for header in ('X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin',
                       'X-Frame-Options: SAMEORIGIN', 'Permissions-Policy: camera=(), microphone=(), geolocation=()'):
            self.assertIn(header, glob)
        self.assertFalse([l for l in glob if l.startswith(('Strict-Transport-Security', 'Cache-Control'))])
        self.assertEqual(len([r for r in self.rules if r == '/*']), 1)

    def test_cache_rules(self):
        immutable = ['Cache-Control: public, max-age=31536000, immutable']
        self.assertEqual(self.rules['/fonts/*'], immutable)
        self.assertEqual(self.rules['/portillo-images/*'], immutable)
        for route in ('/', '/en/', '/pt/', '/privacidad/', '/*.html', '/sitemap.xml', '/robots.txt', '/site.webmanifest', '/version.json'):
            self.assertEqual(self.rules[route], ['Cache-Control: public, max-age=0, must-revalidate'], route)

    def test_no_pages_dev_rules(self):
        self.assertFalse([r for r in self.rules if 'pages.dev' in r])

    def test_csp_covers_inline_scripts_by_hash(self):
        csp = next(l for l in self.rules['/*'] if l.startswith('Content-Security-Policy:'))
        script_src = re.search(r"script-src ([^;]*)", csp).group(1)
        self.assertNotIn("'unsafe-inline'", script_src)
        self.assertNotIn('umami', csp)  # sin UMAMI_ID no hay terceros
        for page in self.dist.rglob('*.html'):
            html = page.read_text(encoding='utf-8')
            for attrs, body in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, flags=re.S):
                if 'ld+json' in attrs:
                    continue
                self.assertNotIn('src=', attrs)
                digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
                self.assertIn(f"'sha256-{digest}'", script_src, page.name)

    def test_csp_adds_umami_only_when_present(self):
        page = '<script defer src="https://cloud.umami.is/script.js" data-website-id="x"></script>'
        with_umami = build_csp([page])
        self.assertIn('script-src \'self\' https://cloud.umami.is', with_umami)
        self.assertIn('connect-src \'self\' https://cloud.umami.is https://api-gateway.umami.dev', with_umami)
        self.assertNotIn('umami', build_csp(['<p>sin medición</p>']))

    def test_images_versioned_everywhere(self):
        for page in self.dist.rglob('*.html'):
            html = page.read_text(encoding='utf-8')
            for ref in re.findall(r'portillo-images/[\w.-]+\.(?:jpe?g|png|avif|webp)(?!\?v=[0-9a-f]{10})', html):
                self.fail(f'{page.name}: referencia sin versión: {ref}')

    def test_version_images_uses_content_hash(self):
        out = version_images('<img src="a/portillo-images/x.jpg"> "https://h/portillo-images/y.png" z.jpg',
                             {'x.jpg': 'abc', 'y.png': 'def'})
        self.assertIn('portillo-images/x.jpg?v=abc"', out)
        self.assertIn('portillo-images/y.png?v=def"', out)
        self.assertEqual(version_images('portillo-images/otro.jpg', {}), 'portillo-images/otro.jpg')


if __name__ == '__main__':
    unittest.main()
