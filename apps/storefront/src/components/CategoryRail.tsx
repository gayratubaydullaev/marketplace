"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { rewriteMediaUrl } from "@/lib/media";

type Cat = {
  slug: string;
  image_url?: string | null;
  translations: Record<string, { name?: string }>;
};

/**
 * Desktop mouse drag uses CSS transform (1:1 with the cursor).
 * Touch keeps native overflow scrolling.
 */
export function CategoryRail({
  categories,
  locale,
}: {
  categories: Cat[];
  locale: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const offsetRef = useRef(0);
  const drag = useRef<{
    active: boolean;
    pointerId: number;
    startX: number;
    startOffset: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const maxOffset = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return 0;
    return Math.max(0, track.scrollWidth - viewport.clientWidth);
  }, []);

  const applyOffset = useCallback(
    (next: number) => {
      const track = trackRef.current;
      if (!track) return;
      const max = maxOffset();
      const clamped = Math.min(max, Math.max(0, next));
      offsetRef.current = clamped;
      track.style.transform = `translate3d(${-clamped}px, 0, 0)`;
      setCanPrev(clamped > 2);
      setCanNext(max > 2 && clamped < max - 2);
    },
    [maxOffset]
  );

  useEffect(() => {
    applyOffset(0);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => applyOffset(offsetRef.current));
    ro.observe(viewport);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [categories.length, applyOffset]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(e: WheelEvent) {
      const max = maxOffset();
      if (max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const next = offsetRef.current + delta;
      if ((offsetRef.current <= 0 && delta < 0) || (offsetRef.current >= max && delta > 0)) return;
      e.preventDefault();
      applyOffset(next);
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [applyOffset, maxOffset]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = drag.current;
      if (!d || !d.active || e.pointerId !== d.pointerId) return;
      // Mouse right → content follows right (offset decreases).
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) > 3) {
        d.moved = true;
        setDragging(true);
      }
      if (!d.moved) return;
      e.preventDefault();
      applyOffset(d.startOffset - dx);
    }

    function onUp(e: PointerEvent) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const viewport = viewportRef.current;
      try {
        viewport?.releasePointerCapture(d.pointerId);
      } catch {
        /* already released */
      }
      if (d.moved) {
        suppressClick.current = true;
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 60);
      }
      drag.current = null;
      setDragging(false);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyOffset]);

  function scrollByDir(dir: -1 | 1) {
    const viewport = viewportRef.current;
    const step = viewport ? Math.min(viewport.clientWidth * 0.7, 320) : 280;
    applyOffset(offsetRef.current + dir * step);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setPointerCapture(e.pointerId);
    drag.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startOffset: offsetRef.current,
      moved: false,
    };
  }

  function onClickCapture(e: React.MouseEvent) {
    if (suppressClick.current || drag.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <div className="relative">
      {canPrev ? (
        <button
          type="button"
          aria-label="Previous"
          onClick={() => scrollByDir(-1)}
          className="absolute start-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night/10 bg-paper/95 text-night shadow-md transition hover:bg-white md:flex"
        >
          ‹
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          aria-label="Next"
          onClick={() => scrollByDir(1)}
          className="absolute end-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-night/10 bg-paper/95 text-night shadow-md transition hover:bg-white md:flex"
        >
          ›
        </button>
      ) : null}

      <div
        ref={viewportRef}
        className={`home-cat-rail-viewport overflow-hidden pe-4 md:px-1 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        <ul
          ref={trackRef}
          className="home-cat-rail flex w-max select-none gap-2 sm:gap-3.5"
          style={{
            transform: "translate3d(0,0,0)",
            willChange: "transform",
          }}
        >
          {categories.map((c, i) => {
            const name = c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug;
            const image = c.image_url
              ? rewriteMediaUrl(c.image_url, { fallbackKey: `cat:${c.slug}` })
              : "";
            return (
              <li key={c.slug} className="shrink-0" style={{ animationDelay: `${i * 50}ms` }}>
                <Link
                  href={`/${locale}/categories/${c.slug}`}
                  title={name}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className="group flex w-[5.75rem] flex-col sm:w-[8.5rem]"
                >
                  <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-[#e8eef0] sm:rounded-xl">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt=""
                        draggable={false}
                        loading="lazy"
                        decoding="async"
                        width={200}
                        height={200}
                        sizes="120px"
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className="absolute inset-0 bg-gradient-to-br from-teal/90 via-teal to-night transition duration-500 group-hover:scale-105"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="mt-1.5 line-clamp-2 text-center font-display text-[11px] font-bold leading-snug text-night sm:mt-2 sm:text-[13px]">
                    {name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
