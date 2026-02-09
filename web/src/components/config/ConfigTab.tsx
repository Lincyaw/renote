import { useState, useEffect } from 'react';
import { useConnectionStore } from '../../store/connectionStore';
import { wsClient } from '../../services/websocket';

export default function ConfigTab() {
  const { status, connectionParams } = useConnectionStore();

  const [host, setHost] = useState(connectionParams?.host || window.location.hostname || 'localhost');
  const [port, setPort] = useState(String(connectionParams?.port || '9080'));
  const [token, setToken] = useState(connectionParams?.token || '');

  // Auto-connect on mount if we have saved params
  useEffect(() => {
    if (connectionParams && status.ws === 'disconnected') {
      wsClient.connect(connectionParams.host, connectionParams.port, connectionParams.token);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    const portNum = parseInt(port, 10);
    if (!host || isNaN(portNum)) return;

    useConnectionStore.getState().setConnectionParams({ host, port: portNum, token });
    wsClient.connect(host, portNum, token);
  };

  const handleDisconnect = () => {
    wsClient.disconnect();
    useConnectionStore.getState().disconnect();
  };

  const isConnected = status.ws === 'connected';
  const isConnecting = status.ws === 'connecting';

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold mb-4 text-gray-100">Connection Settings</h2>

      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Host</label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={isConnected || isConnecting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="localhost"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={isConnected || isConnecting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="9080"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={isConnected || isConnecting}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            placeholder="Auth token (optional)"
          />
        </div>

        <div className="pt-2">
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
