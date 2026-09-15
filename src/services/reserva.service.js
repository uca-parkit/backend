import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_VIGENTES, ESTADOS_RESERVA } from '../utils/roles.js';

const VIOLACION_EXCLUSION = '23P01';

// Vista detallada de la reserva con sus joins, en la forma que espera el front
// (ReservaDto). El WHERE lo pone cada consumidor.
const SELECT_RESERVA_DETALLE = `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.estado, r.created_at,
         r.id_vehiculo, v.patente, v.marca, v.modelo, v.id_tipo_vehiculo,
         r.id_cochera, c.identificador AS cochera,
         NULL::text AS cochera_sector, FALSE AS cochera_cubierta,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion, e.tarifa_hora,
         ROUND(e.tarifa_hora * EXTRACT(EPOCH FROM (r.fin - r.inicio)) / 3600)::int AS precio_total
    FROM reserva r
    JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
    JOIN cochera c         ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
`;

/**
 * Crea una reserva: el conductor reserva contra un ESTACIONAMIENTO y el backend
 * le asigna una cochera libre del tipo de su vehiculo, sin sobrevender.
 *
 * La transaccion hace, en orden:
 *   1. Valida estacionamiento (publicado/activo) y vehiculo (del conductor, activo).
 *   2. Elige y bloquea una cochera del tipo del vehiculo que no tenga reservas
 *      vigentes solapadas. `FOR UPDATE ... SKIP LOCKED` serializa: dos pedidos
 *      concurrentes toman cocheras distintas y, si solo queda una, el segundo la
 *      salta y ve "sin lugares" en vez de sobrevender.
 *      Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 *   3. Inserta la reserva en esa cochera.
 *
 * Ademas, el EXCLUDE constraint `reserva_sin_solapamiento` (ver schema.sql)
 * repite la garantia a nivel base de datos; si salta, se traduce a un 409.
 */
export async function crear(idConductor, { id_estacionamiento, id_vehiculo, inicio, fin }) {
  return withTransaction(async (client) => {
    // 1. Estacionamiento publicado y activo.
    const { rows: ests } = await client.query(
      `SELECT id_estacionamiento, nombre, direccion, tarifa_hora, publicado, activo
         FROM estacionamiento WHERE id_estacionamiento = $1`,
      [id_estacionamiento],
    );
    const estacionamiento = ests[0];
    if (!estacionamiento) throw ApiError.notFound('El estacionamiento no existe');
    if (!estacionamiento.activo || !estacionamiento.publicado) {
      throw ApiError.conflict('El estacionamiento no esta publicado');
    }

    // 1b. Vehiculo del conductor.
    const { rows: vehiculos } = await client.query(
      `SELECT id_vehiculo, id_tipo_vehiculo, patente, marca, modelo, activo
         FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2`,
      [id_vehiculo, idConductor],
    );
    const vehiculo = vehiculos[0];
    if (!vehiculo) throw ApiError.notFound('El vehiculo no existe o no pertenece al conductor');
    if (!vehiculo.activo) throw ApiError.conflict('El vehiculo esta dado de baja');

    // 2. Elegir y bloquear una cochera libre del tipo del vehiculo.
    const { rows: libres } = await client.query(
      `SELECT c.id_cochera, c.identificador
         FROM cochera c
        WHERE c.id_estacionamiento = $1
          AND c.activo
          AND c.estado_actual <> 'INACTIVA'
          AND c.id_tipo_vehiculo = $2
          AND NOT EXISTS (
            SELECT 1 FROM reserva r
             WHERE r.id_cochera = c.id_cochera
               AND r.estado = ANY($3::estado_reserva[])
               AND r.inicio < $5
               AND r.fin > $4
          )
        ORDER BY c.identificador
        FOR UPDATE OF c SKIP LOCKED
        LIMIT 1`,
      [id_estacionamiento, vehiculo.id_tipo_vehiculo, ESTADOS_VIGENTES, inicio, fin],
    );

    const cochera = libres[0];
    if (!cochera) {
      const { rows: hay } = await client.query(
        `SELECT COUNT(*)::int AS n FROM cochera
          WHERE id_estacionamiento = $1 AND activo
            AND estado_actual <> 'INACTIVA' AND id_tipo_vehiculo = $2`,
        [id_estacionamiento, vehiculo.id_tipo_vehiculo],
      );
      if (hay[0].n === 0) {
        throw ApiError.conflict('El estacionamiento no tiene cocheras para ese tipo de vehiculo');
      }
      throw ApiError.conflict('No hay cocheras libres en esa franja horaria');
    }

    // 3. Alta.
    let reserva;
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_reserva, id_conductor, id_vehiculo, id_cochera,
                   inicio, fin, estado, created_at`,
        [idConductor, id_vehiculo, cochera.id_cochera, inicio, fin, ESTADOS_RESERVA.PENDIENTE],
      );
      reserva = rows[0];
    } catch (error) {
      if (error.code === VIOLACION_EXCLUSION) {
        throw ApiError.conflict('La cochera se reservo recien; intenta de nuevo');
      }
      throw error;
    }

    const horas = (new Date(reserva.fin) - new Date(reserva.inicio)) / 3_600_000;

    // Forma completa que espera el front (ReservaDto). El esquema no tiene
    // sector ni cubierta en cochera, por eso van en null/false.
    return {
      ...reserva,
      id_estacionamiento: estacionamiento.id_estacionamiento,
      estacionamiento: estacionamiento.nombre,
      direccion: estacionamiento.direccion,
      tarifa_hora: estacionamiento.tarifa_hora,
      precio_total: Math.round(Number(estacionamiento.tarifa_hora) * horas),
      patente: vehiculo.patente,
      marca: vehiculo.marca,
      modelo: vehiculo.modelo,
      id_tipo_vehiculo: vehiculo.id_tipo_vehiculo,
      cochera: cochera.identificador,
      cochera_sector: null,
      cochera_cubierta: false,
    };
  });
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `${SELECT_RESERVA_DETALLE} WHERE r.id_conductor = $1 ORDER BY r.inicio DESC`,
    [idConductor],
  );
  return rows;
}

/**
 * Cancela una reserva del conductor: la deja en estado CANCELADA (baja logica,
 * no se borra). Verifica pertenencia (404 si no es suya) y que sea cancelable.
 */
export async function cancelar(idReserva, idConductor) {
  const { rows } = await query(
    'SELECT id_reserva, estado, fin FROM reserva WHERE id_reserva = $1 AND id_conductor = $2',
    [idReserva, idConductor],
  );

  const reserva = rows[0];
  if (!reserva) throw ApiError.notFound('Reserva no encontrada para este conductor');

  if (reserva.estado === ESTADOS_RESERVA.CANCELADA) {
    throw ApiError.conflict('La reserva ya estaba cancelada');
  }
  if (reserva.estado === ESTADOS_RESERVA.FINALIZADA || new Date(reserva.fin) <= new Date()) {
    throw ApiError.conflict('No se puede cancelar una reserva que ya finalizo');
  }

  await query(
    'UPDATE reserva SET estado = $1 WHERE id_reserva = $2 AND id_conductor = $3',
    [ESTADOS_RESERVA.CANCELADA, idReserva, idConductor],
  );

  const { rows: detalle } = await query(
    `${SELECT_RESERVA_DETALLE} WHERE r.id_reserva = $1`,
    [idReserva],
  );
  return detalle[0];
}
