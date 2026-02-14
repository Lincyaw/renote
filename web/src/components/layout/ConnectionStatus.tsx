import { useConnectionStore } from '../../store/connectionStore';

function SignalIcon({ bars, color }: { bars: 0 | 1 | 2 | 3; color: string }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" className={color}>
      <rect x="0" y="9" width="3" height="3" rx="0.5" opacity={bars >= 1 ? 1 : 0.2} fill="currentColor" />
      <rect x="4" y="5" width="3" height="7" rx="0.5" opacity={bars >= 2 ? 1 : 0.2} fill="currentColor" />
      <rect x="8" y="1" width="3" height="11" rx="0.5" opacity={bars >= 3 ? 1 : 0.2} fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ''}`}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ConnectionStatus() {
  const { status, connectionQuality, isAutoReconnecting } = useConnectionStore();

  const wsStatus = status.ws;

  if (wsStatus === 'connecting' || isAutoReconnecting) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <SpinnerIcon className="text-yellow-400" />
        <span className="text-xs text-yellow-400">
          {isAutoReconnecting ? 'Reconnecting...' : 'Connecting...'}
        </span>
      </div>
    );
  }

  if (wsStatus === 'disconnected') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <SignalIcon bars={0} color="text-red-500" />
        <span className="text-xs text-red-400">Disconnected</span>
      </div>
    );
  }

  // Connected
  const barCount = connectionQuality === 'good' ? 3 : connectionQuality === 'degraded' ? 2 : 1;
  const signalColor = connectionQuality === 'good' ? 'text-green-500' : connectionQuality === 'degraded' ? 'text-yellow-500' : 'text-red-500';
  const shouldPulse = connectionQuality !== 'good';

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5">
      <span className={shouldPulse ? 'animate-pulse' : ''}>
        <SignalIcon bars={barCount as 0 | 1 | 2 | 3} color={signalColor} />
      </span>
      {connectionQuality !== 'good' && (
        <span className="text-xs text-gray-500">{connectionQuality}</span>
      )}
    </div>
  );
}
