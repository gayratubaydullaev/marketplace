"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Product } from "@/lib/api";
import { ProductSpecs } from "@/components/ProductSpecs";

export function ProductInfoSection({
  product,
  locale,
  description,
  categoryName,
  vendorName,
}: {
  product: Product;
  locale: string;
  description: string;
  categoryName?: string | null;
  vendorName?: string | null;
}) {
  const t = useTranslations("product");
  const hasDescription = Boolean(description.trim());

  const tabs: { id: "description" | "specs"; label: string }[] = [];
  if (hasDescription) tabs.push({ id: "description", label: t("description") });
  tabs.push({ id: "specs", label: t("specs") });

  const [tab, setTab] = useState<"description" | "specs">(
    hasDescription ? "description" : "specs"
  );
  const active = tabs.some((x) => x.id === tab) ? tab : tabs[0]?.id || "specs";

  return (
    <section className="mt-12 border-t border-night/8 pt-10 sm:mt-14 sm:pt-12 lg:mt-0 lg:border-t lg:pt-10">
      <div className="min-w-0 max-w-3xl lg:max-w-none">
        {tabs.length > 1 ? (
          <div
            className="flex gap-1 rounded-xl bg-night/[0.04] p-1"
            role="tablist"
            aria-label={t("aboutProduct")}
          >
            {tabs.map((item) => {
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTab(item.id)}
                  className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                    isActive
                      ? "bg-white text-night shadow-sm"
                      : "text-muted hover:text-night"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : (
          <h2 className="font-display text-lg font-bold text-night">{t("specs")}</h2>
        )}

        <div className="mt-5 lg:mt-6" role="tabpanel">
          {active === "description" ? (
            hasDescription ? (
              <div className="whitespace-pre-line text-sm leading-relaxed text-night/75 sm:text-[15px] lg:text-base lg:leading-7">
                {description}
              </div>
            ) : (
              <p className="text-sm text-muted">{t("noDescription")}</p>
            )
          ) : (
            <ProductSpecs
              product={product}
              locale={locale}
              categoryName={categoryName}
              vendorName={vendorName}
              labels={{
                sku: t("sku"),
                category: t("category"),
                vendor: t("vendor"),
                availability: t("availability"),
                inStock: t("inStock"),
                outOfStock: t("outOfStock"),
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}
