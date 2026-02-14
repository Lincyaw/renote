"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpServer = createHttpServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
const MIME_TYPES = {
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
function authenticateRequest(req) {
    const token = req.query.token;
    if (token && token === config_1.CONFIG.authToken)
        return true;
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${config_1.CONFIG.authToken}`)
        return true;
    return !config_1.CONFIG.authToken; // allow if no token configured
}
function createHttpServer() {
    const app = (0, express_1.default)();
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });
    app.get('/token', (req, res) => {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${config_1.CONFIG.authToken}`) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        res.json({ token: config_1.CONFIG.authToken });
    });
    // File serving endpoint for PDF/image preview
    app.get('/api/file', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (!authenticateRequest(req)) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const filePath = req.query.path;
        if (!filePath) {
            res.status(400).json({ error: 'Missing path parameter' });
            return;
        }
        const resolved = path_1.default.resolve(filePath);
        const ext = path_1.default.extname(resolved).toLowerCase();
        const mimeType = MIME_TYPES[ext];
        if (!mimeType) {
            res.status(400).json({ error: 'Unsupported file type' });
            return;
        }
        let stat;
        try {
            stat = fs_1.default.statSync(resolved);
        }
        catch {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        if (stat.size > config_1.CONFIG.maxFileSize) {
            res.status(413).json({ error: 'File too large' });
            return;
        }
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Content-Length', stat.size);
        fs_1.default.createReadStream(resolved).pipe(res);
    });
    // Serve web client static files
    const webDistPath = process.env.WEB_DIST_PATH
        || path_1.default.join(__dirname, '../../web-dist');
    if (fs_1.default.existsSync(webDistPath)) {
        logger_1.logger.info(`Serving web client from ${webDistPath}`);
        app.use(express_1.default.static(webDistPath));
        app.get('{*path}', (_req, res) => {
            res.sendFile(path_1.default.join(webDistPath, 'index.html'));
        });
    }
    const httpPort = config_1.CONFIG.port + 1;
    app.listen(httpPort, config_1.CONFIG.host, () => {
        logger_1.logger.info(`HTTP server running on ${config_1.CONFIG.host}:${httpPort}`);
    });
    return app;
}
