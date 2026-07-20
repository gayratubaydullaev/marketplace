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

  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-1.5 text-sm">
      <Link
        href={page > 1 ? buildHref(path, params, page - 1) : "#"}
        aria-disabled={page <= 1}
        className={`rounded-xl border px-3 py-2 font-medium ${
          page > 1
            ? "border-night/12 bg-white hover:border-accent/40"
            : "pointer-events-none border-night/5 text-night/25"
        }`}
      >
        ←
      </Link>
      {start > 1 ? (
        <>
          <Link
            href={buildHref(path, params, 1)}
            className="rounded-xl border border-night/12 bg-white px-3 py-2 hover:border-accent/40"
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
          className={`min-w-10 rounded-xl px-3 py-2 text-center font-semibold ${
            p === page
              ? "bg-accent text-night"
              : "border border-night/12 bg-white hover:border-accent/40"
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
            className="rounded-xl border border-night/12 bg-white px-3 py-2 hover:border-accent/40"
          >
            {totalPages}
          </Link>
        </>
      ) : null}
      <Link
        href={page < totalPages ? buildHref(path, params, page + 1) : "#"}
        aria-disabled={page >= totalPages}
        className={`rounded-xl border px-3 py-2 font-medium ${
          page < totalPages
            ? "border-night/12 bg-white hover:border-accent/40"
            : "pointer-events-none border-night/5 text-night/25"
        }`}
      >
        →
      </Link>
    </div>
  );
}
