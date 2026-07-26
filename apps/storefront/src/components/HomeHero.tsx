"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCarouselDrag } from "@/lib/useCarouselDrag";
import { track } from "@/lib/track";

export type HeroSlide = {
  id: string;
  image: string;
  /** Whole image is the CTA when set (internal or external). */
  href?: string;
  /** Dwell time before auto-advance (ms). */
  intervalMs?: number;
};

function isExternalHref(href: string) {
  return /^(https?:|mailto:|tel:)/i.test(href);
}

function SlideLink({
  href,
  className,
  children,
  onNavigate,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  if (!href?.trim()) {
    return <div className={className}>{children}</div>;
  }
  if (isExternalHref(href)) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={() => onNavigate?.()}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={() => onNavigate?.()}
    >
      {children}
    </Link>
  );
}

export function HomeHero({
  brand,
  slides,
}: {
  brand: string;
  slides: HeroSlide[];
}) {
  const list = slides.length > 0 ? slides : [];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);
  const total = list.length;
  const slide = list[active] || list[0];
  const autoMs = Math.max(2000, Math.min(120000, slide?.intervalMs || 6500));
  const multi = total > 1;

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (total < 1) return;
      setActive(((index % total) + total) % total);
    },
    [total]
  );

  const go = useCallback(
    (dir: -1 | 1) => {
      goTo(active + dir);
    },
    [active, goTo]
  );

  const drag = useCarouselDrag({
    enabled: multi,
    onSwipe: go,
    onPause: setPaused,
  });

  useEffect(() => {
    if (!multi || paused || reducedMotion.current) return;
    const timer = window.setTimeout(() => go(1), autoMs);
    return () => window.clearTimeout(timer);
  }, [active, autoMs, go, multi, paused]);

  useEffect(() => {
    if (!slide?.id) return;
    track("banner_impression", slide.id, { kind: "hero", href: slide.href || "" });
  }, [slide?.id, slide?.href]);

  if (!slide) return null;

  return (
    <section
      className="home-hero mt-0"
      aria-roledescription="carousel"
      aria-label={brand}
    >
      <div
        className={`relative overflow-hidden rounded-2xl bg-night md:rounded-3xl md:shadow-[0_18px_50px_-28px_rgba(11,31,36,0.45)] ${
          multi ? (drag.dragging ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onPointerDown={drag.onPointerDown}
        onClickCapture={drag.onClickCapture}
        onDragStart={drag.onDragStart}
      >
        {multi ? (
          <>
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(-1)}
              className="absolute start-2 top-1/2 z-[3] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-paper/25 bg-night/50 text-base text-paper transition hover:bg-night/70 sm:start-3 sm:h-10 sm:w-10 sm:text-lg"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(1)}
              className="absolute end-2 top-1/2 z-[3] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-paper/25 bg-night/50 text-base text-paper transition hover:bg-night/70 sm:end-3 sm:h-10 sm:w-10 sm:text-lg"
            >
              ›
            </button>
          </>
        ) : null}

        <div className="relative aspect-[2/1] w-full max-h-[min(38dvh,16rem)] select-none sm:aspect-[3/2] sm:max-h-[min(52vh,30rem)] lg:max-h-[32rem]">
          {list.map((item, i) => {
            const isActive = i === active;
            const near = Math.abs(i - active) <= 1 || (active === 0 && i === total - 1) || (active === total - 1 && i === 0);
            if (!isActive && !near) return null;
            return (
              <div
                key={item.id}
                className={`absolute inset-0 transition-opacity duration-500 ease-out ${
                  isActive ? "z-[1] opacity-100" : "z-0 pointer-events-none opacity-0"
                }`}
                aria-hidden={!isActive}
              >
                <SlideLink
                  href={isActive ? item.href : undefined}
                  className="absolute inset-0 block overflow-hidden"
                  onNavigate={() =>
                    track("banner_click", item.id, { kind: "hero", href: item.href || "" })
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt=""
                    draggable={false}
                    decoding="async"
                    fetchPriority={isActive ? "high" : "low"}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </SlideLink>
              </div>
            );
          })}

          {multi ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-end justify-center bg-gradient-to-t from-night/40 via-night/10 to-transparent p-4 sm:p-5"
              role="tablist"
              aria-label="Slides"
            >
              <div className="pointer-events-auto flex items-center gap-1.5">
                {list.map((item, i) => {
                  const isActive = i === active;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`${i + 1} / ${total}`}
                      onClick={() => goTo(i)}
                      className={`relative h-1.5 overflow-hidden rounded-full transition-all ${
                        isActive ? "w-7 bg-paper/25" : "w-1.5 bg-paper/35 hover:bg-paper/55"
                      }`}
                    >
                      {isActive && !reducedMotion.current ? (
                        <span
                          key={`prog-${active}-${paused ? "p" : "r"}`}
                          className={`banner-progress-bar absolute inset-y-0 start-0 w-full origin-left rounded-full bg-accent ${
                            paused ? "banner-progress-paused" : ""
                          }`}
                          style={{ animationDuration: `${autoMs}ms` }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
