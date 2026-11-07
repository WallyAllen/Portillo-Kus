// Fotos de las tarjetas de servicios. Cada una reemplaza su mismo archivo y su descripción va junto
// con la foto: la anterior deja de ser cierta, y el servidor no acepta una sin la otra.
import { agrupar, aviso, campo, crear, ESPANOL, fijarClave, guardarYRecargar, leerClave, serializar } from './comun.js';
import { selectorDeFoto } from './imagen.js';
import { revisarTexto } from './revisar.js';

function tarjeta({ foto, datos, commit, fotos, guardar, recargar }) {
  const formulario = crear('form', 'tarjeta foto-tarjeta');
  const descripcion = leerClave(datos, foto.clave);
  const actual = crear('img', 'foto-actual');
  actual.src = `/portillo-images/${foto.archivo}?v=${commit}`;
  actual.alt = descripcion;
  actual.addEventListener('error', () => { actual.hidden = true; });
  const reglas = { largo: fotos.largoDescripcion, atributo: true };
  const fila = campo({ etiqueta: 'Descripción de la foto nueva', largo: reglas.largo, ayuda: `La de ahora: ${descripcion}` });
  fila.nodo.hidden = true;
  const error = aviso();
  const boton = crear('button', 'boton', 'Guardar foto');
  boton.type = 'submit';
  boton.hidden = true;
  const selector = selectorDeFoto({
    aspecto: fotos.aspecto,
    etiqueta: 'Cambiar foto',
    alCambiar: () => {
      const hay = selector.hayFoto();
      fila.nodo.hidden = !hay;
      boton.hidden = !hay;
    },
  });
  formulario.append(crear('h3', '', foto.etiqueta), actual, selector.nodo, fila.nodo, error.nodo, boton);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.mostrar();
    const texto = fila.entrada.value.trim();
    const problema = revisarTexto(texto, reglas) ?? (texto === descripcion ? 'Describí lo que muestra la foto nueva.' : null);
    fila.avisar(problema);
    if (problema) {
      fila.entrada.focus();
      return;
    }
    boton.disabled = true;
    fijarClave(datos, foto.clave, texto);
    const salio = await guardarYRecargar({
      guardar,
      cambios: {
        base: commit,
        descripcion: `Foto de ${foto.etiqueta}`,
        archivos: [
          { ruta: `portillo-images/${foto.archivo}`, base64: await selector.base64() },
          { ruta: ESPANOL, texto: serializar(datos) },
        ],
      },
      recargar,
      alFallar: (mensaje) => error.mostrar(mensaje),
    });
    if (!salio) {
      fijarClave(datos, foto.clave, descripcion);
      boton.disabled = false;
    }
  });
  return formulario;
}

export default {
  id: 'fotos',
  titulo: 'Fotos',
  async render(contenedor, { api, guardar }) {
    const dibujar = async () => {
      const [{ fotos }, { commit, texto }] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${ESPANOL}`)]);
      const datos = JSON.parse(texto);
      const secciones = [];
      for (const [grupo, lista] of agrupar(fotos.lista)) {
        const rejilla = crear('div', 'fotos-rejilla');
        rejilla.append(...lista.map((foto) => tarjeta({ foto, datos, commit, fotos, guardar, recargar: dibujar })));
        secciones.push(crear('h2', '', grupo), rejilla);
      }
      contenedor.replaceChildren(
        crear('h1', '', 'Fotos de los servicios'),
        crear('p', '', 'Después de guardar, la foto nueva tarda unos minutos en verse en el sitio.'),
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
