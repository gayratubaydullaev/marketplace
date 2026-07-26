import { type Product } from "@/lib/api";

/** Only use DB-hydrated `items` (never raw ES `_source`). */
export function extractSearchItems(data: { items?: Product[] }): Product[] {
  if (!Array.isArray(data.items)) return [];
  return data.items.filter((p) => p && (p.id || p.slug));
}

export function parseSuggestions(data: {
  suggestions?: string[];
  items?: string[];
}): string[] {
  const list = data.suggestions || data.items || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
  }
  return out;
}

const RECENT_KEY = "gayrat_recent_searches";

export function loadRecentSearches(limit = 6): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string, limit = 8) {
  if (typeof window === "undefined") return;
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const prev = loadRecentSearches(limit);
    const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, limit);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
