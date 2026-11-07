// Qué se puede editar de content.*.json y con qué reglas. src/panel-campos.json es la lista;
// esto la hace cumplir en el servidor: ocultar un campo en la pantalla no alcanza.
// pantallas/revisar.js avisa lo mismo en el navegador (worker/test/campos.test.mjs los compara).
import definicion from '../src/panel-campos.json' with { type: 'json' };
import reglas from './reglas.json' with { type: 'json' };
import { aplanar, oculto } from './traducciones.js';

export { definicion };

const NUMEROS_RESENA = Array.from({ length: definicion.resenas.cantidad }, (_, i) => i + 1);
const claveResena = (numero, parte) => `opiniones.r${numero}_${parte}`;

const CAMPOS = new Map([
  ...definicion.textos.map((c) => [c.clave, c]),
  ...NUMEROS_RESENA.flatMap((n) => [
    [claveResena(n, 'text'), { etiqueta: `Reseña ${n}: texto`, largo: definicion.resenas.largoTexto, puedeVaciar: true }],
    [claveResena(n, 'name'), { etiqueta: `Reseña ${n}: autor`, largo: definicion.resenas.largoAutor, puedeVaciar: true }],
  ]),
  ...definicion.fotos.lista.map((f) => [f.clave, {
    etiqueta: `Descripción de la foto: ${f.etiqueta}`, largo: definicion.fotos.largoDescripcion, atributo: true,
  }]),
]);

export const FOTOS_SERVICIO = new Map(definicion.fotos.lista.map((f) => [f.archivo, f]));

const ROTULOS_ABOGADO = { cargo: 'Cargo', idiomas: 'Idiomas', biografia: 'Biografía' };

// El nombre que se le muestra a una persona para una clave de pendientes.
export function rotulo(clave, abogados = []) {
  const deEquipo = clave.match(/^equipo:([^.]+)\.(.+)$/);
  if (!deEquipo) return CAMPOS.get(clave)?.etiqueta ?? clave;
  const abogado = abogados.find((a) => a.id === deEquipo[1]);
  return `${abogado?.nombre ?? deEquipo[1]} · ${ROTULOS_ABOGADO[deEquipo[2]] ?? deEquipo[2]}`;
}

const sinMarcador = (texto) => (texto.startsWith(reglas.pendiente) ? texto.slice(reglas.pendiente.length).trim() : texto);

// Los textos no se escapan al armar la página: "<" abriría una etiqueta y, dentro de un atributo,
// una comilla lo cerraría. Por eso se rechazan acá y no se escapan en el build.
function revisarValor(nombre, valor, campo) {
  if (typeof valor !== 'string') return `${nombre}: tiene que ser un texto.`;
  if (valor.includes('<')) return `${nombre}: no puede llevar el carácter <.`;
  if (campo?.atributo && valor.includes('"')) return `${nombre}: no puede llevar comillas dobles.`;
  return null;
}

// antes y despues: el JSON de un idioma. Revisa sólo lo que cambió. listaCerrada: false para una
// traducción de un pendiente, que no depende de que la clave siga en la lista.
export function revisarContenido(codigo, antes, despues, { listaCerrada = true } = {}) {
  const [a, d] = [aplanar(antes), aplanar(despues)];
  const errores = [];
  const esBase = codigo === reglas.idiomaBase;
  for (const clave of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (a[clave] === d[clave]) continue;
    const campo = CAMPOS.get(clave);
    if (listaCerrada && !campo) {
      errores.push(`${clave}: este texto no se puede editar desde el panel.`);
      continue;
    }
    if (!(clave in d)) {
      errores.push(`${clave}: este texto no se puede borrar.`);
      continue;
    }
    const nombre = campo?.etiqueta ?? clave;
    const problema = revisarValor(nombre, d[clave], campo);
    if (problema) errores.push(problema);
    else if (esBase && campo && !campo.puedeVaciar && !d[clave].trim()) errores.push(`${nombre}: no puede quedar vacío.`);
    else if (esBase && campo && [...sinMarcador(d[clave])].length > campo.largo) errores.push(`${nombre}: pasa de ${campo.largo} caracteres.`);
  }
  if (esBase) {
    for (const n of NUMEROS_RESENA) {
      const [texto, autor] = [d[claveResena(n, 'text')], d[claveResena(n, 'name')]];
      const tocada = texto !== a[claveResena(n, 'text')] || autor !== a[claveResena(n, 'name')];
      if (tocada && typeof texto === 'string' && !oculto(texto) && oculto(autor ?? '')) {
        errores.push(`Reseña ${n}: tiene texto pero le falta el autor.`);
      }
    }
  }
  return errores;
}
