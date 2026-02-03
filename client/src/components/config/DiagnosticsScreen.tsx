import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useConnectionStore } from '../../store/connectionStore';
import { colors, spacing, typography, radius } from '../../theme';

interface LogEntry {
  time: string;
  level: 'info' | 'error' | 'warn';
  message: string;
}

export default function DiagnosticsScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [testHost, setTestHost] = useState('');
  const [testPort, setTestPort] = useState('9080');
  const [isTesting, setIsTesting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const { connectionParams, status } = useConnectionStore();

  useEffect(() => {
    if (connectionParams) {
      setTestHost(connectionParams.host);
      setTestPort(connectionParams.port.toString());
    }
  }, [connectionParams]);

  const addLog = (level: LogEntry['level'], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, level, message }]);
    setTimeout(() => scrollRef.current?.scrollToEnd(), 100);
  };

  const clearLogs = () => setLogs([]);

  const testHttpConnection = async () => {
    if (!testHost) {
      Alert.alert('错误', '请输入服务器地址');
      return;
    }

    setIsTesting(true);
    addLog('info', `测试 HTTP 连接: http://${testHost}:${parseInt(testPort) + 1}/health`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `http://${testHost}:${parseInt(testPort) + 1}/health`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        addLog('info', `✅ HTTP 连接成功: ${JSON.stringify(data)}`);
      } else {
        addLog('error', `❌ HTTP 响应错误: ${response.status}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        addLog('error', '❌ HTTP 连接超时 (5秒)');
      } else {
        addLog('error', `❌ HTTP 连接失败: ${error.message}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const testWebSocketConnection = async () => {
    if (!testHost) {
      Alert.alert('错误', '请输入服务器地址');
      return;
    }

    setIsTesting(true);
    const wsUrl = `ws://${testHost}:${testPort}`;
    addLog('info', `测试 WebSocket 连接: ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          addLog('error', '❌ WebSocket 连接超时 (10秒)');
          ws.close();
          setIsTesting(false);
        }
      }, 10000);

      ws.onopen = () => {
        if (resolved) return;
        addLog('info', '✅ WebSocket 连接已打开');
        addLog('info', '发送 auth 消息...');
        ws.send(JSON.stringify({ type: 'auth', token: connectionParams?.token || '' }));
      };

      ws.onmessage = (event) => {
        if (resolved) return;
        try {
          const msg = JSON.parse(event.data);
          addLog('info', `收到消息: ${msg.type}`);
          if (msg.type === 'auth_success') {
            addLog('info', `✅ 认证成功! clientId: ${msg.data?.clientId}`);
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            setIsTesting(false);
          } else if (msg.type === 'error') {
            addLog('error', `❌ 服务器错误: ${msg.error}`);
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            setIsTesting(false);
          }
        } catch (e) {
          addLog('warn', `收到非 JSON 消息: ${event.data.substring(0, 100)}`);
        }
      };

      ws.onerror = (error: any) => {
        if (resolved) return;
        addLog('error', `❌ WebSocket 错误: ${error.message || '未知错误'}`);
      };

      ws.onclose = (event) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        addLog('warn', `WebSocket 关闭: code=${event.code}, reason=${event.reason || '无'}`);
        setIsTesting(false);
      };
    } catch (error: any) {
      addLog('error', `❌ 创建 WebSocket 失败: ${error.message}`);
      setIsTesting(false);
    }
  };

  const testTerminalWebSocket = async () => {
    if (!testHost) {
      Alert.alert('错误', '请输入服务器地址');
      return;
    }

    setIsTesting(true);
    const token = connectionParams?.token || '';
    const wsUrl = `ws://${testHost}:${testPort}/terminal?token=${encodeURIComponent(token)}&sessionId=test-${Date.now()}&type=shell`;
    addLog('info', `测试终端 WebSocket: ws://${testHost}:${testPort}/terminal?...`);

    try {
      const ws = new WebSocket(wsUrl);
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          addLog('error', '❌ 终端 WebSocket 连接超时 (10秒)');
          ws.close();
          setIsTesting(false);
        }
      }, 10000);

      ws.onopen = () => {
        if (resolved) return;
        addLog('info', '✅ 终端 WebSocket 连接已打开');
        // 等待一下看是否收到终端输出
        setTimeout(() => {
          if (!resolved) {
            addLog('info', '✅ 终端连接保持正常');
            resolved = true;
            clearTimeout(timeout);
            ws.close();
            setIsTesting(false);
          }
        }, 2000);
      };

      ws.onmessage = (event) => {
        if (resolved) return;
        addLog('info', `收到终端数据: ${event.data.substring(0, 50)}...`);
      };

      ws.onerror = (error: any) => {
        if (resolved) return;
        addLog('error', `❌ 终端 WebSocket 错误: ${error.message || '未知错误'}`);
      };

      ws.onclose = (event) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (event.code === 4001) {
          addLog('error', '❌ 终端连接被拒绝: 无效的 token');
        } else if (event.code === 4002) {
          addLog('error', '❌ 终端连接被拒绝: 缺少 sessionId');
        } else if (event.code === 4003) {
          addLog('error', '❌ 终端连接被拒绝: 启动终端失败');
        } else {
          addLog('warn', `终端 WebSocket 关闭: code=${event.code}, reason=${event.reason || '无'}`);
        }
        setIsTesting(false);
      };
    } catch (error: any) {
      addLog('error', `❌ 创建终端 WebSocket 失败: ${error.message}`);
      setIsTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 当前状态 */}
      <View style={styles.statusCard}>
        <Text style={styles.sectionTitle}>当前连接状态</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>WebSocket:</Text>
          <Text style={[
            styles.statusValue,
            { color: status.ws === 'connected' ? colors.success : colors.error }
          ]}>
            {status.ws}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>连接参数:</Text>
          <Text style={styles.statusValue}>
            {connectionParams
              ? `${connectionParams.host}:${connectionParams.port}`
              : '未设置'}
          </Text>
        </View>
      </View>

      {/* 测试工具 */}
      <View style={styles.testCard}>
        <Text style={styles.sectionTitle}>连接测试</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="服务器地址"
            value={testHost}
            onChangeText={setTestHost}
            autoCapitalize="none"
            placeholderTextColor={colors.text.disabled}
          />
          <TextInput
            style={[styles.input, { flex: 1, marginLeft: spacing.sm }]}
            placeholder="端口"
            value={testPort}
            onChangeText={setTestPort}
            keyboardType="numeric"
            placeholderTextColor={colors.text.disabled}
          />
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.buttonDisabled]}
            onPress={testHttpConnection}
            disabled={isTesting}
          >
            <Text style={styles.buttonText}>测试 HTTP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.buttonDisabled]}
            onPress={testWebSocketConnection}
            disabled={isTesting}
          >
            <Text style={styles.buttonText}>测试主 WS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.testButton, isTesting && styles.buttonDisabled]}
            onPress={testTerminalWebSocket}
            disabled={isTesting}
          >
            <Text style={styles.buttonText}>测试终端 WS</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 日志区域 */}
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.sectionTitle}>诊断日志</Text>
          <TouchableOpacity onPress={clearLogs}>
            <Text style={styles.clearButton}>清除</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          ref={scrollRef}
          style={styles.logScroll}
          contentContainerStyle={styles.logContent}
        >
          {logs.length === 0 ? (
            <Text style={styles.emptyLog}>点击上方按钮开始测试</Text>
          ) : (
            logs.map((log, index) => (
              <View key={index} style={styles.logEntry}>
                <Text style={styles.logTime}>{log.time}</Text>
                <Text style={[
                  styles.logMessage,
                  log.level === 'error' && styles.logError,
                  log.level === 'warn' && styles.logWarn,
                ]}>
                  {log.message}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    padding: spacing.base,
  },
  statusCard: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  testCard: {
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  logCard: {
    flex: 1,
    backgroundColor: colors.background.primary,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  sectionTitle: {
    fontSize: typography.size.subheadline,
    fontWeight: typography.weight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  statusLabel: {
    fontSize: typography.size.footnote,
    color: colors.text.secondary,
  },
  statusValue: {
    fontSize: typography.size.footnote,
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.secondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: typography.size.footnote,
    backgroundColor: colors.background.secondary,
    color: colors.text.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  testButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.text.inverse,
    fontSize: typography.size.footnote,
    fontWeight: typography.weight.semibold,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  clearButton: {
    color: colors.primary,
    fontSize: typography.size.footnote,
  },
  logScroll: {
    flex: 1,
    backgroundColor: colors.codeBg,
    borderRadius: radius.md,
  },
  logContent: {
    padding: spacing.sm,
  },
  emptyLog: {
    color: colors.text.disabled,
    fontSize: typography.size.footnote,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  logEntry: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  logTime: {
    fontSize: 11,
    color: colors.text.disabled,
    fontFamily: 'monospace',
    marginRight: spacing.sm,
    width: 70,
  },
  logMessage: {
    flex: 1,
    fontSize: 12,
    color: colors.codeFg,
    fontFamily: 'monospace',
  },
  logError: {
    color: colors.error,
  },
  logWarn: {
    color: colors.warning,
  },
});
