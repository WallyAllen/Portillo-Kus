// Guardar es un commit en el repo. Este módulo decide qué se puede guardar, lo valida contra
// el estado de la rama en ese momento y evita pisar lo que otra persona guardó.
import { FOTOS_SERVICIO, revisarContenido, rotulo } from './campos.js';
import { RepoGitHub } from './github.js';
import reglas from './reglas.json' with { type: 'json' };
import {
  ARCHIVO_PENDIENTES, equipoSoloEspanol, fijarTexto, OTROS_IDIOMAS, oculto, parsearPendientes, reconciliar,
  reponerTraducciones, RUTA_EQUIPO, RUTAS_TEXTOS, rutaDeClave, serializarPendientes, vistaDeTextos,
} from './traducciones.js';
import { validarRepo } from './validacion.js';

const RUTA_TEXTO = /^src\/(content\.(es|en|pt|ru|zh)\.json|equipo\.json)$/;
const RUTA_TRADUCCION = /^src\/content\.(en|pt|ru|zh)\.json$/;
const CARPETA_FOTOS = 'portillo-images/';
const FOTO_ABOGADO = /^abogado-[a-z0-9-]{1,48}\.jpg$/;
const nombreDeFoto = (ruta) => ruta.slice(CARPETA_FOTOS.length);
const esRutaFoto = (ruta) => ruta.startsWith(CARPETA_FOTOS)
  && (FOTO_ABOGADO.test(nombreDeFoto(ruta)) || FOTOS_SERVICIO.has(nombreDeFoto(ruta)));
// Una foto se guarda con el id del abogado: corregir un nombre no deja archivos huérfanos.
export const fotoDeAbogado = (id) => `abogado-${String(id).replace(/^abogado-/, '')}.jpg`;
const IMAGEN_MAXIMA = 5 * 1024 * 1024;
const LADO_MAXIMO = 1200; // El mismo límite que aplica el recorte del panel.
const MAX_ARCHIVOS = 10;
// Un reintento sólo por una carrera justo al mover la rama. Con más, una ráfaga de escrituras
// podría pasar de 50 subpedidos, el límite del plan Free de Workers.
const INTENTOS = 2;

const serializar = (datos) => `${JSON.stringify(datos, null, 2)}\n`;

export class Conflicto extends Error {
  constructor(archivos) {
    super(archivos.length
      ? 'Otra persona cambió lo mismo mientras editabas. Recargá para ver su versión antes de guardar.'
      : 'Otra persona acaba de guardar. Probá de nuevo.');
    this.archivos = archivos;
  }
}

export class DatosInvalidos extends Error {
  constructor(errores) {
    super('El cambio no se guardó.');
    this.errores = errores;
  }
}

export class Prohibido extends Error {
  constructor() {
    super('Tu usuario no tiene permiso para esto.');
  }
}

// El navegador recodifica la foto a JPEG. Comprobamos su estructura hasta el primer escaneo
// y su marcador final. Pillow sigue siendo quien decodifica los datos de los píxeles.
function esJpegValido(base64) {
  let datos;
  try {
    datos = atob(base64);
  } catch {
    return false;
  }
  if (!datos.startsWith('\xFF\xD8') || !datos.endsWith('\xFF\xD9')) return false;

  const byte = (i) => datos.charCodeAt(i);
  const entero = (i) => (byte(i) << 8) | byte(i + 1);
  const fin = datos.length - 2;
  let componentes = 0;
  let cuantizacion = false;
  let huffman = false;
  for (let i = 2; i < fin;) {
    if (byte(i++) !== 0xff) return false;
    while (byte(i) === 0xff) i++;
    const marcador = byte(i++);
    if (i + 2 > fin || marcador < 0xc0 || marcador === 0xd8 || marcador === 0xd9 || (marcador >= 0xd0 && marcador <= 0xd7)) return false;
    const largo = entero(i);
    if (largo < 2 || i + largo > fin) return false;

    if (marcador === 0xc0 || marcador === 0xc1 || marcador === 0xc2) {
      if (componentes || largo < 11 || byte(i + 2) !== 8) return false;
      const alto = entero(i + 3);
      const ancho = entero(i + 5);
      componentes = byte(i + 7);
      if (!ancho || !alto || ancho > LADO_MAXIMO || alto > LADO_MAXIMO) return false;
      if (![1, 3].includes(componentes) || largo !== 8 + 3 * componentes) return false;
    } else if (marcador === 0xdb) {
      cuantizacion ||= largo >= 67;
    } else if (marcador === 0xc4) {
      huffman ||= largo >= 20;
    } else if (marcador === 0xda) {
      const escaneo = byte(i + 2);
      return cuantizacion && huffman && escaneo > 0 && escaneo <= componentes
        && largo === 6 + 2 * escaneo && i + largo < fin;
    }
    i += largo;
  }
  return false;
}

