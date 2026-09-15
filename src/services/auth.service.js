import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { firmarToken } from '../utils/jwt.js';

const CAMPOS_PUBLICOS = `
  id_usuario, nombre, apellido, email, rol, telefono, activo, created_at
`;

const VIOLACION_UNIQUE = '23505';

export async function registrar({ nombre, apellido, email, password, rol, telefono = null }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);

  let usuario;
  try {
    const { rows } = await query(
      `INSERT INTO usuario (nombre, apellido, email, password_hash, rol, telefono)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CAMPOS_PUBLICOS}`,
      [nombre, apellido, email, passwordHash, rol, telefono],
    );
    usuario = rows[0];
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict('Ya existe un usuario registrado con ese email');
    }
    throw error;
  }

  return { usuario, token: firmarToken(usuario) };
}

export async function login({ email, password }) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PUBLICOS}, password_hash FROM usuario WHERE email = $1`,
    [email],
  );

  const usuario = rows[0];

  // Se compara igual cuando el usuario no existe para no filtrar por tiempo
  // que emails estan registrados.
  const hash = usuario?.password_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const coincide = await bcrypt.compare(password, hash);

  if (!usuario || !coincide) {
    throw ApiError.unauthorized('Email o contrasena incorrectos');
  }

  if (!usuario.activo) {
    throw ApiError.forbidden('El usuario esta dado de baja');
  }

  delete usuario.password_hash;
  return { usuario, token: firmarToken(usuario) };
}

export async function obtenerPerfil(idUsuario) {
  const { rows } = await query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = $1`,
    [idUsuario],
  );

  if (!rows[0]) throw ApiError.notFound('Usuario no encontrado');
  return rows[0];
}
