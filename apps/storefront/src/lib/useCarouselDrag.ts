"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Mouse drag + touch swipe for image carousels. Suppresses click after a swipe. */
export function useCarouselDrag(opts: {
  enabled: boolean;
  onSwipe: (dir: -1 | 1) => void;
  onPause?: (paused: boolean) => void;
  threshold?: number;
}) {
  const { enabled, onSwipe, onPause, threshold = 48 } = opts;
  const drag = useRef<{
    pointerId: number | null;
    startX: number;
    moved: boolean;
  }>({ pointerId: null, startX: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const suppressClick = useRef(false);

  const endDrag = useCallback(
    (clientX: number) => {
      if (drag.current.pointerId == null) return;
      const dx = clientX - drag.current.startX;
      const moved = drag.current.moved;
      drag.current.pointerId = null;
      setDragging(false);
      onPause?.(false);
      if (moved && Math.abs(dx) >= threshold) {
        suppressClick.current = true;
        onSwipe(dx < 0 ? 1 : -1);
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 50);
      }
    },
    [onPause, onSwipe, threshold]
  );

  useEffect(() => {
    if (!enabled) return;

    function onMove(e: PointerEvent) {
      if (drag.current.pointerId == null || e.pointerId !== drag.current.pointerId) return;
      const dx = e.clientX - drag.current.startX;
      if (!drag.current.moved && Math.abs(dx) > 8) {
        drag.current.moved = true;
        setDragging(true);
      }
      if (drag.current.moved) e.preventDefault();
    }

    function onUp(e: PointerEvent) {
      if (drag.current.pointerId == null || e.pointerId !== drag.current.pointerId) return;
      endDrag(e.clientX);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [enabled, endDrag]);

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled || e.button !== 0) return;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, moved: false };
    onPause?.(true);
  }

  function onClickCapture(e: React.MouseEvent) {
    if (suppressClick.current || drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return {
    dragging,
    onPointerDown,
    onClickCapture,
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  };
}
