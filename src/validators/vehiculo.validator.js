import { campos } from './helpers.js';

export function validarVehiculo(body) {
  const validador = campos(body)
    .texto('patente', body.patente, { min: 5, max: 12 })
    .entero('id_tipo_vehiculo', body.id_tipo_vehiculo, { min: 1 })
    .texto('marca', body.marca, { requerido: false, max: 60 })
    .texto('modelo', body.modelo, { requerido: false, max: 60 });

  const resultado = validador.resultado();

  // La patente se guarda normalizada para que el UNIQUE sea real.
  if (resultado.valores.patente) {
    resultado.valores.patente = resultado.valores.patente.toUpperCase().replace(/\s+/g, '');
  }

  return resultado;
}
