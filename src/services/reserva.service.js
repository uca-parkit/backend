import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import {
  FRANJAS_ESTANDAR,
  instanteLocal,
  motivoFueraDeHorario,
  sumarDias,
} from '../utils/horario.js';
import { ESTADOS_COCHERA, ESTADOS_RESERVA, ESTADOS_VIGENTES } from '../utils/roles.js';
import { asegurarPropiedad } from './estacionamiento.service.js';

const VIOLACION_EXCLUSION = '23P01';

/** Reserva con todo lo que muestran los listados, incluido el precio total. */
const SELECT_DETALLE = `
  SELECT r.id_reserva, r.id_conductor, r.inicio, r.fin, r.estado, r.created_at,
         r.id_vehiculo, v.patente, v.marca, v.modelo, v.id_tipo_vehiculo,
         r.id_cochera, c.identificador AS cochera,
         c.sector AS cochera_sector, c.cubierta AS cochera_cubierta,
         e.id_estacionamiento, e.nombre AS estacionamiento, e.direccion, e.tarifa_hora,
         ROUND(EXTRACT(EPOCH FROM (r.fin - r.inicio)) / 3600 * e.tarifa_hora, 2) AS precio_total,
         u.nombre AS conductor_nombre, u.apellido AS conductor_apellido
    FROM reserva r
    JOIN vehiculo v        ON v.id_vehiculo = r.id_vehiculo
    JOIN cochera c         ON c.id_cochera = r.id_cochera
    JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
    JOIN usuario u         ON u.id_usuario = r.id_conductor
`;

/**
 * Condicion SQL "la cochera `c` no tiene reservas vigentes que se pisen con
 * [inicio, fin)". Recibe los placeholders de los parametros.
 * Dos rangos [a, b) y [c, d) se solapan si  a < d  AND  b > c.
 */
function sinSolapamiento(estados, inicio, fin) {
  return `NOT EXISTS (
    SELECT 1 FROM reserva r
     WHERE r.id_cochera = c.id_cochera
       AND r.estado = ANY(${estados}::estado_reserva[])
       AND r.inicio < ${fin}
       AND r.fin > ${inicio}
  )`;
}

/**
 * Crea una reserva garantizando que ninguna cochera quede sobrevendida.
 *
 * Se puede pedir de dos formas:
 *   - `id_estacionamiento`: el backend asigna la primera cochera libre que
 *     admita el vehiculo (es lo que usa la app).
 *   - `id_cochera`: reserva esa cochera puntual.
 *
 * En ambos casos las cocheras candidatas se bloquean con SELECT ... FOR UPDATE
 * antes de buscar solapamientos. Eso serializa los pedidos concurrentes: el
 * segundo espera el commit del primero y ya ve su reserva. (Bloquear solo las
 * reservas existentes no alcanza: no impide que dos transacciones inserten
 * filas nuevas que se pisan entre si.)
 *
 * Ademas, el EXCLUDE constraint `reserva_sin_solapamiento` (ver schema.sql)
 * repite la garantia a nivel base de datos; si salta, se traduce a un 409.
 */
export async function crear(idConductor, { id_cochera, id_estacionamiento, id_vehiculo, inicio, fin }) {
  return withTransaction(async (client) => {
    const vehiculo = await obtenerVehiculo(client, id_vehiculo, idConductor);

    const cochera = id_cochera
      ? await bloquearCochera(client, id_cochera, vehiculo, inicio, fin)
      : await asignarCochera(client, id_estacionamiento, vehiculo, inicio, fin);

    await validarHorario(client, cochera.id_estacionamiento, inicio, fin);

    let idReserva;
    try {
      const { rows } = await client.query(
        `INSERT INTO reserva (id_conductor, id_vehiculo, id_cochera, inicio, fin, estado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_reserva`,
        [idConductor, id_vehiculo, cochera.id_cochera, inicio, fin, ESTADOS_RESERVA.PENDIENTE],
      );
      idReserva = rows[0].id_reserva;
    } catch (error) {
      if (error.code === VIOLACION_EXCLUSION) {
        throw ApiError.conflict('La cochera ya esta reservada en esa franja horaria');
      }
      throw error;
    }

    return obtenerDetalle(client, idReserva);
  });
}

