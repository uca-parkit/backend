import bcrypt from 'bcrypt';

import { config } from '../config/env.js';
import { hayBaseDeDatos, query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';
import { firmarToken } from '../utils/jwt.js';
import { ROLES } from '../utils/roles.js';

const CAMPOS_PUBLICOS = `
  id_usuario, nombre, apellido, email, rol, telefono, activo, created_at
`;

const VIOLACION_UNIQUE = '23505';

// TEMPORAL: credenciales fijas para poder entrar mientras no haya base.
// Solo se aceptan en modo sin base; al configurar DATABASE_URL dejan de funcionar.
// Tiene los dos perfiles y puede alternar entre ellos con POST /auth/rol.
const ADMIN_HARDCODEADO = Object.freeze({
  email: 'admin@gmail.com',
  password: 'admin123',
  usuario: {
    id_usuario: 'admin',
    nombre: 'Admin',
    apellido: 'UCAio',
    email: 'admin@gmail.com',
    rol: ROLES.PROPIETARIO,
    roles: [ROLES.CONDUCTOR, ROLES.PROPIETARIO],
    telefono: null,
    activo: true,
    created_at: null,
  },
});

const esAdminHardcodeado = (idUsuario) =>
  !hayBaseDeDatos && idUsuario === ADMIN_HARDCODEADO.usuario.id_usuario;

/** Los usuarios de la base tienen un unico rol: `roles` es la lista de perfiles habilitados. */
const conRoles = (usuario) => ({ ...usuario, roles: usuario.roles ?? [usuario.rol] });

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
    usuario = conRoles(rows[0]);
  } catch (error) {
    if (error.code === VIOLACION_UNIQUE) {
      throw ApiError.conflict('Ya existe un usuario registrado con ese email');
    }
    throw error;
  }

  return { usuario, token: firmarToken(usuario) };
}

export async function login({ email, password }) {
  if (!hayBaseDeDatos) {
    if (email !== ADMIN_HARDCODEADO.email || password !== ADMIN_HARDCODEADO.password) {
      throw ApiError.unauthorized('Email o contrasena incorrectos');
    }
    const usuario = structuredClone(ADMIN_HARDCODEADO.usuario);
    return { usuario, token: firmarToken(usuario) };
  }

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
  return { usuario: conRoles(usuario), token: firmarToken(usuario) };
}

/** Perfil del usuario con `rol` = el perfil activo del token. */
export async function obtenerPerfil(idUsuario, rolActivo) {
  if (esAdminHardcodeado(idUsuario)) {
    return { ...structuredClone(ADMIN_HARDCODEADO.usuario), rol: rolActivo };
  }

  const { rows } = await query(
    `SELECT ${CAMPOS_PUBLICOS} FROM usuario WHERE id_usuario = $1`,
    [idUsuario],
  );

  if (!rows[0]) throw ApiError.notFound('Usuario no encontrado');
  return conRoles(rows[0]);
}

/** Cambia el perfil activo: devuelve un token nuevo firmado con ese rol. */
export async function cambiarRol(idUsuario, rolActivo, rolNuevo) {
  const usuario = await obtenerPerfil(idUsuario, rolActivo);

  if (!usuario.roles.includes(rolNuevo)) {
    throw ApiError.forbidden(`El usuario no tiene habilitado el perfil ${rolNuevo}`);
  }

  usuario.rol = rolNuevo;
  return { usuario, token: firmarToken(usuario) };
}
