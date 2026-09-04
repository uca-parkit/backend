import { ESTADOS_COCHERA } from '../utils/roles.js';
import { campos } from './helpers.js';

export function validarEstacionamiento(body) {
  const validador = campos(body)
    .texto('nombre', body.nombre, { min: 3, max: 120 })
    .texto('direccion', body.direccion, { min: 5, max: 200 })
    .texto('barrio_zona', body.barrio_zona, { requerido: false, max: 120 })
    .numero('latitud', body.latitud, { requerido: false, min: -90, max: 90 })
    .numero('longitud', body.longitud, { requerido: false, min: -180, max: 180 })
    .texto('telefono_contacto', body.telefono_contacto, { requerido: false, max: 30 })
    .email('email_contacto', body.email_contacto, { requerido: false })
    .numero('tarifa_hora', body.tarifa_hora, { requerido: false, min: 0, default: 0 })
    .booleano('publicado', body.publicado, { requerido: false, default: false });

  const { valores, errores } = validador.resultado();
  valores.horarios = validarHorarios(body.horarios, errores);

  return { valores, errores };
}

/** Los horarios son opcionales y se cargan junto con el estacionamiento. */
function validarHorarios(horarios, errores) {
  if (horarios === undefined || horarios === null) return [];

  if (!Array.isArray(horarios)) {
    errores.push({ campo: 'horarios', mensaje: 'debe ser un arreglo' });
    return [];
  }

  const diasUsados = new Set();
  const normalizados = [];

  horarios.forEach((horario, indice) => {
    const { valores, errores: erroresHorario } = campos(horario ?? {})
      .entero('dia_semana', horario?.dia_semana, { min: 0, max: 6 })
      .hora('hora_apertura', horario?.hora_apertura)
      .hora('hora_cierre', horario?.hora_cierre)
      .resultado();

    erroresHorario.forEach((error) => {
      errores.push({ campo: `horarios[${indice}].${error.campo}`, mensaje: error.mensaje });
    });

    if (erroresHorario.length > 0) return;

    if (valores.hora_cierre <= valores.hora_apertura) {
      errores.push({
        campo: `horarios[${indice}].hora_cierre`,
        mensaje: 'debe ser posterior a hora_apertura',
      });
      return;
    }

    if (diasUsados.has(valores.dia_semana)) {
      errores.push({
        campo: `horarios[${indice}].dia_semana`,
        mensaje: 'ya hay otro horario cargado para ese dia',
      });
      return;
    }

    diasUsados.add(valores.dia_semana);
    normalizados.push(valores);
  });

  return normalizados;
}

export function validarCochera(body) {
  return campos(body)
    .texto('identificador', body.identificador, { min: 1, max: 20 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { min: 1 })
    .enumerado('estado_actual', body.estado_actual, Object.values(ESTADOS_COCHERA), {
      requerido: false,
      default: ESTADOS_COCHERA.LIBRE,
    })
    .resultado();
}

/** Filtros de GET /api/estacionamientos. Todo opcional. */
export function validarBusqueda(query) {
  return campos(query)
    .texto('q', query.q, { requerido: false, max: 120 })
    .texto('zona', query.zona, { requerido: false, max: 120 })
    .entero('id_tipo_vehiculo', query.id_tipo_vehiculo, { requerido: false, min: 1 })
    .numero('tarifa_max', query.tarifa_max, { requerido: false, min: 0 })
    .entero('limit', query.limit, { requerido: false, min: 1, max: 100, default: 20 })
    .entero('offset', query.offset, { requerido: false, min: 0, default: 0 })
    .resultado();
}
