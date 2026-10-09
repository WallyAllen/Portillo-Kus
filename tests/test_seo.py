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
        self.lang={'code':'es','html_lang':'es','hreflang':'es','slug':''}
        self.langs=[self.lang,{'code':'en','html_lang':'en','hreflang':'en','slug':'en'},
                    {'code':'pt','html_lang':'pt-BR','hreflang':'pt-BR','slug':'pt'}]

    def rendered(self):
        return seo.metadata(self.lang,self.flat,'https://portillokusestudio.com/','',langs=self.langs)

    def test_preview_cannot_be_indexed_even_with_flag(self):
        with patch.dict(os.environ,{'INDEXAR':'1'}):
            self.assertFalse(seo.can_index('https://example.pages.dev/'))
            self.assertFalse(seo.can_index('https://portillokusestudio.com/preview/'))
            self.assertTrue(seo.can_index('https://portillokusestudio.com/'))
        with patch.dict(os.environ,{'INDEXAR':''}):
            self.assertFalse(seo.can_index('https://portillokusestudio.com/'))

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
            self.assertTrue(all(len(entry)==5 for entry in root))
            self.assertIn('Disallow: /',(dist/'robots.txt').read_text())


if __name__=='__main__': unittest.main()
