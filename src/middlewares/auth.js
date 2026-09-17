import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { verificarToken } from '../utils/jwt.js';

/**
 * Valida el header `Authorization: Bearer <token>` y deja el usuario
 * autenticado en `req.usuario` ({ id, rol }).
 *
 * Ademas confirma contra la base que la cuenta siga activa y que el perfil del
 * token siga habilitado: un token viejo no tiene que servir despues de una baja
 * o de un cambio de perfiles.
 */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Falta el header Authorization: Bearer <token>'));
  }

  let payload;
  try {
    payload = verificarToken(token);
  } catch {
    return next(ApiError.unauthorized('Token invalido o expirado'));
  }

  try {
    const { rows } = await query(
      'SELECT activo, roles::text[] AS roles FROM usuario WHERE id_usuario = $1',
      [payload.sub],
    );

    const usuario = rows[0];
    if (!usuario || !usuario.activo) {
      return next(ApiError.unauthorized('La cuenta ya no esta activa'));
    }
    if (!usuario.roles.includes(payload.rol)) {
      return next(ApiError.unauthorized('El perfil de la sesion ya no esta habilitado'));
    }

    req.usuario = { id: payload.sub, rol: payload.rol };
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Restringe la ruta a los roles indicados. Usar siempre despues de authenticate. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) {
      return next(ApiError.unauthorized());
    }
    if (!roles.includes(req.usuario.rol)) {
      return next(ApiError.forbidden(`Esta accion requiere el rol: ${roles.join(' o ')}`));
    }
    return next();
  };
}
