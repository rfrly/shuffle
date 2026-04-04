import { useRef, useCallback } from 'react';

export function useLongPress(callback, { delay = 400, interval = 80 } = {}) {
  const timeoutRef   = useRef(null);
  const intervalRef  = useRef(null);

  const start = useCallback(() => {
    callback();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(callback, interval);
    }, delay);
  }, [callback, delay, interval]);

  const stop = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  }, []);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: (e) => { e.preventDefault(); start(); },
    onTouchEnd: (e) => { e.preventDefault(); stop(); },
    onTouchCancel: stop,
  };
}

export function useSwipeInput({ onSwipeUp, onSwipeDown, onTap, disabled, threshold = 15 }) {
  const startYRef = useRef(null);
  return {
    onTouchStart: (e) => { if (disabled) return; e.preventDefault(); startYRef.current = e.touches[0].clientY; },
    onTouchEnd: (e) => {
      if (startYRef.current === null) return;
      const delta = startYRef.current - e.changedTouches[0].clientY;
      startYRef.current = null;
      if (Math.abs(delta) > threshold) { if (delta > 0) onSwipeUp(); else onSwipeDown(); } else { onTap(); }
    },
    onClick: () => { if (!disabled) onTap(); },
    style: { touchAction: 'none' },
  };
}
