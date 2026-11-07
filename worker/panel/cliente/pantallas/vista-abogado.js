// El marcado de equipo.render (src/equipo.py) para la vista previa. Sin DOM: es una copia línea por
// línea, y tests/test_panel_reglas.py la compara con el Python, así que no se puede desincronizar.
const ICONO_PERSONA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4.5 4.5 0 1 0 '
  + '0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.4-8 5.3V21h16v-1.7c0-2.9-3.6-5.3-8-5.3Z"/></svg>';
const ICONO_LINKEDIN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M5 3a2 '
  + '2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.3 8.6h3.4V21H3.3V8.6Zm5.6 0h3.3v1.7c.5-.9 1.7-2 3.6-2 3.8 0 4.5 2.4 '
  + '4.5 5.6V21h-3.4v-6.2c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H8.9V8.6Z"/></svg>';

const REEMPLAZOS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => REEMPLAZOS[c]);

const foto = (abogado, prefijo, alt) => {
  if (!abogado.foto) return `<span class="abogado-sin-foto">${ICONO_PERSONA}</span>`;
  return `<img src="${prefijo}portillo-images/${escapar(abogado.foto)}" alt="${escapar(alt)}" loading="lazy">`;
};

// textos: claves ya aplanadas de content.<codigo>.json.
export function renderEquipo(abogados, codigo, textos, prefijo) {
  const tarjetas = [];
  const dialogos = [];
  abogados.forEach((a, indice) => {
    const numero = indice + 1;
    const id = `abogado-${numero}`;
    const [nombre, cargo] = [escapar(a.nombre), escapar(a.cargo[codigo])];
    const matricula = a.matricula
      ? `<p class="abogado-matricula">${textos['estudio.tag_matricula']} ${escapar(a.matricula)}</p>` : '';
    tarjetas.push(
      `<li class="abogado reveal" style="--i:${numero - 1}"><div class="abogado-foto">${foto(a, prefijo, a.nombre)}</div>`
      + `<h3 class="abogado-nombre">${nombre}</h3><p class="abogado-cargo">${cargo}</p>${matricula}`
      + `<button type="button" class="btn btn-secondary abogado-abrir" data-abogado="${id}" aria-haspopup="dialog">`
      + `${textos['equipo.ver_perfil']}</button></li>`,
    );
    const parrafos = a.biografia[codigo].split('\n\n').filter((p) => p.trim()).map((p) => `<p>${escapar(p.trim())}</p>`).join('');
    const idiomas = a.idiomas[codigo].trim()
      ? `<p class="abogado-idiomas"><strong>${textos['equipo.tag_idiomas']}:</strong> ${escapar(a.idiomas[codigo])}</p>` : '';
    const linkedin = a.linkedin
      ? `<a class="abogado-linkedin" href="${escapar(a.linkedin)}" target="_blank" rel="noopener" `
        + `aria-label="LinkedIn: ${escapar(a.nombre)}">${ICONO_LINKEDIN}</a>` : '';
    const pie = idiomas || linkedin ? `<div class="abogado-pie">${idiomas}${linkedin}</div>` : '';
    dialogos.push(
      `<dialog class="abogado-dialog" id="${id}" aria-labelledby="${id}-nombre"><div class="abogado-dialog-body">`
      + `<button type="button" class="abogado-cerrar" aria-label="${textos['equipo.cerrar']}">×</button>`
      + `<header class="abogado-cabecera"><div class="abogado-foto">${foto(a, prefijo, '')}</div><div>`
      + `<h3 class="abogado-nombre" id="${id}-nombre">${nombre}</h3><p class="abogado-cargo">${cargo}</p>${matricula}</div></header>`
      + `<div class="abogado-bio">${parrafos}</div>${pie}</div></dialog>`,
    );
  });
  if (!tarjetas.length) return '';
  return `<ul class="equipo-grid stagger">${tarjetas.join('')}</ul>${dialogos.join('')}`;
}
