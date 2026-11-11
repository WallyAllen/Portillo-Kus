// Fotos de las tarjetas de servicios. Cada una reemplaza su mismo archivo y su descripción va junto
// con la foto: la anterior deja de ser cierta, y el servidor no acepta una sin la otra.
// Las fotos elegidas se publican juntas desde la barra de abajo.
import {
  agrupar, aviso, campo, cargando, crear, ESPANOL, fallaDeCarga, fijarClave, guardarYRecargar, leerClave, listo, marcarEditado, serializar,
} from './comun.js';
import { selectorDeFoto } from './imagen.js';
import { revisarTexto } from './revisar.js';

// El servidor acepta 10 archivos por guardado: las fotos y el JSON con sus descripciones.
const MAXIMO_POR_VEZ = 9;

function tarjeta({ foto, estado, fotos, alCambiar }) {
  const nodo = crear('div', 'tarjeta foto-tarjeta');
  const actual = crear('img', 'foto-actual');
  actual.addEventListener('error', () => { actual.hidden = true; });
  const reglas = { largo: fotos.largoDescripcion, atributo: true };
  const fila = campo({ etiqueta: 'Descripción de la foto nueva', largo: reglas.largo, ayuda: '' });
  fila.nodo.hidden = true;
  const ayuda = fila.nodo.querySelector('.campo-ayuda');
  const descripcion = () => leerClave(estado.datos, foto.clave);
  const refrescar = () => {
    actual.hidden = false;
    actual.src = `/portillo-images/${foto.archivo}?v=${estado.commit}`;
    actual.alt = descripcion();
    ayuda.textContent = `La de ahora: ${descripcion()}`;
  };
  const selector = selectorDeFoto({
    aspecto: fotos.aspecto,
    etiqueta: 'Cambiar foto',
    alCambiar: () => {
      const hay = selector.hayFoto();
      fila.nodo.hidden = !hay;
      marcarEditado(actual, hay);
      alCambiar();
    },
  });
  fila.entrada.addEventListener('input', alCambiar);
  nodo.append(crear('h3', '', foto.etiqueta), actual, selector.nodo, fila.nodo);
  refrescar();
  return {
    nodo,
    foto,
    elegida: () => selector.hayFoto(),
    // Devuelve el aviso, o null. Marca el campo.
    revisar() {
      const texto = fila.entrada.value.trim();
      const problema = revisarTexto(texto, reglas) ?? (texto === descripcion() ? 'Describí lo que muestra la foto nueva.' : null);
      fila.avisar(problema);
      return problema;
    },
    enfocar: () => fila.entrada.focus(),
    texto: () => fila.entrada.value.trim(),
    base64: () => selector.base64(),
    url: () => selector.url(),
    bloquear(bloqueada) {
      selector.nodo.inert = bloqueada;
      fila.entrada.disabled = bloqueada;
    },
    refrescar,
  };
}

export default {
  id: 'fotos',
  titulo: 'Fotos',
  volanta: 'CONTENIDO DEL SITIO',
  bajada: 'Elegí una foto nueva, revisá el recorte y escribí qué muestra. Podés cambiar varias y publicarlas juntas.',
  async render(contenedor, { api, guardar, barra, previa }) {
    const leerActual = async () => {
      const { commit, texto } = await api(`/api/archivo?ruta=${ESPANOL}`);
      return { commit, datos: JSON.parse(texto) };
    };
    const dibujar = async (mensaje) => {
      const [{ fotos }, estado] = await Promise.all([api('/api/campos'), leerActual()]);
      let control = { actualizar() {} };
      const error = aviso();
      const conflicto = crear('div', 'aviso-borrador');
      conflicto.dataset.tipo = 'conflicto';
      conflicto.hidden = true;
      const actualizar = crear('button', 'boton', 'Cargar versión actual');
      actualizar.type = 'button';
      conflicto.append(crear('p', '', 'Otra persona publicó cambios mientras elegías. Tus fotos siguen seleccionadas: cargá la versión actual y revisá las descripciones antes de publicar.'), actualizar);
      const tarjetas = [];
      const secciones = [];
      for (const [grupo, lista] of agrupar(fotos.lista)) {
        const rejilla = crear('div', 'fotos-rejilla');
        for (const foto of lista) {
          const t = tarjeta({ foto, estado, fotos, alCambiar: () => control.actualizar() });
          tarjetas.push(t);
          rejilla.append(t.nodo);
        }
        secciones.push(crear('h2', 'fotos-grupo', grupo), rejilla);
      }
      actualizar.addEventListener('click', async () => {
        actualizar.disabled = true;
        try {
          Object.assign(estado, await leerActual());
          for (const t of tarjetas) t.refrescar();
          conflicto.hidden = true;
          error.mostrar();
        } catch {
          error.mostrar('No se pudo cargar la versión actual. Tus fotos siguen seleccionadas.');
        } finally {
          actualizar.disabled = false;
        }
      });
      const elegidas = () => tarjetas.filter((t) => t.elegida());

      const publicar = async () => {
        error.mostrar();
        const lista = elegidas();
        const conProblema = lista.filter((t) => t.revisar());
        if (conProblema.length) {
          conProblema[0].enfocar();
          return false;
        }
        if (lista.length > MAXIMO_POR_VEZ) {
          error.mostrar(`Publicá de a ${MAXIMO_POR_VEZ} fotos como máximo. Ahora hay ${lista.length} elegidas.`);
          return false;
        }
        for (const t of tarjetas) t.bloquear(true);
        const copia = structuredClone(estado.datos);
        let archivos;
        try {
          archivos = await Promise.all(lista.map(async (t) => {
            fijarClave(copia, t.foto.clave, t.texto());
            return { ruta: `portillo-images/${t.foto.archivo}`, base64: await t.base64() };
          }));
        } catch {
          error.mostrar('No se pudo preparar una de las fotos. Probá de nuevo.');
          for (const t of tarjetas) t.bloquear(false);
          return false;
        }
        const salio = await guardarYRecargar({
          guardar,
          cambios: {
            base: estado.commit,
            descripcion: `${lista.length === 1 ? 'Foto' : 'Fotos'}: ${lista.map((t) => t.foto.etiqueta).join(', ')}`,
            archivos: [...archivos, { ruta: ESPANOL, texto: serializar(copia) }],
          },
          recargar: () => {
            if (contenedor.isConnected) return dibujar(lista.length === 1 ? 'Foto enviada para publicar.' : 'Fotos enviadas para publicar.');
          },
          alFallar: (mensaje, codigo) => {
            if (codigo === 409) conflicto.hidden = false;
            error.mostrar(mensaje);
          },
        });
        if (!salio) for (const t of tarjetas) t.bloquear(false);
        return salio;
      };
      const cambiosParaPrevia = () => ({
        fotos: elegidas().map((t) => ({ archivo: t.foto.archivo, url: t.url(), alt: t.texto() })),
      });
      listo(contenedor);
      contenedor.replaceChildren(...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []), conflicto, error.nodo, ...secciones);
      control = barra.usar({ contar: () => elegidas().length, publicar, previa: () => previa(cambiosParaPrevia()) });
    };
    cargando(contenedor);
    try {
      await dibujar();
    } catch (e) {
      fallaDeCarga(contenedor, e);
    }
  },
};
