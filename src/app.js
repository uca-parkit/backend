import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { config } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import estacionamientoRoutes from './routes/estacionamiento.routes.js';
import reservaRoutes from './routes/reserva.routes.js';
import vehiculoRoutes from './routes/vehiculo.routes.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Railway y cualquier PaaS ponen un proxy delante: sin esto req.ip y el
// protocolo llegan mal.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv !== 'test') {
  app.use(morgan(config.isProduction ? 'combined' : 'dev'));
}

const { apiPrefix } = config;

app.get(`${apiPrefix}/health`, (_req, res) => res.json({ status: 'ok', servicio: 'UCAio API' }));

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/estacionamientos`, estacionamientoRoutes);
app.use(`${apiPrefix}/vehiculos`, vehiculoRoutes);
app.use(`${apiPrefix}/reservas`, reservaRoutes);

// Manejo de errores (siempre al final)
app.use(notFound);
app.use(errorHandler);

export default app;
