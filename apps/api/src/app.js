import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { eventInput, shipmentInput, trackingPattern, tokenMatches, HttpError } from './domain.js';

export function createApp({
  store,
  adminToken,
  trustProxy = false,
  logger = console,
  rateLimitMax = 120,
}) {
  const app = express();
  app.disable('x-powered-by');
  // ALB sends exactly one trusted forwarding hop; direct API Service is private.
  app.set('trust proxy', trustProxy ? 1 : false);
  app.use(helmet());
  app.use((req, res, next) => {
    const started = Date.now();
    req.requestId = randomUUID();
    res.setHeader('X-Request-ID', req.requestId);
    res.on('finish', () => {
      if (req.path === '/healthz' || req.path === '/readyz') return;
      logger.info(
        JSON.stringify({
          level: 'info',
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || 'unmatched',
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      );
    });
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try {
      await store.ready();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: '8kb' }));
  const admin = (req, _res, next) => {
    const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!tokenMatches(match?.[1], adminToken))
      return next(new HttpError(401, 'Operator token required'));
    next();
  };
  app.param('trackingNumber', (req, _res, next, value) => {
    if (!trackingPattern.test(value)) return next(new HttpError(400, 'Invalid tracking number'));
    next();
  });
  app.get('/api/shipments/:trackingNumber', async (req, res) =>
    res.json(await store.get(req.params.trackingNumber)),
  );
  app.get('/api/shipments', admin, async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ shipments: await store.list(), limit: 100 });
  });
  app.post('/api/shipments', admin, async (req, res) => {
    const shipment = await store.create(shipmentInput.parse(req.body));
    res.status(201).location(`/api/shipments/${shipment.trackingNumber}`).json(shipment);
  });
  app.post('/api/shipments/:trackingNumber/events', admin, async (req, res) => {
    res
      .status(201)
      .json(await store.addEvent(req.params.trackingNumber, eventInput.parse(req.body)));
  });
  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));
  app.use((error, req, res, _next) => {
    const status = error instanceof ZodError ? 400 : error.status || 500;
    if (status >= 500)
      logger.error(
        JSON.stringify({
          level: 'error',
          requestId: req.requestId,
          message: 'Request failed',
          code: error.code || 'INTERNAL',
        }),
      );
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? 'Internal server error'
            : error instanceof ZodError
              ? 'Invalid request data'
              : error.message,
        requestId: req.requestId,
      });
  });
  return app;
}
