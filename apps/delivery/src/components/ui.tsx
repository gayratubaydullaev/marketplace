"use client";

import type { ReactNode } from "react";
import {
  EmptyState as SharedEmptyState,
  Msg as SharedMsg,
  ConfirmDialog,
  LoadingBlock,
  KpiCard,
  Button,
  formatApiError,
  readApiError,
} from "@gayrat/ui";

export { ConfirmDialog, LoadingBlock, KpiCard, Button, formatApiError, readApiError };

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return <SharedEmptyState text={text} action={action} />;
}

export function Msg({
  text,
  tone = "error",
  onRetry,
  retryLabel,
}: {
  text?: string;
  tone?: "error" | "ok";
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return <SharedMsg text={text} tone={tone} onRetry={onRetry} retryLabel={retryLabel} />;
}
