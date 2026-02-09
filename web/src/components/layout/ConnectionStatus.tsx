import { useConnectionStore } from '../../store/connectionStore';

export default function ConnectionStatus() {
  const { status, connectionQuality, isAutoReconnecting } = useConnectionStore();

  const wsStatus = status.ws;

  const statusColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-red-500',
  }[wsStatus];

  const qualityColor = {
    good: 'bg-green-500',
    degraded: 'bg-yellow-500',
    poor: 'bg-red-500',
  }[connectionQuality];

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
      <div className={`w-2 h-2 rounded-full ${statusColor}`} />
      <span className="text-gray-400">
        {wsStatus === 'connected' ? 'Connected' : wsStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
      </span>
      {wsStatus === 'connected' && connectionQuality !== 'good' && (
        <>
          <div className={`w-1.5 h-1.5 rounded-full ${qualityColor}`} />
          <span className="text-gray-500">{connectionQuality}</span>
        </>
      )}
      {isAutoReconnecting && (
        <span className="text-yellow-400">Reconnecting...</span>
      )}
    </div>
  );
}
