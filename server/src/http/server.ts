import express from 'express';
import path from 'path';
import fs from 'fs';
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

  // Serve web client static files
  const webDistPath = process.env.WEB_DIST_PATH
    || path.join(__dirname, '../../web-dist');

  if (fs.existsSync(webDistPath)) {
    logger.info(`Serving web client from ${webDistPath}`);
    app.use(express.static(webDistPath));
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  const httpPort = CONFIG.port + 1;
  app.listen(httpPort, CONFIG.host, () => {
    logger.info(`HTTP server running on ${CONFIG.host}:${httpPort}`);
  });

  return app;
}
