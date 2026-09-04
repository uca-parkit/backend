import * as reservaService from '../services/reserva.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const crear = asyncHandler(async (req, res) => {
  const reserva = await reservaService.crear(req.usuario.id, req.body);
  res.status(201).json({ reserva });
});

export const listarMias = asyncHandler(async (req, res) => {
  const reservas = await reservaService.listarPorConductor(req.usuario.id);
  res.json({ reservas });
});
