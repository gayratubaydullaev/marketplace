"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type User = {
  id: string;
  email: string;
  role: string;
  status: string;
  first_name?: string;
  last_name?: string;
};

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<User[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ items: User[] }>("/v1/admin/users")
      .then((d) => setItems(d.items || []))
      .catch((e) => setMsg(errMsg(e)));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (u) =>
        u.email.toLowerCase().includes(needle) ||
        `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase().includes(needle) ||
        u.role.toLowerCase().includes(needle)
    );
  }, [items, q]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title={t("pageCustomersTitle")} description={t("pageCustomersDesc")} />
      <Input
        className="mb-4 max-w-sm"
        placeholder={t("customersSearch")}
        value={q}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <Msg text={msg} />
      {pageItems.length === 0 ? (
        <EmptyState text={t("customersEmpty")} />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <Link href={`/customers/${u.id}`} className="font-medium text-teal hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </div>
  );
}
