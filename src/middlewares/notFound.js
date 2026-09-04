import { ApiError } from '../utils/ApiError.js';

// Se ejecuta cuando ninguna ruta hizo match.
export function notFound(req, _res, next) {
  next(ApiError.notFound(`No existe la ruta ${req.method} ${req.originalUrl}`));
}
