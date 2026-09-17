import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const register = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.registrar(req.body);
  res.status(201).json({ usuario, token });
});

export const login = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.login(req.body);
  res.json({ usuario, token });
});

export const perfil = asyncHandler(async (req, res) => {
  const usuario = await authService.obtenerPerfil(req.usuario.id);
  res.json({ usuario });
});

export const cambiarRol = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.cambiarRol(req.usuario.id, req.body.rol);
  res.json({ usuario, token });
});

export const actualizarPerfil = asyncHandler(async (req, res) => {
  const { usuario, token } = await authService.actualizarPerfil(req.usuario.id, req.body);
  res.json({ usuario, token });
});

export const eliminarCuenta = asyncHandler(async (req, res) => {
  await authService.eliminarCuenta(req.usuario.id);
  res.status(204).end();
});
