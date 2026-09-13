import { Router } from 'express';

import * as reservaController from '../controllers/reserva.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { ROLES } from '../utils/roles.js';
import { validarReserva } from '../validators/reserva.validator.js';

const router = Router();

const soloConductor = [authenticate, requireRole(ROLES.CONDUCTOR)];

router.post('/', ...soloConductor, validate(validarReserva), reservaController.crear);

router.get('/', ...soloConductor, reservaController.listarMias);

router.patch('/:id/cancelar', ...soloConductor, reservaController.cancelar);

export default router;
