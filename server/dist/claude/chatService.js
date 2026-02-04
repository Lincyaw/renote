"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claudeChatService = void 0;
const child_process_1 = require("child_process");
const logger_1 = require("../utils/logger");
class ClaudeChatService {
    constructor() {
        // 存储正在运行的进程，按 sessionId 索引
        this.runningProcesses = new Map();
    }
    /**
     * 发送消息给 Claude CLI
     * 使用 -p (print) 模式，消息通过 stdin 传入，响应通过 jsonl 文件监听获取
     */
    async sendMessage(options) {
        const { workspaceDirName, sessionId, newSessionId, message, cwd, allowedTools } = options;
        // 确定实际使用的 sessionId
        const effectiveSessionId = sessionId || newSessionId;
        // 检查该会话是否已有进程在运行
        if (effectiveSessionId && this.runningProcesses.has(effectiveSessionId)) {
            return {
                success: false,
                error: 'A message is already being processed for this session',
                sessionId: effectiveSessionId,
            };
        }
        const args = ['-p'];
        // 恢复现有会话
        if (sessionId) {
            args.push('--resume', sessionId);
        }
        // 新建会话并指定 ID
        else if (newSessionId) {
            args.push('--session-id', newSessionId);
        }
        // 添加允许的工具参数
        if (allowedTools && allowedTools.length > 0) {
            args.push('--allowedTools', allowedTools.join(','));
        }
        logger_1.logger.info(`[ChatService] Sending message to Claude CLI`);
        logger_1.logger.info(`[ChatService] Args: ${args.join(' ')}`);
        logger_1.logger.info(`[ChatService] CWD: ${cwd || 'default'}`);
        logger_1.logger.info(`[ChatService] Message length: ${message.length}`);
        if (allowedTools && allowedTools.length > 0) {
            logger_1.logger.info(`[ChatService] Allowed tools: ${allowedTools.join(', ')}`);
        }
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)('claude', args, {
                cwd: cwd || process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    // 确保 Claude CLI 不会等待用户输入
                    TERM: 'dumb',
                },
            });
            // 记录进程
            if (effectiveSessionId) {
                this.runningProcesses.set(effectiveSessionId, proc);
            }
            // 写入消息到 stdin
            proc.stdin.write(message);
            proc.stdin.end();
            // 收集输出（主要用于错误检测）
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
                // 可以选择性地记录 stdout，但主要响应通过 jsonl 监听获取
                logger_1.logger.debug(`[ChatService] stdout: ${data.toString().substring(0, 200)}...`);
            });
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
                logger_1.logger.warn(`[ChatService] stderr: ${data.toString()}`);
            });
            proc.on('close', (code) => {
                // 移除进程记录
                if (effectiveSessionId) {
                    this.runningProcesses.delete(effectiveSessionId);
                }
                if (code === 0) {
                    logger_1.logger.info(`[ChatService] Claude CLI completed successfully`);
                    resolve({
                        success: true,
                        sessionId: effectiveSessionId,
                    });
                }
                else {
                    logger_1.logger.error(`[ChatService] Claude CLI exited with code ${code}`);
                    resolve({
                        success: false,
                        error: stderr || `Exit code: ${code}`,
                        sessionId: effectiveSessionId,
                    });
                }
            });
            proc.on('error', (err) => {
                // 移除进程记录
                if (effectiveSessionId) {
                    this.runningProcesses.delete(effectiveSessionId);
                }
                logger_1.logger.error(`[ChatService] Failed to spawn Claude CLI:`, err);
                resolve({
                    success: false,
                    error: err.message,
                    sessionId: effectiveSessionId,
                });
            });
        });
    }
    /**
     * 检查指定会话是否有正在进行的消息处理
     */
    isProcessing(sessionId) {
        return this.runningProcesses.has(sessionId);
    }
    /**
     * 取消正在进行的消息处理
     */
    cancelMessage(sessionId) {
        const proc = this.runningProcesses.get(sessionId);
        if (proc) {
            proc.kill('SIGTERM');
            this.runningProcesses.delete(sessionId);
            logger_1.logger.info(`[ChatService] Cancelled message processing for session ${sessionId}`);
            return true;
        }
        return false;
    }
}
exports.claudeChatService = new ClaudeChatService();
