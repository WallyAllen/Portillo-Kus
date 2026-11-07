"""Las reglas de build.py y su copia en worker/validacion.js no se pueden desincronizar.

Los casos de casos_validacion.json los corre también worker/test/validacion.test.mjs.
"""
import hashlib
import inspect
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
import analytics  # noqa: E402
import build  # noqa: E402
import equipo  # noqa: E402
import headers  # noqa: E402
import seo  # noqa: E402
import traducciones  # noqa: E402

REGLAS = json.loads((ROOT / 'worker/reglas.json').read_text(encoding='utf-8'))
CASOS = json.loads((ROOT / 'tests/casos_validacion.json').read_text(encoding='utf-8'))


def huella():
    """El código Python que worker/validacion.js copia. Si cambia, hay que revisar la copia."""
    piezas = (build.flatten, traducciones.oculto, traducciones.cargar, traducciones.aplicar, build.resolve_reviews,
              equipo._incompleto, equipo.aplicar_respaldo, equipo.cargar, seo.metadata, seo.business, analytics.AnalyticsValidator)
    fuente = ''.join(inspect.getsource(pieza).replace('\r\n', '\n') for pieza in piezas)
    return hashlib.sha256(fuente.encode('utf-8')).hexdigest()


def aplicar(raiz, cambio):
    if 'abogados' in cambio:
        lista = []
        for ajustes in cambio['abogados']:
            abogado = {**CASOS['abogadoCompleto'], **ajustes}
            lista.append({k: v for k, v in abogado.items() if v is not None})
        (raiz / 'src/equipo.json').write_text(json.dumps({'abogados': lista}, ensure_ascii=False), encoding='utf-8')
        return
    archivo = raiz / cambio['archivo']
    if 'crudo' in cambio:
        archivo.write_text(cambio['crudo'], encoding='utf-8')
        return
    datos = json.loads(archivo.read_text(encoding='utf-8'))
    *camino, ultima = cambio['ruta'].split('.')
    nodo = datos
    for parte in camino:
        nodo = nodo[parte]
    if cambio.get('borrar'):
        del nodo[ultima]
    else:
        nodo[ultima] = cambio['valor']
    archivo.write_text(json.dumps(datos, ensure_ascii=False), encoding='utf-8')


class ReglasTests(unittest.TestCase):
    def test_constantes_iguales_a_build(self):
        self.assertEqual(REGLAS['pendiente'], build.PENDING)
        self.assertEqual(REGLAS['idiomasTodos'], [l['code'] for l in build.TODOS_LOS_IDIOMAS])
        self.assertEqual(REGLAS['idiomasPublicados'], list(build.IDIOMAS_PUBLICADOS))
        self.assertEqual(REGLAS['idiomaBase'], build.DEFAULT_LANG)
        self.assertEqual(REGLAS['textosAbogado'], list(equipo.TEXTOS))
        self.assertEqual(REGLAS['obligatoriosAbogado'], list(equipo.OBLIGATORIOS))
        self.assertEqual(REGLAS['reviews'], build.REVIEWS)
        self.assertTrue((ROOT / REGLAS['archivoPendientes']).is_file())

    def test_claves_generadas_son_las_de_las_plantillas(self):
        base = build.flatten(json.loads((ROOT / 'src/content.es.json').read_text(encoding='utf-8')))
        en_plantillas = set()
        for nombre in ('template.html', 'privacy-template.html', '404-template.html'):
            texto = (ROOT / 'src' / nombre).read_text(encoding='utf-8')
            en_plantillas |= {m[1] for m in re.findall(r'\{\{(url:)?([\w.\-]+)\}\}', texto)}
            en_plantillas |= set(re.findall(r'<!--si:([\w.\-]+)-->', texto))
        self.assertEqual(sorted(en_plantillas - base.keys()), sorted(REGLAS['clavesGeneradas']))

    def test_huella_del_codigo_que_valida_el_panel(self):
        self.assertEqual(huella(), REGLAS['huellaPython'],
                         'Cambió una regla en Python: actualizá worker/validacion.js y sus casos en '
                         'tests/casos_validacion.json, y recién después huellaPython en worker/reglas.json.')

    def test_version_json_no_se_cachea_como_immutable(self):
        self.assertIn('/version.json', headers.REVALIDATED)


