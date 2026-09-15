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

-- Conductor de prueba
INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono)
VALUES (
  'Juan', 
  'Pérez', 
  'conductor@ucaio.com', 
  'demo1234', -- O el hash si ya usas bcrypt
  'CONDUCTOR', 
  '1122334455'
)
ON CONFLICT (email) DO NOTHING;

-- Propietario de prueba
INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono)
VALUES (
  'María', 
  'Gómez', 
  'propietario@ucaio.com', 
  'demo1234', 
  'PROPIETARIO', 
  '1199887766'
)
ON CONFLICT (email) DO NOTHING;