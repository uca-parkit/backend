import { query, withTransaction } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

const COLUMNAS = [
  'id_estacionamiento', 'id_propietario', 'nombre', 'direccion', 'barrio_zona',
  'latitud', 'longitud', 'telefono_contacto', 'email_contacto', 'tarifa_hora',
  'publicado', 'activo',
];

const CAMPOS = COLUMNAS.join(', ');
const CAMPOS_E = COLUMNAS.map((columna) => `e.${columna}`).join(', ');

/** Crea el estacionamiento y sus horarios en una sola transaccion. */
export async function crear(idPropietario, datos) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO estacionamiento
         (id_propietario, nombre, direccion, barrio_zona, latitud, longitud,
          telefono_contacto, email_contacto, tarifa_hora, publicado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${CAMPOS}`,
      [
        idPropietario,
        datos.nombre,
        datos.direccion,
        datos.barrio_zona ?? null,
        datos.latitud ?? null,
        datos.longitud ?? null,
        datos.telefono_contacto ?? null,
        datos.email_contacto ?? null,
        datos.tarifa_hora ?? 0,
        datos.publicado ?? false,
      ],
    );

    const estacionamiento = rows[0];
    estacionamiento.horarios = [];

    for (const horario of datos.horarios ?? []) {
      const { rows: filas } = await client.query(
        `INSERT INTO horario (id_estacionamiento, dia_semana, hora_apertura, hora_cierre)
         VALUES ($1, $2, $3, $4)
         RETURNING id_horario, dia_semana, hora_apertura, hora_cierre`,
        [
          estacionamiento.id_estacionamiento,
          horario.dia_semana,
          horario.hora_apertura,
          horario.hora_cierre,
        ],
      );
      estacionamiento.horarios.push(filas[0]);
    }

    return estacionamiento;
  });
}

/**
 * Busqueda publica: solo estacionamientos publicados y activos.
 * Devuelve la cantidad de cocheras activas para poder comparar opciones.
 */
export async function buscar(filtros) {
  const condiciones = ['e.publicado = TRUE', 'e.activo = TRUE'];
  const parametros = [];

  if (filtros.q) {
    parametros.push(`%${filtros.q}%`);
    condiciones.push(`(e.nombre ILIKE $${parametros.length} OR e.direccion ILIKE $${parametros.length})`);
  }

  if (filtros.zona) {
    parametros.push(`%${filtros.zona}%`);
    condiciones.push(`e.barrio_zona ILIKE $${parametros.length}`);
  }

  if (filtros.tarifa_max !== undefined) {
    parametros.push(filtros.tarifa_max);
    condiciones.push(`e.tarifa_hora <= $${parametros.length}`);
  }

  if (filtros.id_tipo_vehiculo !== undefined) {
    parametros.push(filtros.id_tipo_vehiculo);
    condiciones.push(`EXISTS (
      SELECT 1 FROM cochera ct
      WHERE ct.id_estacionamiento = e.id_estacionamiento
        AND ct.activo = TRUE
        AND ct.id_tipo_vehiculo = $${parametros.length}
    )`);
  }

  parametros.push(filtros.limit, filtros.offset);

  // Subqueries en vez de JOIN + GROUP BY: asi los conteos de cocheras y los
  // horarios no se multiplican entre si y cada uno cuenta lo suyo.
  const { rows } = await query(
    `SELECT ${CAMPOS_E},
            (SELECT COUNT(*) FROM cochera c
              WHERE c.id_estacionamiento = e.id_estacionamiento
                AND c.activo)::int AS cocheras_activas,
            (SELECT COUNT(*) FROM cochera c
              WHERE c.id_estacionamiento = e.id_estacionamiento
                AND c.activo AND c.estado_actual = 'LIBRE')::int AS cocheras_libres,
            COALESCE((
              SELECT json_agg(
                       json_build_object(
                         'dia_semana', h.dia_semana,
                         'hora_apertura', h.hora_apertura,
                         'hora_cierre', h.hora_cierre)
                       ORDER BY h.dia_semana)
                FROM horario h
               WHERE h.id_estacionamiento = e.id_estacionamiento
            ), '[]'::json) AS horarios
       FROM estacionamiento e
      WHERE ${condiciones.join(' AND ')}
      ORDER BY e.nombre
      LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
    parametros,
  );

  return rows;
}

// Zona fija de Argentina (sin horario de verano), igual que el front al armar
// los instantes de las reservas. Asi las franjas y las reservas se comparan bien.
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

// Franjas que se le ofrecen al conductor (coinciden con FRANJAS_ESTANDAR del front).
const FRANJAS = [
  { desde: '08:00', hasta: '10:00' },
  { desde: '10:00', hasta: '13:00' },
  { desde: '13:00', hasta: '17:00' },
  { desde: '17:00', hasta: '21:00' },
];

/**
 * Disponibilidad por franja para una fecha: cuantas cocheras (del tipo pedido)
 * quedan libres en cada tramo, cruzando el horario de atencion con las reservas
 * vigentes que se solapan.
 */
