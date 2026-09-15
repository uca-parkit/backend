import { campos } from './helpers.js';

export function validarReserva(body) {
  const validador = campos(body)
    // El backend elige la cochera: el conductor reserva contra el estacionamiento.
    .uuid('id_estacionamiento', body.id_estacionamiento)
    .uuid('id_vehiculo', body.id_vehiculo)
    .fechaHora('inicio', body.inicio)
    .fechaHora('fin', body.fin);

  const { valores, errores } = validador.resultado();

  if (valores.inicio && valores.fin) {
    if (valores.fin <= valores.inicio) {
      errores.push({ campo: 'fin', mensaje: 'debe ser posterior a inicio' });
    }
    if (valores.inicio.getTime() < Date.now() - 60_000) {
      errores.push({ campo: 'inicio', mensaje: 'no puede estar en el pasado' });
    }
  }

  return { valores, errores };
}