class PanelCamposTests(unittest.TestCase):
    """src/panel-campos.json contra la plantilla y los textos reales."""

    @classmethod
    def setUpClass(cls):
        cls.campos = json.loads((ROOT / 'src/panel-campos.json').read_text(encoding='utf-8'))
        cls.es = build.flatten(json.loads((ROOT / 'src/content.es.json').read_text(encoding='utf-8')))
        cls.plantilla = (ROOT / 'src/template.html').read_text(encoding='utf-8')
        cls.en_atributo = set()
        for marca in re.finditer(r'\{\{([\w.\-]+)\}\}', cls.plantilla):
            antes = cls.plantilla[:marca.start()]
            if antes.rfind('<') > antes.rfind('>'):
                cls.en_atributo.add(marca.group(1))

    def test_cada_texto_existe_y_entra_en_su_largo(self):
        for campo in self.campos['textos']:
            with self.subTest(campo['clave']):
                self.assertIn(campo['clave'], self.es)
                self.assertLessEqual(len(self.es[campo['clave']]), campo['largo'])
                self.assertTrue(campo['etiqueta'] and campo['etiqueta'] != campo['clave'])

    def test_un_texto_de_la_lista_no_se_usa_en_un_atributo(self):
        """Si no, una comilla rompería la etiqueta: tendría que marcarse atributo, como las fotos."""
        for campo in self.campos['textos']:
            self.assertNotIn(campo['clave'], self.en_atributo, campo['clave'])
        for numero in range(1, self.campos['resenas']['cantidad'] + 1):
            for parte in ('text', 'name'):
                clave = f'opiniones.r{numero}_{parte}'
                self.assertIn(clave, self.es)
                self.assertNotIn(clave, self.en_atributo, clave)

    def test_cada_foto_esta_en_la_plantilla_con_su_descripcion(self):
        fotos = self.campos['fotos']
        for foto in fotos['lista']:
            with self.subTest(foto['archivo']):
                self.assertIn(f'portillo-images/{foto["archivo"]}" alt="{{{{{foto["clave"]}}}}}"', self.plantilla)
                self.assertTrue((ROOT / 'portillo-images' / foto['archivo']).is_file())
                self.assertLessEqual(len(self.es[foto['clave']]), fotos['largoDescripcion'])
                self.assertIn(foto['clave'], self.en_atributo)
                self.assertNotIn('"', self.es[foto['clave']])

    def test_ningun_texto_de_hoy_lleva_lo_que_el_panel_rechaza(self):
        for codigo in REGLAS['idiomasTodos']:
            datos = build.flatten(json.loads((ROOT / f'src/content.{codigo}.json').read_text(encoding='utf-8')))
            for clave, valor in datos.items():
                self.assertNotIn('<', str(valor), f'{codigo}: {clave}')
                if clave in self.en_atributo:
                    self.assertNotIn('"', str(valor), f'{codigo}: {clave}')


class VistaPreviaTests(unittest.TestCase):
    """La vista previa del panel copia el marcado de equipo.render: si cambia uno, falla acá."""

    def renderizar_en_node(self, abogados, textos):
        modulo = (ROOT / 'worker/panel/cliente/pantallas/vista-abogado.js').as_uri()
        guion = (f"import {{ renderEquipo }} from {json.dumps(modulo)};"
                 "const [a, t] = JSON.parse(process.argv[1]);"
                 "process.stdout.write(renderEquipo(a, 'es', t, '/'));")
        resultado = subprocess.run(['node', '--input-type=module', '-e', guion, json.dumps([abogados, textos])],
                                   capture_output=True, text=True, encoding='utf-8', check=True)
        return resultado.stdout

    def test_mismo_marcado_que_el_sitio(self):
        textos = build.flatten(json.loads((ROOT / 'src/content.es.json').read_text(encoding='utf-8')))
        textos = {c: textos[c] for c in ('estudio.tag_matricula', 'equipo.ver_perfil', 'equipo.tag_idiomas', 'equipo.cerrar')}
        peligroso = """<script>alert(1)</script> & "comillas" 'simples'"""
        completo = {'nombre': peligroso, 'foto': 'abogado-1.jpg', 'matricula': peligroso, 'linkedin': 'https://www.linkedin.com/in/a"b/',
                    'cargo': {'es': peligroso}, 'idiomas': {'es': peligroso}, 'biografia': {'es': f'Uno {peligroso}\n\n  Dos  \n\n\n\n'}}
        minimo = {'nombre': 'Sin datos', 'foto': '', 'matricula': '', 'linkedin': '',
                  'cargo': {'es': ''}, 'idiomas': {'es': ' '}, 'biografia': {'es': ''}}
        for abogados in ([], [minimo], [completo, minimo]):
            with self.subTest(len(abogados)):
                salida = equipo.render(abogados, 'es', textos, '/')
                self.assertEqual(self.renderizar_en_node(abogados, textos), salida)
                self.assertNotIn('<script', salida)


