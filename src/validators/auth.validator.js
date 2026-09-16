import { ROLES } from '../utils/roles.js';
import { campos } from './helpers.js';

export function validarRegistro(body) {
  return campos(body)
    .texto('nombre', body.nombre, { min: 2, max: 80 })
    .texto('apellido', body.apellido, { min: 2, max: 80 })
    .email('email', body.email)
    // bcrypt ignora lo que pase de 72 bytes, por eso el tope.
    .texto('password', body.password, { min: 8, max: 72 })
    .enumerado('rol', body.rol, Object.values(ROLES))
    .texto('telefono', body.telefono, { requerido: false, max: 30 })
    .resultado();
}

export function validarLogin(body) {
  return campos(body)
    .email('email', body.email)
    .texto('password', body.password, { min: 1, max: 72 })
    .resultado();
}
