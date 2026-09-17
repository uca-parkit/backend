// Error de aplicacion con status HTTP, para que el errorHandler
// sepa que respuesta devolver.

export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Solicitud invalida', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'No autenticado') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'No autorizado') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Recurso no encontrado') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflicto con el estado actual del recurso', details) {
    return new ApiError(409, message, details);
  }
}
