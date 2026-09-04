// Envuelve un controller async para que los errores lleguen al errorHandler
// sin tener que escribir try/catch en cada uno.

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
