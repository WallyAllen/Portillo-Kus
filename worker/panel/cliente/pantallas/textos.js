// La lista cerrada de src/panel-campos.json, sólo en español. El servidor rechaza cualquier otra clave.
import { agrupar, aviso, campo, crear, ESPANOL, fijarClave, guardarYRecargar, leerClave, serializar } from './comun.js';
import { revisarTexto } from './revisar.js';

export default {
  id: 'textos',
  titulo: 'Textos',
  async render(contenedor, { api, guardar }) {
    const dibujar = async (mensaje) => {
      const [{ textos }, { commit, texto }] = await Promise.all([api('/api/campos'), api(`/api/archivo?ruta=${ESPANOL}`)]);
      const datos = JSON.parse(texto);
      const error = aviso();
      const formulario = crear('form', 'formulario');
      const grupos = agrupar(textos);
      const filas = [];
      for (const [grupo, campos] of grupos) {
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
      const boton = crear('button', 'boton', 'Guardar');
      boton.type = 'submit';
      formulario.append(error.nodo, boton);
      formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        error.mostrar();
        let hayProblemas = false;
        const cambiados = [];
        for (const { definicion, fila, valor } of filas) {
          const problema = revisarTexto(fila.entrada.value, definicion);
          fila.avisar(problema);
          if (problema) {
            if (!hayProblemas) fila.entrada.focus();
            hayProblemas = true;
          } else if (fila.entrada.value !== valor) {
            fijarClave(datos, definicion.clave, fila.entrada.value);
            cambiados.push(definicion.etiqueta);
          }
        }
        if (hayProblemas) return;
        if (!cambiados.length) {
          error.mostrar('No cambiaste nada.');
          return;
        }
        boton.disabled = true;
        const salio = await guardarYRecargar({
          guardar,
          cambios: { base: commit, descripcion: `Textos: ${cambiados.join(', ')}`, archivos: [{ ruta: ESPANOL, texto: serializar(datos) }] },
          recargar: () => dibujar('Guardado.'),
          alFallar: (texto) => error.mostrar(texto),
        });
        if (!salio) boton.disabled = false;
      });
      const ayuda = crear('p', '', 'Se escriben en español. Los otros idiomas muestran el español hasta que se carguen sus traducciones.');
      contenedor.replaceChildren(crear('h1', '', 'Textos'), ayuda, ...(mensaje ? [crear('p', 'aviso-ok', mensaje)] : []), formulario);
    };
    contenedor.append(crear('p', '', 'Cargando…'));
    try {
      await dibujar();
    } catch (e) {
      contenedor.replaceChildren(crear('p', 'aviso-error', e.message));
    }
  },
};
