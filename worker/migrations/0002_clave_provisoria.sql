ALTER TABLE users ADD COLUMN cambiar_clave INTEGER NOT NULL DEFAULT 0 CHECK (cambiar_clave IN (0, 1));
