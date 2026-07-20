export default function Loading() {
  return (
    <div className="animate-pulse py-8" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-40 rounded-lg bg-night/10" />
      <div className="mt-3 h-4 w-64 max-w-full rounded bg-night/5" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2.5">
            <div className="aspect-[3/4] rounded-2xl bg-night/8" />
            <div className="h-3.5 w-2/3 rounded bg-night/10" />
            <div className="h-3 w-full rounded bg-night/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
