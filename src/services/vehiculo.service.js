import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';

const CAMPOS = `
  id_vehiculo, id_conductor, id_tipo_vehiculo, patente, marca, modelo, color,
  predeterminado, activo
`;

/**
 * Registra un vehiculo. El primero del conductor queda como predeterminado; si
 * se pide `predeterminado: true` explicitamente, reemplaza al anterior (el
 * indice `vehiculo_un_predeterminado` impide que haya dos).
 */
export async function crear(idConductor, datos) {
  try {
    return await withTransaction(async (client) => {
      const { rowCount: tieneVehiculos } = await client.query(
        'SELECT 1 FROM vehiculo WHERE id_conductor = $1 AND activo LIMIT 1',
        [idConductor],
      );

      const predeterminado = datos.predeterminado ?? tieneVehiculos === 0;

      if (predeterminado) {
        await client.query(
          'UPDATE vehiculo SET predeterminado = FALSE WHERE id_conductor = $1 AND predeterminado',
          [idConductor],
        );
      }

      const { rows } = await client.query(
        `INSERT INTO vehiculo
           (id_conductor, id_tipo_vehiculo, patente, marca, modelo, color, predeterminado)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${CAMPOS}`,
        [
          idConductor,
          datos.id_tipo_vehiculo,
          datos.patente,
          datos.marca ?? null,
          datos.modelo ?? null,
          datos.color ?? null,
          predeterminado,
        ],
      );
      return rows[0];
    });
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE && error.constraint === 'vehiculo_patente_unica') {
      throw ApiError.conflict(`La patente ${datos.patente} ya esta registrada`);
    }
    if (error.code === VIOLACION_FK) {
      throw ApiError.badRequest('El id_tipo_vehiculo indicado no existe');
    }
    throw error;
  }
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `SELECT v.id_vehiculo, v.id_conductor, v.id_tipo_vehiculo, v.patente,
            v.marca, v.modelo, v.color, v.predeterminado, v.activo,
            t.nombre AS tipo_vehiculo
       FROM vehiculo v
       JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = v.id_tipo_vehiculo
      WHERE v.id_conductor = $1
      ORDER BY v.predeterminado DESC, v.patente`,
    [idConductor],
  );
  return rows;
}

export async function obtenerDelConductor(idVehiculo, idConductor) {
  const { rows } = await query(
    `SELECT ${CAMPOS} FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2`,
    [idVehiculo, idConductor],
  );

  if (!rows[0]) throw ApiError.notFound('Vehiculo no encontrado para este conductor');
  return rows[0];
}

export async function listarTipos() {
  const { rows } = await query(
    'SELECT id_tipo_vehiculo, nombre FROM tipo_vehiculo ORDER BY id_tipo_vehiculo',
  );
  return rows;
}
