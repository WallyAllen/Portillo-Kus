// Las reglas de `python src/build.py --produccion` en JS, para que un guardado no rompa el build.
// La fuente de verdad es Python. Mantienen la sincronía tests/casos_validacion.json (lo corren
// ambos lados) y tests/test_panel_reglas.py (compara reglas.json y una huella del código Python).
// Donde el build fallaría por un dato con forma rara (un número en vez de texto), acá se rechaza
// siempre: el panel sólo debería escribir textos.
import reglas from './reglas.json' with { type: 'json' };
import { aplanar, aplicarRespaldo, aplicarRespaldoAbogado, ARCHIVO_PENDIENTES, oculto, parsearPendientes } from './traducciones.js';

const PENDIENTE = reglas.pendiente;
const GENERADAS = new Set(reglas.clavesGeneradas);
const BLOQUE_SI = /<!--si:([\w.-]+)-->([\s\S]*?)<!--\/si:\1-->/g;
const MARCADOR = /\{\{(?:url:)?([\w.-]+)\}\}/g;
const MARCADOR_SUELTO = /\{\{[\w.:-]+\}\}/;
const TAG = /<[^>]*>/g;
// Lo que validate_analytics exige con atributos que un texto no trae.
const CONTACTO_SIN_MEDICION = /<[^>]*(\bdata-wa\b|\bdata-event\b|\bdata-umami-event|href\s*=\s*["']?\s*(tel:|mailto:|https?:\/\/(www\.)?wa\.me))/i;
const CODIGO_IDIOMA = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const FOTO_ABOGADO = /^abogado-[^/\\"]+\.(jpe?g|png|webp|avif)$/i;
const LINKEDIN = 'https://www.linkedin.com/in/';

const incompleto = (valor) => {
  const texto = String(valor ?? '').trim();
  return !texto || texto.includes('[');
};
const resolver = (texto) => texto.replaceAll('{reviews}', String(reglas.reviews)).replaceAll('{year}', '2026');
const textoPlano = (valor) => resolver(valor).replace(TAG, '').trim();

// Las claves de esta plantilla que llegan a la página: lo que está en un bloque <!--si:--> con
// el dato vacío o pendiente no se genera. Un bloque que depende de un dato de build.py se toma
// como visible (si no, un dato que hoy está vacío podría ocultar un pendiente mañana).
function clavesQueLlegan(plantilla, textos, hayEquipo, errores, idioma) {
  const visible = plantilla.replace(BLOQUE_SI, (bloque, clave, interior) => {
    if (clave === 'equipo_html') return hayEquipo ? interior : '';
    if (GENERADAS.has(clave)) return interior;
    if (!(clave in textos)) {
      errores.push(`${idioma}: falta la clave ${clave}`);
      return '';
    }
    return oculto(textos[clave]) ? '' : interior;
  });
  return [...visible.matchAll(MARCADOR)].map((m) => m[1]);
}

function validarTextos(idioma, textos, plantillas, hayEquipo, errores) {
  const paginas = [plantillas.portada, plantillas.privacidad];
  if (idioma === reglas.idiomaBase) paginas.push(plantillas.noExiste);
  const claves = new Set(paginas.flatMap((p) => clavesQueLlegan(p, textos, hayEquipo, errores, idioma)));
  for (const clave of claves) {
    if (GENERADAS.has(clave)) continue;
    if (!(clave in textos)) {
      errores.push(`${idioma}: falta la clave ${clave}`);
      continue;
    }
    const valor = textos[clave];
    if (valor.startsWith(PENDIENTE)) errores.push(`${idioma}: ${clave} sigue pendiente`);
    if (MARCADOR_SUELTO.test(valor)) errores.push(`${idioma}: ${clave} tiene un marcador sin reemplazar`);
    if (CONTACTO_SIN_MEDICION.test(valor)) errores.push(`${idioma}: ${clave} no puede llevar un enlace de contacto`);
  }
  for (const clave of reglas.clavesQueLeeElCodigo) {
    if (!(clave in textos)) errores.push(`${idioma}: falta la clave ${clave}`);
  }
  for (const [titulo, descripcion, pagina] of [
    ['meta.title', 'meta.description', 'portada'],
    ['privacy.meta_title', 'privacy.description', 'privacidad'],
  ]) {
    if (!(titulo in textos) || !(descripcion in textos)) continue;
    const [t, d] = [textoPlano(textos[titulo]), textoPlano(textos[descripcion])];
    if (t.startsWith(PENDIENTE) || d.startsWith(PENDIENTE)) errores.push(`${idioma}/${pagina}: título o descripción pendiente`);
    if ([...t].length > reglas.largoMaximoTitulo) errores.push(`${idioma}/${pagina}: el título tiene ${[...t].length} caracteres (máximo ${reglas.largoMaximoTitulo})`);
    if ([...d].length > reglas.largoMaximoDescripcion) errores.push(`${idioma}/${pagina}: la descripción tiene ${[...d].length} caracteres (máximo ${reglas.largoMaximoDescripcion})`);
  }
  const idiomas = textos['seo.contact_languages'];
  if (idiomas && !idiomas.startsWith(PENDIENTE)) {
    const codigos = idiomas.split(',').map((c) => c.trim()).filter(Boolean);
    if (!codigos.length || codigos.some((c) => !CODIGO_IDIOMA.test(c))) {
      errores.push(`${idioma}: seo.contact_languages debe tener códigos de idioma separados por coma`);
    }
  }
}

function validarAbogado(abogado, imagenes, errores) {
  if (abogado === null || typeof abogado !== 'object' || Array.isArray(abogado)) {
    errores.push('equipo.json: hay una entrada que no es un abogado');
    return;
  }
  const nombre = typeof abogado.nombre === 'string' ? abogado.nombre : '(sin nombre)';
  if (typeof abogado.nombre !== 'string') errores.push(`${nombre}: falta el nombre`);
  for (const campo of ['foto', 'matricula', 'linkedin']) {
    if (abogado[campo] !== undefined && typeof abogado[campo] !== 'string') errores.push(`${nombre}: ${campo} debe ser texto`);
  }
  for (const campo of reglas.textosAbogado) {
    const textos = abogado[campo];
    if (textos === null || typeof textos !== 'object' || Array.isArray(textos)) {
      errores.push(`${nombre}: ${campo} sin ${reglas.idiomasTodos.join(', ')}`);
      continue;
    }
    const faltan = reglas.idiomasTodos.filter((c) => typeof textos[c] !== 'string');
    if (faltan.length) errores.push(`${nombre}: ${campo} sin ${faltan.join(', ')}`);
  }
  if (abogado.publicado !== true) return;

  if (incompleto(nombre)) errores.push(`${nombre}: falta el nombre real`);
  if (!FOTO_ABOGADO.test(String(abogado.foto ?? '')) || !imagenes.has(abogado.foto)) {
    errores.push(`${nombre}: falta la foto (portillo-images/abogado-*)`);
  }
  for (const campo of reglas.obligatoriosAbogado) {
    for (const codigo of reglas.idiomasPublicados) {
      if (incompleto(abogado[campo]?.[codigo])) errores.push(`${nombre}: falta ${campo} en ${codigo}`);
    }
  }
  for (const codigo of reglas.idiomasPublicados) {
    if (String(abogado.idiomas?.[codigo] ?? '').includes('[')) errores.push(`${nombre}: idiomas de muestra en ${codigo}`);
  }
  if (String(abogado.matricula ?? '').includes('[')) errores.push(`${nombre}: matrícula de muestra`);
  if (abogado.linkedin && !String(abogado.linkedin).startsWith(LINKEDIN)) {
    errores.push(`${nombre}: linkedin debe empezar con ${LINKEDIN}`);
  }
}

function leerJson(texto, ruta, errores) {
  if (texto === null) {
    errores.push(`${ruta}: no existe`);
    return null;
  }
  try {
    return JSON.parse(texto);
  } catch {
    errores.push(`${ruta}: no es un JSON válido`);
    return null;
  }
}

// leer(ruta) devuelve el texto del archivo o null. listarImagenes() devuelve un Set con los
// nombres de portillo-images/. Devuelve la lista de errores: vacía si el build va a pasar.
export async function validarRepo({ leer, listarImagenes }) {
  const errores = [];
  const [crudos, crudoEquipo, portada, privacidad, noExiste, crudoPendientes] = await Promise.all([
    Promise.all(reglas.idiomasTodos.map((c) => leer(`src/content.${c}.json`))),
    leer('src/equipo.json'),
    leer('src/template.html'),
    leer('src/privacy-template.html'),
    leer('src/404-template.html'),
    leer(ARCHIVO_PENDIENTES),
  ]);

  let pendientes = {};
  try {
    pendientes = parsearPendientes(crudoPendientes);
  } catch {
    errores.push(`${ARCHIVO_PENDIENTES}: no tiene el formato esperado`);
  }

  const textos = {};
  reglas.idiomasTodos.forEach((codigo, i) => {
    const datos = leerJson(crudos[i], `src/content.${codigo}.json`, errores);
    if (datos === null) return;
    if (typeof datos !== 'object' || Array.isArray(datos)) {
      errores.push(`src/content.${codigo}.json: no tiene el formato esperado`);
      return;
    }
    // Ruso y chino no se publican todavía: el build no los lee, sólo tienen que ser JSON.
    if (reglas.idiomasPublicados.includes(codigo)) textos[codigo] = aplanar(datos);
  });

  const equipo = leerJson(crudoEquipo, 'src/equipo.json', errores);
  const abogados = equipo?.abogados;
  if (equipo !== null && !Array.isArray(abogados)) errores.push('src/equipo.json: falta la lista de abogados');
  const lista = Array.isArray(abogados) ? abogados : [];
  const hayEquipo = lista.some((a) => a?.publicado === true);
  const imagenes = hayEquipo ? await listarImagenes() : new Set();
  const ids = new Set();
  for (const abogado of lista) {
    // El id une al abogado con sus pendientes: la posición en la lista cambia al sacar a alguien.
    if (typeof abogado?.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(abogado.id)) errores.push(`${abogado?.nombre ?? '(sin nombre)'}: falta el id`);
    else if (ids.has(abogado.id)) errores.push(`${abogado.nombre}: el id ${abogado.id} está repetido`);
    else ids.add(abogado.id);
    if (abogado !== null && typeof abogado === 'object' && !Array.isArray(abogado)) aplicarRespaldoAbogado(abogado, pendientes);
    validarAbogado(abogado, imagenes, errores);
  }

  const base = textos[reglas.idiomaBase];
  if (!base) return errores;
  aplicarRespaldo(textos, pendientes);
  const clavesBase = Object.keys(base);
  const parejos = [];
  for (const codigo of reglas.idiomasPublicados) {
    if (!textos[codigo]) continue;
    const propias = Object.keys(textos[codigo]);
    const faltan = clavesBase.filter((c) => !(c in textos[codigo]));
    const sobran = propias.filter((c) => !(c in base));
    if (faltan.length) errores.push(`${codigo}: faltan claves: ${faltan.join(', ')}`);
    if (sobran.length) errores.push(`${codigo}: sobran claves: ${sobran.join(', ')}`);
    const noTexto = propias.filter((c) => typeof textos[codigo][c] !== 'string');
    if (noTexto.length) errores.push(`${codigo}: no son texto: ${noTexto.join(', ')}`);
    else parejos.push(codigo);
  }
  if (portada === null || privacidad === null || noExiste === null) {
    errores.push('Faltan plantillas en src/');
    return errores;
  }
  const plantillas = { portada, privacidad, noExiste };
  for (const codigo of parejos) validarTextos(codigo, textos[codigo], plantillas, hayEquipo, errores);
  return errores;
}