export async function disponibilidad(idEstacionamiento, { fecha, id_tipo_vehiculo = null }) {
  const { rows: existe } = await query(
    'SELECT 1 FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );
  if (!existe[0]) throw ApiError.notFound('Estacionamiento no encontrado');

  const valoresFranjas = FRANJAS.map((f) => `('${f.desde}'::time, '${f.hasta}'::time)`).join(', ');

  const { rows } = await query(
    `WITH horario_dia AS (
       SELECT hora_apertura, hora_cierre
         FROM horario
        WHERE id_estacionamiento = $1
          AND dia_semana = EXTRACT(DOW FROM $2::date)::int
        LIMIT 1
     ),
     cocheras_tipo AS (
       SELECT id_cochera
         FROM cochera
        WHERE id_estacionamiento = $1
          AND activo
          AND estado_actual <> 'INACTIVA'
          AND ($3::smallint IS NULL OR id_tipo_vehiculo = $3::smallint)
     ),
     franjas(hora_desde, hora_hasta) AS ( VALUES ${valoresFranjas} )
     SELECT to_char(f.hora_desde, 'HH24:MI') AS hora_desde,
            to_char(f.hora_hasta, 'HH24:MI') AS hora_hasta,
            (SELECT count(*) FROM cocheras_tipo)::int AS total,
            (SELECT count(*) FROM cocheras_tipo ct
              WHERE EXISTS (
                SELECT 1 FROM reserva r
                 WHERE r.id_cochera = ct.id_cochera
                   AND r.estado IN ('PENDIENTE', 'CONFIRMADA')
                   AND r.inicio < (($2 || ' ' || f.hora_hasta::text)::timestamp AT TIME ZONE $4)
                   AND r.fin    > (($2 || ' ' || f.hora_desde::text)::timestamp AT TIME ZONE $4)
              ))::int AS ocupadas,
            (SELECT to_char(hora_apertura, 'HH24:MI') FROM horario_dia) AS apertura,
            (SELECT to_char(hora_cierre,   'HH24:MI') FROM horario_dia) AS cierre
       FROM franjas f
      ORDER BY f.hora_desde`,
    [idEstacionamiento, fecha, id_tipo_vehiculo, ZONA_HORARIA],
  );

  const ahora = Date.now();

  return rows.map((r) => {
    const libres = Math.max(0, r.total - r.ocupadas);
    const cerrado = r.apertura === null;
    const dentroHorario = !cerrado && r.apertura <= r.hora_desde && r.hora_hasta <= r.cierre;
    // Offset fijo -03:00: la franja ya paso si su inicio quedo atras en el tiempo.
    const yaPaso = new Date(`${fecha}T${r.hora_desde}:00-03:00`).getTime() <= ahora;

    let disponible = false;
    let motivo = null;
    let cocheras_libres = 0;

    if (cerrado) {
      motivo = 'El estacionamiento no atiende ese dia';
    } else if (!dentroHorario) {
      motivo = 'Fuera del horario de atencion';
    } else if (yaPaso) {
      motivo = 'El horario ya paso';
    } else if (r.total === 0) {
      motivo = 'No hay cocheras para el tipo de vehiculo seleccionado';
    } else if (libres === 0) {
      motivo = 'Sin lugares en esa franja';
    } else {
      disponible = true;
      cocheras_libres = libres;
    }

    return { hora_desde: r.hora_desde, hora_hasta: r.hora_hasta, disponible, cocheras_libres, motivo };
  });
}

export async function obtenerPorId(idEstacionamiento) {
  const { rows } = await query(
    `SELECT ${CAMPOS} FROM estacionamiento WHERE id_estacionamiento = $1`,
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');

  const estacionamiento = rows[0];

  const [{ rows: horarios }, { rows: cocheras }] = await Promise.all([
    query(
      `SELECT id_horario, dia_semana, hora_apertura, hora_cierre
         FROM horario WHERE id_estacionamiento = $1 ORDER BY dia_semana`,
      [idEstacionamiento],
    ),
    query(
      `SELECT c.id_cochera, c.identificador, c.estado_actual, c.activo,
              c.id_tipo_vehiculo, t.nombre AS tipo_vehiculo
         FROM cochera c
         JOIN tipo_vehiculo t ON t.id_tipo_vehiculo = c.id_tipo_vehiculo
        WHERE c.id_estacionamiento = $1
        ORDER BY c.identificador`,
      [idEstacionamiento],
    ),
  ]);

  estacionamiento.horarios = horarios;
  estacionamiento.cocheras = cocheras;
  return estacionamiento;
}

/** Verifica que el estacionamiento exista y sea del propietario autenticado. */
export async function asegurarPropiedad(idEstacionamiento, idPropietario) {
  const { rows } = await query(
    'SELECT id_estacionamiento, id_propietario FROM estacionamiento WHERE id_estacionamiento = $1',
    [idEstacionamiento],
  );

  if (!rows[0]) throw ApiError.notFound('Estacionamiento no encontrado');
  if (rows[0].id_propietario !== idPropietario) {
    throw ApiError.forbidden('El estacionamiento pertenece a otro propietario');
  }

  return rows[0];
}

export async function listarPorPropietario(idPropietario) {
  const { rows } = await query(
    `SELECT ${CAMPOS} FROM estacionamiento WHERE id_propietario = $1 ORDER BY nombre`,
    [idPropietario],
  );
  return rows;
}
