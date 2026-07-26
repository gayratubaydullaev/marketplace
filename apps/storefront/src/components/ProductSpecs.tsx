import { productAttributeRows, type Product } from "@/lib/api";

export function ProductSpecs({
  product,
  locale,
  categoryName,
  vendorName,
  labels,
}: {
  product: Product;
  locale: string;
  categoryName?: string | null;
  vendorName?: string | null;
  labels: {
    sku: string;
    category: string;
    vendor: string;
    availability: string;
    inStock: string;
    outOfStock: string;
  };
}) {
  const attrs = productAttributeRows(product.attributes);
  const stock = product.inventory_quantity;
  const inStock = typeof stock !== "number" || stock > 0;

  const meta: { key: string; value: string }[] = [];
  if (product.sku) meta.push({ key: labels.sku, value: product.sku });
  if (categoryName) meta.push({ key: labels.category, value: categoryName });
  if (vendorName) meta.push({ key: labels.vendor, value: vendorName });
  meta.push({
    key: labels.availability,
    value: inStock ? labels.inStock : labels.outOfStock,
  });

  const rows = [...meta, ...attrs.map((a) => ({ key: a.key, value: a.value }))];
  if (rows.length === 0) return null;

  return (
    <dl className="divide-y divide-night/6 overflow-hidden rounded-2xl border border-night/8 bg-white/60">
      {rows.map((row, i) => (
        <div
          key={`${row.key}-${i}`}
          className="grid grid-cols-[minmax(7rem,0.4fr)_minmax(0,1fr)] gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,1fr)] sm:px-5"
        >
          <dt className="font-medium capitalize text-muted">{formatAttrKey(row.key, locale)}</dt>
          <dd className="min-w-0 break-words font-semibold text-night">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatAttrKey(key: string, locale: string) {
  if (/[A-ZА-ЯЁЎҚҒҲ]/.test(key) || key.includes(" ")) return key;
  const spaced = key.replace(/[_-]+/g, " ");
  try {
    return spaced.replace(/^\w/, (c) => c.toLocaleUpperCase(locale));
  } catch {
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }
}
