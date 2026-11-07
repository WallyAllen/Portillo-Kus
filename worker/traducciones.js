// Traducciones pendientes: la copia en JS de src/traducciones.py más el registro de cambios.
// El archivo de pendientes lo escribe sólo el servidor: {"pendientes": {clave: {fecha, viejo: {idioma: texto}}}}.
// clave es la de content.*.json ("hero.sub") o "equipo:<id>.<campo>". Un idioma está pendiente
// mientras figura en viejo, que guarda el español de su última traducción válida.
import reglas from './reglas.json' with { type: 'json' };

export const ARCHIVO_PENDIENTES = reglas.archivoPendientes;
const BASE = reglas.idiomaBase;
export const OTROS_IDIOMAS = reglas.idiomasTodos.filter((c) => c !== BASE);
const rutaContenido = (codigo) => `src/content.${codigo}.json`;
export const RUTA_EQUIPO = 'src/equipo.json';
export const RUTAS_TEXTOS = [...reglas.idiomasTodos.map(rutaContenido), RUTA_EQUIPO];
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function aplanar(valor, prefijo = '') {
  const vacio = valor !== null && typeof valor === 'object' && !Object.keys(valor).length;
  if (valor === null || typeof valor !== 'object' || vacio) return { [prefijo.replace(/\.$/, '')]: valor };
  const salida = {};
  const entradas = Array.isArray(valor) ? valor.map((v, i) => [i + 1, v]) : Object.entries(valor);
  for (const [clave, v] of entradas) Object.assign(salida, aplanar(v, `${prefijo}${clave}.`));
  return salida;
}

export const oculto = (valor) => {
  const texto = String(valor).trim();
  return !texto || texto.startsWith(reglas.pendiente);
};

// Lanza un error si no tiene el formato. Sin archivo, no hay pendientes.
export function parsearPendientes(texto) {
  if (texto === null || texto === undefined) return {};
  const { pendientes } = JSON.parse(texto);
  if (!esObjeto(pendientes) || !Object.values(pendientes).every((e) => esObjeto(e) && esObjeto(e.viejo))) {
    throw new Error('formato inválido');
  }
  return pendientes;
}

export const serializarPendientes = (pendientes) => `${JSON.stringify({ pendientes }, null, 2)}\n`;

// Igual que traducciones.aplicar() de Python.
export function aplicarRespaldo(textos, pendientes) {
  const base = textos[BASE];
  for (const [codigo, propios] of Object.entries(textos)) {
    if (codigo === BASE) continue;
    for (const [clave, es] of Object.entries(base)) {
      const listada = codigo in (pendientes[clave]?.viejo ?? {});
      const tiene = clave in propios;
      if (!tiene && !listada) continue;
      if (oculto(es)) {
        if (!tiene || !oculto(propios[clave])) propios[clave] = es;
      } else if (listada || oculto(propios[clave])) {
        propios[clave] = es;
      }
    }
  }
}

// Igual que equipo.aplicar_respaldo() de Python. Modifica el abogado recibido.
export function aplicarRespaldoAbogado(abogado, pendientes) {
  for (const campo of reglas.textosAbogado) {
    const textos = abogado[campo];
    if (!esObjeto(textos)) continue;
    const es = textos[BASE] ?? '';
    const viejo = abogado.id ? pendientes[`equipo:${abogado.id}.${campo}`]?.viejo ?? {} : {};
    for (const codigo of OTROS_IDIOMAS) {
      if (!(codigo in textos) && !(codigo in viejo)) continue;
      if (codigo in viejo || oculto(textos[codigo])) textos[codigo] = es;
    }
  }
}

