import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('seo',ROOT/'src/seo.py')
seo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seo)


def flatten(data,prefix=''):
    result={}
    for k,v in data.items():
        key=prefix+k
        if isinstance(v,dict): result.update(flatten(v,key+'.'))
        else: result[key]=v
    return result


class SeoTests(unittest.TestCase):
    def setUp(self):
        self.flat=flatten(json.loads((ROOT/'src/content.es.json').read_text(encoding='utf-8')))
        # Los arma build.py; sin confirmar llevan el marcador.
        self.flat.update({'num.rating':'[PENDIENTE] 5,0','num.rating_raw':'5.0','num.reviews':'[PENDIENTE] 417'})
        self.lang={'code':'es','html_lang':'es','hreflang':'es','slug':'','og_locale':'es_AR'}
        self.langs=[self.lang,{'code':'en','html_lang':'en','hreflang':'en','slug':'en','og_locale':'en_US'},
                    {'code':'pt','html_lang':'pt-BR','hreflang':'pt-BR','slug':'pt','og_locale':'pt_BR'}]

    def rendered(self):
        return seo.metadata(self.lang,self.flat,'https://portillokusestudio.com/','',langs=self.langs)

    def test_production_is_indexable_by_default_and_previews_are_not(self):
        with patch.dict(os.environ,{'NOINDEX':''}):
            self.assertTrue(seo.can_index(seo.SITE_URL))
            self.assertTrue(seo.can_index('https://portillokusestudio.com/'))
            self.assertFalse(seo.can_index('https://example.pages.dev/'))
            self.assertFalse(seo.can_index('https://portillokusestudio.com/preview/'))
            self.assertNotIn('name="robots"',self.rendered())
        with patch.dict(os.environ,{'NOINDEX':'1'}):
            self.assertFalse(seo.can_index('https://portillokusestudio.com/'))
            self.assertIn('<meta name="robots" content="noindex, nofollow">',self.rendered())

    def test_site_url_has_no_trailing_slash(self):
        self.assertEqual(seo.SITE_URL,'https://portillokusestudio.com')

    def test_og_locale_alternates_list_the_other_languages(self):
        html=self.rendered()
        self.assertIn('<meta property="og:locale" content="es_AR">',html)
        self.assertIn('<meta property="og:locale:alternate" content="en_US">',html)
        self.assertIn('<meta property="og:locale:alternate" content="pt_BR">',html)
        self.assertNotIn('og:locale:alternate" content="es_AR"',html)

    def test_pending_rating_and_contact_languages_are_omitted(self):
        html=self.rendered()
        payload=json.loads(html.split('<script type="application/ld+json">')[1].split('</script>')[0])
        business=payload['@graph'][-1]
        self.assertNotIn('aggregateRating',business)
        self.assertNotIn('contactPoint',business)
        self.assertEqual(business['@type'],'LegalService')
        self.assertIn('twitter:card',html)
        self.assertIn('rel="canonical"',html)

    def test_confirmed_rating_is_included_and_invalid_rating_fails(self):
        self.flat.update({'num.rating':'5,0','num.reviews':'417'})
        self.assertIn('aggregateRating',self.rendered())
        self.flat['num.rating_raw']='6'
        with self.assertRaises(ValueError): self.rendered()

    def test_metadata_limits_and_script_escaping(self):
        self.flat['meta.title']='x'*61
        with self.assertRaises(ValueError): self.rendered()
        self.flat['meta.title']='Portillo Kus'
        self.flat['contacto.card1_title']='</script><script>unsafe</script>'
        html=self.rendered()
        self.assertNotIn('</script><script>unsafe',html)

    def test_sitemap_contains_all_six_routes_and_alternates(self):
        def path_for(lang,page):
            return ((lang['slug']+'/') if lang['slug'] else '') + (
                {'es':'privacidad/','en':'privacy/','pt':'privacidade/'}[lang['code']] if page=='privacy' else '')
        with tempfile.TemporaryDirectory() as temp:
            dist=Path(temp)
            seo.write_files(dist,'https://example.pages.dev/',self.langs,path_for)
            root=seo.ET.parse(dist/'sitemap.xml').getroot()
            self.assertEqual(len(root),6)
            self.assertTrue(all(len(entry)==6 for entry in root))
            self.assertIn('Disallow: /',(dist/'robots.txt').read_text())


if __name__=='__main__': unittest.main()
