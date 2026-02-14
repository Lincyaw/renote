import { useState } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';

export default function WelcomeScreen() {
  const { status, connectionParams } = useConnectionStore();

  const [host, setHost] = useState(connectionParams?.host || window.location.hostname || 'localhost');
  const [port, setPort] = useState(String(connectionParams?.port || '9080'));
  const [token, setToken] = useState(connectionParams?.token || '');

  const isConnecting = status.ws === 'connecting';

  const handleConnect = () => {
    const portNum = parseInt(port, 10);
    if (!host || isNaN(portNum)) return;

    useConnectionStore.getState().setConnectionParams({ host, port: portNum, token });
    wsClient.connect(host, portNum, token);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConnect();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo & Tagline */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-blue-400">
              <path d="M4 8h24M4 16h24M4 24h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="26" cy="24" r="4" fill="currentColor" opacity="0.3" />
              <path d="M24.5 24l1 1 2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Renote</h1>
          <p className="text-sm text-gray-500 mt-1">Remote Claude Code Monitor</p>
        </div>

        {/* Connection Form */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
              placeholder="localhost"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
              placeholder="9080"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
              placeholder="Auth token (optional)"
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors mt-2"
          >
            {isConnecting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting...
              </span>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
