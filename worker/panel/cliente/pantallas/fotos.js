// Fotos de las tarjetas de servicios. Cada una reemplaza su mismo archivo y su descripción va junto
// con la foto: la anterior deja de ser cierta, y el servidor no acepta una sin la otra.
import { agrupar, aviso, campo, crear, ESPANOL, fijarClave, guardarYRecargar, leerClave, serializar } from './comun.js';
import { selectorDeFoto } from './imagen.js';
import { revisarTexto } from './revisar.js';

function tarjeta({ foto, datos, commit, fotos, guardar, leerActual }) {
  const formulario = crear('form', 'tarjeta foto-tarjeta');
  let descripcion = leerClave(datos, foto.clave);
  const actual = crear('img', 'foto-actual');
  actual.src = `/portillo-images/${foto.archivo}?v=${commit}`;
  actual.alt = descripcion;
  actual.addEventListener('error', () => { actual.hidden = true; });
  const reglas = { largo: fotos.largoDescripcion, atributo: true };
  const fila = campo({ etiqueta: 'Descripción de la foto nueva', largo: reglas.largo, ayuda: `La de ahora: ${descripcion}` });
  fila.nodo.hidden = true;
  const error = aviso();
  const boton = crear('button', 'boton', 'Publicar foto');
  boton.type = 'submit';
  boton.hidden = true;
  const actualizar = crear('button', 'boton boton-borde', 'Cargar versión actual');
  actualizar.type = 'button';
  actualizar.hidden = true;
  actualizar.addEventListener('click', async () => {
    actualizar.disabled = true;
    try {
      ({ datos, commit } = await leerActual());
      descripcion = leerClave(datos, foto.clave);
      actual.src = `/portillo-images/${foto.archivo}?v=${commit}`;
      actual.alt = descripcion;
      fila.nodo.querySelector('.campo-ayuda').textContent = `La de ahora: ${descripcion}`;
      actualizar.hidden = true;
      error.mostrar('Se cargó la versión actual. Revisá tu foto y su descripción antes de publicar.');
      boton.focus();
    } catch {
      error.mostrar('No se pudo cargar la versión actual. Tu foto sigue seleccionada.');
    } finally {
      actualizar.disabled = false;
    }
  });
  const selector = selectorDeFoto({
    aspecto: fotos.aspecto,
    etiqueta: 'Cambiar foto',
    alCambiar: () => {
      const hay = selector.hayFoto();
      fila.nodo.hidden = !hay;
      boton.hidden = !hay;
    },
  });
  formulario.append(crear('h3', '', foto.etiqueta), actual, selector.nodo, fila.nodo, error.nodo, boton, actualizar);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (boton.disabled || actualizar.disabled || !selector.hayFoto()) return;
    error.mostrar();
    const texto = fila.entrada.value.trim();
    const problema = revisarTexto(texto, reglas) ?? (texto === descripcion ? 'Describí lo que muestra la foto nueva.' : null);
    fila.avisar(problema);
    if (problema) {
      fila.entrada.focus();
      return;
    }
    boton.disabled = true;
    actualizar.disabled = true;
    selector.nodo.inert = true;
    fila.entrada.disabled = true;
    const copia = structuredClone(datos);
    fijarClave(copia, foto.clave, texto);
    let base64;
    try {
      base64 = await selector.base64();
    } catch {
      error.mostrar('No se pudo preparar la foto. Probá de nuevo.');
    }
    if (!base64) {
      boton.disabled = actualizar.disabled = fila.entrada.disabled = false;
      selector.nodo.inert = false;
      return;
    }
    const salio = await guardarYRecargar({
      guardar,
      cambios: {
        base: commit,
        descripcion: `Foto de ${foto.etiqueta}`,
        archivos: [
          { ruta: `portillo-images/${foto.archivo}`, base64 },
          { ruta: ESPANOL, texto: serializar(copia) },
        ],
      },
      recargar: ({ commit: publicado }) => formulario.replaceWith(tarjeta({
        foto, datos: copia, commit: publicado, fotos, guardar, leerActual,
      })),
      alFallar: (mensaje, estado) => {
        if (estado === 409) actualizar.hidden = false;
        error.mostrar(mensaje);
      },
    });
    if (!salio) {
      boton.disabled = actualizar.disabled = fila.entrada.disabled = false;
      selector.nodo.inert = false;
    }
  });
  return formulario;
}

export default {
  id: 'fotos',
  titulo: 'Fotos',
  async render(contenedor, { api, guardar }) {
    const leerActual = async () => {
      const { commit, texto } = await api(`/api/archivo?ruta=${ESPANOL}`);
      return { commit, datos: JSON.parse(texto) };
    };
    const dibujar = async () => {
      const [{ fotos }, { commit, datos }] = await Promise.all([api('/api/campos'), leerActual()]);
      const secciones = [];
      for (const [grupo, lista] of agrupar(fotos.lista)) {
        const rejilla = crear('div', 'fotos-rejilla');
        rejilla.append(...lista.map((foto) => tarjeta({ foto, datos, commit, fotos, guardar, leerActual })));
        secciones.push(crear('h2', '', grupo), rejilla);
      }
      contenedor.replaceChildren(
        crear('h1', '', 'Fotos de los servicios'),
        crear('p', '', 'Revisá el recorte y la descripción. La foto nueva tarda unos minutos en verse en el sitio después de publicar.'),
        ...secciones,
      );
    };
    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await dibujar();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
