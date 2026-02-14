import express from 'express';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

function authenticateRequest(req: express.Request): boolean {
  const token = req.query.token as string | undefined;
  if (token && token === CONFIG.authToken) return true;
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${CONFIG.authToken}`) return true;
  return !CONFIG.authToken; // allow if no token configured
}

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

  // File serving endpoint for PDF/image preview
  app.get('/api/file', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!authenticateRequest(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }

    const resolved = path.resolve(filePath);
    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
      res.status(400).json({ error: 'Unsupported file type' });
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (stat.size > CONFIG.maxFileSize) {
      res.status(413).json({ error: 'File too large' });
      return;
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(resolved).pipe(res);
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