async function obtenerVehiculo(client, idVehiculo, idConductor) {
  const { rows } = await client.query(
    'SELECT id_vehiculo, id_tipo_vehiculo, patente, activo FROM vehiculo WHERE id_vehiculo = $1 AND id_conductor = $2',
    [idVehiculo, idConductor],
  );

  const vehiculo = rows[0];
  if (!vehiculo) throw ApiError.notFound('El vehiculo no existe o no pertenece al conductor');
  if (!vehiculo.activo) throw ApiError.conflict('El vehiculo esta dado de baja');
  return vehiculo;
}

/** Reserva de una cochera puntual: lock sobre esa fila y validaciones. */
async function bloquearCochera(client, idCochera, vehiculo, inicio, fin) {
  const { rows: cocheras } = await client.query(
    `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo,
            c.id_tipo_vehiculo, c.id_estacionamiento,
            e.publicado, e.activo AS estacionamiento_activo
       FROM cochera c
       JOIN estacionamiento e ON e.id_estacionamiento = c.id_estacionamiento
      WHERE c.id_cochera = $1
      FOR UPDATE OF c`,
    [idCochera],
  );

  const cochera = cocheras[0];
  if (!cochera) throw ApiError.notFound('La cochera no existe');

  if (!cochera.activo || cochera.estado_actual === ESTADOS_COCHERA.INACTIVA) {
    throw ApiError.conflict('La cochera no esta disponible para reservar');
  }
  if (!cochera.estacionamiento_activo || !cochera.publicado) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }
  if (vehiculo.id_tipo_vehiculo !== cochera.id_tipo_vehiculo) {
    throw ApiError.conflict('La cochera no admite el tipo de vehiculo seleccionado');
  }

  const { rows: solapadas } = await client.query(
    `SELECT id_reserva, inicio, fin, estado
       FROM reserva
      WHERE id_cochera = $1
        AND estado = ANY($2::estado_reserva[])
        AND inicio < $4
        AND fin > $3
      ORDER BY inicio
      LIMIT 1`,
    [idCochera, ESTADOS_VIGENTES, inicio, fin],
  );

  if (solapadas.length > 0) {
    const conflicto = solapadas[0];
    throw ApiError.conflict('La cochera ya esta reservada en esa franja horaria', {
      id_cochera: idCochera,
      reserva_en_conflicto: {
        id_reserva: conflicto.id_reserva,
        inicio: conflicto.inicio,
        fin: conflicto.fin,
        estado: conflicto.estado,
      },
    });
  }

  return cochera;
}

/**
 * Asignacion automatica. Se bloquean todas las cocheras compatibles, siempre
 * en el mismo orden (por id), y recien despues se busca la primera sin
 * solapamiento. El orden fijo evita deadlocks entre pedidos simultaneos.
 */
async function asignarCochera(client, idEstacionamiento, vehiculo, inicio, fin) {
  const { rows: estacionamientos } = await client.query(
    'SELECT publicado, activo FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const estacionamiento = estacionamientos[0];
  if (!estacionamiento) throw ApiError.notFound('El estacionamiento no existe');
  if (!estacionamiento.activo || !estacionamiento.publicado) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }

  const { rows: candidatas } = await client.query(
    `SELECT c.id_cochera
       FROM cochera c
      WHERE c.id_estacionamiento = $1
        AND c.activo
        AND c.estado_actual <> $2
        AND c.id_tipo_vehiculo = $3
      ORDER BY c.id_cochera
      FOR UPDATE`,
    [idEstacionamiento, ESTADOS_COCHERA.INACTIVA, vehiculo.id_tipo_vehiculo],
  );

  if (candidatas.length === 0) {
    throw ApiError.conflict('El estacionamiento no tiene cocheras para ese tipo de vehiculo');
  }

  const { rows: libres } = await client.query(
    `SELECT c.id_cochera, c.id_estacionamiento, c.identificador
       FROM cochera c
      WHERE c.id_cochera = ANY($1::uuid[])
        AND ${sinSolapamiento('$2', '$3', '$4')}
      ORDER BY c.identificador
      LIMIT 1`,
    [candidatas.map((c) => c.id_cochera), ESTADOS_VIGENTES, inicio, fin],
  );

  if (!libres[0]) {
    throw ApiError.conflict('No quedan cocheras libres para ese vehiculo en esa franja horaria');
  }

  return libres[0];
}

async function validarHorario(client, idEstacionamiento, inicio, fin) {
  const { rows: horarios } = await client.query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const motivo = motivoFueraDeHorario(horarios, inicio, fin);
  if (motivo) throw ApiError.conflict(motivo);
}