// { clave: { idioma: texto } } de todo lo traducible. leer(ruta) devuelve el texto o null.
export async function vistaDeTextos(leer) {
  const vista = {};
  const sumar = (clave, codigo, valor) => {
    if (typeof valor === 'string') (vista[clave] ??= {})[codigo] = valor;
  };
  await Promise.all(reglas.idiomasTodos.map(async (codigo) => {
    const texto = await leer(rutaContenido(codigo));
    if (texto !== null) for (const [clave, valor] of Object.entries(aplanar(JSON.parse(texto)))) sumar(clave, codigo, valor);
  }));
  const equipo = await leer(RUTA_EQUIPO);
  for (const abogado of equipo === null ? [] : JSON.parse(equipo).abogados) {
    if (!abogado.id) continue;
    for (const campo of reglas.textosAbogado) {
      for (const [codigo, valor] of Object.entries(abogado[campo] ?? {})) sumar(`equipo:${abogado.id}.${campo}`, codigo, valor);
    }
  }
  return vista;
}

// La lista nueva, de comparar dos versiones. Un idioma entra si cambió el español. Un idioma
// sale si recibió un texto real en este guardado, o si el español volvió a lo que ya estaba
// traducido. Lo que ya no existe (un abogado borrado) también sale.
export function reconciliar(pendientes, antes, despues, fecha) {
  const nuevos = {};
  for (const [clave, textos] of Object.entries(despues)) {
    const previos = antes[clave] ?? {};
    const viejo = { ...(pendientes[clave]?.viejo ?? {}) };
    const esAntes = previos[BASE] ?? '';
    const esAhora = textos[BASE] ?? '';
    const cambioElEspanol = esAntes !== esAhora;
    for (const codigo of OTROS_IDIOMAS) {
      const traducido = textos[codigo] !== previos[codigo] && textos[codigo] !== undefined && !oculto(textos[codigo]);
      if (traducido) delete viejo[codigo];
      else if (cambioElEspanol) {
        viejo[codigo] ??= esAntes; // si ya estaba, ése es el de la última traducción válida
        if (viejo[codigo] === esAhora) delete viejo[codigo];
      }
    }
    if (Object.keys(viejo).length) {
      nuevos[clave] = { fecha: cambioElEspanol ? fecha : pendientes[clave]?.fecha ?? fecha, viejo };
    }
  }
  return nuevos;
}

// Escribe un texto en el JSON de un idioma o de equipo. Devuelve false si no encuentra dónde.
export function fijarTexto(datos, clave, codigo, valor) {
  const deEquipo = clave.match(/^equipo:([^.]+)\.(.+)$/);
  if (deEquipo) {
    const abogado = datos.abogados.find((a) => a.id === deEquipo[1]);
    if (!abogado || !esObjeto(abogado[deEquipo[2]])) return false;
    abogado[deEquipo[2]][codigo] = valor;
    return true;
  }
  const partes = clave.split('.');
  const ultima = partes.pop();
  let nodo = datos;
  for (const parte of partes) {
    nodo[parte] ??= {};
    nodo = nodo[parte];
    if (!esObjeto(nodo)) return false;
  }
  nodo[ultima] = valor;
  return true;
}

export const rutaDeClave = (clave, codigo) => (clave.startsWith('equipo:') ? RUTA_EQUIPO : rutaContenido(codigo));

// Lo que recibe y manda un editor: sólo el español de equipo.json. Las traducciones ni se muestran
// ni se aceptan: al guardar se reponen las de la rama, y un abogado nuevo arranca sin traducir.
export function equipoSoloEspanol(equipo) {
  return {
    ...equipo,
    abogados: equipo.abogados.map((abogado) => {
      const copia = { ...abogado };
      for (const campo of reglas.textosAbogado) copia[campo] = { [BASE]: abogado[campo]?.[BASE] ?? '' };
      return copia;
    }),
  };
}

export function reponerTraducciones(enviado, actual) {
  const porId = new Map(actual.abogados.map((a) => [a.id, a]));
  return {
    ...enviado,
    abogados: enviado.abogados.map((abogado) => {
      if (!esObjeto(abogado)) return abogado;
      const copia = { ...abogado };
      const previo = porId.get(abogado.id);
      for (const campo of reglas.textosAbogado) {
        copia[campo] = { [BASE]: abogado[campo]?.[BASE] ?? '' };
        for (const codigo of OTROS_IDIOMAS) copia[campo][codigo] = previo?.[campo]?.[codigo] ?? '';
      }
      return copia;
    }),
  };
}
