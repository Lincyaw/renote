import { useEffect } from 'react';
import { useToastStore } from '../../store/toastStore';

export default function Toast() {
  const { toasts, removeToast } = useToastStore();

  useEffect(() => {
    toasts.forEach((toast) => {
      const duration = toast.duration || 3000;
      const timer = setTimeout(() => removeToast(toast.id), duration);
      return () => clearTimeout(timer);
    });
  }, [toasts, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const bgColor = {
          success: 'bg-green-600',
          error: 'bg-red-600',
          warning: 'bg-yellow-600',
          info: 'bg-blue-600',
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`${bgColor} text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-slide-in-right cursor-pointer`}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
