"""El respaldo al español, probado en el build real. Las reglas compartidas con el panel están en casos_validacion.json."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
import traducciones  # noqa: E402

CASOS = json.loads((ROOT / 'tests/casos_validacion.json').read_text(encoding='utf-8'))
ENTRADA = lambda *idiomas: {'fecha': '2026-01-01T00:00:00Z', 'viejo': {i: 'viejo' for i in idiomas}}  # noqa: E731


class Sitio:
    def __init__(self, temporal):
        self.raiz = Path(temporal)
        shutil.copytree(ROOT / 'src', self.raiz / 'src')
        (self.raiz / 'portillo-images').mkdir()
        Image.new('RGB', (100, 100)).save(self.raiz / 'portillo-images/abogado-prueba.jpg')

    def textos(self, idioma, cambio):
        ruta = self.raiz / f'src/content.{idioma}.json'
        datos = json.loads(ruta.read_text(encoding='utf-8'))
        cambio(datos)
        ruta.write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')

    def pendientes(self, pendientes):
        (self.raiz / 'src/traducciones-pendientes.json').write_text(json.dumps({'pendientes': pendientes}), encoding='utf-8')

    def abogado(self, **ajustes):
        datos = {'abogados': [{**CASOS['abogadoCompleto'], **ajustes}]}
        (self.raiz / 'src/equipo.json').write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')

    def build(self, *argumentos):
        resultado = subprocess.run([sys.executable, str(self.raiz / 'src/build.py'), *argumentos], capture_output=True,
                                   text=True, encoding='utf-8', env=dict(os.environ, PYTHONUTF8='1'))
        if resultado.returncode:
            raise AssertionError(resultado.stderr[-1000:])

    def pagina(self, ruta):
        return (self.raiz / 'dist' / ruta).read_text(encoding='utf-8')


class RespaldoEnElBuild(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        self.sitio = Sitio(temporal.name)

    def test_texto_en_la_lista_sale_en_espanol_con_lang(self):
        self.sitio.textos('es', lambda d: d['hero'].__setitem__('sub', 'Bajada nueva'))
        self.sitio.textos('en', lambda d: d['hero'].__setitem__('sub', 'Old subtitle'))
        self.sitio.pendientes({'hero.sub': ENTRADA('en')})
        self.sitio.build('--produccion')
        en = self.sitio.pagina('en/index.html')
        self.assertIn('<span lang="es">Bajada nueva</span>', en)
        self.assertNotIn('Old subtitle', en)
        self.assertNotIn('<span lang="es">', self.sitio.pagina('index.html'), 'en español no hace falta marcarlo')
        self.assertNotIn('Bajada nueva', self.sitio.pagina('pt/index.html'), 'portugués no estaba en la lista')

    def test_vacio_y_pendiente_caen_al_espanol_sin_lista(self):
        self.sitio.textos('es', lambda d: d['hero'].__setitem__('sub', 'Bajada nueva'))
        self.sitio.textos('en', lambda d: d['hero'].__setitem__('sub', ''))
        self.sitio.textos('pt', lambda d: d['hero'].__setitem__('sub', '[PENDIENTE] algo'))
        self.sitio.build('--produccion')
        for pagina in ('en/index.html', 'pt/index.html'):
            self.assertIn('<span lang="es">Bajada nueva</span>', self.sitio.pagina(pagina))
            self.assertNotIn('[PENDIENTE] algo', self.sitio.pagina(pagina))

    def test_title_y_atributos_no_llevan_marcado(self):
        self.sitio.textos('es', lambda d: d['meta'].update(title='Título nuevo', description='Descripción nueva'))
        self.sitio.pendientes({'meta.title': ENTRADA('en'), 'meta.description': ENTRADA('en')})
        self.sitio.build('--produccion')
        en = self.sitio.pagina('en/index.html')
        self.assertIn('<title>Título nuevo</title>', en)
        self.assertIn('content="Descripción nueva"', en)
        self.assertNotIn('<span lang="es">Título nuevo', en)
        self.assertNotIn('<span lang="es">Descripción nueva', en)

    def test_clave_que_falta_en_un_idioma_y_esta_en_la_lista(self):
        self.sitio.textos('en', lambda d: d['hero'].pop('sub'))
        self.sitio.pendientes({'hero.sub': ENTRADA('en')})
        self.sitio.build('--produccion')
        self.assertIn('<span lang="es">', self.sitio.pagina('en/index.html'))

    def test_clave_que_falta_sin_lista_frena_el_build(self):
        self.sitio.textos('en', lambda d: d['hero'].pop('sub'))
        with self.assertRaisesRegex(AssertionError, 'hero.sub'):
            self.sitio.build()

    def test_el_respaldo_no_revela_un_bloque_sin_dato_en_espanol(self):
        def resena(texto, nombre):
            return lambda d: d['opiniones'].update(r1_text=texto, r1_name=nombre)
        self.sitio.textos('en', resena('Reseña sólo en inglés', 'Ann'))
        self.sitio.pendientes({'opiniones.r1_text': ENTRADA('en'), 'opiniones.r1_name': ENTRADA('en')})
        self.sitio.build('--produccion')
        en = self.sitio.pagina('en/index.html')
        self.assertNotIn('Reseña sólo en inglés', en)
        self.assertNotIn('[PENDIENTE]', en)

    def test_la_lista_no_se_publica(self):
        self.sitio.pendientes({'hero.sub': ENTRADA('en')})
        self.sitio.build('--produccion')
        self.assertEqual(list((self.sitio.raiz / 'dist').rglob('traducciones*')), [])

    def test_abogado_con_respaldo_lleva_lang_y_sin_lista_no(self):
        self.sitio.abogado(
            cargo={**CASOS['abogadoCompleto']['cargo'], 'en': '[Cargo]'},
            biografia={**CASOS['abogadoCompleto']['biografia'], 'en': '[PENDIENTE] algo'},
            idiomas={**CASOS['abogadoCompleto']['idiomas'], 'pt': ''},
        )
        self.sitio.pendientes({'equipo:prueba.cargo': ENTRADA('en')})
        self.sitio.build('--produccion')
        en, pt = self.sitio.pagina('en/index.html'), self.sitio.pagina('pt/index.html')
        self.assertIn('<p class="abogado-cargo" lang="es">Socia</p>', en)
        self.assertIn('<p lang="es">Uno</p>', en)
        self.assertIn('</strong> Spanish</p>', en)
        self.assertNotIn('[Cargo]', en)
        self.assertIn('<p class="abogado-cargo">Sócia</p>', pt)
        self.assertIn('<span lang="es">Español</span>', pt)


class Cargar(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        self.ruta = Path(temporal.name) / 'pendientes.json'

    def test_sin_archivo_no_hay_pendientes(self):
        self.assertEqual(traducciones.cargar(self.ruta), {})

    def test_formato_invalido_es_un_error(self):
        for texto in ('{ roto', '{}', '{"pendientes": []}', '{"pendientes": {"a": {}}}'):
            self.ruta.write_text(texto, encoding='utf-8')
            with self.subTest(texto), self.assertRaises((ValueError, KeyError)):
                traducciones.cargar(self.ruta)


if __name__ == '__main__':
    unittest.main()
