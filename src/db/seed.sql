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


-- 1. TIPOS DE VEHÍCULO
INSERT INTO tipo_vehiculo (id_tipo_vehiculo, nombre) VALUES
  (1, 'Auto'),
  (2, 'Moto'),
  (3, 'Camioneta')
ON CONFLICT (id_tipo_vehiculo) DO NOTHING;

-- 2. USUARIOS (DEBEN IR ANTES DE ESTACIONAMIENTO Y VEHÍCULO)
-- 2a. Conductor
INSERT INTO usuario (id_usuario, nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES (
  '280672ee-94d4-4a61-92b5-97ab59bb1ff4',
  'Martina',
  'Álvarez',
  'conductor@test.com',
  '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i',
  'CONDUCTOR',
  '+54 9 11 5555 1234',
  TRUE
)
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;

-- 2b. Propietario
INSERT INTO usuario (id_usuario, nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'Matias',
  'Álvarez',
  'propietario@test.com',
  '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i',
  'PROPIETARIO',
  '+54 9 11 4444 8899',
  TRUE
)
ON CONFLICT (email) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;

-- 3. VEHÍCULOS (Depende de usuario conductor)
INSERT INTO vehiculo (id_vehiculo, id_conductor, id_tipo_vehiculo, patente, marca, modelo, activo)
VALUES 
  (
    'c1111111-1111-1111-1111-111111111111',
    '280672ee-94d4-4a61-92b5-97ab59bb1ff4',
    1,
    'AB 123 CD',
    'Toyota',
    'Corolla',
    TRUE
  ),
  (
    'c2222222-2222-2222-2222-222222222222',
    '280672ee-94d4-4a61-92b5-97ab59bb1ff4',
    2,
    'AA 984 XT',
    'Honda',
    'CB 190',
    TRUE
  )
ON CONFLICT (patente) DO NOTHING;

-- 4. ESTACIONAMIENTO (Depende de usuario propietario)
INSERT INTO estacionamiento (
  id_estacionamiento,
  id_propietario,
  nombre,
  direccion,
  barrio_zona,
  latitud,
  longitud,
  telefono_contacto,
  email_contacto,
  tarifa_hora,
  publicado,
  activo
)
VALUES (
  'e1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111', -- Coincide exactamente con el id_usuario del propietario
  'Cochera Belgrano',
  'Av. Belgrano 1240',
  'Belgrano',
  -34.611800,
  -58.383300,
  '+54 11 4311 2200',
  'belgrano@ucaio.com',
  900.00,
  TRUE,
  TRUE
)
ON CONFLICT (id_estacionamiento) DO NOTHING;

-- 5. COCHERAS (Depende de estacionamiento)
INSERT INTO cochera (id_estacionamiento, id_tipo_vehiculo, identificador, estado_actual, activo)
VALUES 
  ('e1111111-1111-1111-1111-111111111111', 1, 'A1', 'LIBRE', TRUE),
  ('e1111111-1111-1111-1111-111111111111', 1, 'A2', 'OCUPADA', TRUE),
  ('e1111111-1111-1111-1111-111111111111', 1, 'A3', 'RESERVADA', TRUE),
  ('e1111111-1111-1111-1111-111111111111', 2, 'A4', 'LIBRE', TRUE),
  ('e1111111-1111-1111-1111-111111111111', 1, 'A5', 'LIBRE', TRUE),
  ('e1111111-1111-1111-1111-111111111111', 1, 'A6', 'RESERVADA', TRUE)
ON CONFLICT (id_estacionamiento, identificador) DO NOTHING;