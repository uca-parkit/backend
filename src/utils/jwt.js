import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';

/** Firma el token con lo minimo necesario para autorizar: id y rol. */
export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id_usuario, rol: usuario.rol },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

/** Devuelve el payload o lanza si el token es invalido/expiro. */
export function verificarToken(token) {
  return jwt.verify(token, config.jwt.secret);
}
