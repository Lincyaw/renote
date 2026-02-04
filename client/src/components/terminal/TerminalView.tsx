import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Keyboard,
  Platform,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { useTerminalSessionStore, TerminalType } from '../../store/terminalSessionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { colors, spacing, typography, radius, animation } from '../../theme';

interface TerminalViewProps {
  sessionId: string;
  onBack: () => void;
}

const FONT_SIZE_STORAGE_KEY = 'terminal_font_size';
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 28;
const FONT_SIZE_STEP = 2;

/**
 * Special key definitions for the toolbar
 */
interface SpecialKey {
  label: string;
  send?: string;
  isModifier?: boolean;
}

const SPECIAL_KEYS: SpecialKey[] = [
  { label: 'ESC', send: '\x1b' },
  { label: 'CTRL', isModifier: true },
  { label: 'ALT', isModifier: true },
  { label: 'TAB', send: '\t' },
  { label: '↑', send: '\x1b[A' },
  { label: '↓', send: '\x1b[B' },
  { label: '←', send: '\x1b[D' },
  { label: '→', send: '\x1b[C' },
  { label: 'HOME', send: '\x1b[H' },
  { label: 'END', send: '\x1b[F' },
  { label: 'PGUP', send: '\x1b[5~' },
  { label: 'PGDN', send: '\x1b[6~' },
];

/**
 * Generate HTML for terminal with direct WebSocket connection
 */
function generateTerminalHtml(wsUrl: string, initialFontSize: number): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; background: ${colors.codeBg}; overflow: hidden; }
    #terminal { height: 100%; width: 100%; }
    #status { position: fixed; top: 0; left: 0; right: 0; padding: 4px 8px; font-size: 12px; font-family: monospace; z-index: 100; }
    #status.connecting { background: #666; color: white; }
    #status.connected { display: none; }
    #status.error { background: #c53030; color: white; }
  </style>
</head>
<body>
  <div id="status" class="connecting">Connecting...</div>
  <div id="terminal"></div>
  <script>
    const wsUrl = "${wsUrl}";
    const statusEl = document.getElementById('status');
    let ws = null;
    let term = null;
    let fitAddon = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    let currentFontSize = ${initialFontSize};
    let ctrlActive = false;
    let altActive = false;

    function connect() {
      statusEl.textContent = reconnectAttempts > 0 ? 'Reconnecting...' : 'Connecting...';
      statusEl.className = 'connecting';

      console.log('[Terminal WS] Connecting to:', wsUrl);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'Connecting to: ' + wsUrl }));

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[Terminal WS] Connection opened');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: 'WebSocket opened' }));
        reconnectAttempts = 0;
        statusEl.className = 'connected';
        sendResize();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'connected' }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          try {
            const msg = JSON.parse(new TextDecoder().decode(event.data));
            if (msg.type === 'pong') {}
          } catch (e) {}
        } else {
          term.write(event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('[Terminal WS] Connection closed:', event.code, event.reason);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'log',
          message: 'WebSocket closed: code=' + event.code + ', reason=' + event.reason
        }));
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'error';

        if (reconnectAttempts < maxReconnectAttempts && event.code !== 4001 && event.code !== 4002) {
          reconnectAttempts++;
          setTimeout(connect, Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: event.reason || 'Connection closed (code: ' + event.code + ')'
          }));
        }
      };

      ws.onerror = (errorEvent) => {
        console.log('[Terminal WS] Connection error:', errorEvent);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'log',
          message: 'WebSocket error occurred'
        }));
        statusEl.textContent = 'Connection error';
        statusEl.className = 'error';
      };
    }

    function sendResize() {
      if (ws && ws.readyState === WebSocket.OPEN && term) {
        const msg = JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows });
        ws.send(new TextEncoder().encode(msg));
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resized',
          cols: term.cols,
          rows: term.rows
        }));
      }
    }

    function applyModifiers(data) {
      if (data.length === 1) {
        const charCode = data.charCodeAt(0);
        if (ctrlActive && charCode >= 97 && charCode <= 122) {
          const ctrlChar = String.fromCharCode(charCode - 96);
          ctrlActive = false;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'modifier_consumed', key: 'ctrl' }));
          return ctrlChar;
        }
        if (ctrlActive && charCode >= 65 && charCode <= 90) {
          const ctrlChar = String.fromCharCode(charCode - 64);
          ctrlActive = false;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'modifier_consumed', key: 'ctrl' }));
          return ctrlChar;
        }
        if (altActive) {
          altActive = false;
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'modifier_consumed', key: 'alt' }));
          return '\\x1b' + data;
        }
      }
      return data;
    }

    term = new Terminal({
      cursorBlink: true,
      fontSize: currentFontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '${colors.codeBg}',
        foreground: '${colors.codeFg}',
        cursor: '${colors.codeFg}',
        cursorAccent: '${colors.codeBg}',
        selection: 'rgba(255, 255, 255, 0.3)',
      },
      allowProposedApi: true,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));

    term.onData((data) => {
      const modifiedData = applyModifiers(data);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(modifiedData);
      }
    });

    // 使用 ResizeObserver 监听终端容器尺寸变化
    // 这比 window.resize 更可靠，因为它能监测到容器自身的尺寸变化（如键盘弹出时）
    let resizeTimeout = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      // 防抖：50ms 延迟确保布局稳定后再计算尺寸
      resizeTimeout = setTimeout(() => {
        fitAddon.fit();
        sendResize();
      }, 50);
    });
    resizeObserver.observe(document.getElementById('terminal'));

    // 保留 window resize 事件作为后备方案
    window.addEventListener('resize', () => {
      fitAddon.fit();
      sendResize();
    });

    // 在 DOM 就绪后连接 WebSocket
    setTimeout(connect, 100);

    window.writeToTerminal = (data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    };

    window.setCtrlActive = (active) => { ctrlActive = active; };
    window.setAltActive = (active) => { altActive = active; };
    window.clearTerminal = () => { term.clear(); };

    window.resizeTerminal = () => {
      fitAddon.fit();
      sendResize();
    };

    window.focusTerminal = () => { term.focus(); };

    window.setFontSize = (size) => {
      currentFontSize = size;
      term.options.fontSize = size;
      fitAddon.fit();
      sendResize();
    };

    window.disconnect = () => {
      if (ws) {
        ws.close();
        ws = null;
      }
    };
  </script>
