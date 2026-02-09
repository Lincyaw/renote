import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ConnectionStatus, ConnectionQuality, ConnectionParams } from '../types';

interface ConnectionState {
  status: ConnectionStatus;
  connectionQuality: ConnectionQuality;
  connectionParams: ConnectionParams | null;
  isAutoReconnecting: boolean;
  setWSStatus: (status: ConnectionStatus['ws']) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  setConnectionParams: (params: ConnectionParams | null) => void;
  setAutoReconnecting: (reconnecting: boolean) => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      status: { ws: 'disconnected' },
      connectionQuality: 'good',
      connectionParams: null,
      isAutoReconnecting: false,
      setWSStatus: (ws) => set((state) => ({ status: { ...state.status, ws } })),
      setConnectionQuality: (quality) => set({ connectionQuality: quality }),
      setConnectionParams: (params) => set({ connectionParams: params }),
      setAutoReconnecting: (reconnecting) => set({ isAutoReconnecting: reconnecting }),
      disconnect: () => set({
        status: { ws: 'disconnected' },
        connectionQuality: 'good',
        isAutoReconnecting: false,
      }),
    }),
    {
      name: 'connection-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        connectionParams: state.connectionParams,
      }),
    }
  )
);
