import { create } from 'zustand';
import type { Toast } from '../types';

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { ...toast, id: Date.now().toString() + Math.random().toString(36).substr(2, 5) },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
