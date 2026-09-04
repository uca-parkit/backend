import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';

/** Alta de una cochera dentro de un estacionamiento del propietario autenticado. */
export async function crear(idEstacionamiento, idPropietario, datos) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  try {
    const { rows } = await query(
      `INSERT INTO cochera (id_estacionamiento, id_tipo_vehiculo, identificador, estado_actual)
       VALUES ($1, $2, $3, $4)
       RETURNING id_cochera, id_estacionamiento, id_tipo_vehiculo, identificador,
                 estado_actual, activo`,
      [idEstacionamiento, datos.id_tipo_vehiculo, datos.identificador, datos.estado_actual],
    );
    return rows[0];
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict(
        `El estacionamiento ya tiene una cochera con el identificador "${datos.identificador}"`,
      );
    }
    if (error.code === VIOLACION_FK) {
      throw ApiError.badRequest('El id_tipo_vehiculo indicado no existe');
    }
    throw error;
  }
}

export async function listarPorEstacionamiento(idEstacionamiento) {
  const { rows } = await query(
    `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo,
            c.id_tipo_vehiculo, t.nombre AS tipo_vehiculo
       FROM cochera c
       JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = c.id_tipo_vehiculo
      WHERE c.id_estacionamiento = $1
      ORDER BY c.identificador`,
    [idEstacionamiento],
  );
  return rows;
}
