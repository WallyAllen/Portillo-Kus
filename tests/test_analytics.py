"""Contrato P04: opcionalidad, cobertura de contactos y exclusión de PII."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from analytics import analytics_fields, validate_analytics

# Fixture sintáctica local, nunca configurar este ID en una cuenta o despliegue.
TEST_ID = '00000000-0000-4000-8000-000000000000'


class AnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'src', self.root / 'src')
        (self.root / 'portillo-images').mkdir()

    def run_build(self, website_id=None):
        env = {key: value for key, value in os.environ.items()
               if key not in ('UMAMI_ID', 'SITE_URL')}
        env['PYTHONUTF8'] = '1'
        if website_id is not None:
            env['UMAMI_ID'] = website_id
        return subprocess.run([sys.executable, str(self.root / 'src/build.py')],
                              capture_output=True, text=True, encoding='utf-8', env=env)

    def test_script_is_optional_and_only_accepts_uuid(self):
        for value in (None, '', '   '):
            fields = analytics_fields('es', value)
            self.assertEqual(fields['analytics_script'], '')
            self.assertEqual(fields['analytics_listener'], '')
        fields = analytics_fields('pt', TEST_ID)
        self.assertIn('https://cloud.umami.is/script.js', fields['analytics_script'])
        self.assertIn('data-exclude-search="true"', fields['analytics_script'])
        self.assertIn('data-exclude-hash="true"', fields['analytics_script'])
        self.assertNotIn('data-auto-track="false"', fields['analytics_script'])
        for invalid in ('inventado', '<script>', TEST_ID + '" onload="bad', '0' * 36):
            with self.assertRaisesRegex(ValueError, 'UMAMI_ID'):
                analytics_fields('es', invalid)

    def test_contact_links_fail_without_complete_valid_attributes(self):
        for contact in ('data-wa href="#"', 'href="https://wa.me/123?text=privado"',
                        'href="//wa.me/123"', 'href="tel:+123"', 'href="mailto:a@example.test"'):
            with self.subTest(contact=contact), self.assertRaises(ValueError):
                validate_analytics(f'<a {contact}>Contactar</a>', 'es')
        good = 'data-event="mail_click" data-button="privacidad" data-lang="pt"'
        validate_analytics(f'<a href="mailto:a@example.test" {good}>Mail</a>', 'pt')
        for bad in (good.replace('mail_click', 'whatsapp_click'),
                    good.replace('privacidad', 'nombre-de-cliente'),
                    good.replace('pt', 'pt-BR'), good + ' data-topic="texto libre"'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_analytics(f'<a href="mailto:a@example.test" {bad}>Mail</a>', 'pt')

    def test_future_map_events_and_automatic_duplicates(self):
        for event, button in (('mapa_click', 'contacto-mapa'),
                              ('como_llegar_click', 'contacto-como-llegar')):
            validate_analytics(f'<button data-event="{event}" data-button="{button}" '
                               'data-lang="en">Mapa</button>', 'en')
        with self.assertRaisesRegex(ValueError, 'duplica'):
            validate_analytics('<a data-umami-event="whatsapp_click">WA</a>', 'es')

    def test_build_instruments_all_languages_and_disabled_has_no_umami_requests(self):
        for website_id in (None, '   ', TEST_ID):
            result = self.run_build(website_id)
            self.assertEqual(result.returncode, 0, result.stderr)
            for code, slug in (('es', ''), ('en', 'en'), ('pt', 'pt')):
                markup = (self.root / 'dist' / slug / 'index.html').read_text(encoding='utf-8')
                validate_analytics(markup, code)
                self.assertIn(f'data-lang="{code}"', markup)
                self.assertIn('data-button="portada"', markup)
                self.assertIn('data-button="area-laboral"', markup)
                self.assertIn('data-button="barra-movil"', markup)
                if website_id == TEST_ID:
                    self.assertEqual(markup.count('https://cloud.umami.is/script.js'), 1)
                    self.assertEqual(markup.count("target.closest('[data-event]')"), 1)
                else:
                    self.assertNotIn('umami', markup.lower())
            if website_id == TEST_ID:
                self.assertNotIn('data-umami-event=', markup)

    def test_invalid_id_or_missing_contact_attributes_preserve_existing_output(self):
        self.assertEqual(self.run_build().returncode, 0)
        before = (self.root / 'dist/index.html').read_bytes()
        invalid_id = self.run_build('no-es-un-id')
        self.assertEqual(invalid_id.returncode, 1)
        self.assertIn('UMAMI_ID', invalid_id.stderr)
        template = self.root / 'src/template.html'
        with template.open('a', encoding='utf-8') as source:
            source.write('<a href="mailto:future@example.test">Contacto futuro</a>')
        broken_contact = self.run_build()
        self.assertEqual(broken_contact.returncode, 1)
        self.assertIn('data-button', broken_contact.stderr)
        self.assertEqual((self.root / 'dist/index.html').read_bytes(), before)

    def test_delegated_listener_sends_one_event_and_only_static_safe_properties(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node requerido para verificar ejecución del listener')
        code = analytics_fields('pt', TEST_ID)['analytics_listener']
        code = code.removeprefix('<script>').removesuffix('</script>')
        harness = r'''
const vm = require('node:vm');
const assert = require('node:assert/strict');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const calls = [], listeners = [];
const context = {
  document: {documentElement:{lang:'pt-BR'}, addEventListener(type, callback){
    assert.equal(type, 'click'); listeners.push(callback);
  }},
  window: {umami:{track(name, data){calls.push({name,data:JSON.parse(JSON.stringify(data))});}}}
};
vm.runInNewContext(input, context);
assert.equal(listeners.length, 1);
function click(overrides = {}) {
  const attrs = {
    'data-event':'whatsapp_click', 'data-button':'area-laboral',
    'data-lang':'pt', 'data-topic':'laboral',
    'data-wa-msg':'nombre privado y caso sensible', 'data-email':'persona@example.test',
    'href':'https://wa.me/123?text=nombre%20privado', ...overrides
  };
  const anchor = {getAttribute(key){return attrs[key] ?? null;}};
  // Click sobre SVG/texto anidado encuentra el botón padre.
  const target = {closest(selector){assert.equal(selector,'[data-event]');return anchor;}};
  listeners[0]({target, preventDefault(){throw Error('No bloquear contacto');}});
}
click();
assert.deepEqual(calls, [{name:'whatsapp_click',data:{idioma:'pt',boton:'area-laboral',tema:'laboral'}}]);
click({'data-topic':'nombre privado'});
assert.deepEqual(calls[1].data, {idioma:'pt',boton:'area-laboral'});
click({'data-button':'persona@example.test'});
click({'data-event':'texto libre'});
click({'data-lang':'es'});
assert.equal(calls.length, 2);
delete context.window.umami;
click();
context.window.umami = {track(){throw Error('tracker bloqueado');}};
click();
assert.equal(calls.length, 2);
'''
        result = subprocess.run([node, '-e', harness], input=json.dumps(code),
                                capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
