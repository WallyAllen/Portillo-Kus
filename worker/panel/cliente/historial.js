// "Historial → Volver a la versión anterior": deshace la última publicación hecha desde el panel.
// Se ofrece sólo sin cambios sin publicar en la pantalla, para no mezclar versiones.
const $ = (id) => document.getElementById(id);
const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

let permitido = true;

export function permitirHistorial(si) {
  permitido = si;
  $('restaurar-version').disabled = !si;
  $('restaurar-nota').hidden = si;
}

function abrirMenu(abierto) {
  $('historial-menu').hidden = !abierto;
  $('historial').setAttribute('aria-expanded', String(abierto));
}

function preguntar(anterior) {
  const dialogo = $('restaurar');
  const cuando = anterior.fecha ? fecha.format(new Date(anterior.fecha)) : 'hace poco';
  $('restaurar-fecha').textContent = `La última publicación fue «${anterior.descripcion}»${anterior.autor ? `, de ${anterior.autor},` : ''} el ${cuando}.`;
  $('restaurar-lista').replaceChildren(...anterior.cambia.map((tema) => {
    const item = document.createElement('li');
    item.textContent = tema;
    return item;
  }));
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'restaurar'), { once: true });
  });
}

// alRestaurar(commit): ya se guardó; falta seguir la publicación y volver a leer la pantalla.
export function iniciarHistorial({ api, alRestaurar }) {
  const boton = $('historial');
  const menu = $('historial-menu');
  const aviso = (texto) => {
    $('aviso-panel').textContent = texto;
  };
  boton.addEventListener('click', () => {
    abrirMenu(menu.hidden);
    if (!menu.hidden) menu.querySelector('button:not(:disabled)')?.focus();
  });
  document.addEventListener('click', (evento) => { if (!evento.target.closest('.historial')) abrirMenu(false); });
  menu.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      abrirMenu(false);
      boton.focus();
    }
  });
  $('restaurar-version').addEventListener('click', async () => {
    abrirMenu(false);
    if (!permitido) return;
    aviso('Buscando la versión anterior…');
    try {
      const { head, anterior } = await api('/api/anterior');
      if (!anterior) {
        aviso('Todavía no hay publicaciones del panel para deshacer.');
        return;
      }
      if (anterior.motivo) {
        aviso(anterior.motivo);
        return;
      }
      aviso('');
      if (!await preguntar(anterior)) {
        boton.focus();
        return;
      }
      aviso('Volviendo a la versión anterior…');
      const { commit } = await api('/api/restaurar', { metodo: 'POST', cuerpo: { head, commit: anterior.commit } });
      aviso('Listo: volviste a la versión anterior. Se está publicando en el sitio.');
      alRestaurar(commit);
    } catch (e) {
      aviso([e.message, ...(e.datos?.errores ?? [])].join(' '));
    }
  });
}
