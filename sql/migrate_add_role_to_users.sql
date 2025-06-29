-- Agrega el campo 'role' a la tabla users existente
ALTER TABLE users
ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