class FotosHuerfanasTests(unittest.TestCase):
    def test_la_foto_de_un_abogado_que_ya_no_esta_no_se_publica(self):
        with tempfile.TemporaryDirectory() as temporal:
            raiz = Path(temporal)
            shutil.copytree(ROOT / 'src', raiz / 'src')
            (raiz / 'portillo-images').mkdir()
            for nombre in ('abogado-viejo.jpg', 'otra.jpg'):
                Image.new('RGB', (100, 100)).save(raiz / 'portillo-images' / nombre)
            subprocess.run([sys.executable, str(raiz / 'src/build.py'), '--produccion'], check=True, capture_output=True,
                           env=dict(os.environ, PYTHONUTF8='1'))
            self.assertFalse((raiz / 'dist/portillo-images/abogado-viejo.jpg').exists())
            self.assertTrue((raiz / 'dist/portillo-images/otra.jpg').exists())


class CasosCompartidosTests(unittest.TestCase):
    def test_build_produccion_da_lo_que_dicen_los_casos(self):
        with tempfile.TemporaryDirectory() as temporal:
            modelo = Path(temporal) / 'modelo'
            shutil.copytree(ROOT / 'src', modelo / 'src')
            (modelo / 'portillo-images').mkdir()
            (modelo / 'portillo-images/fixture.jpg').write_bytes(b'fixture')
            for nombre in CASOS['imagenes']:
                Image.new('RGB', (100, 100)).save(modelo / 'portillo-images' / nombre)
            for numero, caso in enumerate(c for c in CASOS['casos'] if not c.get('estricto')):
                with self.subTest(caso['nombre']):
                    raiz = Path(temporal) / str(numero)
                    shutil.copytree(modelo, raiz)
                    for cambio in caso['cambios']:
                        aplicar(raiz, cambio)
                    resultado = subprocess.run(
                        [sys.executable, str(raiz / 'src/build.py'), '--produccion'], capture_output=True, text=True,
                        encoding='utf-8', env=dict(os.environ, PYTHONUTF8='1'))
                    self.assertEqual('ok' if resultado.returncode == 0 else 'error', caso['espera'], resultado.stderr[-500:])


class VersionTests(unittest.TestCase):
    def build(self, **entorno):
        with tempfile.TemporaryDirectory() as temporal:
            raiz = Path(temporal)
            shutil.copytree(ROOT / 'src', raiz / 'src')
            (raiz / 'portillo-images').mkdir()
            env = {k: v for k, v in os.environ.items() if k != 'WORKERS_CI_COMMIT_SHA'}
            subprocess.run([sys.executable, str(raiz / 'src/build.py'), '--produccion'], check=True, capture_output=True,
                           env={**env, 'PYTHONUTF8': '1', **entorno})
            return json.loads((raiz / 'dist/version.json').read_text(encoding='utf-8'))

    def test_con_el_sha_de_workers_builds(self):
        self.assertEqual(self.build(WORKERS_CI_COMMIT_SHA='a' * 40), {'sha': 'a' * 40})

    def test_build_local_no_finge_un_commit(self):
        self.assertEqual(self.build(), {'sha': 'local'})


if __name__ == '__main__':
    unittest.main()
