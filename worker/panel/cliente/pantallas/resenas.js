// Las reseñas (opiniones.rN_*). Una sin publicar lleva el marcador [PENDIENTE], que el build oculta:
// el estudio no lo ve, sólo elige si se publica o no.
import { aviso, campo, crear, ESPANOL, fijarClave, guardarYRecargar, leerClave, serializar } from './comun.js';
import { revisarResena } from './revisar.js';

export default {
  id: 'resenas',
  titulo: 'Reseñas',
  async render(contenedor, { api, guardar }) {
    const dibujar = async (mensaje) => {
      const [{ resenas, pendiente }, { commit, texto }] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${ESPANOL}`)]);
      const datos = JSON.parse(texto);
      const limpio = (valor) => (valor.startsWith(pendiente) ? valor.slice(pendiente.length).trim() : valor);
      const error = aviso();
      const formulario = crear('form', 'formulario');
      const filas = [];
      for (let n = 1; n <= resenas.cantidad; n++) {
        const [claveTexto, claveAutor] = [`opiniones.r${n}_text`, `opiniones.r${n}_name`];
        const [valorTexto, valorAutor] = [leerClave(datos, claveTexto), leerClave(datos, claveAutor)];
        const tarjeta = crear('fieldset', 'tarjeta grupo');
        tarjeta.append(crear('legend', '', `Reseña ${n}`));
        const filaTexto = campo({ etiqueta: 'Texto', valor: limpio(valorTexto), largo: resenas.largoTexto, multilinea: true });
        const filaAutor = campo({ etiqueta: 'Autor', valor: limpio(valorAutor), largo: resenas.largoAutor });
        const publicar = crear('input');
        publicar.type = 'checkbox';
        publicar.checked = Boolean(valorTexto.trim()) && !valorTexto.startsWith(pendiente);
        const rotulo = crear('label', 'campo-check');
        rotulo.append(publicar, ' Mostrar esta reseña en el sitio');
        tarjeta.append(filaTexto.nodo, filaAutor.nodo, rotulo);
        formulario.append(tarjeta);
        filas.push({ claveTexto, claveAutor, filaTexto, filaAutor, publicar });
      }
      const boton = crear('button', 'boton', 'Guardar');
      boton.type = 'submit';
      formulario.append(error.nodo, boton);
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        error.mostrar();
        let hayProblemas = false;
        for (const { filaTexto, filaAutor, publicar } of filas) {
          const problemas = revisarResena({ texto: filaTexto.entrada.value, autor: filaAutor.entrada.value, publicada: publicar.checked }, resenas);
          filaTexto.avisar(problemas.texto);
          filaAutor.avisar(problemas.autor);
          hayProblemas ||= Boolean(problemas.texto || problemas.autor);
        }
        if (hayProblemas) return;
        const antes = serializar(datos);
        const conMarcador = (valor, publicada) => {
          const texto = valor.trim();
          return publicada || !texto ? texto : `${pendiente} ${texto}`;
        };
        for (const { claveTexto, claveAutor, filaTexto, filaAutor, publicar } of filas) {
          fijarClave(datos, claveTexto, conMarcador(filaTexto.entrada.value, publicar.checked));
          fijarClave(datos, claveAutor, conMarcador(filaAutor.entrada.value, publicar.checked));
        }
        if (serializar(datos) === antes) {
          error.mostrar('No cambiaste nada.');
          return;
        }
        boton.disabled = true;
        const salio = await guardarYRecargar({
          guardar,
          cambios: { base: commit, descripcion: 'Reseñas', archivos: [{ ruta: ESPANOL, texto: serializar(datos) }] },
          recargar: () => dibujar('Guardado.'),
          alFallar: (texto) => error.mostrar(texto),
        });
        if (!salio) boton.disabled = false;
      });
      const ayuda = crear('p', '', 'Copiá cada reseña tal como está en Google. Sin marcar "Mostrar", no aparece en el sitio.');
      contenedor.replaceChildren(crear('h1', '', 'Reseñas'), ayuda, ...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []), formulario);
    };
    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await dibujar();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
