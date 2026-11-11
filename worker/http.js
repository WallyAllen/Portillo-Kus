// Encabezados del panel y de la API. src/_headers no se aplica a lo que genera el Worker,
// así que noindex, CSP y demás van acá. Todo /panel y /api/* sale por estas funciones.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-src 'self'", // la vista previa de la portada ("Ver cómo queda")
  "frame-ancestors 'none'",
].join('; ');

export const ENCABEZADOS = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': CSP,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function respuesta(cuerpo, tipo, estado = 200, extra = {}) {
  return new Response(cuerpo, { status: estado, headers: { ...ENCABEZADOS, 'Content-Type': tipo, ...extra } });
}

export function json(datos, estado = 200, extra = {}) {
  return respuesta(JSON.stringify(datos), 'application/json; charset=utf-8', estado, extra);
}

export function error(mensaje, estado, extra = {}) {
  return json({ error: mensaje }, estado, extra);
}
