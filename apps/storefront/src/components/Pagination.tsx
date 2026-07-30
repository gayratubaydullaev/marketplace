import Link from "next/link";

function buildHref(basePath: string, params: Record<string, string | undefined>, page: number) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      {dir === "prev" ? (
        <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export function Pagination({
  locale,
  basePath,
  page,
  pageSize,
  total,
  params = {},
}: {
  locale: string;
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  params?: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const path = basePath.startsWith("/") ? basePath : `/${locale}${basePath}`;

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const navBtn = (enabled: boolean) =>
    `inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border px-2.5 font-medium transition ${
      enabled
        ? "border-night/12 bg-white text-night hover:border-teal/40 hover:text-teal"
        : "pointer-events-none border-night/5 text-night/25"
    }`;

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5 text-sm" aria-label="Pagination">
      <Link
        href={page > 1 ? buildHref(path, params, page - 1) : "#"}
        aria-disabled={page <= 1}
        aria-label="Previous page"
        className={navBtn(page > 1)}
      >
        <Chevron dir="prev" />
      </Link>
      {start > 1 ? (
        <>
          <Link
            href={buildHref(path, params, 1)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-night/12 bg-white px-3 font-medium hover:border-teal/40"
          >
            1
          </Link>
          {start > 2 ? <span className="px-1 text-night/35">…</span> : null}
        </>
      ) : null}
      {pages.map((p) => (
        <Link
          key={p}
          href={buildHref(path, params, p)}
          aria-current={p === page ? "page" : undefined}
          className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl px-3 text-center font-semibold transition ${
            p === page
              ? "bg-accent text-night"
              : "border border-night/12 bg-white hover:border-teal/40"
          }`}
        >
          {p}
        </Link>
      ))}
      {end < totalPages ? (
        <>
          {end < totalPages - 1 ? <span className="px-1 text-night/35">…</span> : null}
          <Link
            href={buildHref(path, params, totalPages)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-night/12 bg-white px-3 font-medium hover:border-teal/40"
          >
            {totalPages}
          </Link>
        </>
      ) : null}
      <Link
        href={page < totalPages ? buildHref(path, params, page + 1) : "#"}
        aria-disabled={page >= totalPages}
        aria-label="Next page"
        className={navBtn(page < totalPages)}
      >
        <Chevron dir="next" />
      </Link>
    </nav>
  );
}
