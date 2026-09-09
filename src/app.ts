import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { ENV } from './config/env';

const app: Application = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: ENV.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ['Authorization'],
  })
);
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (ENV.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/v1', routes);

// Fallback route
app.get('/', (_req, res) => {
  res.json({
    name: 'W-Spread API',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// 404 & Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
