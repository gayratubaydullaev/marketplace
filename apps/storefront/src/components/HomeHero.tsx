"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

export type HeroSlide = {
  id: string;
  image: string;
  headline?: string;
  sub?: string;
  cta?: string;
  href?: string;
  ctaSecondary?: string;
  hrefSecondary?: string;
  showBrand?: boolean;
};

const AUTO_MS = 6500;

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
  const [progress, setProgress] = useState(0);
  const touchX = useRef<number | null>(null);
  const reducedMotion = useRef(false);
  const total = list.length;
  const slide = list[active] || list[0];

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const goTo = useCallback(
    (index: number) => {
      if (total < 1) return;
      setActive(((index % total) + total) % total);
      setProgress(0);
    },
    [total]
  );

  const go = useCallback(
    (dir: -1 | 1) => {
      goTo(active + dir);
    },
    [active, goTo]
  );

  useEffect(() => {
    if (total < 2 || paused || reducedMotion.current) return;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - started;
      const p = Math.min(1, elapsed / AUTO_MS);
      setProgress(p);
      if (p >= 1) {
        go(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, go, paused, total]);

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
    setPaused(true);
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null || total < 2) {
      setPaused(false);
      return;
    }
    const x = e.changedTouches[0]?.clientX ?? touchX.current;
    const delta = x - touchX.current;
    touchX.current = null;
    setPaused(false);
    if (Math.abs(delta) < 48) return;
    go(delta < 0 ? 1 : -1);
  }

  if (!slide) return null;

  const showBrand = slide.showBrand !== false;
  const hasPrimary = Boolean(slide.cta?.trim() && slide.href?.trim());
  const hasSecondary = Boolean(slide.ctaSecondary?.trim() && slide.hrefSecondary?.trim());
  const hasCopy =
    showBrand || Boolean(slide.headline?.trim()) || Boolean(slide.sub?.trim()) || hasPrimary || hasSecondary;

  return (
    <section
      className="home-hero mt-1 w-full sm:mt-2"
      aria-roledescription="carousel"
      aria-label={brand}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-[0_18px_50px_-28px_rgba(11,31,36,0.45)] sm:rounded-3xl"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative h-[min(58dvh,420px)] w-full sm:h-[min(62vh,480px)]">
          {list.map((item, i) => {
            const isActive = i === active;
            return (
              <div
                key={item.id}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                  isActive ? "z-[1] opacity-100" : "z-0 pointer-events-none opacity-0"
                }`}
                aria-hidden={!isActive}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={isActive ? `live-${item.id}` : item.id}
                  src={item.image}
                  alt=""
                  draggable={false}
                  className={`h-full w-full object-cover ${isActive ? "home-hero-zoom" : ""}`}
                />
                <div
                  className={`absolute inset-0 ${
                    hasCopy
                      ? "bg-gradient-to-t from-night/75 via-night/25 to-night/10"
                      : "bg-gradient-to-t from-night/35 via-transparent to-transparent"
                  }`}
                />
              </div>
            );
          })}

          <div className="relative z-[2] flex h-full flex-col justify-end p-5 sm:p-8 md:p-10">
            {hasCopy ? (
              <div key={slide.id} className="home-hero-copy max-w-xl">
                {showBrand ? (
                  <p className="font-display text-[clamp(1.85rem,7vw,3.25rem)] font-extrabold leading-[0.95] tracking-tight text-paper">
                    {brand}
                  </p>
                ) : null}
                {slide.headline?.trim() ? (
                  <h1
                    className={`home-hero-line text-base font-semibold leading-snug text-saffron sm:text-xl md:text-2xl ${
                      showBrand ? "mt-2.5 sm:mt-3" : ""
                    }`}
                  >
                    {slide.headline}
                  </h1>
                ) : null}
                {slide.sub?.trim() ? (
                  <p className="home-hero-line home-hero-line-delay mt-2 max-w-md text-sm leading-relaxed text-paper/80 sm:text-[0.95rem]">
                    {slide.sub}
                  </p>
                ) : null}
                {hasPrimary || hasSecondary ? (
                  <div className="home-hero-line home-hero-line-delay-2 mt-5 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:items-center sm:gap-2.5">
                    {hasPrimary ? (
                      <Link
                        href={slide.href!}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-2.5 text-sm font-bold text-night transition hover:bg-accent-hover"
                      >
                        {slide.cta}
                      </Link>
                    ) : null}
                    {hasSecondary ? (
                      <Link
                        href={slide.hrefSecondary!}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-paper/35 px-6 py-2.5 text-sm font-semibold text-paper transition hover:border-paper/60 hover:bg-paper/10"
                      >
                        {slide.ctaSecondary}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {total > 1 ? (
              <div
                className={`flex items-center gap-1.5 ${hasCopy ? "mt-5 sm:mt-6" : ""}`}
                role="tablist"
                aria-label="Slides"
              >
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
                      {isActive ? (
                        <span
                          className="absolute inset-y-0 start-0 rounded-full bg-accent"
                          style={{ width: `${Math.max(progress, 0.06) * 100}%` }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
