import * as estacionamientoService from '../services/estacionamiento.service.js';
import * as cocheraService from '../services/cochera.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const crear = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.crear(req.usuario.id, req.body);
  res.status(201).json({ estacionamiento });
});

export const buscar = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.buscar(req.query);
  res.json({
    estacionamientos,
    paginacion: {
      limit: req.query.limit,
      offset: req.query.offset,
      cantidad: estacionamientos.length,
    },
  });
});

export const obtener = asyncHandler(async (req, res) => {
  const estacionamiento = await estacionamientoService.obtenerPorId(req.params.id);
  res.json({ estacionamiento });
});

export const disponibilidad = asyncHandler(async (req, res) => {
  const franjas = await estacionamientoService.disponibilidad(req.params.id, req.query);
  res.json({ franjas });
});

export const listarMios = asyncHandler(async (req, res) => {
  const estacionamientos = await estacionamientoService.listarPorPropietario(req.usuario.id);
  res.json({ estacionamientos });
});

export const crearCochera = asyncHandler(async (req, res) => {
  const cochera = await cocheraService.crear(req.params.id, req.usuario.id, req.body);
  res.status(201).json({ cochera });
});

export const listarCocheras = asyncHandler(async (req, res) => {
  const cocheras = await cocheraService.listarPorEstacionamiento(req.params.id);
  res.json({ cocheras });
});
