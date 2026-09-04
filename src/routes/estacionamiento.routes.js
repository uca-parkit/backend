import { Router } from 'express';

import * as estacionamientoController from '../controllers/estacionamiento.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import {
  validarBusqueda,
  validarCochera,
  validarEstacionamiento,
} from '../validators/estacionamiento.validator.js';

const router = Router();

// Publico: busqueda y detalle de estacionamientos publicados.
router.get('/', validate(validarBusqueda, 'query'), estacionamientoController.buscar);

// Propietario: sus estacionamientos. Va antes de '/:id' para que no lo capture.
router.get(
  '/mios',
  authenticate,
  requireRole(ROLES.PROPIETARIO),
  estacionamientoController.listarMios,
);

router.get('/:id', estacionamientoController.obtener);
router.get('/:id/cocheras', estacionamientoController.listarCocheras);

// Propietario: alta de estacionamientos y cocheras.
router.post(
  '/',
  authenticate,
  requireRole(ROLES.PROPIETARIO),
  validate(validarEstacionamiento),
  estacionamientoController.crear,
);

router.post(
  '/:id/cocheras',
  authenticate,
  requireRole(ROLES.PROPIETARIO),
  validate(validarCochera),
  estacionamientoController.crearCochera,
);

export default router;