// Sólo se aceptan estas rutas: el token podría escribir cualquier archivo.
// La lista de pendientes no está: la escribe únicamente el servidor, también para un admin.
function comprobarArchivos(archivos) {
  if (!archivos.length || archivos.length > MAX_ARCHIVOS) {
    throw new DatosInvalidos([`Se guardan entre 1 y ${MAX_ARCHIVOS} archivos por vez.`]);
  }
  const errores = [];
  const vistas = new Set();
  for (const archivo of archivos) {
    const ruta = archivo?.ruta;
    if (typeof ruta !== 'string') {
      errores.push('Falta una ruta de archivo válida.');
      continue;
    }
    if (vistas.has(ruta)) errores.push(`${ruta}: repetido`);
    vistas.add(ruta);
    if (RUTA_TEXTO.test(ruta)) {
      if (typeof archivo.texto !== 'string') errores.push(`${ruta}: falta el texto`);
      if ('base64' in archivo) errores.push(`${ruta}: un archivo de texto no admite base64`);
    } else if (esRutaFoto(ruta)) {
      if ('texto' in archivo) errores.push(`${ruta}: una imagen no admite texto`);
      if (typeof archivo.base64 === 'string' && archivo.base64.length * 0.75 > IMAGEN_MAXIMA) {
        errores.push(`${ruta}: la imagen pasa de 5 MB`);
      } else if (typeof archivo.base64 !== 'string' || !esJpegValido(archivo.base64)) {
        errores.push(`${ruta}: subí una imagen JPG entera de hasta ${LADO_MAXIMO} píxeles por lado`);
      }
    } else {
      errores.push(`${ruta}: este archivo no se puede editar desde el panel`);
    }
  }
  if (errores.length) throw new DatosInvalidos(errores);
}

const lector = (repo, ref, propios = new Map()) => (ruta) => (propios.has(ruta) ? propios.get(ruta) : repo.leer(ruta, ref));

function validar(repo, leer, archivos, ref) {
  return validarRepo({
    leer,
    listarImagenes: async () => {
      const nuevas = archivos.map((a) => a.ruta).filter(esRutaFoto).map(nombreDeFoto);
      return new Set([...await repo.listar('portillo-images', ref), ...nuevas]);
    },
  });
}

// Lo que el validador no mira porque el build lo dejaría pasar: lista cerrada, caracteres
// peligrosos y a qué nombre puede ir cada foto.
async function revisarCambios(archivos, leerRama, { listaCerrada }) {
  const errores = [];
  const enviados = new Map(archivos.filter((a) => a.texto !== undefined).map((a) => [a.ruta, a.texto]));
  const json = (texto) => {
    try {
      return JSON.parse(texto);
    } catch {
      return null; // lo rechaza la validación
    }
  };
  for (const [ruta, texto] of enviados) {
    const idioma = ruta.match(/^src\/content\.(\w+)\.json$/)?.[1];
    const [despues, antes] = idioma ? [json(texto), json(await leerRama(ruta))] : [];
    if (despues && antes) errores.push(...revisarContenido(idioma, antes, despues, { listaCerrada }));
  }
  const fotos = archivos.map((a) => a.ruta).filter(esRutaFoto).map(nombreDeFoto);
  const espanol = 'src/content.es.json';
  const equipoEnviado = enviados.has(RUTA_EQUIPO) ? json(enviados.get(RUTA_EQUIPO)) : null;
  const equipoRama = json(await leerRama(RUTA_EQUIPO));
  const abogados = (equipoEnviado ?? equipoRama)?.abogados;
  const fotosPrevias = new Map((Array.isArray(equipoRama?.abogados) ? equipoRama.abogados : []).map((a) => [a.id, a.foto]));
  for (const abogado of Array.isArray(equipoEnviado?.abogados) ? equipoEnviado.abogados : []) {
    if (abogado?.foto && abogado.foto !== fotosPrevias.get(abogado.id) && abogado.foto !== fotoDeAbogado(abogado.id)) {
      errores.push(`${abogado.nombre}: la foto tiene que llamarse ${fotoDeAbogado(abogado.id)}.`);
    }
  }
  const delEquipo = new Set((Array.isArray(abogados) ? abogados : []).map((a) => fotoDeAbogado(a?.id)));
  for (const foto of fotos) {
    const servicio = FOTOS_SERVICIO.get(foto);
    if (!servicio && !delEquipo.has(foto)) errores.push(`${foto}: no corresponde a ningún abogado.`);
    if (!servicio) continue;
    // Si la foto cambia, su descripción anterior deja de ser cierta.
    const [antes, despues] = [json(await leerRama(espanol)), enviados.has(espanol) ? json(enviados.get(espanol)) : null];
    const alt = (datos) => servicio.clave.split('.').reduce((nodo, parte) => nodo?.[parte], datos);
    if (!despues || alt(antes) === alt(despues)) errores.push(`${servicio.etiqueta}: al cambiar la foto hay que escribir su nueva descripción.`);
  }
  return errores;
}

