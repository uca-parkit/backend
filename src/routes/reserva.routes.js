import { Router } from 'express';

import * as reservaController from '../controllers/reserva.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarReserva } from '../validators/reserva.validator.js';

const router = Router();

router.post(
  '/',
  authenticate,
  requireRole(ROLES.CONDUCTOR),
  validate(validarReserva),
  reservaController.crear,
);

router.get('/', authenticate, requireRole(ROLES.CONDUCTOR), reservaController.listarMias);

export default router;
