import * as vehiculoService from '../services/vehiculo.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const crear = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.crear(req.usuario.id, req.body);
  res.status(201).json({ vehiculo });
});

export const listarMios = asyncHandler(async (req, res) => {
  const vehiculos = await vehiculoService.listarPorConductor(req.usuario.id);
  res.json({ vehiculos });
});

export const actualizar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.actualizar(req.params.id, req.usuario.id, req.body);
  res.json({ vehiculo });
});

export const eliminar = asyncHandler(async (req, res) => {
  const vehiculo = await vehiculoService.darDeBaja(req.params.id, req.usuario.id);
  res.json({ vehiculo });
});

export const listarTipos = asyncHandler(async (_req, res) => {
  const tipos = await vehiculoService.listarTipos();
  res.json({ tipos });
});
