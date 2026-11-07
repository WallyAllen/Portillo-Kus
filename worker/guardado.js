// Guardar es un commit en el repo. Este módulo decide qué se puede guardar, lo valida contra
// el estado de la rama en ese momento y evita pisar lo que otra persona guardó.
import { RepoGitHub } from './github.js';
import { validarRepo } from './validacion.js';

const RUTA_TEXTO = /^src\/(content\.(es|en|pt|ru|zh)\.json|equipo\.json)$/;
const RUTA_IMAGEN = /^portillo-images\/([a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp))$/;
const IMAGEN_MAXIMA = 5 * 1024 * 1024;
const MAX_ARCHIVOS = 10;
// Un reintento sólo por una carrera justo al mover la rama. Con más, una ráfaga de escrituras
// podría pasar de 50 subpedidos, el límite del plan Free de Workers.
const INTENTOS = 2;

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
    super('El cambio no se guardó porque rompería la publicación.');
    this.errores = errores;
  }
}

function esImagenReal(base64) {
  let inicio;
  try {
    inicio = atob(base64.slice(0, 16));
  } catch {
    return false;
  }
  return inicio.startsWith('\xFF\xD8\xFF') // JPEG
    || inicio.startsWith('\x89PNG\r\n\x1A\n')
    || (inicio.startsWith('RIFF') && inicio.slice(8, 12) === 'WEBP');
}

// Una imagen corrupta frena el build (Pillow no la abre) y un archivo de otro tipo no debe
// llegar al repo. Sólo se aceptan estas rutas: el token podría escribir cualquier archivo.
function comprobarArchivos(archivos) {
  if (!archivos.length || archivos.length > MAX_ARCHIVOS) return [`Se guardan entre 1 y ${MAX_ARCHIVOS} archivos por vez.`];
  const errores = [];
  const vistas = new Set();
  for (const archivo of archivos) {
    const ruta = String(archivo?.ruta);
    if (vistas.has(ruta)) errores.push(`${ruta}: repetido`);
    vistas.add(ruta);
    if (RUTA_TEXTO.test(ruta)) {
      if (typeof archivo.texto !== 'string') errores.push(`${ruta}: falta el texto`);
    } else if (RUTA_IMAGEN.test(ruta)) {
      if (typeof archivo.base64 !== 'string' || !esImagenReal(archivo.base64)) errores.push(`${ruta}: no es una imagen JPG, PNG o WebP`);
      else if (archivo.base64.length * 0.75 > IMAGEN_MAXIMA) errores.push(`${ruta}: la imagen pasa de 5 MB`);
    } else {
      errores.push(`${ruta}: este archivo no se puede editar desde el panel`);
    }
  }
  return errores;
}

function validar(repo, ref, archivos) {
  const propios = new Map(archivos.map((a) => [a.ruta, a]));
  return validarRepo({
    leer: (ruta) => (propios.has(ruta) ? propios.get(ruta).texto : repo.leer(ruta, ref)),
    listarImagenes: async () => {
      const nuevas = [...propios.keys()].filter((r) => RUTA_IMAGEN.test(r)).map((r) => r.split('/')[1]);
      return new Set([...await repo.listar('portillo-images', ref), ...nuevas]);
    },
  });
}

function armarMensaje(descripcion, autor, archivos) {
  const resumen = String(descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Cambios desde el panel';
  return `Panel (${autor.nombre}): ${resumen}\n\nUsuario: ${autor.usuario}\nArchivos:\n${archivos.map((a) => `- ${a.ruta}`).join('\n')}`;
}

// base: el commit sobre el que se leyó. Si la rama avanzó sin tocar estos archivos, el cambio
// entra arriba de lo nuevo; si tocó alguno, Conflicto. Devuelve { commit }.
export async function guardarCambios(env, { base, archivos, descripcion, autor }) {
  const invalidos = comprobarArchivos(archivos);
  if (invalidos.length) throw new DatosInvalidos(invalidos);
  const repo = new RepoGitHub(env);
  const rutas = archivos.map((a) => a.ruta);
  for (let intento = 0; intento < INTENTOS; intento++) {
    const head = await repo.head();
    if (head !== base) {
      const cambiados = await repo.archivosCambiados(base, head);
      if (!cambiados) throw new Conflicto(rutas);
      const choque = rutas.filter((r) => cambiados.includes(r));
      if (choque.length) throw new Conflicto(choque);
    }
    // Contra head y no contra base: lo que entró recién también cuenta para las reglas.
    const errores = await validar(repo, head, archivos);
    if (errores.length) throw new DatosInvalidos(errores);
    const firma = { name: autor.nombre, email: `${autor.usuario}@panel.invalid` };
    const commit = await repo.crearCommit({ padre: head, archivos, mensaje: armarMensaje(descripcion, autor, archivos), autor: firma });
    if (await repo.moverRama(commit)) return { commit };
  }
  throw new Conflicto([]);
}

// Lee un archivo editable y el commit al que pertenece: ese commit es la base del guardado.
// Con varios archivos, pasar el commit del primero como ref para leerlos todos en la misma versión.
export async function leerParaEditar(env, ruta, ref) {
  if (!RUTA_TEXTO.test(ruta)) throw new DatosInvalidos([`${ruta}: este archivo no se puede editar desde el panel`]);
  const repo = new RepoGitHub(env);
  const commit = ref || await repo.head();
  return { ruta, commit, texto: await repo.leer(ruta, commit) };
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