// Lo que escribe un editor en equipo.json pierde las traducciones que haya mandado.
async function comoEditor(archivos, leerRama) {
  return Promise.all(archivos.map(async (archivo) => {
    if (archivo.ruta !== RUTA_EQUIPO) return archivo;
    try {
      const enviado = JSON.parse(archivo.texto);
      if (!Array.isArray(enviado.abogados)) return archivo; // lo rechaza la validación
      return { ...archivo, texto: serializar(reponerTraducciones(enviado, JSON.parse(await leerRama(RUTA_EQUIPO)))) };
    } catch {
      return archivo; // JSON roto: lo rechaza la validación
    }
  }));
}

// Suma al mismo commit lo que cambia en la lista de pendientes. Se calcula contra la rama, que
// para estos archivos es igual a la base: si no, el guardado ya terminó en Conflicto.
// confirmados: [{ clave, codigo }] que un admin dio por traducidos aunque el texto no haya cambiado.
async function conPendientes(archivos, leerRama, confirmados = []) {
  if (!archivos.some((a) => RUTAS_TEXTOS.includes(a.ruta))) return archivos;
  const propios = new Map(archivos.map((a) => [a.ruta, a.texto]));
  let pendientes;
  let nuevos;
  try {
    pendientes = parsearPendientes(await leerRama(ARCHIVO_PENDIENTES));
    const despues = await vistaDeTextos((ruta) => (propios.has(ruta) ? propios.get(ruta) : leerRama(ruta)));
    nuevos = reconciliar(pendientes, await vistaDeTextos(leerRama), despues, new Date().toISOString());
  } catch {
    return archivos; // algo roto: lo rechaza la validación
  }
  for (const { clave, codigo } of confirmados) {
    if (!nuevos[clave]) continue;
    delete nuevos[clave].viejo[codigo];
    if (!Object.keys(nuevos[clave].viejo).length) delete nuevos[clave];
  }
  if (JSON.stringify(nuevos) === JSON.stringify(pendientes)) return archivos;
  return [...archivos, { ruta: ARCHIVO_PENDIENTES, texto: serializarPendientes(nuevos) }];
}

