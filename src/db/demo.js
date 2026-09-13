// Carga usuarios y datos de ejemplo para desarrollo. Ejecutar con: npm run db:demo
// Es idempotente: si los usuarios demo ya existen no toca nada.
// Los datos son ficticios (las direcciones solo sirven para ver el listado).
import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { pool, withTransaction } from '../config/database.js';

const PASSWORD_DEMO = 'demo1234';
const EMAIL_PROPIETARIO = 'propietario@parkit.com';
const EMAIL_CONDUCTOR = 'conductor@parkit.com';

// dia_semana: 0 = domingo ... 6 = sabado
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];
const DIAS_HABILES = [1, 2, 3, 4, 5];

// id_tipo_vehiculo segun seed.sql
const AUTO = 1;
const MOTO = 2;
const CAMIONETA = 3;

const ESTACIONAMIENTOS = [
  {
    nombre: 'Cochera Belgrano',
    descripcion: 'Cochera cubierta con acceso directo por Av. Belgrano.',
    calle: 'Av. Belgrano',
    numero: '1240',
    ciudad: 'CABA',
    provincia: 'Buenos Aires',
    codigo_postal: 'C1093',
    barrio_zona: 'Monserrat',
    latitud: -34.6131,
    longitud: -58.3847,
    telefono_contacto: '+54 11 4311 2200',
    email_contacto: 'belgrano@parkit.com',
    tarifa_hora: 900,
    cubierto: true,
    dias: TODOS_LOS_DIAS,
    apertura: '07:00',
    cierre: '23:00',
    // [identificador, tipo, sector, cubierta]
    cocheras: [
      ['A1', AUTO, 'A', true], ['A2', AUTO, 'A', true], ['A3', AUTO, 'A', true],
      ['A4', AUTO, 'A', true], ['A5', AUTO, 'A', true], ['A6', AUTO, 'A', true],
      ['M1', MOTO, 'M', true], ['M2', MOTO, 'M', true],
    ],
  },
  {
    nombre: 'Playa Puerto Madero',
    descripcion: 'Playa descubierta sobre la avenida, con lugares para camionetas.',
    calle: 'Av. Alicia Moreau de Justo',
    numero: '1500',
    ciudad: 'CABA',
    provincia: 'Buenos Aires',
    codigo_postal: 'C1107',
    barrio_zona: 'Puerto Madero',
    latitud: -34.6157,
    longitud: -58.3647,
    telefono_contacto: '+54 11 4890 7711',
    email_contacto: 'madero@parkit.com',
    tarifa_hora: 1200,
    cubierto: false,
    dias: DIAS_HABILES,
    apertura: '08:00',
    cierre: '21:00',
    cocheras: [
      ['B1', AUTO, 'B', false], ['B2', AUTO, 'B', false], ['B3', AUTO, 'B', false],
      ['B4', AUTO, 'B', false], ['C1', CAMIONETA, 'C', false], ['C2', CAMIONETA, 'C', false],
    ],
  },
];

if (config.isProduction) {
  console.error('[demo] no se cargan datos de demo en produccion');
  process.exit(1);
}

async function insertarUsuario(client, { nombre, apellido, email, rol, telefono }, hash) {
  const { rows } = await client.query(
    `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id_usuario`,
    [nombre, apellido, email, hash, rol, telefono],
  );
  return rows[0].id_usuario;
}

async function insertarEstacionamiento(client, idPropietario, datos) {
  const { rows } = await client.query(
    `INSERT INTO estacionamiento
       (id_propietario, nombre, descripcion, direccion, calle, numero, ciudad, provincia,
        codigo_postal, barrio_zona, latitud, longitud, telefono_contacto, email_contacto,
        tarifa_hora, cubierto, publicado)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, TRUE)
     RETURNING id_estacionamiento`,
    [
      idPropietario,
      datos.nombre,
      datos.descripcion,
      `${datos.calle} ${datos.numero}`,
      datos.calle,
      datos.numero,
      datos.ciudad,
      datos.provincia,
      datos.codigo_postal,
      datos.barrio_zona,
      datos.latitud,
      datos.longitud,
      datos.telefono_contacto,
      datos.email_contacto,
      datos.tarifa_hora,
      datos.cubierto,
    ],
  );
  const { id_estacionamiento: idEstacionamiento } = rows[0];

  for (const dia of datos.dias) {
    await client.query(
      `INSERT INTO horario (id_estacionamiento, dia_semana, hora_apertura, hora_cierre)
       VALUES ($1, $2, $3, $4)`,
      [idEstacionamiento, dia, datos.apertura, datos.cierre],
    );
  }

  for (const [identificador, idTipoVehiculo, sector, cubierta] of datos.cocheras) {
    await client.query(
      `INSERT INTO cochera (id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta)
       VALUES ($1, $2, $3, $4, $5)`,
      [idEstacionamiento, idTipoVehiculo, identificador, sector, cubierta],
    );
  }
}

try {
  const hash = await bcrypt.hash(PASSWORD_DEMO, config.bcryptRounds);

  const cargado = await withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM usuario WHERE email = ANY($1)', [
      [EMAIL_PROPIETARIO, EMAIL_CONDUCTOR],
    ]);
    if (rowCount > 0) return false;

    const idPropietario = await insertarUsuario(
      client,
      { nombre: 'Matias', apellido: 'Alvarez', email: EMAIL_PROPIETARIO, rol: 'PROPIETARIO', telefono: '+54 9 11 4444 8899' },
      hash,
    );
    const idConductor = await insertarUsuario(
      client,
      { nombre: 'Martina', apellido: 'Alvarez', email: EMAIL_CONDUCTOR, rol: 'CONDUCTOR', telefono: '+54 9 11 5555 1234' },
      hash,
    );

    for (const estacionamiento of ESTACIONAMIENTOS) {
      await insertarEstacionamiento(client, idPropietario, estacionamiento);
    }

    await client.query(
      `INSERT INTO vehiculo (id_conductor, id_tipo_vehiculo, patente, marca, modelo, color, predeterminado)
       VALUES ($1, $2, 'AB123CD', 'Toyota', 'Corolla', 'Gris', TRUE),
              ($1, $3, 'A123BCD', 'Honda', 'CB 190', 'Negro', FALSE)`,
      [idConductor, AUTO, MOTO],
    );

    return true;
  });

  console.log(
    cargado
      ? `[demo] listo: ${EMAIL_PROPIETARIO} y ${EMAIL_CONDUCTOR} (password: ${PASSWORD_DEMO})`
      : '[demo] los usuarios demo ya existian, no se cargo nada',
  );
} catch (error) {
  console.error('[demo] fallo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
