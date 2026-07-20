"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export function ProductGallery({
  images,
  name,
  focusIndex = 0,
}: {
  images: string[];
  name: string;
  focusIndex?: number;
}) {
  const t = useTranslations("product");
  const [active, setActive] = useState(focusIndex);
  const [lightbox, setLightbox] = useState(false);
  const touchX = useRef<number | null>(null);
  const mobileStripRef = useRef<HTMLDivElement>(null);
  const mobileThumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const desktopStripRef = useRef<HTMLDivElement>(null);
  const desktopThumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Skip desktop strip auto-scroll when user hovers thumbs (avoids scroll fight). */
  const skipDesktopScrollRef = useRef(false);
  const list = images.length > 0 ? images : [];
  const src = list[active];
  const total = list.length;
  const showDots = total > 1 && total <= 8;

  const scrollDesktopThumb = useCallback((index: number) => {
    const desktopEl = desktopThumbRefs.current[index];
    const desktopStrip = desktopStripRef.current;
    if (!desktopEl || !desktopStrip) return;
    const target =
      desktopEl.offsetTop - (desktopStrip.clientHeight - desktopEl.offsetHeight) / 2;
    desktopStrip.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, []);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (total < 2) return;
      skipDesktopScrollRef.current = false;
      setActive((i) => (i + dir + total) % total);
    },
    [total]
  );

  useEffect(() => {
    skipDesktopScrollRef.current = false;
    setActive(Math.min(Math.max(0, focusIndex), Math.max(0, total - 1)));
  }, [focusIndex, images, total]);

  useEffect(() => {
    const mobileEl = mobileThumbRefs.current[active];
    const mobileStrip = mobileStripRef.current;
    if (mobileEl && mobileStrip) {
      const target =
        mobileEl.offsetLeft - (mobileStrip.clientWidth - mobileEl.offsetWidth) / 2;
      mobileStrip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }

    if (skipDesktopScrollRef.current) {
      skipDesktopScrollRef.current = false;
      return;
    }
    scrollDesktopThumb(active);
  }, [active, scrollDesktopThumb]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    if (!lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null || total < 2) return;
    const x = e.changedTouches[0]?.clientX ?? touchX.current;
    const delta = x - touchX.current;
    touchX.current = null;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? 1 : -1);
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-clip">
      <div className="flex w-full min-w-0 flex-col items-stretch gap-3 lg:flex-row lg:items-start lg:gap-4">
        {total > 1 ? (
          <div
            ref={desktopStripRef}
            className="hidden w-[5.25rem] shrink-0 flex-col gap-2.5 overflow-y-auto overscroll-contain [scrollbar-width:none] xl:w-24 lg:flex [&::-webkit-scrollbar]:hidden"
            style={{ maxHeight: "min(84dvh, 44rem)", height: "min(84dvh, 44rem)" }}
          >
            {list.map((img, i) => (
              <button
                key={`d-${img}-${i}`}
                ref={(el) => {
                  desktopThumbRefs.current[i] = el;
                }}
                type="button"
                onClick={() => {
                  skipDesktopScrollRef.current = true;
                  setActive(i);
                }}
                onMouseEnter={() => {
                  skipDesktopScrollRef.current = true;
                  setActive(i);
                }}
                className={`aspect-square w-full shrink-0 overflow-hidden rounded-2xl border-2 transition ${
                  i === active
                    ? "border-accent opacity-100 shadow-sm"
                    : "border-transparent opacity-65 hover:opacity-100"
                }`}
                aria-label={`${i + 1} / ${total}`}
                aria-current={i === active}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative mx-auto w-full min-w-0 lg:mx-0 lg:w-auto lg:flex-1">
          {/*
            Aspect-correct frame that still fits the viewport:
            width = min(parent, maxHeight * ratio) so aspect-ratio never breaks.
            Mobile 1:1 · Desktop 4:5
          */}
          <div
            className="group relative mx-auto overflow-hidden rounded-2xl bg-surface-muted
              aspect-square w-[min(100%,min(70dvh,28rem))]
              sm:w-[min(100%,min(72dvh,32rem))]
              lg:mx-0 lg:aspect-[4/5] lg:w-[min(100%,calc(min(84dvh,44rem)*0.8))] lg:max-h-[min(84dvh,44rem)] lg:rounded-3xl lg:shadow-[0_24px_60px_-36px_rgba(11,31,36,0.4)]"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {src ? (
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in"
                onClick={() => setLightbox(true)}
                aria-label={name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-night/50 to-transparent px-5 pb-4 pt-16 text-xs font-semibold text-paper/95 opacity-0 transition duration-300 group-hover:opacity-100 lg:block">
                  {t("zoomHint")}
                </span>
              </button>
            ) : (
              <div className="flex h-full w-full items-end bg-gradient-to-br from-teal/15 to-mist p-6">
                <span className="font-display text-5xl font-extrabold text-night/12">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}

            {total > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => go(-1)}
                  className="absolute start-3 top-1/2 z-[1] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-night shadow-md transition hover:bg-white lg:flex"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => go(1)}
                  className="absolute end-3 top-1/2 z-[1] hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-night shadow-md transition hover:bg-white lg:flex"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="pointer-events-none absolute end-3 top-3 z-[1] rounded-full bg-night/55 px-2.5 py-1 text-[11px] font-bold tabular-nums text-paper backdrop-blur-sm lg:end-4 lg:top-4 lg:px-3 lg:py-1.5 lg:text-xs">
                  {active + 1} / {total}
                </div>

                {showDots ? (
                  <div className="absolute inset-x-0 bottom-3 z-[1] flex justify-center gap-1.5 lg:hidden">
                    {list.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Photo ${i + 1}`}
                        onClick={() => setActive(i)}
                        className={`h-1.5 rounded-full transition ${
                          i === active ? "w-4 bg-accent" : "w-1.5 bg-white/70"
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {total > 1 ? (
            <div
              ref={mobileStripRef}
              className="mx-auto mt-3 flex max-w-[min(100%,min(70dvh,28rem))] snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth touch-pan-x [scrollbar-width:none] sm:max-w-[min(100%,min(72dvh,32rem))] lg:hidden [&::-webkit-scrollbar]:hidden"
            >
              {list.map((img, i) => (
                <button
                  key={`m-${img}-${i}`}
                  ref={(el) => {
                    mobileThumbRefs.current[i] = el;
                  }}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`h-[4.5rem] w-[4.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border-2 transition sm:h-20 sm:w-20 ${
                    i === active ? "border-accent opacity-100" : "border-transparent opacity-70"
                  }`}
                  aria-label={`${i + 1} / ${total}`}
                  aria-current={i === active}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {lightbox && src ? (
        <div
          className="fixed inset-0 z-[70] flex max-w-[100vw] flex-col overflow-x-hidden bg-night/94"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-4"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <button
              type="button"
              className="absolute inset-0"
              aria-label="Close"
              onClick={() => setLightbox(false)}
            />
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="absolute end-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-paper transition hover:bg-white/25"
              style={{ top: "max(1rem, env(safe-area-inset-top))" }}
              aria-label="Close"
            >
              ✕
            </button>
            {total > 1 ? (
              <>
                <p
                  className="absolute start-4 z-10 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums text-paper"
                  style={{ top: "max(1rem, env(safe-area-inset-top))" }}
                >
                  {active + 1} / {total}
                </p>
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => go(-1)}
                  className="absolute start-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-paper transition hover:bg-white/25"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => go(1)}
                  className="absolute end-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-paper transition hover:bg-white/25 md:end-16"
                >
                  ›
                </button>
              </>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={name}
              className="relative z-[1] max-h-[min(78dvh,900px)] max-w-full object-contain"
            />
          </div>
          {total > 1 ? (
            <div
              className="min-w-0 shrink-0 border-t border-white/10 bg-night/80 px-3 pt-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <div className="mx-auto flex max-w-full snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {list.map((img, i) => (
                  <button
                    key={`lb-${img}-${i}`}
                    type="button"
                    onClick={() => setActive(i)}
                    className={`h-[4.75rem] w-[4.75rem] shrink-0 snap-start overflow-hidden rounded-xl border-2 sm:h-20 sm:w-20 ${
                      i === active ? "border-accent" : "border-transparent opacity-60"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
