"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import "@gayrat/map/styles.css";

const LocationPicker = dynamic(() => import("@gayrat/map").then((m) => m.LocationPicker), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[280px] rounded-xl" />,
});

export type Pin = { lat: number; lng: number };

type GeoItem = { lat: number; lng: number; display_name?: string; label?: string };

export function MapPinField({
  value,
  onChange,
  searchHint = "Search…",
  locateLabel = "My location",
  autoLocate = false,
  pinHint = "Drag the pin or tap the map to edit",
}: {
  value: Pin | null;
  onChange: (pin: Pin | null) => void;
  searchHint?: string;
  locateLabel?: string;
  autoLocate?: boolean;
  pinHint?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GeoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  const autoTried = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  async function applyPin(pin: Pin) {
    onChangeRef.current(pin);
    setHits([]);
    setErr("");
    try {
      const rev = await api<GeoItem>(`/v1/delivery/geo/reverse?lat=${pin.lat}&lng=${pin.lng}`);
      if (rev.display_name || rev.label) setQ(rev.display_name || rev.label || "");
    } catch {
      /* ignore */
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setErr("Geolocation unavailable");
      return;
    }
    setLocating(true);
    setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void applyPin({ lat: pos.coords.latitude, lng: pos.coords.longitude }).finally(() =>
          setLocating(false)
        );
      },
      () => {
        setLocating(false);
        setErr("Could not get location");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  useEffect(() => {
    if (!autoLocate || autoTried.current || value) return;
    autoTried.current = true;
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate, value]);

  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ items: GeoItem[] }>(
        `/v1/delivery/geo/search?q=${encodeURIComponent(q.trim())}&limit=5`
      );
      setHits(data.items || []);
      if (!(data.items || []).length) setErr("Not found — tap the map");
    } catch {
      setHits([]);
      setErr("Search failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal"
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
          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "…" : "OK"}
        </button>
        <button
          type="button"
          disabled={busy || locating}
          onClick={locate}
          className="rounded-xl border border-teal/40 bg-teal/10 px-3 py-2 text-xs font-semibold text-teal disabled:opacity-50"
        >
          {locating ? "…" : locateLabel}
        </button>
      </div>
      {err ? <p className="text-xs text-amber-700">{err}</p> : null}
      {hits.length > 0 ? (
        <ul className="max-h-32 overflow-y-auto rounded-xl border text-sm shadow-sm">
          {hits.map((h, i) => (
            <li key={`${h.lat}-${i}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => void applyPin({ lat: h.lat, lng: h.lng })}
              >
                {h.display_name || h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-500">{pinHint}</p>
      <div className="overflow-hidden rounded-xl border shadow-sm">
        <LocationPicker value={value} onChange={(p) => void applyPin(p)} height={280} />
      </div>
      {value ? (
        <p className="text-[11px] tabular-nums text-teal">
          ✓ {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}
