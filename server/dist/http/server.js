"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpServer = createHttpServer;
const express_1 = __importDefault(require("express"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
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
    const httpPort = config_1.CONFIG.port + 1;
    app.listen(httpPort, config_1.CONFIG.host, () => {
        logger_1.logger.info(`HTTP server running on ${config_1.CONFIG.host}:${httpPort}`);
    });
    return app;
}
