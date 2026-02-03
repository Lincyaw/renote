import express from 'express';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';

export function createHttpServer() {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/token', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${CONFIG.authToken}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json({ token: CONFIG.authToken });
  });

  const httpPort = CONFIG.port + 1;
  app.listen(httpPort, CONFIG.host, () => {
    logger.info(`HTTP server running on ${CONFIG.host}:${httpPort}`);
  });

  return app;
}
