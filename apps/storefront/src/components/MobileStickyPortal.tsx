"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Fixed action bar above the always-visible mobile bottom nav.
 * Safe-area is handled by the nav; this bar sits on top of --bottom-chrome.
 */
export function MobileStickyPortal({
  children,
  className = "md:hidden",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-x-0 z-40 max-w-[100vw] border-t border-night/8 bg-paper/97 px-3 py-2 backdrop-blur-md ${className}`}
      style={{
        bottom: "var(--bottom-chrome)",
        minHeight: "var(--sticky-action-h)",
      }}
    >
      <div className="mx-auto flex h-full w-full min-w-0 max-w-lg flex-col justify-center">{children}</div>
    </div>,
    document.body
  );
}
