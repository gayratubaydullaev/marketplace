import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
} from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }>) {
  const styles =
    variant === "secondary"
      ? "border border-teal-800/20 bg-white text-teal-900"
      : variant === "ghost"
        ? "bg-transparent text-teal-900 hover:bg-teal-50"
        : "bg-teal text-white hover:bg-teal-800";
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-teal-600",
        props.className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" }>) {
  const styles =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-900"
        : tone === "danger"
          ? "bg-rose-100 text-rose-800"
          : "bg-stone-100 text-stone-700";
  return (
    <span {...props} className={cx("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", styles, props.className)}>
      {children}
    </span>
  );
}

export function Card({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div {...props} className={cx("rounded-lg border border-stone-200 bg-white p-4 shadow-sm", props.className)}>
      {children}
    </div>
  );
}
