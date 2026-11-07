"""Equipo: borradores sólo en la vista previa; publicar exige datos completos."""
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
IDIOMAS = ('es', 'en', 'pt', 'ru', 'zh')


def completo(**cambios):
    abogado = {'publicado': True, 'nombre': 'Dra. <Prueba>', 'foto': 'abogado-prueba.jpg', 'matricula': 'T° 1 F° 2',
               'linkedin': 'https://www.linkedin.com/in/prueba/',
               'cargo': {c: f'Socia {c}' for c in IDIOMAS}, 'idiomas': {c: 'Español' for c in IDIOMAS},
               'biografia': {c: f'Primero {c}\n\nSegundo {c}' for c in IDIOMAS}}
    abogado.update(cambios)
    return abogado


class EquipoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'src', self.root / 'src')
        (self.root / 'portillo-images').mkdir()
        Image.new('RGB', (600, 600)).save(self.root / 'portillo-images' / 'abogado-prueba.jpg')

    def build(self, *args):
        env = dict(os.environ, PYTHONUTF8='1')
        return subprocess.run([sys.executable, str(self.root / 'src/build.py'), *args],
                              capture_output=True, text=True, encoding='utf-8', env=env)

    def cargar(self, *abogados):
        (self.root / 'src/equipo.json').write_text(json.dumps({'abogados': list(abogados)}, ensure_ascii=False), encoding='utf-8')

    def home(self):
        return (self.root / 'dist/index.html').read_text(encoding='utf-8')

    def test_borradores_sin_salir_a_produccion(self):
        self.assertEqual(self.build().returncode, 0)
        self.assertIn('[Abogado 1]', self.home())
        resultado = self.build('--produccion')
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        self.assertNotIn('Abogado 1', self.home())
        self.assertNotIn('id="equipo"', self.home())

    def test_publicado_completo_sale_escapado_y_por_idioma(self):
        self.cargar(completo(), completo(publicado=False, nombre='Borrador'))
        resultado = self.build('--produccion')
        self.assertEqual(resultado.returncode, 0, resultado.stderr)
        html = self.home()
        self.assertIn('Dra. &lt;Prueba&gt;', html)
        self.assertIn('<p>Primero es</p><p>Segundo es</p>', html)
        self.assertNotIn('Borrador', html)
        self.assertIn('Primero en', (self.root / 'dist/en/index.html').read_text(encoding='utf-8'))
        self.assertIn('aria-labelledby="abogado-1-nombre"', html)
        self.assertIn('sizes="180px"', html)

    def test_sacar_a_todos_quita_la_seccion(self):
        self.cargar()
        self.assertEqual(self.build().returncode, 0)
        self.assertNotIn('id="equipo"', self.home())

    def test_publicar_incompleto_frena_el_build(self):
        casos = {
            'falta el nombre real': completo(nombre='[Abogado 1]'),
            'falta la foto': completo(foto=''),
            'falta biografia en en': completo(biografia={**completo()['biografia'], 'en': '[Trayectoria]'}),
            'matrícula de muestra': completo(matricula='[T° y F°]'),
            'linkedin debe empezar': completo(linkedin='https://ejemplo.com/'),
            'cargo sin zh': completo(cargo={c: 'Socia' for c in IDIOMAS[:-1]}),
        }
        for mensaje, abogado in casos.items():
            with self.subTest(mensaje):
                self.cargar(abogado)
                resultado = self.build('--produccion')
                self.assertEqual(resultado.returncode, 1)
                self.assertIn(mensaje, resultado.stderr)


if __name__ == '__main__':
    unittest.main()