function armarMensaje(descripcion, autor, archivos) {
  const resumen = String(descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Cambios desde el panel';
  return `Panel (${autor.nombre}): ${resumen}\n\nUsuario: ${autor.usuario}\nArchivos:\n${archivos.map((a) => `- ${a.ruta}`).join('\n')}`;
}

// base: el commit sobre el que se leyó. Si la rama avanzó sin tocar estos archivos, el cambio
// entra arriba de lo nuevo; si tocó alguno, Conflicto. Devuelve { commit }.
// La lista de pendientes no cuenta para el conflicto: se recalcula sobre lo último de la rama.
// comprobar(leerRama) es opcional y corre en cada intento: puede lanzar Conflicto.
export async function guardarCambios(env, { base, archivos, descripcion, autor, comprobar, confirmados, repo = new RepoGitHub(env) }) {
  comprobarArchivos(archivos);
  const esAdmin = autor.rol === 'admin';
  if (!esAdmin && archivos.some((a) => RUTA_TRADUCCION.test(a.ruta))) throw new Prohibido();
  const rutas = archivos.map((a) => a.ruta);
  for (let intento = 0; intento < INTENTOS; intento++) {
    const head = await repo.head();
    if (head !== base) {
      const cambiados = await repo.archivosCambiados(base, head);
      if (!cambiados) throw new Conflicto(rutas);
      const choque = rutas.filter((r) => cambiados.includes(r));
      if (choque.length) throw new Conflicto(choque);
    }
    const leerRama = lector(repo, head);
    if (comprobar) await comprobar(leerRama);
    const propios = esAdmin ? archivos : await comoEditor(archivos, leerRama);
    const problemas = await revisarCambios(propios, leerRama, { listaCerrada: !confirmados });
    if (problemas.length) throw new DatosInvalidos(problemas);
    const finales = await conPendientes(propios, leerRama, confirmados);
    // Contra head y no contra base: lo que entró recién también cuenta para las reglas.
    const conMios = lector(repo, head, new Map(finales.filter((a) => a.texto !== undefined).map((a) => [a.ruta, a.texto])));
    const errores = await validar(repo, conMios, finales, head);
    if (errores.length) throw new DatosInvalidos(errores);
    const firma = { name: autor.nombre, email: `${autor.usuario}@panel.invalid` };
    const commit = await repo.crearCommit({ padre: head, archivos: finales, mensaje: armarMensaje(descripcion, autor, finales), autor: firma });
    if (await repo.moverRama(commit)) return { commit };
  }
  throw new Conflicto([]);
}

// Lee un archivo editable y el commit al que pertenece: ese commit es la base del guardado.
// Con varios archivos, pasar el commit del primero como ref para leerlos todos en la misma versión.
// Un editor no ve las traducciones: ni los otros idiomas ni sus campos en equipo.json.
export async function leerParaEditar(env, ruta, ref, rol) {
  if (!RUTA_TEXTO.test(ruta)) throw new DatosInvalidos([`${ruta}: este archivo no se puede editar desde el panel`]);
  const esAdmin = rol === 'admin';
  if (!esAdmin && RUTA_TRADUCCION.test(ruta)) throw new Prohibido();
  const repo = new RepoGitHub(env);
  const commit = ref || await repo.head();
  const texto = await repo.leer(ruta, commit);
  const visible = !esAdmin && ruta === RUTA_EQUIPO && texto !== null ? serializar(equipoSoloEspanol(JSON.parse(texto))) : texto;
  return { ruta, commit, texto: visible };
}

// Para la pantalla Traducciones. Sólo admin: lo comprueba la ruta en api.js.
export async function listarTraducciones(env) {
  const repo = new RepoGitHub(env);
  const commit = await repo.head();
  const leer = lector(repo, commit);
  const pendientes = parsearPendientes(await leer(ARCHIVO_PENDIENTES));
  const vista = await vistaDeTextos(leer);
  const { abogados } = JSON.parse(await leer(RUTA_EQUIPO));
  const lista = Object.entries(pendientes).map(([clave, { fecha, viejo }]) => ({
    clave,
    titulo: rotulo(clave, abogados),
    fecha,
    nuevo: vista[clave]?.es ?? '',
    idiomas: OTROS_IDIOMAS.filter((c) => c in viejo).map((codigo) => {
      const actual = vista[clave]?.[codigo] ?? '';
      return { codigo, viejo: viejo[codigo], actual: oculto(actual) ? '' : actual, publicado: reglas.idiomasPublicados.includes(codigo) };
    }),
  }));
  return { commit, pendientes: lista };
}

// textos: { clave: { idioma: texto } }. Un campo vacío deja ese idioma pendiente. Traducción y baja
// del pendiente salen en un solo commit. El texto recibido da de baja el idioma aunque sea igual al
// que ya estaba: un cambio de coma en español puede no pedir otra traducción.
export async function guardarTraducciones(env, { base, textos, autor }) {
  if (autor.rol !== 'admin') throw new Prohibido();
  const repo = new RepoGitHub(env);
  const leerBase = lector(repo, base);
  const pendientesBase = parsearPendientes(await leerBase(ARCHIVO_PENDIENTES));
  const vistaBase = await vistaDeTextos(leerBase);

  const pedido = [];
  const errores = [];
  for (const [clave, porIdioma] of Object.entries(textos ?? {})) {
    for (const [codigo, valor] of Object.entries(porIdioma ?? {})) {
      const texto = typeof valor === 'string' ? valor.trim() : '';
      if (!texto) continue;
      if (!(codigo in (pendientesBase[clave]?.viejo ?? {}))) errores.push(`${clave}: ${codigo} no está pendiente`);
      else if (oculto(vistaBase[clave]?.es ?? '')) errores.push(`${clave}: el español todavía no tiene texto para traducir`);
      else if (oculto(texto)) errores.push(`${clave}: ${codigo} no puede quedar marcado como pendiente`);
      else pedido.push({ clave, codigo, texto });
    }
  }
  if (!pedido.length && !errores.length) errores.push('Escribí al menos una traducción.');
  if (errores.length) throw new DatosInvalidos(errores);

  const porRuta = new Map();
  for (const { clave, codigo, texto } of pedido) {
    const ruta = rutaDeClave(clave, codigo);
    if (!porRuta.has(ruta)) porRuta.set(ruta, JSON.parse(await leerBase(ruta)));
    if (!fijarTexto(porRuta.get(ruta), clave, codigo, texto)) throw new DatosInvalidos([`${clave}: ya no existe`]);
  }
  const archivos = [...porRuta].map(([ruta, datos]) => ({ ruta, texto: serializar(datos) }));
  const claves = [...new Set(pedido.map((p) => p.clave))];

  // Si el español cambió mientras se traducía, esta traducción ya no le corresponde.
  const comprobar = async (leerRama) => {
    const pendientes = parsearPendientes(await leerRama(ARCHIVO_PENDIENTES));
    const vista = await vistaDeTextos(leerRama);
    const cambiaron = claves.filter((clave) => vista[clave]?.es !== vistaBase[clave]?.es
      || pedido.some((p) => p.clave === clave && !(p.codigo in (pendientes[clave]?.viejo ?? {}))));
    if (cambiaron.length) throw new Conflicto(cambiaron);
  };
  const descripcion = `Traducción de ${pedido.map((p) => `${p.clave} (${p.codigo})`).join(', ')}`;
  return guardarCambios(env, { base, archivos, descripcion, autor, comprobar, confirmados: pedido, repo });
}

// version.json dice qué commit está sirviendo el sitio. Si es otro, el nuestro igual puede estar
// publicado: dos guardados seguidos publican sólo el último, que contiene al anterior.
export async function estadoPublicacion(env, commit, origen) {
  const respuesta = await env.ASSETS.fetch(new Request(`${origen}/version.json`));
  const publicado = respuesta.ok ? (await respuesta.json()).sha : null;
  if (publicado === commit) return { estado: 'publicado', publicado };
  if (!/^[0-9a-f]{40}$/.test(publicado || '')) return { estado: 'publicando', publicado };
  const contiene = await new RepoGitHub(env).contiene(publicado, commit);
  return { estado: contiene ? 'publicado' : 'publicando', publicado };
}

// ---- Historial: "Volver a la versión anterior" deshace la última publicación del panel con un
// commit nuevo que deja sus archivos como estaban antes. Sólo si nadie los tocó después: así nunca
// pisa otro cambio. La lista de pendientes vuelve con ellos, porque también era parte de ese estado.
const PREFIJO_PANEL = 'Panel (';
const NO_SE_PUEDE = 'Esa publicación no se puede deshacer desde el panel. Avisale a Felipe.';
const NOMBRES_IDIOMA = { en: 'inglés', pt: 'portugués', ru: 'ruso', zh: 'chino' };

function rotuloDeArchivo(ruta) {
  if (ruta === 'src/content.es.json') return 'Textos, reseñas y descripciones de fotos';
  if (ruta === RUTA_EQUIPO) return 'Abogados';
  if (ruta === ARCHIVO_PENDIENTES) return null; // acompaña a los textos: no se nombra aparte
  const idioma = ruta.match(RUTA_TRADUCCION)?.[1];
  if (idioma) return `Traducción al ${NOMBRES_IDIOMA[idioma] ?? idioma}`;
  const foto = FOTOS_SERVICIO.get(nombreDeFoto(ruta));
  return foto ? `Foto: ${foto.etiqueta}` : 'Foto de un abogado';
}

async function ultimaDelPanel(repo, autor) {
  const head = await repo.head();
  const lista = await repo.historial(head, 30);
  const ultimo = lista.find((c) => c.commit.message.startsWith(PREFIJO_PANEL));
  if (!ultimo) return { head, anterior: null };
  const [titulo] = ultimo.commit.message.split('\n');
  const [, nombre = '', descripcion = titulo] = titulo.match(/^Panel \((.*?)\): (.*)$/) ?? [];
  const anterior = { commit: ultimo.sha, fecha: ultimo.commit.committer?.date ?? null, autor: nombre, descripcion, cambia: [] };
  const padre = ultimo.parents.length === 1 ? ultimo.parents[0].sha : null;
  const rutas = padre ? await repo.archivosCambiados(padre, ultimo.sha) : null;
  const permitida = (ruta) => RUTA_TEXTO.test(ruta) || esRutaFoto(ruta) || ruta === ARCHIVO_PENDIENTES;
  if (!rutas?.length || !rutas.every(permitida)) return { head, anterior: { ...anterior, motivo: NO_SE_PUEDE } };
  anterior.cambia = [...new Set(rutas.map(rotuloDeArchivo).filter(Boolean))];
  if (autor.rol !== 'admin' && rutas.some((r) => RUTA_TRADUCCION.test(r))) {
    return { head, anterior: { ...anterior, motivo: 'La última publicación cambió traducciones: sólo la puede deshacer una cuenta de administración.' } };
  }
  if (ultimo.sha !== head) {
    const despues = await repo.archivosCambiados(ultimo.sha, head);
    if (!despues || rutas.some((r) => despues.includes(r))) {
      return { head, anterior: { ...anterior, motivo: 'Después de esa publicación hubo otros cambios en lo mismo. Avisale a Felipe.' } };
    }
  }
  return { head, anterior, padre, rutas };
}

// Para el diálogo: qué se deshace, o por qué no se puede. Sin commit para deshacer, anterior es null.
export async function versionAnterior(env, autor) {
  const { head, anterior } = await ultimaDelPanel(new RepoGitHub(env), autor);
  return { head, anterior };
}

// head y commit: lo que mostró el diálogo. Si algo cambió desde entonces, Conflicto.
export async function restaurarVersion(env, { head: visto, commit, autor, repo = new RepoGitHub(env) }) {
  const { head, anterior, padre, rutas } = await ultimaDelPanel(repo, autor);
  if (head !== visto || anterior?.commit !== commit) throw new Conflicto([]);
  if (anterior.motivo) throw new DatosInvalidos([anterior.motivo]);
  const archivos = [];
  for (const ruta of rutas) {
    if (esRutaFoto(ruta)) {
      const sha = await repo.blob(ruta, padre);
      // Una foto que esa publicación agregó queda: sin su abogado, nadie la muestra.
      if (sha) archivos.push({ ruta, sha });
      continue;
    }
    const texto = await repo.leer(ruta, padre);
    if (texto === null) throw new DatosInvalidos([NO_SE_PUEDE]);
    archivos.push({ ruta, texto });
  }
  if (!archivos.length) throw new DatosInvalidos([NO_SE_PUEDE]);
  const propios = new Map(archivos.filter((a) => a.texto !== undefined).map((a) => [a.ruta, a.texto]));
  const errores = await validar(repo, lector(repo, head, propios), archivos, head);
  if (errores.length) throw new DatosInvalidos(['Esa versión anterior ya no es compatible con el sitio. Avisale a Felipe.']);
  const firma = { name: autor.nombre, email: `${autor.usuario}@panel.invalid` };
  const nuevo = await repo.crearCommit({
    padre: head, archivos, autor: firma,
    mensaje: armarMensaje(`Volver a la versión anterior a «${anterior.descripcion}»`, autor, archivos),
  });
  if (!await repo.moverRama(nuevo)) throw new Conflicto([]);
  return { commit: nuevo };
}
