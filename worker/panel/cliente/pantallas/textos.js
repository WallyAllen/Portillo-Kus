// La lista cerrada de src/panel-campos.json, sólo en español. El servidor rechaza cualquier otra clave.
import {
  agrupar, aviso, borradorDeFormulario, campo, cargando, crear, ESPANOL, fallaDeCarga, fijarClave, guardarYRecargar, leerClave, listo, serializar,
} from './comun.js';
import { revisarTexto } from './revisar.js';

export default {
  id: 'textos',
  titulo: 'Textos',
  volanta: 'CONTENIDO DEL SITIO',
  bajada: 'Se escriben en español. Los otros idiomas muestran el español hasta que se carguen sus traducciones.',
  async render(contenedor, { api, guardar, usuario, barra, previa }) {
    const dibujar = async (mensaje, borradorAnterior) => {
      const [{ textos }, { commit, texto }] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${ESPANOL}`)]);
      const datos = JSON.parse(texto);
      const error = aviso();
      const formulario = crear('form', 'formulario');
      formulario.addEventListener('submit', (evento) => evento.preventDefault());
      const filas = [];
      for (const [grupo, campos] of agrupar(textos)) {
        const tarjeta = crear('fieldset', 'tarjeta grupo');
        tarjeta.append(crear('legend', '', grupo));
        for (const definicion of campos) {
          const valor = leerClave(datos, definicion.clave);
          const fila = campo({ etiqueta: definicion.etiqueta, valor, largo: definicion.largo, multilinea: definicion.largo > 100 });
          filas.push({ definicion, fila, valor });
          tarjeta.append(fila.nodo);
        }
        formulario.append(tarjeta);
      }
      formulario.append(error.nodo);
      let control = { actualizar() {} };
      const borrador = borradorDeFormulario({
        formulario, usuario: usuario.usuario, seccion: 'textos', commit, borradorAnterior,
        campos: filas.map(({ definicion, fila }) => [definicion.clave, fila.entrada]),
        recargar: (anterior) => dibujar(null, anterior),
        alCambiar: () => control.actualizar(),
      });

      const publicar = async () => {
        error.mostrar();
        if (borrador.pendiente()) {
          error.mostrar('Elegí qué hacer con el borrador antes de publicar.');
          return false;
        }
        const copia = structuredClone(datos);
        let hayProblemas = false;
        const cambiados = [];
        for (const { definicion, fila, valor } of filas) {
          const problema = revisarTexto(fila.entrada.value, definicion);
          fila.avisar(problema);
          if (problema) {
            if (!hayProblemas) fila.entrada.focus();
            hayProblemas = true;
          } else if (fila.entrada.value !== valor) {
            fijarClave(copia, definicion.clave, fila.entrada.value);
            cambiados.push(definicion.etiqueta);
          }
        }
        if (hayProblemas || !cambiados.length) return false;
        borrador.editar(false);
        const salio = await guardarYRecargar({
          guardar,
          cambios: { base: commit, descripcion: `Textos: ${cambiados.join(', ')}`, archivos: [{ ruta: ESPANOL, texto: serializar(copia) }] },
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
      const cambiosParaPrevia = () => ({
        textos: filas.filter(({ fila, valor }) => fila.entrada.value !== valor)
          .map(({ definicion, fila, valor }) => ({ clave: definicion.clave, antes: valor, ahora: fila.entrada.value })),
      });
      listo(contenedor);
      contenedor.replaceChildren(...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []), formulario);
      control = barra.usar({ contar: borrador.cuenta, enPausa: borrador.pendiente, publicar, previa: () => previa(cambiosParaPrevia()) });
    };
    cargando(contenedor);
    try {
      await dibujar();
    } catch (e) {
      fallaDeCarga(contenedor, e);
    }
  },
};
