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


-- ============================================================================
-- MAS DATOS DE PRUEBA: propietarios, conductores, estacionamientos y cocheras
-- Todos con la misma clave: demo1234 (mismo hash que los usuarios de arriba).
-- Idempotente: UUIDs fijos + ON CONFLICT.
-- ============================================================================

-- 6. PROPIETARIOS ADICIONALES
INSERT INTO usuario (id_usuario, nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES
  ('b0000000-0000-0000-0000-000000000002', 'Lucía',  'Fernández', 'lucia.fernandez@test.com', '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'PROPIETARIO', '+54 9 11 6111 0002', TRUE),
  ('b0000000-0000-0000-0000-000000000003', 'Diego',  'Gómez',     'diego.gomez@test.com',     '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'PROPIETARIO', '+54 9 11 6111 0003', TRUE),
  ('b0000000-0000-0000-0000-000000000004', 'Sofía',  'Ramírez',   'sofia.ramirez@test.com',   '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'PROPIETARIO', '+54 9 11 6111 0004', TRUE),
  ('b0000000-0000-0000-0000-000000000005', 'Javier', 'Torres',    'javier.torres@test.com',   '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'PROPIETARIO', '+54 9 11 6111 0005', TRUE)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 7. CONDUCTORES ADICIONALES
INSERT INTO usuario (id_usuario, nombre, apellido, email, password_hash, rol, telefono, activo)
VALUES
  ('d0000000-0000-0000-0000-000000000002', 'Carla', 'Ruiz', 'carla.ruiz@test.com', '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'CONDUCTOR', '+54 9 11 6222 0002', TRUE),
  ('d0000000-0000-0000-0000-000000000003', 'Pablo', 'Díaz', 'pablo.diaz@test.com', '$2b$10$u4CEphG8idmn8acxVzoPAuWgj3BTrdnpL7.KvphWnl98/iUAPYQ/i', 'CONDUCTOR', '+54 9 11 6222 0003', TRUE)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 8. ESTACIONAMIENTOS DE LOS PROPIETARIOS NUEVOS
INSERT INTO estacionamiento (
  id_estacionamiento, id_propietario, nombre, direccion, barrio_zona,
  latitud, longitud, telefono_contacto, email_contacto, tarifa_hora, publicado, activo
)
VALUES
  ('e2222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000002', 'Estacionamiento Palermo Soho',      'Honduras 4900',     'Palermo',   -34.588900, -58.430600, '+54 11 4832 1100', 'palermo@ucaio.com',   1200.00, TRUE,  TRUE),
  ('e3333333-3333-3333-3333-333333333333', 'b0000000-0000-0000-0000-000000000003', 'Cochera Recoleta',                  'Av. Callao 1200',   'Recoleta',  -34.587500, -58.397400, '+54 11 4813 4400', 'recoleta@ucaio.com',  1500.00, TRUE,  TRUE),
  ('e4444444-4444-4444-4444-444444444444', 'b0000000-0000-0000-0000-000000000004', 'Parking Caballito',                 'Av. Rivadavia 5000','Caballito', -34.618700, -58.441500, '+54 11 4902 7700', 'caballito@ucaio.com',  800.00, TRUE,  TRUE),
  ('e5555555-5555-5555-5555-555555555555', 'b0000000-0000-0000-0000-000000000005', 'Garage Núñez',                      'Av. Cabildo 3800',  'Núñez',     -34.545500, -58.461000, '+54 11 4701 9900', 'nunez@ucaio.com',     1000.00, TRUE,  TRUE),
  ('e6666666-6666-6666-6666-666666666666', 'b0000000-0000-0000-0000-000000000002', 'Estacionamiento Palermo Hollywood', 'Fitz Roy 1700',     'Palermo',   -34.579300, -58.436000, '+54 11 4776 2200', 'hollywood@ucaio.com', 1300.00, FALSE, TRUE)
ON CONFLICT (id_estacionamiento) DO NOTHING;

-- 9. COCHERAS DE LOS ESTACIONAMIENTOS NUEVOS
INSERT INTO cochera (id_estacionamiento, id_tipo_vehiculo, identificador, estado_actual, activo)
VALUES
  -- Palermo Soho (Lucía): 6 cocheras
  ('e2222222-2222-2222-2222-222222222222', 1, 'P1', 'LIBRE',    TRUE),
  ('e2222222-2222-2222-2222-222222222222', 1, 'P2', 'OCUPADA',  TRUE),
  ('e2222222-2222-2222-2222-222222222222', 2, 'P3', 'LIBRE',    TRUE),
  ('e2222222-2222-2222-2222-222222222222', 3, 'P4', 'RESERVADA',TRUE),
  ('e2222222-2222-2222-2222-222222222222', 1, 'P5', 'LIBRE',    TRUE),
  ('e2222222-2222-2222-2222-222222222222', 1, 'P6', 'INACTIVA', FALSE),
  -- Recoleta (Diego): 5 cocheras
  ('e3333333-3333-3333-3333-333333333333', 1, 'R1', 'LIBRE',    TRUE),
  ('e3333333-3333-3333-3333-333333333333', 1, 'R2', 'OCUPADA',  TRUE),
  ('e3333333-3333-3333-3333-333333333333', 2, 'R3', 'LIBRE',    TRUE),
  ('e3333333-3333-3333-3333-333333333333', 1, 'R4', 'RESERVADA',TRUE),
  ('e3333333-3333-3333-3333-333333333333', 3, 'R5', 'LIBRE',    TRUE),
  -- Caballito (Sofía): 4 cocheras
  ('e4444444-4444-4444-4444-444444444444', 1, 'C1', 'LIBRE',    TRUE),
  ('e4444444-4444-4444-4444-444444444444', 1, 'C2', 'LIBRE',    TRUE),
  ('e4444444-4444-4444-4444-444444444444', 2, 'C3', 'OCUPADA',  TRUE),
  ('e4444444-4444-4444-4444-444444444444', 3, 'C4', 'LIBRE',    TRUE),
  -- Núñez (Javier): 5 cocheras
  ('e5555555-5555-5555-5555-555555555555', 1, 'N1', 'LIBRE',    TRUE),
  ('e5555555-5555-5555-5555-555555555555', 1, 'N2', 'RESERVADA',TRUE),
  ('e5555555-5555-5555-5555-555555555555', 1, 'N3', 'LIBRE',    TRUE),
  ('e5555555-5555-5555-5555-555555555555', 2, 'N4', 'LIBRE',    TRUE),
  ('e5555555-5555-5555-5555-555555555555', 3, 'N5', 'OCUPADA',  TRUE),
  -- Palermo Hollywood (Lucía): 3 cocheras
  ('e6666666-6666-6666-6666-666666666666', 1, 'H1', 'LIBRE',    TRUE),
  ('e6666666-6666-6666-6666-666666666666', 2, 'H2', 'LIBRE',    TRUE),
  ('e6666666-6666-6666-6666-666666666666', 1, 'H3', 'RESERVADA',TRUE)
ON CONFLICT (id_estacionamiento, identificador) DO NOTHING;