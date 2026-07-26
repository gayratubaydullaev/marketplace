"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const LocationPicker = dynamic(() => import("@gayrat/map").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[280px] rounded-2xl" />,
});

export type Pin = { lat: number; lng: number };

type GeoItem = { lat: number; lng: number; display_name?: string; label?: string };

function normalizeQ(s: string) {
  return s.replace(/[’‘ʻʼ'`]/g, "").trim();
}

function geolocationErrorMessage(code?: number) {
  if (code === 1) return "denied";
  if (code === 2) return "unavailable";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function MapPinField({
  value,
  onChange,
  searchHint = "Search address…",
  pinHint = "Tap the map to set the pin",
  contextQuery = "",
  /** When this changes (street+house+district), auto-search and place pin. */
  lookupQuery = "",
  autoLocate = true,
  locateLabel = "My location",
  locatingLabel = "Detecting…",
  locateDeniedLabel = "Location permission denied — set the pin on the map",
  locateUnavailableLabel = "Could not detect location — set the pin on the map",
  editHint = "You can drag the pin or tap the map to adjust",
}: {
  value: Pin | null;
  onChange: (pin: Pin | null) => void;
  searchHint?: string;
  pinHint?: string;
  contextQuery?: string;
  lookupQuery?: string;
  /** Try browser geolocation once when no pin is set. */
  autoLocate?: boolean;
  locateLabel?: string;
  locatingLabel?: string;
  locateDeniedLabel?: string;
  locateUnavailableLabel?: string;
  editHint?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [fromGps, setFromGps] = useState(false);
  const autoTried = useRef(false);
  const lastLookup = useRef("");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const seed = lookupQuery || contextQuery;
    if (!seeded && seed) {
      setQ(seed);
      setSeeded(true);
    } else if (lookupQuery) {
      setQ(lookupQuery);
    }
  }, [contextQuery, lookupQuery, seeded]);

  async function applyPin(pin: Pin, opts?: { gps?: boolean; keepLabel?: boolean }) {
    onChangeRef.current(pin);
    setHits([]);
    setErr("");
    setFromGps(Boolean(opts?.gps));
    if (opts?.keepLabel) return;
    try {
      const rev = await api<GeoItem>(`/v1/delivery/geo/reverse?lat=${pin.lat}&lng=${pin.lng}`);
      if (rev.display_name || rev.label) {
        setQ(rev.display_name || rev.label || "");
      }
    } catch {
      /* pin is enough */
    }
  }

  function locate(manual = false) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setErr(locateUnavailableLabel);
      return;
    }
    setLocating(true);
    setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        void applyPin(pin, { gps: true }).finally(() => setLocating(false));
      },
      (e) => {
        setLocating(false);
        const kind = geolocationErrorMessage(e?.code);
        setErr(kind === "denied" ? locateDeniedLabel : locateUnavailableLabel);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  useEffect(() => {
    if (!autoLocate || autoTried.current || value) return;
    autoTried.current = true;
    locate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate, value]);

  async function geoSearch(query: string) {
    const data = await api<{ items: GeoItem[] }>(
      `/v1/delivery/geo/search?q=${encodeURIComponent(query)}&limit=5`
    );
    return data.items || [];
  }

  async function runLookup(rawQuery: string, opts?: { fromAuto?: boolean }) {
    const query = normalizeQ(rawQuery);
    if (!query) {
      if (!opts?.fromAuto) setErr("Manzil kiriting");
      return;
    }
    setBusy(true);
    setErr("");
    setFromGps(false);
    try {
      let items = await geoSearch(query);
      let approximate = false;
      const fallbackBase = normalizeQ(lookupQuery || contextQuery || query);
      if (items.length === 0 && fallbackBase) {
        const parts = fallbackBase
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);
        const fallbacks = [
          parts.length >= 2 ? parts.slice(1).join(", ") : "",
          parts.length >= 1 ? parts[parts.length - 1] : "",
        ].filter((f, i, arr) => f && arr.indexOf(f) === i && normalizeQ(f) !== query);
        for (const fb of fallbacks) {
          await new Promise((r) => setTimeout(r, 1100));
          try {
            items = await geoSearch(fb);
          } catch {
            break;
          }
          if (items.length > 0) {
            approximate = true;
            setErr("Aniq uy topilmadi — tumanni tanlang yoki xaritadan nuqtani bosing");
            break;
          }
        }
      }
      setHits(items);
      if (items.length === 0) {
        setErr("Topilmadi — xaritadan nuqtani bosing");
      } else if (items.length === 1) {
        // Place pin even for district-level fallback so user can drag to the house.
        await applyPin({ lat: items[0].lat, lng: items[0].lng }, { keepLabel: true });
        setQ(items[0].display_name || items[0].label || query);
        setHits([]);
        if (approximate) {
          setErr("Aniq uy topilmadi — markerni uyga yaqinroq torting");
        } else {
          setErr("");
        }
      } else if (approximate) {
        setErr("Aniq uy topilmadi — tumanni tanlang yoki xaritadan nuqtani bosing");
      }
    } catch (e) {
      setHits([]);
      setErr(e instanceof Error ? e.message.slice(0, 140) : "Qidiruv xatosi");
    } finally {
      setBusy(false);
    }
  }

  // Auto geocode when street + house (+ district/region) are filled.
  useEffect(() => {
    const qn = normalizeQ(lookupQuery);
    if (!qn || qn === lastLookup.current) return;
    // Need enough parts: at least street-ish text with a number or 2+ comma segments
    const hasHouse = /\d/.test(qn);
    const parts = qn.split(",").map((p) => p.trim()).filter(Boolean);
    if (!hasHouse && parts.length < 2) return;
    const t = window.setTimeout(() => {
      lastLookup.current = qn;
      void runLookup(qn, { fromAuto: true });
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupQuery]);

  async function search() {
    await runLookup(q.trim() || lookupQuery || contextQuery);
  }

  async function onPick(pin: Pin) {
    setFromGps(false);
    await applyPin(pin);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-night/10 bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent/40 focus:bg-white"
          placeholder={searchHint}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
        />
        <button
          type="button"
          disabled={busy || locating}
          onClick={search}
          className="shrink-0 rounded-xl bg-night px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "OK"}
        </button>
        <button
          type="button"
          disabled={busy || locating}
          onClick={() => locate(true)}
          className="shrink-0 rounded-xl border border-teal/40 bg-teal/10 px-3 py-2 text-xs font-semibold text-teal disabled:opacity-50"
        >
          {locating ? locatingLabel : locateLabel}
        </button>
      </div>
      {hits.length > 0 ? (
        <ul className="max-h-36 overflow-y-auto rounded-xl border border-night/8 bg-white text-sm shadow-sm">
          {hits.map((h, i) => (
            <li key={`${h.lat}-${h.lng}-${i}`}>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left hover:bg-surface-muted"
                onClick={() => {
                  setFromGps(false);
                  void applyPin({ lat: h.lat, lng: h.lng });
                }}
              >
                {h.display_name || h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {err ? <p className="text-xs text-amber-800">{err}</p> : null}
      <p className="text-xs text-muted">{value ? editHint : pinHint}</p>
      <div className="overflow-hidden rounded-2xl border border-night/8 bg-surface-muted shadow-sm">
        <LocationPicker value={value} onChange={onPick} height={280} />
      </div>
      {value ? (
        <p className="text-[11px] tabular-nums text-teal">
          ✓ {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          {fromGps ? " · GPS" : ""}
        </p>
      ) : (
        <p className="text-[11px] text-muted">Nuqta hali tanlanmagan</p>
      )}
    </div>
  );
}
