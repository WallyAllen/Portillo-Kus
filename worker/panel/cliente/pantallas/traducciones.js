// Traducciones pendientes, sólo para admin (la API también lo exige). Un idioma con el campo
// vacío sigue pendiente y el sitio muestra el español: se puede traducir de a un idioma.
import { crear } from './comun.js';

const NOMBRES = { en: 'Inglés', pt: 'Portugués', ru: 'Ruso', zh: 'Chino' };

function bloqueDeTexto(rotulo, texto) {
  const bloque = crear('div', 'trad-texto');
  bloque.append(crear('strong', '', rotulo), crear('p', '', texto || '(vacío)'));
  return bloque;
}

function campoDeIdioma(clave, idioma, conViejo) {
  const campo = crear('div', 'trad-campo');
  const id = `trad-${clave}-${idioma.codigo}`.replace(/[^\w-]/g, '-');
  const rotulo = crear('label', '', NOMBRES[idioma.codigo] ?? idioma.codigo);
  rotulo.htmlFor = id;
  if (!idioma.publicado) rotulo.append(crear('span', 'trad-oculto', ' (todavía sin publicar)'));
  // Arranca vacío: lo escrito se da por traducido, y una traducción vieja prellenada se confirmaría sin querer.
  const entrada = crear('textarea');
  entrada.id = id;
  entrada.rows = 3;
  entrada.lang = idioma.codigo;
  entrada.dataset.codigo = idioma.codigo;
  campo.append(rotulo);
  if (conViejo) campo.append(bloqueDeTexto('Español anterior', idioma.viejo));
  if (idioma.actual) {
    campo.append(bloqueDeTexto('Traducción actual', idioma.actual));
    const usar = crear('button', 'boton boton-borde trad-usar', 'Usar la actual');
    usar.type = 'button';
    usar.addEventListener('click', () => { entrada.value = idioma.actual; entrada.focus(); });
    campo.append(usar);
  }
  campo.append(entrada);
  return campo;
}

function tarjeta(item, alGuardar) {
  const formulario = crear('form', 'tarjeta trad');
  formulario.append(crear('h2', '', item.titulo));
  formulario.append(crear('p', 'trad-fecha', `Cambió el ${new Date(item.fecha).toLocaleString('es-AR')}`));

  // Se muestra un solo "anterior" salvo que un idioma se haya traducido entre dos cambios.
  const anteriores = new Set(item.idiomas.map((i) => i.viejo));
  if (anteriores.size === 1) formulario.append(bloqueDeTexto('Español anterior', item.idiomas[0].viejo));
  formulario.append(bloqueDeTexto('Español nuevo', item.nuevo));

  const sinTexto = !item.nuevo.trim() || item.nuevo.startsWith('[PENDIENTE]');
  if (sinTexto) {
    formulario.append(crear('p', 'aviso-error', 'El español todavía no tiene un texto para traducir.'));
    return formulario;
  }
  for (const idioma of item.idiomas) formulario.append(campoDeIdioma(item.clave, idioma, anteriores.size > 1));

  const aviso = crear('p', 'aviso-error');
  aviso.setAttribute('role', 'alert');
  aviso.hidden = true;
  const boton = crear('button', 'boton', 'Guardar');
  boton.type = 'submit';
  formulario.append(aviso, boton);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const textos = {};
    for (const entrada of formulario.querySelectorAll('textarea')) {
      if (entrada.value.trim()) textos[entrada.dataset.codigo] = entrada.value;
    }
    aviso.hidden = true;
    boton.disabled = true;
    try {
      await alGuardar(item.clave, textos);
    } catch (e) {
      aviso.textContent = [e.message, ...(e.datos?.errores ?? [])].join(' ');
      aviso.hidden = false;
      boton.disabled = false;
    }
  });
  return formulario;
}

export default {
  id: 'traducciones',
  titulo: 'Traducciones',
  soloAdmin: true,
  async render(contenedor, { api, seguirPublicacion }) {
    const dibujar = async () => {
      const { commit, pendientes } = await api('/api/traducciones');
      const titulo = crear('h1', '', 'Traducciones');
      const ayuda = crear('p', '', pendientes.length
        ? 'Mientras un idioma siga pendiente, el sitio muestra el texto en español. Un campo vacío sigue pendiente.'
        : 'No hay traducciones pendientes.');
      const guardar = async (clave, textos) => {
        try {
          const { commit: nuevo } = await api('/api/traducciones', { metodo: 'POST', cuerpo: { base: commit, textos: { [clave]: textos } } });
          seguirPublicacion(nuevo);
        } catch (e) {
          if (e.estado !== 409) throw e;
          await dibujar(); // otra persona cambió lo mismo: se muestra lo último
          seguirMensaje(e.message);
          return;
        }
        await dibujar();
      };
      // Volver a dibujar no borra lo que se estaba escribiendo en las otras tarjetas.
      const escrito = new Map([...contenedor.querySelectorAll('textarea')].map((t) => [t.id, t.value]));
      const tarjetas = pendientes.map((item) => tarjeta(item, guardar));
      contenedor.replaceChildren(titulo, ayuda, ...tarjetas);
      for (const entrada of contenedor.querySelectorAll('textarea')) entrada.value = escrito.get(entrada.id) ?? '';
    };
    const seguirMensaje = (mensaje) => {
      const aviso = crear('p', 'aviso-error', mensaje);
      aviso.setAttribute('role', 'alert');
      contenedor.prepend(aviso);
    };
    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await dibujar();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
