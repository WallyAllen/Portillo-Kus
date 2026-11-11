// Usuarios del panel (sólo admin; la API lo vuelve a comprobar). Una contraseña provisoria se
// muestra una sola vez: después no hay forma de verla, sólo de generar otra.
import { aviso, campo, crear, mensajeDeError } from './comun.js';

const ROLES = {
  admin: 'Administración: todo, también traducciones y usuarios',
  editor: 'Edición: contenido en español',
};

function tarjetaContrasena({ usuario, contrasena }, alCerrar) {
  const nodo = crear('section', 'tarjeta contrasena-nueva');
  nodo.setAttribute('role', 'status');
  const codigo = crear('p', 'contrasena-valor', contrasena);
  const copiar = crear('button', 'boton boton-borde', 'Copiar');
  copiar.type = 'button';
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(contrasena);
      copiar.textContent = 'Copiada';
    } catch {
      copiar.textContent = 'Seleccionala y copiala a mano';
    }
  });
  const listo = crear('button', 'boton', 'Ya la anoté');
  listo.type = 'button';
  listo.addEventListener('click', alCerrar);
  const acciones = crear('div', 'acciones');
  acciones.append(copiar, listo);
  nodo.append(
    crear('h2', '', `Contraseña provisoria de ${usuario}`),
    codigo,
    crear('p', '', 'Pasásela por un medio privado. No se vuelve a mostrar: si se pierde, generá otra.'),
    acciones,
  );
  return nodo;
}

function fila(u, { yo, accion }) {
  const nodo = crear('li', 'tarjeta abogado-fila');
  const datos = crear('div', 'abogado-fila-datos');
  datos.append(
    crear('strong', '', u.nombre),
    crear('span', 'estado-oculto', `${u.usuario}${u.usuario === yo ? ' (vos)' : ''}`),
    crear('span', u.activo ? 'estado-publicado' : 'estado-oculto', u.activo ? 'Activo' : 'Desactivado'),
  );
  const rol = crear('p', 'campo-ayuda', ROLES[u.rol] ?? u.rol);
  const confirmar = crear('div', 'abogado-confirmar');
  confirmar.hidden = true;
  const preguntar = (texto, si, hacer) => {
    const boton = (t, f) => {
      const b = crear('button', 'boton boton-borde', t);
      b.type = 'button';
      b.addEventListener('click', f);
      return b;
    };
    confirmar.replaceChildren(crear('p', '', texto), boton(si, hacer), boton('Cancelar', () => { confirmar.hidden = true; }));
    confirmar.hidden = false;
  };
  const acciones = crear('div', 'acciones');
  const boton = (texto, f) => {
    const b = crear('button', 'boton boton-borde', texto);
    b.type = 'button';
    b.addEventListener('click', f);
    acciones.append(b);
  };
  if (u.activo) {
    boton('Desactivar', () => preguntar(
      `¿Desactivar a ${u.nombre}? Se cierra su sesión y no puede volver a entrar hasta que la reactiven.`,
      'Sí, desactivar',
      () => accion('/api/usuarios/activo', { usuario: u.usuario, activo: false }),
    ));
  } else {
    boton('Reactivar', () => accion('/api/usuarios/activo', { usuario: u.usuario, activo: true }));
  }
  boton('Nueva contraseña', () => preguntar(
    `¿Generar una contraseña nueva para ${u.nombre}? La actual deja de servir y se cierran sus sesiones.`,
    'Sí, generar',
    () => accion('/api/usuarios/contrasena', { usuario: u.usuario }),
  ));
  nodo.append(datos, rol, acciones, confirmar);
  return nodo;
}

function formularioNuevo(api, alCrear) {
  const formulario = crear('form', 'formulario tarjeta');
  const nombre = campo({ etiqueta: 'Nombre', largo: 80 });
  const usuario = campo({ etiqueta: 'Usuario para entrar', largo: 40, ayuda: 'En minúsculas, sin espacios. Por ejemplo: maria.perez' });
  usuario.entrada.autocapitalize = 'none';
  usuario.entrada.spellcheck = false;
  const grupo = crear('fieldset', 'grupo');
  grupo.append(crear('legend', '', 'Qué puede hacer'));
  for (const [valor, texto] of Object.entries(ROLES)) {
    const opcion = crear('input');
    opcion.type = 'radio';
    opcion.name = 'rol';
    opcion.value = valor;
    opcion.checked = valor === 'editor';
    const rotulo = crear('label', 'campo-check');
    rotulo.append(opcion, ` ${texto}`);
    grupo.append(rotulo);
  }
  const error = aviso();
  const boton = crear('button', 'boton', 'Crear usuario');
  boton.type = 'submit';
  formulario.append(crear('h2', '', 'Nuevo usuario'), nombre.nodo, usuario.nodo, grupo, error.nodo, boton);
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.mostrar();
    const valor = usuario.entrada.value.trim().toLowerCase();
    nombre.avisar(nombre.entrada.value.trim() ? null : 'Escribí el nombre.');
    usuario.avisar(/^[a-z0-9._-]{3,40}$/.test(valor) ? null : 'De 3 a 40 letras minúsculas, números, punto, guion o guion bajo.');
    if (!nombre.entrada.value.trim() || !/^[a-z0-9._-]{3,40}$/.test(valor)) return;
    boton.disabled = true;
    try {
      alCrear(await api('/api/usuarios', {
        metodo: 'POST',
        cuerpo: { nombre: nombre.entrada.value, usuario: valor, rol: formulario.elements.rol.value },
      }));
    } catch (e) {
      error.mostrar(mensajeDeError(e));
      boton.disabled = false;
    }
  });
  return formulario;
}

export default {
  id: 'usuarios',
  titulo: 'Usuarios',
  soloAdmin: true,
  async render(contenedor, { api, usuario: yo }) {
    const dibujar = async (arriba = []) => {
      const { usuarios } = await api('/api/usuarios');
      const error = aviso();
      const accion = async (ruta, cuerpo) => {
        error.mostrar();
        try {
          const r = await api(ruta, { metodo: 'POST', cuerpo });
          await dibujar(r.contrasena ? [tarjetaContrasena(r, () => dibujar())] : [crear('p', 'aviso-ok', 'Listo.')]);
        } catch (e) {
          error.mostrar(mensajeDeError(e));
          error.nodo.scrollIntoView({ block: 'center' });
        }
      };
      const lista = crear('ul', 'abogados-lista usuarios-lista');
      lista.append(...usuarios.map((u) => fila(u, { yo: yo.usuario, accion })));
      const distribucion = crear('div', 'usuarios-distribucion');
      const cuentas = crear('section', 'usuarios-cuentas');
      cuentas.append(crear('h2', '', 'Cuentas del panel'), lista);
      distribucion.append(cuentas, formularioNuevo(api, (r) => dibujar([tarjetaContrasena(r, () => dibujar())])));
      contenedor.replaceChildren(
        crear('h1', '', 'Usuarios'),
        ...arriba,
        error.nodo,
        distribucion,
      );
      arriba[0]?.scrollIntoView?.({ block: 'start' });
    };
    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await dibujar();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
