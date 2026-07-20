"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";

type Phase = "checking" | "paid" | "failed" | "pending" | "timeout" | "error";

type PaymentList = {
  items?: Array<{ status?: string }>;
  payment_status?: string;
  status?: string;
};

type OrderPayload = {
  payment_status?: string;
  status?: string;
  order?: { order_number?: string; payment_status?: string; status?: string };
};

function normalize(raw: string): Phase {
  const v = raw.toLowerCase();
  if (["paid", "succeeded", "success", "confirmed"].includes(v)) return "paid";
  if (["failed", "cancelled", "canceled", "rejected"].includes(v)) return "failed";
  return "pending";
}

export default function PaymentReturnPage() {
  const locale = useLocale();
  const t = useTranslations("checkout");
  const params = useParams();
  const orderId = String(params.id || "");
  const clear = useCart((s) => s.clear);
  const [phase, setPhase] = useState<Phase>("checking");
  const [detail, setDetail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const stopped = useRef(false);
  const cleared = useRef(false);

  useEffect(() => {
    const n = sessionStorage.getItem("pending_order_number") || "";
    if (n) setOrderNumber(n);
  }, []);

  useEffect(() => {
    if (!orderId) {
      setPhase("error");
      setDetail("Missing order id");
      return;
    }
    stopped.current = false;
    let attempts = 0;

    const check = async () => {
      if (stopped.current) return;
      attempts += 1;
      try {
        const payment = await api<PaymentList>(`/v1/payments/order/${orderId}`);
        const fromItems = payment.items?.[0]?.status;
        const raw = fromItems || payment.payment_status || payment.status || "";
        if (raw) {
          const next = normalize(raw);
          setPhase(next === "pending" ? "pending" : next);
          setDetail(raw);
          if (next === "paid" || next === "failed") {
            stopped.current = true;
            if (next === "paid" && !cleared.current) {
              cleared.current = true;
              clear();
              sessionStorage.removeItem("pending_order_id");
              sessionStorage.removeItem("pending_order_number");
            }
            return;
          }
        } else {
          const order = await api<OrderPayload>(`/v1/orders/${orderId}`);
          const oRaw =
            order.order?.payment_status ||
            order.payment_status ||
            order.order?.status ||
            order.status ||
            "pending";
          if (order.order?.order_number) setOrderNumber(order.order.order_number);
          const next = normalize(oRaw);
          setPhase(next === "pending" ? "pending" : next);
          setDetail(oRaw);
          if (next === "paid" || next === "failed") {
            stopped.current = true;
            if (next === "paid" && !cleared.current) {
              cleared.current = true;
              clear();
              sessionStorage.removeItem("pending_order_id");
              sessionStorage.removeItem("pending_order_number");
            }
            return;
          }
        }
      } catch (err) {
        setDetail(err instanceof Error ? err.message : "Unable to verify payment");
        if (attempts >= 15) {
          setPhase("error");
          stopped.current = true;
          return;
        }
      }
      if (attempts >= 15) {
        setPhase("timeout");
        setDetail(t("paymentPending"));
        stopped.current = true;
        return;
      }
      window.setTimeout(check, 2000);
    };

    check();
    return () => {
      stopped.current = true;
    };
  }, [orderId, clear, t]);

  const tone =
    phase === "paid"
      ? "text-teal"
      : phase === "failed" || phase === "error"
        ? "text-rose-700"
        : "text-night/70";

  const title =
    phase === "paid"
      ? t("success")
      : phase === "failed"
        ? t("paymentFailed")
        : phase === "timeout"
          ? t("stillWaiting")
          : phase === "error"
            ? t("verifyError")
            : t("confirming");

  return (
    <div className="mx-auto max-w-xl animate-rise text-center">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      {phase === "paid" && orderNumber ? (
        <p className="mt-3 text-lg font-semibold text-teal">
          {t("orderNumber")}: {orderNumber}
        </p>
      ) : null}
      {detail ? <p className={`mt-4 text-lg ${tone}`}>{detail}</p> : null}
      {phase === "checking" || phase === "pending" ? (
        <p className="mt-2 text-sm text-night/50">{t("polling")}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={`/${locale}/orders/${orderId}`}
          className="inline-block rounded-full bg-teal px-6 py-3 font-bold text-paper"
        >
          {t("viewOrder")}
        </Link>
        <Link
          href={`/${locale}/products`}
          className="inline-block rounded-full border border-night/15 px-6 py-3 font-bold"
        >
          {t("browse")}
        </Link>
      </div>
    </div>
  );
}
