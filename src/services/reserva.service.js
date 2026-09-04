import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_COCHERA, ESTADOS_VIGENTES, ESTADOS_RESERVA } from '../utils/roles.js';

const VIOLACION_EXCLUSION = '23P01';

/**
 * Crea una reserva garantizando que la cochera no quede sobrevendida.
 *
 * La transaccion hace, en orden:
 *   1. SELECT ... FOR UPDATE sobre la fila de COCHERA. Esto serializa a todos
 *      los pedidos concurrentes sobre la misma cochera: el segundo espera a que
 *      el primero commitee, por lo que ya ve su reserva al chequear solapamiento.
 *      (Bloquear solo las reservas existentes no alcanza: no impide que dos
 *      transacciones inserten filas nuevas que se pisan entre si.)
 *   2. Valida cochera / estacionamiento / vehiculo / compatibilidad de tipo.
 *   3. Busca solapamientos contra reservas PENDIENTE o CONFIRMADA.
 *      Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 *   4. Inserta la reserva.
 *
 * Ademas, el EXCLUDE constraint `reserva_sin_solapamiento` (ver schema.sql)
 * repite la garantia a nivel base de datos; si salta, se traduce a un 409.
 */
export async function crear(idConductor, { id_cochera, id_vehiculo, inicio, fin }) {
  return withTransaction(async (client) => {
    // 1. Lock de la cochera: serializa las reservas sobre este mismo lugar.
    const { rows: cocheras } = await client.query(
      `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo,
              c.id_tipo_vehiculo, c.id_estacionamiento,
              e.nombre AS estacionamiento, e.publicado, e.activo AS estacionamiento_activo
         FROM cochera c
         JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
        WHERE c.id_cochera = $1
        FOR UPDATE OF c`,
      [id_cochera],
    );

    const cochera = cocheras[0];
    if (!cochera) throw ApiError.notFound('La cochera no existe');

    // 2. Reglas de negocio previas al calendario.
    if (!cochera.activo || cochera.estado_actual === ESTADOS_COCHERA.INACTIVA) {
      throw ApiError.conflict('La cochera no esta disponible para reservar');
    }
    if (!cochera.estacionamiento_activo || !cochera.publicado) {
      throw ApiError.conflict('El estacionamiento no esta publicado');
    }

    const { rows: vehiculos } = await client.query(
      'SELECT id_vehiculo, id_tipo_vehiculo, patente, activo FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2',
      [id_vehiculo, idConductor],
    );

    const vehiculo = vehiculos[0];
    if (!vehiculo) throw ApiError.notFound('El vehiculo no existe o no pertenece al conductor');
    if (!vehiculo.activo) throw ApiError.conflict('El vehiculo esta dado de baja');

    if (vehiculo.id_tipo_vehiculo !== cochera.id_tipo_vehiculo) {
      throw ApiError.conflict('La cochera no admite el tipo de vehiculo seleccionado');
    }

    // 3. Solapamiento contra reservas vigentes de esa cochera.
    const { rows: solapadas } = await client.query(
      `SELECT id_reserva, inicio, fin, estado
         FROM reserva
        WHERE id_cochera = $1
          AND estado = ANY($2::estado_reserva[])
          AND inicio < $4
          AND fin > $3
        ORDER BY inicio
        LIMIT 1`,
      [id_cochera, ESTADOS_VIGENTES, inicio, fin],
    );

    if (solapadas.length > 0) {
      const conflicto = solapadas[0];
      throw ApiError.conflict('La cochera ya esta reservada en esa franja horaria', {
        id_cochera,
        reserva_en_conflicto: {
          id_reserva: conflicto.id_reserva,
          inicio: conflicto.inicio,
          fin: conflicto.fin,
          estado: conflicto.estado,
        },
      });
    }

    // 4. Alta.
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_reserva, id_conductor, id_vehiculo, id_cochera,
                   inicio, fin, estado, created_at`,
        [idConductor, id_vehiculo, id_cochera, inicio, fin, ESTADOS_RESERVA.PENDIENTE],
      );

      return {
        ...rows[0],
        cochera: {
          id_cochera: cochera.id_cochera,
          identificador: cochera.identificador,
          id_estacionamiento: cochera.id_estacionamiento,
          estacionamiento: cochera.estacionamiento,
        },
      };
    } catch (error) {
      if (error.code === VIOLACION_EXCLUSION) {
        throw ApiError.conflict('La cochera ya esta reservada en esa franja horaria');
      }
      throw error;
    }
  });
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `SELECT r.id_reserva, r.inicio, r.fin, r.estado, r.created_at,
            r.id_vehiculo, v.patente,
            r.id_cochera, c.identificador AS cochera,
            e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion, e.tarifa_hora
       FROM reserva r
       JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
       JOIN cochera c         ON c.id_cochera = r.id_cochera
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE r.id_conductor = $1
      ORDER BY r.inicio DESC`,
    [idConductor],
  );
  return rows;
}
