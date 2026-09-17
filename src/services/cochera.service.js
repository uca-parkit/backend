import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { ESTADOS_COCHERA } from '../utils/roles.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_UNIQUE = '23505';
const VIOLACION_FK = '23503';

const CAMPOS =
  'id_cochera, id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual, activo';

const CAMPOS_EDITABLES = ['identificador', 'id_tipo_vehiculo', 'sector', 'cubierta', 'estado_actual'];

/** Traduce las violaciones de constraints de COCHERA a errores entendibles. */
function traducirError(error, datos) {
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

/** Alta de una cochera dentro de un estacionamiento del propietario autenticado. */
export async function crear(idEstacionamiento, idPropietario, datos) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  try {
    const { rows } = await query(
      `INSERT INTO cochera
         (id_estacionamiento, id_tipo_vehiculo, identificador, sector, cubierta, estado_actual)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CAMPOS}`,
      [
        idEstacionamiento,
        datos.id_tipo_vehiculo,
        datos.identificador,
        datos.sector ?? null,
        datos.cubierta ?? false,
        datos.estado_actual,
      ],
    );
    return rows[0];
  } catch (error) {
    return traducirError(error, datos);
  }
}

/**
 * `reservada_ahora` indica si hay una reserva vigente transcurriendo: el
 * `estado_actual` es el estado fisico y una reserva no lo modifica.
 */
export async function listarPorEstacionamiento(idEstacionamiento) {
  const { rows } = await query(
    `SELECT c.id_cochera, c.id_estacionamiento, c.identificador, c.sector, c.cubierta,
            c.estado_actual, c.activo, c.id_tipo_vehiculo, t.nombre AS tipo_vehiculo,
            EXISTS (
              SELECT 1 FROM reserva r
               WHERE r.id_cochera = c.id_cochera
                 AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
                 AND r.inicio <= now() AND r.fin > now()
            ) AS reservada_ahora
       FROM cochera c
       JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = c.id_tipo_vehiculo
      WHERE c.id_estacionamiento = $1
      ORDER BY c.identificador`,
    [idEstacionamiento],
  );
  return rows;
}

/** Modifica identificador, tipo de vehiculo, sector, cubierta y/o estado de una cochera propia. */
export async function actualizar(idEstacionamiento, idPropietario, idCochera, datos) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const asignaciones = [];
  const parametros = [];
  for (const campo of CAMPOS_EDITABLES) {
    if (datos[campo] === undefined) continue;
    parametros.push(datos[campo]);
    asignaciones.push(`${campo} = $${parametros.length}`);
  }
  parametros.push(idCochera, idEstacionamiento);

  let rows;
  try {
    ({ rows } = await query(
      `UPDATE cochera SET ${asignaciones.join(', ')}
        WHERE id_cochera = $${parametros.length - 1} AND id_estacionamiento = $${parametros.length}
        RETURNING ${CAMPOS}`,
      parametros,
    ));
  } catch (error) {
    return traducirError(error, datos);
  }

  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  return rows[0];
}

/**
 * Baja logica: la cochera puede tener reservas historicas (FK RESTRICT), asi
 * que se desactiva en vez de borrarse.
 */
export async function darDeBaja(idEstacionamiento, idPropietario, idCochera) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const { rows } = await query(
    `UPDATE cochera SET activo = FALSE, estado_actual = $1
      WHERE id_cochera = $2 AND id_estacionamiento = $3
      RETURNING ${CAMPOS}`,
    [ESTADOS_COCHERA.INACTIVA, idCochera, idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('La cochera no existe en este estacionamiento');
  return rows[0];
}
