import { ApiError } from '../utils/ApiError.js';

/**
 * Corre un validador sobre `req[origen]` y reemplaza el contenido por los datos
 * ya normalizados. El validador devuelve { valores, errores }.
 */
export function validate(validador, origen = 'body') {
  return (req, _res, next) => {
    const { valores, errores } = validador(req[origen] ?? {});

    if (errores.length > 0) {
      return next(ApiError.badRequest('Datos invalidos', errores));
    }

    // En Express 5 `req.query` es un getter sin setter: no se puede asignar
    // directamente, hay que redefinir la propiedad sobre la instancia.
    if (origen === 'query') {
      Object.defineProperty(req, 'query', {
        value: valores,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[origen] = valores;
    }

    return next();
  };
}
