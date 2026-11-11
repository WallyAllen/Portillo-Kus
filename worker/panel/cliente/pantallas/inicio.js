// Inicio: qué quedó sin publicar en este navegador, la última publicación y accesos a cada sección.
// Es también el ejemplo mínimo de una pantalla (ver cliente/app.js).
import { crear } from './comun.js';

const fecha = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

const ACCESOS = {
  textos: 'Títulos, presentación, pasos y horarios.',
  fotos: 'Las fotos de las tarjetas de servicios.',
  resenas: 'Las opiniones de clientes que se muestran.',
  abogados: 'El equipo: datos, foto y orden.',
  traducciones: 'Lo que falta traducir a los otros idiomas.',
  usuarios: 'Cuentas y contraseñas del panel.',
};
// Las secciones que guardan borrador (ver borradorDeFormulario en comun.js).
const CON_BORRADOR = ['textos', 'resenas'];

function borradores(usuario, pantallas) {
  return CON_BORRADOR.filter((id) => {
    try {
      const guardado = JSON.parse(localStorage.getItem(`portillo-borrador:${usuario}:${id}`));
      return guardado?.campos && Object.keys(guardado.campos).length;
    } catch {
      return false;
    }
  }).map((id) => pantallas.find((p) => p.id === id)).filter(Boolean);
}

const enlace = (pantalla, texto = pantalla.titulo) => {
  const a = crear('a', '', texto);
  a.href = `#/${pantalla.id}`;
  return a;
};

export default {
  id: 'inicio',
  titulo: 'Inicio',
  render(contenedor, { usuario, api, pantallas, encabezado }) {
    encabezado(`Hola, ${usuario.nombre}`, 'Desde acá editás el sitio del estudio. Los cambios se publican en unos minutos.');

    const resumen = crear('section', 'tarjeta resumen');
    resumen.setAttribute('aria-labelledby', 'resumen-titulo');
    const titulo = crear('h2', '', 'Cómo está el sitio');
    titulo.id = 'resumen-titulo';
    const pendientes = borradores(usuario.usuario, pantallas);
    const sinPublicar = crear('p', pendientes.length ? 'resumen-dato resumen-pendiente' : 'resumen-dato');
    if (pendientes.length) {
      sinPublicar.append('Tenés cambios sin publicar en ');
      pendientes.forEach((p, i) => {
        if (i) sinPublicar.append(i === pendientes.length - 1 ? ' y ' : ', ');
        sinPublicar.append(enlace(p));
      });
      sinPublicar.append('. Quedaron guardados en este navegador.');
    } else {
      sinPublicar.textContent = 'No tenés cambios sin publicar en este navegador.';
    }
    const ultima = crear('p', 'resumen-dato', 'Buscando la última publicación…');
    resumen.append(titulo, sinPublicar, ultima);
    api('/api/anterior').then(({ anterior }) => {
      if (!anterior) {
        ultima.textContent = 'Todavía no se publicó nada desde el panel.';
        return;
      }
      const cuando = anterior.fecha ? fecha.format(new Date(anterior.fecha)) : 'hace poco';
      ultima.textContent = `Última publicación: «${anterior.descripcion}»${anterior.autor ? `, de ${anterior.autor}` : ''}, el ${cuando}.`;
    }).catch(() => {
      ultima.textContent = 'No se pudo leer la última publicación.';
    });

    const accesos = crear('nav', 'accesos');
    accesos.setAttribute('aria-label', 'Accesos directos');
    const lista = crear('ul', '');
    for (const pantalla of pantallas.filter((p) => ACCESOS[p.id])) {
      const item = crear('li', '');
      const a = enlace(pantalla, '');
      a.className = 'acceso';
      a.append(crear('strong', '', pantalla.titulo), crear('span', '', ACCESOS[pantalla.id]));
      item.append(a);
      lista.append(item);
    }
    accesos.append(lista);
    contenedor.append(resumen, accesos);
  },
};
