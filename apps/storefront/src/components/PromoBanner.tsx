import Link from "next/link";

export function PromoBanner({
  title,
  sub,
  cta,
  href,
  image,
}: {
  title?: string;
  sub?: string;
  cta?: string;
  href?: string;
  image: string;
}) {
  const hasText = Boolean(title?.trim() || sub?.trim());
  const hasCta = Boolean(cta?.trim() && href?.trim());
  const inner = (
    <div className="relative aspect-[16/7] min-h-[9.5rem] w-full sm:aspect-[21/7] sm:min-h-[11rem]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
      />
      {hasText || hasCta ? (
        <div className="absolute inset-0 bg-gradient-to-r from-night/90 via-night/55 to-night/20" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-t from-night/25 via-transparent to-transparent" />
      )}
      {hasText || hasCta ? (
        <div className="absolute inset-0 flex flex-col justify-center px-5 py-6 sm:px-10 sm:py-8 md:px-12">
          {title?.trim() ? (
            <p className="max-w-md font-display text-xl font-bold leading-tight text-paper sm:text-3xl md:text-4xl">
              {title}
            </p>
          ) : null}
          {sub?.trim() ? (
            <p className="mt-2 max-w-sm text-sm text-paper/75 sm:mt-3 sm:text-base">{sub}</p>
          ) : null}
          {hasCta ? (
            <span className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-night transition group-hover:bg-accent-hover sm:mt-5">
              {cta}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="home-section mt-14 sm:mt-16">
      {hasCta ? (
        <Link href={href!} className="group relative block overflow-hidden rounded-3xl">
          {inner}
        </Link>
      ) : (
        <div className="group relative overflow-hidden rounded-3xl">{inner}</div>
      )}
    </section>
  );
}
