import { useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminalSessionStore } from '../../store/terminalSessionStore';
import { useConnectionStore } from '../../store/connectionStore';

interface TerminalViewProps {
  sessionId: string;
}

interface SpecialKey {
  label: string;
  send?: string;
  isModifier?: boolean;
}

const SPECIAL_KEYS: SpecialKey[] = [
  { label: 'ESC', send: '\x1b' },
  { label: 'CTRL', isModifier: true },
  { label: 'TAB', send: '\t' },
  { label: '\u2191', send: '\x1b[A' },
  { label: '\u2193', send: '\x1b[B' },
  { label: '\u2190', send: '\x1b[D' },
  { label: '\u2192', send: '\x1b[C' },
];

function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardHeight(Math.max(0, Math.round(offset)));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return keyboardHeight;
}

export default function TerminalView({ sessionId }: TerminalViewProps) {
  // containerRef = stable outer box for ResizeObserver (size from flex layout)
  // termRef = inner div where xterm renders (absolute positioned, size from fit())
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [ctrlActive, setCtrlActive] = useState(false);
  const ctrlActiveRef = useRef(false);
  const keyboardHeight = useKeyboardHeight();

  const { connectionParams } = useConnectionStore();
  const updateSessionStatus = useTerminalSessionStore(s => s.updateSessionStatus);
  const sessionType = useTerminalSessionStore(s => s.sessions.find(sess => sess.id === sessionId)?.type || 'shell');

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({ type: 'resize', cols, rows });
      ws.send(new Blob([new TextEncoder().encode(msg)]));
    }
  }, []);

  // Fit terminal to container, only send resize if cols/rows actually changed
  const doFit = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const term = terminalRef.current;
    if (!fitAddon || !term) return;
    fitAddon.fit();
    const { cols, rows } = term;
    if (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows) {
      lastSizeRef.current = { cols, rows };
      sendResize(cols, rows);
    }
  }, [sendResize]);

  // Refit when keyboard opens/closes
  useEffect(() => {
    doFit();
  }, [keyboardHeight, doFit]);

  // Keep ref in sync with state so onData closure can read latest value
  useEffect(() => {
    ctrlActiveRef.current = ctrlActive;
  }, [ctrlActive]);

  useEffect(() => {
    if (!termRef.current || !containerRef.current || !connectionParams) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, Monaco, monospace",
      theme: {
        background: '#0a0a0f',
        foreground: '#e5e7eb',
        cursor: '#60a5fa',
        selectionBackground: '#374151',
        black: '#1f2937',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f3f4f6',
        brightBlack: '#4b5563',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(termRef.current);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit after layout settles
    requestAnimationFrame(() => {
      fitAddon.fit();
      lastSizeRef.current = { cols: term.cols, rows: term.rows };
    });

    // Build WS URL
    const { host, port, token } = connectionParams;
    const params = new URLSearchParams({
      token,
      sessionId,
      type: sessionType,
      cols: String(term.cols || 80),
      rows: String(term.rows || 24),
    });
    const wsUrl = `ws://${host}:${port}/terminal?${params}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      updateSessionStatus(sessionId, 'active');
      // Send actual size after fit
      sendResize(term.cols, term.rows);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) return;
      term.write(event.data);
    };

    ws.onclose = () => {
      setStatus('error');
      updateSessionStatus(sessionId, 'closed');
      term.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      setStatus('error');
      updateSessionStatus(sessionId, 'error');
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // If CTRL is active, convert the first character to a control code
      if (ctrlActiveRef.current && data.length === 1) {
        const upper = data.toUpperCase();
        if (upper >= 'A' && upper <= 'Z') {
          ws.send(String.fromCharCode(upper.charCodeAt(0) - 64));
          setCtrlActive(false);
          return;
        }
      }

      ws.send(data);
    });

    // Observe the CONTAINER (stable size from flex layout), not the terminal element.
    // fit() changes the terminal element's internals but not the container's size,
    // so this won't cause a resize loop.
    const container = containerRef.current;
    const observer = new ResizeObserver(() => {
      doFit();
    });
    observer.observe(container);

    return () => {
      inputDisposable.dispose();
      observer.disconnect();
      ws.close();
      term.dispose();
      wsRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, sessionType, connectionParams, updateSessionStatus, sendResize, doFit]);

  const handleSpecialKey = useCallback((key: SpecialKey) => {
    const term = terminalRef.current;
    const ws = wsRef.current;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;

    if (key.isModifier) {
      setCtrlActive(prev => !prev);
      return;
    }

    if (key.send) {
      if (ctrlActive && key.send.length === 1) {
        const code = key.send.toUpperCase().charCodeAt(0) - 64;
        ws.send(String.fromCharCode(code));
      } else {
        ws.send(key.send);
      }
    }

    if (ctrlActive) setCtrlActive(false);
    term.focus();
  }, [ctrlActive]);

  const keyboardOpen = keyboardHeight > 0;

  return (
    <div className="relative flex flex-col h-full">
      {status !== 'connected' && (
        <div className={`px-3 py-1 text-xs font-mono ${
          status === 'connecting' ? 'bg-gray-700 text-gray-300' : 'bg-red-900 text-red-300'
        }`}>
          {status === 'connecting' ? 'Connecting...' : 'Connection closed'}
        </div>
      )}

      {/* Stable container for ResizeObserver - size determined by flex, not by xterm */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {/* xterm renders here - absolute so it doesn't affect container size */}
        <div ref={termRef} className="absolute inset-0 bg-[#0a0a0f]" />
      </div>

      {/* Special keys toolbar - floats above virtual keyboard on mobile */}
      <div
        className="flex gap-1 p-1.5 bg-gray-900/95 backdrop-blur border-t border-gray-800 overflow-x-auto md:hidden z-50"
        style={keyboardOpen
          ? { position: 'fixed', left: 0, right: 0, bottom: keyboardHeight }
          : undefined
        }
      >
        {SPECIAL_KEYS.map((key) => (
          <button
            key={key.label}
            onPointerDown={(e) => {
              e.preventDefault();
              handleSpecialKey(key);
            }}
            className={`px-2.5 py-1.5 text-xs font-mono rounded shrink-0 transition-colors ${
              key.isModifier && ctrlActive
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 active:bg-gray-700'
            }`}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