/** `ejecutor` es el client de una transaccion o cualquier objeto con `query`. */
async function obtenerDetalle(ejecutor, idReserva) {
  const { rows } = await ejecutor.query(`${SELECT_DETALLE} WHERE r.id_reserva = $1`, [idReserva]);
  return rows[0];
}

export async function listarPorConductor(idConductor) {
  const { rows } = await query(
    `${SELECT_DETALLE} WHERE r.id_conductor = $1 ORDER BY r.inicio DESC`,
    [idConductor],
  );
  return rows;
}

/** Reservas recibidas por un estacionamiento propio; con `fecha`, las que tocan ese dia. */
export async function listarPorEstacionamiento(idEstacionamiento, idPropietario, { fecha } = {}) {
  await asegurarPropiedad(idEstacionamiento, idPropietario);

  const condiciones = ['c.id_estacionamiento = $1'];
  const parametros = [idEstacionamiento];

  if (fecha) {
    parametros.push(instanteLocal(fecha, '00:00'), instanteLocal(sumarDias(fecha, 1), '00:00'));
    condiciones.push('r.inicio < $3 AND r.fin > $2');
  }

  const { rows } = await query(
    `${SELECT_DETALLE} WHERE ${condiciones.join(' AND ')} ORDER BY r.inicio`,
    parametros,
  );
  return rows;
}

/** El conductor cancela una reserva propia que todavia no termino. */
export async function cancelar(idReserva, idConductor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id_conductor, estado, fin FROM reserva WHERE id_reserva = $1 FOR UPDATE',
      [idReserva],
    );

    const reserva = rows[0];
    if (!reserva) throw ApiError.notFound('La reserva no existe');
    if (reserva.id_conductor !== idConductor) {
      throw ApiError.forbidden('La reserva pertenece a otro conductor');
    }
    if (!ESTADOS_VIGENTES.includes(reserva.estado)) {
      throw ApiError.conflict(`La reserva ya esta ${reserva.estado.toLowerCase()}`);
    }
    if (reserva.fin <= new Date()) {
      throw ApiError.conflict('La reserva ya termino');
    }

    await client.query('UPDATE reserva SET estado = $1 WHERE id_reserva = $2', [
      ESTADOS_RESERVA.CANCELADA,
      idReserva,
    ]);

    return obtenerDetalle(client, idReserva);
  });
}

/**
 * Franjas del dia con la cantidad de cocheras libres. `motivo` explica por
 * que una franja no se puede reservar (fuera de horario, ya empezo o sin lugar).
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo }) {
  const { rows } = await query(
    'SELECT publicado, activo FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (!rows[0].publicado || !rows[0].activo) {
    throw ApiError.conflict('El estacionamiento no esta publicado');
  }

  const { rows: horarios } = await query(
    'SELECT dia_semana, hora_apertura, hora_cierre FROM horario WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  const franjas = [];
  for (const franja of FRANJAS_ESTANDAR) {
    const inicio = instanteLocal(fecha, franja.hora_desde);
    const fin = instanteLocal(fecha, franja.hora_hasta);

    let motivo = motivoFueraDeHorario(horarios, inicio, fin);
    // Mismo margen que el validador de reservas: no se reserva lo que ya empezo.
    if (!motivo && inicio.getTime() < Date.now() - 60_000) {
      motivo = 'La franja ya empezo';
    }

    let libres = 0;
    if (!motivo) {
      const { rows: conteo } = await query(
        `SELECT COUNT(*)::int AS libres
           FROM cochera c
          WHERE c.id_estacionamiento = $1
            AND c.activo
            AND c.estado_actual <> $2
            AND ($3::smallint IS NULL OR c.id_tipo_vehiculo = $3)
            AND ${sinSolapamiento('$4', '$5', '$6')}`,
        [
          idEstacionamiento,
          ESTADOS_COCHERA.INACTIVA,
          id_tipo_vehiculo ?? null,
          ESTADOS_VIGENTES,
          inicio,
          fin,
        ],
      );
      libres = conteo[0].libres;
      if (libres === 0) motivo = 'No quedan cocheras libres en esta franja';
    }

    franjas.push({ ...franja, inicio, fin, disponible: !motivo, cocheras_libres: libres, motivo });
  }

  return { fecha, franjas };
}
