// Las reseñas (opiniones.rN_*). Una sin publicar lleva el marcador [PENDIENTE], que el build oculta:
// el estudio no lo ve, sólo elige si se publica o no.
import { aviso, borradorDeFormulario, campo, crear, ESPANOL, fijarClave, guardarYRecargar, leerClave, serializar } from './comun.js';
import { revisarResena } from './revisar.js';

export default {
  id: 'resenas',
  titulo: 'Reseñas',
  async render(contenedor, { api, guardar, usuario }) {
    const dibujar = async (mensaje, borradorAnterior) => {
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
        const visible = Boolean(valorTexto.trim()) && !valorTexto.startsWith(pendiente);
        publicar.checked = visible;
        const rotulo = crear('label', 'campo-check');
        rotulo.append(publicar, ' Mostrar esta reseña en el sitio');
        tarjeta.append(filaTexto.nodo, filaAutor.nodo, rotulo);
        formulario.append(tarjeta);
        filas.push({ claveTexto, claveAutor, filaTexto, filaAutor, publicar, visible });
      }
      const boton = crear('button', 'boton', 'Publicar cambios');
      boton.type = 'submit';
      formulario.append(error.nodo, boton);
      const borrador = borradorDeFormulario({
        formulario, usuario: usuario.usuario, seccion: 'resenas', commit, borradorAnterior,
        campos: filas.flatMap(({ claveTexto, claveAutor, filaTexto, filaAutor, publicar }) => [
          [claveTexto, filaTexto.entrada], [claveAutor, filaAutor.entrada], [`${claveTexto}.visible`, publicar],
        ]),
        recargar: (anterior) => dibujar(null, anterior),
      });
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (boton.disabled) return;
        error.mostrar();
        if (borrador.pendiente()) {
          error.mostrar('Recuperá o descartá el borrador antes de publicar.');
          return;
        }
        let hayProblemas = false;
        for (const { filaTexto, filaAutor, publicar } of filas) {
          const problemas = revisarResena({ texto: filaTexto.entrada.value, autor: filaAutor.entrada.value, publicada: publicar.checked }, resenas);
          filaTexto.avisar(problemas.texto);
          filaAutor.avisar(problemas.autor);
          if (!hayProblemas && (problemas.texto || problemas.autor)) {
            (problemas.texto ? filaTexto : filaAutor).entrada.focus();
          }
          hayProblemas ||= Boolean(problemas.texto || problemas.autor);
        }
        if (hayProblemas) return;
        const copia = structuredClone(datos);
        const conMarcador = (valor, publicada) => {
          const texto = valor.trim();
          return publicada || !texto ? texto : `${pendiente} ${texto}`;
        };
        for (const { claveTexto, claveAutor, filaTexto, filaAutor, publicar, visible } of filas) {
          if (publicar.checked === visible &&
              filaTexto.entrada.value === limpio(leerClave(datos, claveTexto)) &&
              filaAutor.entrada.value === limpio(leerClave(datos, claveAutor))) continue;
          fijarClave(copia, claveTexto, conMarcador(filaTexto.entrada.value, publicar.checked));
          fijarClave(copia, claveAutor, conMarcador(filaAutor.entrada.value, publicar.checked));
        }
        if (serializar(copia) === serializar(datos)) {
          error.mostrar('No cambiaste nada.');
          return;
        }
        boton.disabled = true;
        borrador.editar(false);
        const salio = await guardarYRecargar({
          guardar,
          cambios: { base: commit, descripcion: 'Reseñas', archivos: [{ ruta: ESPANOL, texto: serializar(copia) }] },
          recargar: () => {
            borrador.limpiar();
            if (contenedor.isConnected) return dibujar('Cambios enviados para publicar.');
          },
          alFallar: (texto, estado) => {
            if (estado === 409) borrador.mostrarConflicto();
            error.mostrar(texto);
          },
        });
        if (!salio) {
          boton.disabled = false;
          borrador.editar(true);
        }
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
