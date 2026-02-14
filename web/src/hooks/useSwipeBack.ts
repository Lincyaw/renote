import { useEffect, useRef } from 'react';

interface UseSwipeBackOptions {
  onSwipeBack: () => void;
  edgeWidth?: number;
  threshold?: number;
  enabled?: boolean;
}

export function useSwipeBack({
  onSwipeBack,
  edgeWidth = 20,
  threshold = 80,
  enabled = true,
}: UseSwipeBackOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch && touch.clientX <= edgeWidth) {
        touchStartX.current = touch.clientX;
        touchStartY.current = touch.clientY;
        swiping.current = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swiping.current) return;
      swiping.current = false;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - touchStartX.current;
      const dy = Math.abs(touch.clientY - touchStartY.current);

      // Must be a horizontal swipe (dx > threshold, dy < dx)
      if (dx > threshold && dy < dx) {
        onSwipeBack();
      }
    };

    const handleTouchCancel = () => {
      swiping.current = false;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [onSwipeBack, edgeWidth, threshold, enabled]);
}
