// Abogados: src/equipo.json. Se edita en español; los otros idiomas muestran el español hasta traducirse.
import { aviso, campo, crear, ESPANOL, guardarYRecargar, leerClave, serializar } from './comun.js';
import { selectorDeFoto } from './imagen.js';
import { fotoDeAbogado, idNuevo, revisarAbogado } from './revisar.js';
import { renderEquipo } from './vista-abogado.js';

const EQUIPO = 'src/equipo.json';
const nombreVisible = (abogado) => abogado.nombre.trim() || '(sin nombre)';

// ---- Vista previa: los estilos reales salen de la portada, sin copiarlos. Se buscan en el texto
// porque DOMParser los haría chocar con la CSP. Incluye los <style> de <noscript>, que muestran el
// perfil sin abrirlo y las tarjetas sin animación.
let estilos = null;

async function estilosDelSitio() {
  estilos ??= (async () => {
    const respuesta = await fetch('/');
    if (!respuesta.ok) throw new Error('sin portada');
    const pagina = await respuesta.text();
    const css = [...pagina.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
      .replaceAll(':root', ':host')
      .replace(/url\((['"]?)(?!data:)([^'")]+)\1\)/g, (_, __, ruta) => `url("${new URL(ruta, respuesta.url)}")`);
    const hoja = new CSSStyleSheet();
    hoja.replaceSync(css);
    // Dentro de un shadow DOM @font-face no aplica: las fuentes se cargan en el documento.
    for (const regla of hoja.cssRules) {
      if (regla instanceof CSSFontFaceRule) {
        const { style } = regla;
        document.fonts.add(new FontFace(style.getPropertyValue('font-family').replaceAll(/['"]/g, ''), style.getPropertyValue('src'), {
          style: style.getPropertyValue('font-style'),
          weight: style.getPropertyValue('font-weight'),
          unicodeRange: style.getPropertyValue('unicode-range'),
        }));
      }
    }
    return hoja;
  })();
  return estilos;
}

function vistaPrevia(textos) {
  const nodo = crear('div', 'vista-previa');
  nodo.inert = true; // se mira, no se usa
  const sombra = nodo.attachShadow({ mode: 'open' });
  const seccion = crear('div', 'section--dark');
  seccion.id = 'equipo';
  sombra.append(seccion);
  estilosDelSitio().then((hoja) => { sombra.adoptedStyleSheets = [hoja]; }).catch(() => {
    seccion.textContent = 'La vista previa no está disponible, pero podés guardar igual.';
  });
  return {
    nodo,
    dibujar(abogado, urlFoto) {
      const plantilla = crear('template');
      // La CSP del panel no admite style="": sólo escalona la animación, que acá no corre. Los textos
      // ya vienen escapados, así que esto no puede tocar lo que escribió el estudio.
      plantilla.innerHTML = renderEquipo([abogado], 'es', textos, '/').replace(/ style="[^"]*"/g, '');
      for (const imagen of plantilla.content.querySelectorAll('img')) {
        imagen.removeAttribute('loading');
        imagen.src = urlFoto;
      }
      seccion.replaceChildren(plantilla.content);
    },
  };
}

// ---- Editor

function editor({ abogado, esNuevo, commit, textosSitio, volver, guardarEquipo, mostrarFaltantes }) {
  const nodo = crear('div');
  const f = {
    nombre: campo({ etiqueta: 'Nombre y apellido', valor: abogado.nombre, largo: 120 }),
    cargo: campo({ etiqueta: 'Cargo', valor: abogado.cargo.es, largo: 120 }),
    matricula: campo({ etiqueta: 'Matrícula', valor: abogado.matricula ?? '', largo: 120 }),
    linkedin: campo({ etiqueta: 'LinkedIn', valor: abogado.linkedin ?? '', largo: 300, tipo: 'url', ayuda: 'La dirección completa del perfil. Si no tiene, dejalo vacío.' }),
    idiomas: campo({ etiqueta: 'Idiomas', valor: abogado.idiomas.es, largo: 120, ayuda: 'Por ejemplo: español, inglés.' }),
    biografia: campo({ etiqueta: 'Biografía', valor: abogado.biografia.es, largo: 3000, multilinea: true, ayuda: 'Separá los párrafos con una línea en blanco.' }),
  };
  f.biografia.entrada.rows = 8;
  const leer = () => ({
    ...abogado,
    nombre: f.nombre.entrada.value.trim(),
    foto: selector.hayFoto() ? fotoDeAbogado(abogado.id) : abogado.foto,
    matricula: f.matricula.entrada.value.trim(),
    linkedin: f.linkedin.entrada.value.trim(),
    publicado: publicar.checked,
    cargo: { ...abogado.cargo, es: f.cargo.entrada.value.trim() },
    idiomas: { ...abogado.idiomas, es: f.idiomas.entrada.value.trim() },
    biografia: { ...abogado.biografia, es: f.biografia.entrada.value.trim() },
  });
  const vista = vistaPrevia(textosSitio);
  const refrescar = () => {
    const datos = leer();
    boton.textContent = datos.publicado || abogado.publicado === true ? 'Publicar cambios' : 'Guardar perfil oculto';
    vista.dibujar(datos, selector.hayFoto() ? selector.url() : `/portillo-images/${datos.foto}?v=${commit}`);
  };
  const selector = selectorDeFoto({ aspecto: [1, 1], etiqueta: abogado.foto ? 'Cambiar foto' : 'Elegir foto', alCambiar: () => refrescar() });
  const avisoFoto = crear('p', 'campo-error');
  avisoFoto.hidden = true;
  const bloqueFoto = crear('div', 'campo');
  bloqueFoto.append(crear('span', 'campo-rotulo', 'Foto'), selector.nodo, avisoFoto);
  const publicar = crear('input');
  publicar.type = 'checkbox';
  publicar.checked = abogado.publicado === true;
  const rotuloPublicar = crear('label', 'campo-check');
  rotuloPublicar.append(publicar, ' Mostrar en el sitio');
  const error = aviso();
  const boton = crear('button', 'boton', 'Guardar');
  boton.type = 'submit';
  const cancelar = crear('button', 'boton boton-borde', 'Volver sin guardar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', () => volver());
  const acciones = crear('div', 'acciones');
  acciones.append(boton, cancelar);

  const revisar = (datos) => {
    const problemas = revisarAbogado(datos);
    for (const [clave, fila] of Object.entries(f)) fila.avisar(problemas[clave]);
    avisoFoto.textContent = problemas.foto ?? '';
    avisoFoto.hidden = !problemas.foto;
    return problemas;
  };

  const formulario = crear('form', 'formulario tarjeta');
  formulario.append(f.nombre.nodo, bloqueFoto, f.cargo.nodo, f.matricula.nodo, f.linkedin.nodo, f.idiomas.nodo, f.biografia.nodo, rotuloPublicar, error.nodo, acciones);
  formulario.addEventListener('input', refrescar);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.mostrar();
    const datos = leer();
    const problemas = revisar(datos);
    if (Object.keys(problemas).length) {
      error.mostrar('Revisá lo que está marcado.');
      return;
    }
    boton.disabled = true;
    let extra;
    try {
      extra = selector.hayFoto() ? [{ ruta: `portillo-images/${datos.foto}`, base64: await selector.base64() }] : [];
    } catch {
      error.mostrar('No se pudo preparar la foto. Probá de nuevo.');
      boton.disabled = false;
      return;
    }
    const salio = await guardarEquipo({
      descripcion: `${esNuevo ? 'Abogado nuevo' : 'Abogado'}: ${nombreVisible(datos)}`,
      cambio: (lista) => {
        const lugar = lista.findIndex((a) => a.id === datos.id);
        if (lugar === -1) lista.push(datos);
        else lista[lugar] = datos;
      },
      extra,
      alFallar: (texto) => error.mostrar(texto),
    });
    if (!salio) boton.disabled = false;
  });

  const titulo = crear('h1', '', esNuevo ? 'Agregar abogado' : `Editar: ${nombreVisible(abogado)}`);
  nodo.append(titulo, formulario, crear('h2', '', 'Así se ve en el sitio'), vista.nodo);
  if (mostrarFaltantes) {
    publicar.checked = true;
    revisar(leer());
    error.mostrar('Para mostrarlo en el sitio falta completar lo marcado.');
  }
  refrescar();
  return nodo;
}

// ---- Lista

function fila({ abogado, indice, total, mover, editar, cambiarPublicado, eliminar }) {
  const nodo = crear('li', 'tarjeta abogado-fila');
  const datos = crear('div', 'abogado-fila-datos');
  datos.append(crear('strong', '', nombreVisible(abogado)), crear('span', abogado.publicado === true ? 'estado-publicado' : 'estado-oculto', abogado.publicado === true ? 'Se ve en el sitio' : 'Oculto'));
  const boton = (texto, accion, deshabilitado = false) => {
    const b = crear('button', 'boton boton-borde', texto);
    b.type = 'button';
    b.disabled = deshabilitado;
    b.addEventListener('click', accion);
    return b;
  };
  const acciones = crear('div', 'acciones');
  const subir = boton('Subir', () => mover(indice, -1), indice === 0);
  const bajar = boton('Bajar', () => mover(indice, 1), indice === total - 1);
  subir.setAttribute('aria-label', `Subir a ${nombreVisible(abogado)}`);
  bajar.setAttribute('aria-label', `Bajar a ${nombreVisible(abogado)}`);
  const confirmar = crear('div', 'abogado-confirmar');
  confirmar.hidden = true;
  confirmar.append(
    crear('p', '', `¿Eliminar a ${nombreVisible(abogado)}? Deja de verse en el sitio.`),
    boton('Sí, eliminar', () => eliminar(abogado)),
    boton('Cancelar', () => { confirmar.hidden = true; }),
  );
  acciones.append(
    subir,
    bajar,
    boton('Editar', () => editar(abogado)),
    boton(abogado.publicado === true ? 'Ocultar' : 'Publicar', () => cambiarPublicado(abogado)),
    boton('Eliminar', () => { confirmar.hidden = false; }),
  );
  nodo.append(datos, acciones, confirmar);
  return nodo;
}

export default {
  id: 'abogados',
  titulo: 'Abogados',
  async render(contenedor, { api, guardar }) {
    let lista;
    let commit;
    let idiomas;
    let textosSitio;
    let ordenCambiado = false;

    const leerTodo = async () => {
      const [{ idiomas: codigos }, archivo, espanol] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${EQUIPO}`), api(`/api/archivo?ruta=${ESPANOL}`)]);
      idiomas = codigos;
      commit = archivo.commit;
      lista = JSON.parse(archivo.texto).abogados;
      const es = JSON.parse(espanol.texto);
      textosSitio = Object.fromEntries(['estudio.tag_matricula', 'equipo.ver_perfil', 'equipo.tag_idiomas', 'equipo.cerrar'].map((c) => [c, leerClave(es, c)]));
      ordenCambiado = false;
    };

    // Se manda una copia: si el servidor la rechaza, lo que se ve sigue siendo lo guardado.
    const guardarEquipo = ({ descripcion, cambio, extra = [], alFallar }) => {
      const copia = structuredClone(lista);
      cambio(copia);
      return guardarYRecargar({
        guardar,
        cambios: { base: commit, descripcion, archivos: [...extra, { ruta: EQUIPO, texto: serializar({ abogados: copia }) }] },
        recargar: async () => {
          await leerTodo();
          dibujarLista('Guardado.');
        },
        alFallar,
      });
    };

    const abrirEditor = (abogado, { esNuevo = false, mostrarFaltantes = false } = {}) => {
      contenedor.replaceChildren(editor({ abogado, esNuevo, commit, textosSitio, volver: () => dibujarLista(), guardarEquipo, mostrarFaltantes }));
      window.scrollTo(0, 0);
    };

    const nuevo = () => {
      const enBlanco = () => Object.fromEntries(idiomas.map((c) => [c, '']));
      return { id: idNuevo(), publicado: false, nombre: '', foto: '', matricula: '', linkedin: '', cargo: enBlanco(), idiomas: enBlanco(), biografia: enBlanco() };
    };

    function dibujarLista(mensaje) {
      const error = aviso();
      const avisarFallo = (texto) => {
        // guardarYRecargar pudo haber redibujado con un 409: el aviso va en la lista nueva.
        dibujarLista();
        contenedor.querySelector('.aviso-error').textContent = texto;
        contenedor.querySelector('.aviso-error').hidden = false;
      };
      const mover = (indice, salto) => {
        const [abogado] = lista.splice(indice, 1);
        lista.splice(indice + salto, 0, abogado);
        ordenCambiado = true;
        dibujarLista();
      };
      const cambiarPublicado = (abogado) => {
        const publicado = abogado.publicado !== true;
        if (publicado && Object.keys(revisarAbogado({ ...abogado, publicado })).length) {
          abrirEditor(abogado, { mostrarFaltantes: true });
          return;
        }
        guardarEquipo({
          descripcion: `${publicado ? 'Publicar' : 'Ocultar'}: ${nombreVisible(abogado)}`,
          cambio: (copia) => { copia.find((a) => a.id === abogado.id).publicado = publicado; },
          alFallar: avisarFallo,
        });
      };
      const eliminar = (abogado) => guardarEquipo({
        descripcion: `Eliminar: ${nombreVisible(abogado)}`,
        cambio: (copia) => { copia.splice(copia.findIndex((a) => a.id === abogado.id), 1); },
        alFallar: avisarFallo,
      });
      const ul = crear('ul', 'abogados-lista');
      ul.append(...lista.map((abogado, indice) => fila({
        abogado, indice, total: lista.length, mover, editar: (a) => abrirEditor(a), cambiarPublicado, eliminar,
      })));
      const agregar = crear('button', 'boton', 'Agregar abogado');
      agregar.type = 'button';
      agregar.addEventListener('click', () => abrirEditor(nuevo(), { esNuevo: true }));
      const barra = crear('div', 'acciones');
      barra.append(agregar);
      if (ordenCambiado) {
        const guardarOrden = crear('button', 'boton', 'Publicar orden');
        guardarOrden.type = 'button';
        guardarOrden.addEventListener('click', () => {
          guardarOrden.disabled = true;
          guardarEquipo({ descripcion: 'Orden de los abogados', cambio: () => {}, alFallar: avisarFallo });
        });
        barra.prepend(guardarOrden);
      }
      contenedor.replaceChildren(
        crear('h1', '', 'Abogados'),
        ...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []),
        barra,
        error.nodo,
        ul,
      );
    }

    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await leerTodo();
      dibujarLista();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
