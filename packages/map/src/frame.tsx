"use client";

import type { CSSProperties, ReactNode } from "react";

export type MapLegendItem = {
  color: string;
  label: string;
};

export function MapFrame({
  height = 280,
  className = "",
  empty,
  legend,
  children,
}: {
  height?: number;
  className?: string;
  empty?: string | null;
  legend?: MapLegendItem[];
  children: ReactNode;
}) {
  const style: CSSProperties = {
    height,
    minHeight: height,
    display: "flex",
    flexDirection: "column",
  };
  return (
    <div className={`gayrat-map-frame ${className}`.trim()} style={style}>
      <div className="gayrat-map-frame__body" style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {children}
        {empty ? <div className="gayrat-map-frame__empty">{empty}</div> : null}
      </div>
      {legend && legend.length > 0 ? (
        <div className="gayrat-map-frame__legend">
          {legend.map((item) => (
            <span key={item.label}>
              <span className="gayrat-map-frame__dot" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MapSkeleton({ height = 260, className = "" }: { height?: number; className?: string }) {
  return <div className={`gayrat-map-skeleton ${className}`.trim()} style={{ height, minHeight: height }} />;
}
