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
