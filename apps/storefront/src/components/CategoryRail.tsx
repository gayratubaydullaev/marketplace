"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { rewriteMediaUrl } from "@/lib/media";

type Cat = {
  slug: string;
  image_url?: string | null;
  translations: Record<string, { name?: string }>;
};

export function CategoryRail({
  categories,
  locale,
}: {
  categories: Cat[];
  locale: string;
}) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const drag = useRef<{
    pointerId: number | null;
    startX: number;
    startScroll: number;
    moved: boolean;
  }>({
    pointerId: null,
    startX: 0,
    startScroll: 0,
    moved: false,
  });
  const [dragging, setDragging] = useState(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [categories.length, updateArrows]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const atStart = el.scrollLeft <= 0 && delta < 0;
      const atEnd = el.scrollLeft >= max - 1 && delta > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += delta;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (drag.current.pointerId == null || e.pointerId !== drag.current.pointerId) return;
      const el = scrollerRef.current;
      if (!el) return;
      const dx = e.clientX - drag.current.startX;
      if (!drag.current.moved && Math.abs(dx) > 5) {
        drag.current.moved = true;
        setDragging(true);
      }
      if (drag.current.moved) {
        e.preventDefault();
        el.scrollLeft = drag.current.startScroll - dx;
      }
    }

    function onUp(e: PointerEvent) {
      if (drag.current.pointerId == null || e.pointerId !== drag.current.pointerId) return;
      drag.current.pointerId = null;
      setDragging(false);
      window.setTimeout(() => {
        drag.current.moved = false;
      }, 0);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.7, 320), behavior: "smooth" });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    if (e.pointerType === "touch") return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  }

  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
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

      <ul
        ref={scrollerRef}
        className={`home-cat-rail flex select-none gap-3 overflow-x-auto pb-1 pe-4 sm:gap-3.5 md:px-1 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ touchAction: "pan-x" }}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {categories.map((c, i) => {
          const name = c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug;
          const image = c.image_url
            ? rewriteMediaUrl(c.image_url, { fallbackKey: `cat:${c.slug}` })
            : "";
          return (
            <li key={c.slug} className="shrink-0 snap-start" style={{ animationDelay: `${i * 50}ms` }}>
              <Link
                href={`/${locale}/categories/${c.slug}`}
                title={name}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="group flex w-[7.25rem] flex-col sm:w-[8.5rem]"
              >
                <span className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#e8eef0]">
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
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="absolute inset-0 bg-gradient-to-br from-teal/90 via-teal to-night transition duration-500 group-hover:scale-105"
                      aria-hidden
                    />
                  )}
                </span>
                <span className="mt-2 line-clamp-2 text-center font-display text-[12px] font-bold leading-snug text-night sm:text-[13px]">
                  {name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
