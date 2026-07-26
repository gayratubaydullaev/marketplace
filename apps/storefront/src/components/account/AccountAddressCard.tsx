"use client";

import { useTranslations } from "next-intl";
import type { Address } from "@/components/account/types";

export function AccountAddressCard({
  item,
  onEdit,
  onDelete,
  onSetDefault,
  settingDefault,
}: {
  item: Address;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  settingDefault?: boolean;
}) {
  const t = useTranslations("account");

  return (
    <li className="rounded-2xl border border-night/8 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-night">
              {item.label || item.full_name || t("addressUntitled")}
            </p>
            {item.is_default ? (
              <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-bold text-teal">
                {t("defaultAddress")}
              </span>
            ) : null}
          </div>
          {item.full_name && item.label ? (
            <p className="mt-1 text-sm text-night/70">{item.full_name}</p>
          ) : null}
          <p className="mt-1 text-sm text-muted">{item.phone}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-night/75">
            {[
              item.region,
              item.district,
              item.street,
              item.building ? `${t("fields.building")} ${item.building}` : null,
              item.apartment ? `${t("fields.apartment")} ${item.apartment}` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-teal hover:bg-teal/10"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-danger/80 hover:bg-danger-muted"
          >
            {t("delete")}
          </button>
        </div>
      </div>
      {!item.is_default ? (
        <button
          type="button"
          disabled={settingDefault}
          onClick={onSetDefault}
          className="mt-3 text-sm font-semibold text-teal hover:underline disabled:opacity-50"
        >
          {settingDefault ? t("working") : t("makeDefault")}
        </button>
      ) : null}
    </li>
  );
}
