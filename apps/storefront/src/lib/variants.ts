import type { Variant } from "@/lib/api";
import { variantImageList } from "@/lib/api";

export type ParsedVariant = {
  variant: Variant;
  color: string;
  size: string;
};

function attrString(attrs: unknown, ...keys: string[]): string | null {
  if (!attrs || typeof attrs !== "object" || Array.isArray(attrs)) return null;
  const record = attrs as Record<string, unknown>;
  for (const key of keys) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Split "Qora / M" style titles, or read color/size from attributes. */
export function parseVariantAxes(variant: Variant): { color: string | null; size: string | null } {
  const color =
    attrString(variant.attributes, "color", "rang", "Colour", "Color") || null;
  const size =
    attrString(variant.attributes, "size", "olcham", "o'lcham", "Size") || null;

  if (color && size) return { color, size };

  const title = (variant.title || "").trim();
  const parts = title.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      color: color || parts[0],
      size: size || parts.slice(1).join(" / "),
    };
  }
  return { color, size };
}

export function buildVariantMatrix(variants: Variant[]): {
  items: ParsedVariant[];
  colors: string[];
  sizes: string[];
} | null {
  if (variants.length < 2) return null;
  const items: ParsedVariant[] = [];
  for (const variant of variants) {
    const { color, size } = parseVariantAxes(variant);
    if (!color || !size) return null;
    items.push({ variant, color, size });
  }
  const colors = [...new Set(items.map((i) => i.color))];
  const sizes = [...new Set(items.map((i) => i.size))];
  if (colors.length < 2 && sizes.length < 2) return null;
  return { items, colors, sizes };
}

export function findVariant(
  items: ParsedVariant[],
  color: string,
  size: string
): ParsedVariant | undefined {
  return items.find((i) => i.color === color && i.size === size);
}

export function colorCover(items: ParsedVariant[], color: string): string | undefined {
  const match = items.find((i) => i.color === color && variantImageList(i.variant)[0]);
  return match ? variantImageList(match.variant)[0] : undefined;
}

export function sizeAvailable(
  items: ParsedVariant[],
  color: string,
  size: string
): boolean {
  const hit = findVariant(items, color, size);
  if (!hit) return false;
  const q = hit.variant.inventory_quantity;
  return typeof q !== "number" || q > 0;
}
