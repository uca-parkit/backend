// Variables de entorno centralizadas.
// En desarrollo se cargan con `node --env-file=.env` (ver script "dev").
// En Railway las inyecta la plataforma.

function requerido(nombre, valor) {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Copiala desde .env.example y volve a levantar el servidor.`,
    );
  }
  return valor;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api',

  db: {
    // Opcional mientras no haya base: sin DATABASE_URL la API arranca igual,
    // solo funciona el login del admin hardcodeado y el resto responde 503.
    url: process.env.DATABASE_URL || null,
    // Railway (y la mayoria de los proveedores administrados) usan certificados
    // que no estan en el store local, por eso rejectUnauthorized: false.
    ssl: (process.env.DATABASE_SSL ?? (nodeEnv === 'production' ? 'true' : 'false')) === 'true',
    poolMax: Number(process.env.DATABASE_POOL_MAX) || 10,
  },

  jwt: {
    secret: requerido('JWT_SECRET', process.env.JWT_SECRET),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};
