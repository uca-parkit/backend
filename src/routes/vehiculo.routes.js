import { Router } from 'express';

import * as vehiculoController from '../controllers/vehiculo.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarVehiculo } from '../validators/vehiculo.validator.js';

const router = Router();

router.get('/tipos', vehiculoController.listarTipos);

router.post(
  '/',
  authenticate,
  requireRole(ROLES.CONDUCTOR),
  validate(validarVehiculo),
  vehiculoController.crear,
);

router.get('/', authenticate, requireRole(ROLES.CONDUCTOR), vehiculoController.listarMios);

export default router;
