-- Usuarios, sesiones e intentos de login del panel. Fechas en milisegundos desde 1970.
CREATE TABLE users (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  nombre  TEXT NOT NULL,
  hash    TEXT NOT NULL,
  rol     TEXT NOT NULL CHECK (rol IN ('admin', 'editor')),
  activo  INTEGER NOT NULL DEFAULT 1,
  creado  INTEGER NOT NULL
);

-- Se guarda el hash del token: leer esta tabla no alcanza para entrar.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  creado     INTEGER NOT NULL
);
CREATE INDEX sessions_expira ON sessions (expira);

-- Se borran a los 15 minutos: la IP no queda guardada más que eso.
CREATE TABLE login_attempts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  ip      TEXT NOT NULL,
  creado  INTEGER NOT NULL
);
CREATE INDEX login_attempts_usuario ON login_attempts (usuario, creado);
CREATE INDEX login_attempts_ip ON login_attempts (ip, creado);
