import { useState, useEffect } from 'react';
import { wsClient } from '../../services/websocket';

interface Props {
  reconnectDelay: number;
}

export default function DisconnectOverlay({ reconnectDelay }: Props) {
  const [countdown, setCountdown] = useState(Math.ceil(reconnectDelay / 1000));

  useEffect(() => {
    setCountdown(Math.ceil(reconnectDelay / 1000));
    const interval = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [reconnectDelay]);

  const handleReconnect = () => {
    wsClient.reconnect();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm">
      <div className="text-center p-6 max-w-xs">
        {/* Disconnect icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-red-400">
            <path d="M8.5 16.5l-5-5m0 0l5-5m-5 5h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 7V4a1 1 0 011-1h3a1 1 0 011 1v16a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-gray-100 mb-1">Connection Lost</h2>
        <p className="text-sm text-gray-400 mb-4">
          {countdown > 0
            ? `Reconnecting in ${countdown}s...`
            : 'Attempting to reconnect...'
          }
        </p>

        <button
          onClick={handleReconnect}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-2 text-sm font-medium transition-colors"
        >
          Reconnect Now
        </button>
      </div>
    </div>
  );
}