</body>
</html>
`;
}

export default function TerminalView({ sessionId, onBack }: TerminalViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontSizeLoaded, setFontSizeLoaded] = useState(false);

  const { updateSessionStatus, getSession } = useTerminalSessionStore();
  const { connectionParams } = useConnectionStore();

  const session = getSession(sessionId);
  const terminalType: TerminalType = session?.type || 'shell';
  const claudeArgs = session?.claudeArgs;
  const cwd = session?.cwd;

  // Load saved font size on mount
  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY).then((value) => {
      if (value) {
        const size = parseInt(value, 10);
        if (!isNaN(size) && size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
          setFontSize(size);
        }
      }
      setFontSizeLoaded(true);
    });
  }, []);

  // Save and apply font size
  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, prev + delta));
      AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, String(newSize));
      webViewRef.current?.injectJavaScript(`window.setFontSize(${newSize}); true;`);
      return newSize;
    });
  }, []);

  // Listen for keyboard show/hide events
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Trigger terminal resize when keyboard height changes
  useEffect(() => {
    if (webViewRef.current && !isLoading) {
      const timer = setTimeout(() => {
        webViewRef.current?.injectJavaScript('window.resizeTerminal && window.resizeTerminal(); true;');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [keyboardHeight, isLoading]);

  const wsUrl = useMemo(() => {
    console.log('[TerminalView] Building wsUrl, connectionParams:', connectionParams ? {
      host: connectionParams.host,
      port: connectionParams.port,
      token: connectionParams.token ? '***' : '(empty)'
    } : null);
    if (!connectionParams) {
      console.warn('[TerminalView] connectionParams is null, cannot build wsUrl');
      return null;
    }
    const { host, port, token } = connectionParams;
    const params = new URLSearchParams({ token, sessionId, type: terminalType });
    if (claudeArgs && claudeArgs.length > 0) {
      params.set('claudeArgs', encodeURIComponent(JSON.stringify(claudeArgs)));
    }
    if (cwd) {
      params.set('cwd', cwd);
    }
    const url = `ws://${host}:${port}/terminal?${params.toString()}`;
    console.log('[TerminalView] Built wsUrl:', url.replace(token, '***'));
    return url;
  }, [connectionParams, sessionId, terminalType, claudeArgs, cwd]);

  const terminalHtml = useMemo(() => {
    if (!wsUrl || !fontSizeLoaded) return null;
    return generateTerminalHtml(wsUrl, fontSize);
  }, [wsUrl, fontSizeLoaded, fontSize]);

  const handleMessage = useCallback((event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      console.log('[TerminalView] WebView message:', message.type, message.message || '');
      switch (message.type) {
        case 'connected':
          setIsLoading(false);
          setError(null);
          updateSessionStatus(sessionId, 'active');
          break;
        case 'error':
          console.error('[TerminalView] Terminal error:', message.message);
          setError(message.message || 'Connection failed');
          updateSessionStatus(sessionId, 'error');
          break;
        case 'log':
          console.log('[TerminalView WebView Log]:', message.message);
          break;
        case 'modifier_consumed':
          if (message.key === 'ctrl') setCtrlActive(false);
          if (message.key === 'alt') setAltActive(false);
          break;
      }
    } catch (err) {
      console.error('[TerminalView] Failed to parse WebView message:', err);
    }
  }, [sessionId, updateSessionStatus]);

  const handleSpecialKey = useCallback((key: SpecialKey) => {
    if (key.isModifier) {
      if (key.label === 'CTRL') {
        const newState = !ctrlActive;
        setCtrlActive(newState);
        webViewRef.current?.injectJavaScript(`window.setCtrlActive(${newState}); true;`);
      } else if (key.label === 'ALT') {
        const newState = !altActive;
        setAltActive(newState);
        webViewRef.current?.injectJavaScript(`window.setAltActive(${newState}); true;`);
      }
    } else if (key.send) {
      const escaped = JSON.stringify(key.send);
      webViewRef.current?.injectJavaScript(`window.writeToTerminal(${escaped}); true;`);
    }
    webViewRef.current?.injectJavaScript('window.focusTerminal && window.focusTerminal(); true;');
  }, [ctrlActive, altActive]);

  useEffect(() => {
    return () => {
      webViewRef.current?.injectJavaScript('window.disconnect && window.disconnect(); true;');
    };
  }, []);

  if (!connectionParams || !terminalHtml) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={animation.activeOpacity}>
            <Text style={styles.backButtonText}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{session?.name || 'Terminal'}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>未连接到服务器</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onBack} activeOpacity={animation.activeOpacity}>
            <Text style={styles.retryButtonText}>返回</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={animation.activeOpacity}>
            <Text style={styles.backButtonText}>{'‹'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{session?.name || 'Terminal'}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>连接失败: {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              setIsLoading(true);
              webViewRef.current?.reload();
            }}
            activeOpacity={animation.activeOpacity}
          >
            <Text style={styles.retryButtonText}>重试</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={animation.activeOpacity}>
          <Text style={styles.backButtonText}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{session?.name || 'Terminal'}</Text>
        <View style={styles.fontControls}>
          <TouchableOpacity
            style={[styles.fontButton, fontSize <= MIN_FONT_SIZE && styles.fontButtonDisabled]}
            onPress={() => changeFontSize(-FONT_SIZE_STEP)}
            disabled={fontSize <= MIN_FONT_SIZE}
            activeOpacity={0.6}
          >
            <Text style={styles.fontButtonText}>A-</Text>
          </TouchableOpacity>
          <Text style={styles.fontSizeText}>{fontSize}</Text>
          <TouchableOpacity
            style={[styles.fontButton, fontSize >= MAX_FONT_SIZE && styles.fontButtonDisabled]}
            onPress={() => changeFontSize(FONT_SIZE_STEP)}
            disabled={fontSize >= MAX_FONT_SIZE}
            activeOpacity={0.6}
          >
            <Text style={styles.fontButtonText}>A+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>连接终端中...</Text>
        </View>
      )}

      {/* 使用 flex 布局，让终端填满剩余空间，toolbar 紧贴在下方 */}
      <View style={[styles.mainContent, { marginBottom: keyboardHeight }]}>
        <View style={styles.terminalContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: terminalHtml }}
            onMessage={handleMessage}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            bounces={false}
            originWhitelist={['*']}
            mixedContentMode="always"
            keyboardDisplayRequiresUserAction={false}
          />
        </View>

        <View style={styles.toolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.toolbarContent}
            keyboardShouldPersistTaps="always"
          >
            {SPECIAL_KEYS.map((key) => (
              <TouchableOpacity
                key={key.label}
                style={[
                  styles.toolbarKey,
                  key.isModifier && key.label === 'CTRL' && ctrlActive && styles.toolbarKeyActive,
                  key.isModifier && key.label === 'ALT' && altActive && styles.toolbarKeyActive,
                ]}
                onPress={() => handleSpecialKey(key)}
                activeOpacity={0.6}
              >
                <Text style={[
                  styles.toolbarKeyText,
                  key.isModifier && key.label === 'CTRL' && ctrlActive && styles.toolbarKeyTextActive,
                  key.isModifier && key.label === 'ALT' && altActive && styles.toolbarKeyTextActive,
                ]}>
                  {key.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.codeBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: '#252526',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: typography.weight.regular,
  },
  headerTitle: {
    flex: 1,
    color: colors.codeFg,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  headerRight: {
    width: 44,
  },
  fontControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fontButton: {
    width: 32,
    height: 32,
    backgroundColor: '#333',
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontButtonDisabled: {
    opacity: 0.4,
  },
  fontButtonText: {
    color: colors.codeFg,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
  },
  fontSizeText: {
    color: colors.codeFg,
    fontSize: 12,
    fontWeight: typography.weight.medium,
    minWidth: 20,
    textAlign: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.codeBg,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: colors.codeFg,
    fontSize: typography.size.body,
    marginTop: spacing.base,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  retryButtonText: {
    color: colors.text.inverse,
    fontSize: typography.size.body,
    fontWeight: typography.weight.semibold,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  terminalContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.codeBg,
  },
  toolbar: {
    height: 44,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  toolbarKey: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: spacing.sm,
    marginHorizontal: 2,
    backgroundColor: '#333',
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbarKeyActive: {
    backgroundColor: colors.primary,
  },
  toolbarKeyText: {
    color: colors.codeFg,
    fontSize: 12,
    fontWeight: typography.weight.medium,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  toolbarKeyTextActive: {
    color: '#fff',
  },
});
