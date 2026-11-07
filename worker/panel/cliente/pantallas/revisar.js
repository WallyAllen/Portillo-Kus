// Los mismos avisos que da el servidor con un 422, para mostrarlos junto al campo antes de guardar.
// Sin DOM: worker/test/campos.test.mjs los compara con worker/campos.js y worker/validacion.js.
const PENDIENTE = '[PENDIENTE]';
const LINKEDIN = 'https://www.linkedin.com/in/';

export const oculto = (valor) => {
  const texto = String(valor ?? '').trim();
  return !texto || texto.startsWith(PENDIENTE);
};

const muestra = (valor) => {
  const texto = String(valor ?? '').trim();
  return !texto || texto.includes('[');
};

// campo: { largo, atributo?, puedeVaciar? }. Devuelve el aviso, o null si está bien.
export function revisarTexto(valor, campo) {
  if (!campo.puedeVaciar && !valor.trim()) return 'Este campo no puede quedar vacío.';
  if (valor.includes('<')) return 'No puede llevar el carácter <.';
  if (campo.atributo && valor.includes('"')) return 'No puede llevar comillas dobles.';
  if ([...valor].length > campo.largo) return `Pasa de ${campo.largo} caracteres.`;
  return null;
}

// Una reseña con texto necesita autor. Sin publicar puede quedar a medias.
export function revisarResena({ texto, autor, publicada }, { largoTexto, largoAutor }) {
  const errores = {};
  const problemaTexto = revisarTexto(texto, { largo: largoTexto, puedeVaciar: true });
  const problemaAutor = revisarTexto(autor, { largo: largoAutor, puedeVaciar: true });
  if (problemaTexto) errores.texto = problemaTexto;
  if (problemaAutor) errores.autor = problemaAutor;
  if (publicada && !texto.trim() && !errores.texto) errores.texto = 'Para publicar la reseña falta el texto.';
  if (publicada && !autor.trim() && !errores.autor) errores.autor = 'Para publicar la reseña falta el autor.';
  return errores;
}

export const fotoDeAbogado = (id) => `abogado-${id.replace(/^abogado-/, '')}.jpg`;

// Un sufijo al azar: un abogado nuevo nunca hereda los pendientes ni la foto de uno borrado.
export const idNuevo = () => `abogado-${crypto.randomUUID().slice(0, 8)}`;

// abogado con los textos en español ya elegidos. Devuelve { campo: aviso }.
export function revisarAbogado(abogado) {
  const errores = {};
  const linkedin = String(abogado.linkedin ?? '');
  if (linkedin && !linkedin.startsWith(LINKEDIN)) errores.linkedin = `Tiene que empezar con ${LINKEDIN}`;
  if (abogado.publicado !== true) return errores;
  if (muestra(abogado.nombre)) errores.nombre = 'Para publicar falta el nombre real.';
  if (!abogado.foto) errores.foto = 'Para publicar falta la foto.';
  if (muestra(abogado.cargo?.es)) errores.cargo = 'Para publicar falta el cargo real.';
  if (muestra(abogado.biografia?.es)) errores.biografia = 'Para publicar falta la biografía real.';
  if (String(abogado.idiomas?.es ?? '').includes('[')) errores.idiomas = 'Reemplazá el texto de muestra o dejalo vacío.';
  if (String(abogado.matricula ?? '').includes('[')) errores.matricula = 'Reemplazá el texto de muestra o dejalo vacío.';
  return errores;
}
