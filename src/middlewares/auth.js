import { ApiError } from '../utils/ApiError.js';
import { verificarToken } from '../utils/jwt.js';

/**
 * Valida el header `Authorization: Bearer <token>` y deja el usuario
 * autenticado en `req.usuario` ({ id, rol }).
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [esquema, token] = header.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Falta el header Authorization: Bearer <token>'));
  }

  try {
    const payload = verificarToken(token);
    req.usuario = { id: payload.sub, rol: payload.rol };
    return next();
  } catch {
    return next(ApiError.unauthorized('Token invalido o expirado'));
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
