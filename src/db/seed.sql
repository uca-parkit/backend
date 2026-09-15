-- Datos base necesarios para operar (catalogo de tipos de vehiculo del ER).
INSERT INTO tipo_vehiculo (id_tipo_vehiculo, nombre) VALUES
  (1, 'Auto'),
  (2, 'Moto'),
  (3, 'Camioneta')
ON CONFLICT (id_tipo_vehiculo) DO NOTHING;

-- Reacomoda la secuencia de la identity despues del insert con ids explicitos.
SELECT setval(
  pg_get_serial_sequence('tipo_vehiculo', 'id_tipo_vehiculo'),
  (SELECT COALESCE(MAX(id_tipo_vehiculo), 1) FROM tipo_vehiculo)
);

-- SEMBRADO DE DATOS INICIALES (TESTING) --------------------------------------

-- Actualizar o Insertar el Conductor de prueba con un HASH valido de bcrypt
INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES (
  'Juan',
  'Pérez',
  'conductor@test.com',
  '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', -- Hash de 'demo1234'
  'CONDUCTOR',
  '1122334455',
  TRUE
)
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;

-- Actualizar o Insertar el Propietario de prueba
INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES (
  'María',
  'Gómez',
  'propietario@test.com',
  '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', -- Hash de 'demo1234'
  'PROPIETARIO',
  '1199887766',
  TRUE
)
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;