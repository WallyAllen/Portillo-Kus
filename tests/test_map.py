"""Verifica privacidad del mapa, destinos y enlaces pendientes sin navegador."""
import importlib.util
import json
from html.parser import HTMLParser
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('site_build', ROOT / 'src/build.py')
site_build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site_build)


class Elements(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.elements = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


class MapTests(unittest.TestCase):
    def render(self, lang, maps_url=None):
        data = json.loads((ROOT / 'src' / f"content.{lang['code']}.json").read_text(encoding='utf-8'))
        if maps_url is not None:
            data['google_maps_url'] = maps_url
        template = (ROOT / 'src/template.html').read_text(encoding='utf-8')
        flat = {k: site_build.resolve_reviews(v) for k, v in site_build.flatten(data).items()}
        return site_build.build(lang, template, 'https://example.test/', flat)

    def test_no_live_map_before_activation_and_exact_directions(self):
        for lang in site_build.LANGS:
            html = self.render(lang)
            elements = Elements(html).elements
            self.assertFalse(any(tag == 'iframe' for tag, attrs in elements))
            map_button = next(attrs for tag, attrs in elements if 'data-map-load' in attrs)
            self.assertEqual(map_button['type'], 'button')
            self.assertEqual(map_button['data-event'], 'mapa_click')
            self.assertEqual(map_button['data-lang'], lang['code'])
            self.assertEqual(map_button['data-button'], 'contacto-mapa')
            directions = next(attrs for tag, attrs in elements if attrs.get('data-event') == 'como_llegar_click')
            query = parse_qs(urlsplit(directions['href']).query)
            self.assertEqual(query['api'], ['1'])
            self.assertEqual(query['destination'], ['Av. Pres. Roque Sáenz Peña 616, C1035 CABA'])
            # Navigation hrefs do not request resources on page load.
            for tag, attrs in elements:
                resource = attrs.get('src', '')
                if tag == 'link' and attrs.get('rel') in ('preconnect', 'stylesheet', 'prefetch'):
                    resource = attrs.get('href', '')
                self.assertNotIn('www.google.com', resource)
            self.assertNotIn('/maps/search/', html)

    def test_pending_and_invalid_profile_links_never_navigate(self):
        for value in ('[PENDIENTE] Confirmar ficha', '', 'javascript:alert(1)',
                      'https://example.com/maps/place/test', 'https://www.google.com/search?q=test',
                      'https://[invalid', 'https://user@www.google.com/maps/place/test'):
            with self.subTest(value=value):
                html = self.render(site_build.LANGS[0], value)
                links = [attrs for tag, attrs in Elements(html).elements
                         if attrs.get('data-button') in ('google_reviews', 'google_profile')]
                self.assertEqual(len(links), 3)
                for attrs in links:
                    self.assertNotIn('href', attrs)
                    self.assertNotIn('tabindex', attrs)
                    self.assertEqual(attrs['aria-disabled'], 'true')
                    self.assertEqual(attrs['role'], 'link')

    def test_single_source_confirmed_profile_and_translated_map(self):
        urls = set()
        buttons = set()
        titles = set()
        for lang in site_build.LANGS:
            data = json.loads((ROOT / 'src' / f"content.{lang['code']}.json").read_text(encoding='utf-8'))
            urls.add(data['google_maps_url'])
            buttons.add(data['contacto']['map_button'])
            titles.add(data['contacto']['map_title'])
            for tag, attrs in Elements(self.render(lang)).elements:
                if attrs.get('data-button') in ('google_reviews', 'google_profile'):
                    self.assertEqual(attrs['href'], data['google_maps_url'])
                    self.assertNotIn('aria-disabled', attrs)
        self.assertEqual(len(urls), 1)
        self.assertEqual(len(buttons), len(site_build.LANGS) - 1)  # Spanish and Portuguese use Ver mapa.
        self.assertEqual(len(titles), len(site_build.LANGS))


if __name__ == '__main__':
    unittest.main()
