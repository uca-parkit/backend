import { Router } from 'express';

import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { validarCambioRol, validarLogin, validarRegistro } from '../validators/auth.validator.js';

const router = Router();

router.post('/register', validate(validarRegistro), authController.register);
router.post('/login', validate(validarLogin), authController.login);
router.get('/me', authenticate, authController.perfil);
router.post('/rol', authenticate, validate(validarCambioRol), authController.cambiarRol);

export default router;
