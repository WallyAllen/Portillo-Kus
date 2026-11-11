// Las reseñas (opiniones.rN_*). Una sin publicar lleva el marcador [PENDIENTE], que el build oculta:
// el estudio no lo ve, sólo elige si se publica o no.
import {
  aviso, borradorDeFormulario, campo, cargando, crear, ESPANOL, fallaDeCarga, fijarClave, guardarYRecargar, leerClave, listo, serializar,
} from './comun.js';
import { revisarResena } from './revisar.js';

export default {
  id: 'resenas',
  titulo: 'Reseñas',
  volanta: 'CONTENIDO DEL SITIO',
  bajada: 'Copiá cada reseña tal como está en Google. Sin marcar «Mostrar», no aparece en el sitio.',
  async render(contenedor, { api, guardar, usuario, barra, previa }) {
    const dibujar = async (mensaje, borradorAnterior) => {
      const [{ resenas, pendiente }, { commit, texto }] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${ESPANOL}`)]);
      const datos = JSON.parse(texto);
      const limpio = (valor) => (valor.startsWith(pendiente) ? valor.slice(pendiente.length).trim() : valor);
      const error = aviso();
      const formulario = crear('form', 'formulario');
      formulario.addEventListener('submit', (evento) => evento.preventDefault());
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
        filas.push({ n, claveTexto, claveAutor, filaTexto, filaAutor, publicar, visible });
      }
      formulario.append(error.nodo);
      let control = { actualizar() {} };
      const borrador = borradorDeFormulario({
        formulario, usuario: usuario.usuario, seccion: 'resenas', commit, borradorAnterior,
        campos: filas.flatMap(({ claveTexto, claveAutor, filaTexto, filaAutor, publicar }) => [
          [claveTexto, filaTexto.entrada], [claveAutor, filaAutor.entrada], [`${claveTexto}.visible`, publicar],
        ]),
        recargar: (anterior) => dibujar(null, anterior),
        alCambiar: () => control.actualizar(),
      });
      const tocada = ({ claveTexto, claveAutor, filaTexto, filaAutor, publicar, visible }) => publicar.checked !== visible
        || filaTexto.entrada.value !== limpio(leerClave(datos, claveTexto))
        || filaAutor.entrada.value !== limpio(leerClave(datos, claveAutor));

      const publicarCambios = async () => {
        error.mostrar();
        if (borrador.pendiente()) {
          error.mostrar('Elegí qué hacer con el borrador antes de publicar.');
          return false;
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
        if (hayProblemas) return false;
        const copia = structuredClone(datos);
        const conMarcador = (valor, publicada) => {
          const texto = valor.trim();
          return publicada || !texto ? texto : `${pendiente} ${texto}`;
        };
        for (const fila of filas.filter(tocada)) {
          fijarClave(copia, fila.claveTexto, conMarcador(fila.filaTexto.entrada.value, fila.publicar.checked));
          fijarClave(copia, fila.claveAutor, conMarcador(fila.filaAutor.entrada.value, fila.publicar.checked));
        }
        if (serializar(copia) === serializar(datos)) return false;
        borrador.editar(false);
        const salio = await guardarYRecargar({
          guardar,
          cambios: { base: commit, descripcion: `Reseñas: ${filas.filter(tocada).map((f) => f.n).join(', ')}`, archivos: [{ ruta: ESPANOL, texto: serializar(copia) }] },
          recargar: () => {
            borrador.limpiar();
            if (contenedor.isConnected) return dibujar('Cambios enviados para publicar.');
          },
          alFallar: (texto, estado) => {
            if (estado === 409) borrador.mostrarConflicto();
            error.mostrar(texto);
          },
        });
        if (!salio) borrador.editar(true);
        return salio;
      };
      // La vista previa recibe todas: las que se ven, en orden, y si cambió algo.
      const cambiosParaPrevia = () => ({
        resenas: filas.map(({ n, filaTexto, filaAutor, publicar, visible }) => ({
          n, texto: filaTexto.entrada.value.trim(), autor: filaAutor.entrada.value.trim(), visible: publicar.checked, eraVisible: visible,
        })),
      });
      listo(contenedor);
      contenedor.replaceChildren(...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []), formulario);
      control = barra.usar({ contar: borrador.cuenta, enPausa: borrador.pendiente, publicar: publicarCambios, previa: () => previa(cambiosParaPrevia()) });
    };
    cargando(contenedor);
    try {
      await dibujar();
    } catch (e) {
      fallaDeCarga(contenedor, e);
    }
  },
};
