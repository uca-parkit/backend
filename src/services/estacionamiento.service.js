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

  const { rows } = await query(
    `SELECT ${CAMPOS_E},
            COUNT(c.id_cochera) FILTER (WHERE c.activo)::int AS cocheras_activas
       FROM estacionamiento e
       LEFT JOIN cochera c ON c.id_estacionamiento = e.id_estacionamiento
      WHERE ${condiciones.join(' AND ')}
      GROUP BY e.id_estacionamiento
      ORDER BY e.nombre
      LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
    parametros,
  );

  return rows;
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
