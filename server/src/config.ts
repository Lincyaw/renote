import { config } from 'dotenv';
import { homedir } from 'os';

config();

export const CONFIG = {
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '8080'),
  authToken: process.env.AUTH_TOKEN || '',
  claudeHome: process.env.CLAUDE_HOME || `${homedir()}/.claude`,
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
  searchTimeout: parseInt(process.env.SEARCH_TIMEOUT || '5000'),
  logLevel: process.env.LOG_LEVEL || 'info',
};

if (!CONFIG.authToken) {
  console.warn('WARNING: AUTH_TOKEN not set. Generate: openssl rand -hex 32');
}
