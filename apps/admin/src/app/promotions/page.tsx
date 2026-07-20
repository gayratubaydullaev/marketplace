"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, SectionTabs, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Coupon = {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order?: number;
  status?: string;
  active?: boolean;
};

type GiftCert = {
  id: string;
  code: string;
  balance: number;
  currency?: string;
  status?: string;
};

type Tab = "coupons" | "gifts";

export default function PromotionsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("coupons");

  const [code, setCode] = useState("");
  const [type, setType] = useState("percent");
  const [value, setValue] = useState(15);
  const [minOrder, setMinOrder] = useState(0);
  const [items, setItems] = useState<Coupon[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

  const [giftCode, setGiftCode] = useState("");
  const [giftBalance, setGiftBalance] = useState(100000);
  const [gifts, setGifts] = useState<GiftCert[]>([]);
  const [giftEditId, setGiftEditId] = useState<string | null>(null);

  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function loadCoupons() {
    const data = await api<{ items: Coupon[] }>("/v1/admin/coupons");
    setItems(data.items || []);
  }

  async function loadGifts() {
    const data = await api<{ items: GiftCert[] }>("/v1/admin/gift-certificates");
    setGifts(data.items || []);
  }

  useEffect(() => {
    loadCoupons().catch((e) => setMsg(errMsg(e)));
    loadGifts().catch((e) => setMsg(errMsg(e)));
  }, []);

  async function createCoupon() {
    setMsg("");
    await api("/v1/admin/coupons", {
      method: "POST",
      body: JSON.stringify({ code, type, value, min_order: minOrder, status: "active" }),
    });
    setCode("");
    setOk(t("promoCouponCreated"));
    await loadCoupons();
  }

  async function saveCouponEdit(id: string) {
    setMsg("");
    await api(`/v1/admin/coupons/${id}`, {
      method: "PUT",
      body: JSON.stringify({ type, value, min_order: minOrder, status: "active" }),
    });
    setEditId(null);
    setOk(t("promoCouponUpdated"));
    await loadCoupons();
  }

  async function removeCoupon(id: string) {
    if (!confirm(t("promoDeleteCoupon"))) return;
    await api(`/v1/admin/coupons/${id}`, { method: "DELETE" });
    setOk(t("promoDeleted"));
    await loadCoupons();
  }

  function startCouponEdit(c: Coupon) {
    setEditId(c.id);
    setType(c.type);
    setValue(c.value);
    setMinOrder(c.min_order || 0);
  }

  async function createGift() {
    setMsg("");
    await api("/v1/admin/gift-certificates", {
      method: "POST",
      body: JSON.stringify({ code: giftCode, balance: giftBalance, currency: "UZS", status: "active" }),
    });
    setGiftCode("");
    setOk(t("promoGiftCreated"));
    await loadGifts();
  }

  async function saveGiftEdit(id: string) {
    setMsg("");
    await api(`/v1/admin/gift-certificates/${id}`, {
      method: "PUT",
      body: JSON.stringify({ balance: giftBalance, status: "active" }),
    });
    setGiftEditId(null);
    setOk(t("promoGiftUpdated"));
    await loadGifts();
  }

  async function removeGift(id: string) {
    if (!confirm(t("promoDeleteGift"))) return;
    await api(`/v1/admin/gift-certificates/${id}`, { method: "DELETE" });
    setOk(t("promoDeleted"));
    await loadGifts();
  }

  function startGiftEdit(g: GiftCert) {
    setGiftEditId(g.id);
    setGiftBalance(g.balance);
  }

  return (
    <div>
      <PageHeader title={t("pagePromotionsTitle")} description={t("pagePromotionsDesc")} />
      <div className="mt-4">
        <SectionTabs
          items={[
            { id: "coupons", label: t("promoTabCoupons") },
            { id: "gifts", label: t("promoTabGifts") },
          ]}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      </div>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      {tab === "coupons" ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input className="max-w-40" placeholder="CODE" value={code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)} />
            <select className="rounded border px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
            <Input className="w-28" type="number" value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(Number(e.target.value))} />
            <Input
              className="w-36"
              type="number"
              placeholder="min order"
              value={minOrder}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinOrder(Number(e.target.value))}
            />
            <Button onClick={() => createCoupon().catch((e) => setMsg(errMsg(e)))}>{t("promoCreate")}</Button>
          </div>
          {items.length === 0 ? (
            <div className="mt-6">
              <EmptyState text={t("promoEmptyCoupons")} />
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {items.map((coupon) => (
                <Card key={coupon.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{coupon.code}</strong> · {coupon.value}
                      {coupon.type === "percent" ? "%" : " UZS"}
                      {coupon.min_order ? ` · min ${coupon.min_order}` : ""}
                    </span>
                    <StatusBadge status={coupon.status || (coupon.active ? "active" : "—")} />
                  </div>
                  {editId === coupon.id ? (
                    <div className="flex flex-wrap gap-2">
                      <select className="rounded border px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="percent">percent</option>
                        <option value="fixed">fixed</option>
                      </select>
                      <Input className="w-24" type="number" value={value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(Number(e.target.value))} />
                      <Input className="w-28" type="number" value={minOrder} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinOrder(Number(e.target.value))} />
                      <Button onClick={() => saveCouponEdit(coupon.id).catch((e) => setMsg(errMsg(e)))}>{t("promoSave")}</Button>
                      <Button variant="ghost" onClick={() => setEditId(null)}>
                        {t("promoCancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-x-2">
                      <Button variant="ghost" onClick={() => startCouponEdit(coupon)}>
                        {t("promoEdit")}
                      </Button>
                      <Button variant="ghost" onClick={() => removeCoupon(coupon.id).catch((e) => setMsg(errMsg(e)))}>
                        {t("promoDelete")}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              className="max-w-40"
              placeholder="GIFTCODE"
              value={giftCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGiftCode(e.target.value)}
            />
            <Input
              className="w-40"
              type="number"
              placeholder="balance"
              value={giftBalance}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGiftBalance(Number(e.target.value))}
            />
            <Button onClick={() => createGift().catch((e) => setMsg(errMsg(e)))}>{t("promoCreate")}</Button>
          </div>
          {gifts.length === 0 ? (
            <div className="mt-6">
              <EmptyState text={t("promoEmptyGifts")} />
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {gifts.map((gift) => (
                <Card key={gift.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{gift.code}</strong> · {gift.balance.toLocaleString()} {gift.currency || "UZS"}
                    </span>
                    <StatusBadge status={gift.status || "—"} />
                  </div>
                  {giftEditId === gift.id ? (
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="w-36"
                        type="number"
                        value={giftBalance}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGiftBalance(Number(e.target.value))}
                      />
                      <Button onClick={() => saveGiftEdit(gift.id).catch((e) => setMsg(errMsg(e)))}>{t("promoSave")}</Button>
                      <Button variant="ghost" onClick={() => setGiftEditId(null)}>
                        {t("promoCancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-x-2">
                      <Button variant="ghost" onClick={() => startGiftEdit(gift)}>
                        {t("promoEdit")}
                      </Button>
                      <Button variant="ghost" onClick={() => removeGift(gift.id).catch((e) => setMsg(errMsg(e)))}>
                        {t("promoDelete")}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
