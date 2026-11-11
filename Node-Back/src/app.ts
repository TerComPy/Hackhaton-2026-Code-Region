import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';
import { vacanciesRouter } from './routes/vacancies.js';
import { aiSummaryRouter } from './routes/ai-summary.js';
import { favoritesRouter } from './routes/favorites.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map(x => x.trim()) }));
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '256kb' }));
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/vacancies', aiSummaryRouter);
app.use('/api/vacancies', vacanciesRouter);
app.use('/api/favorites', favoritesRouter);
app.use(notFound);
app.use(errorHandler);

