"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ComparisonToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const enabled = sp.get("compare") === "1";

  const toggle = () => {
    const params = new URLSearchParams(sp);
    if (enabled) params.delete("compare");
    else params.set("compare", "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-colors",
        enabled
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-card text-muted-foreground hover:bg-card/80",
      )}
    >
      <span
        className={cn(
          "h-3 w-3 rounded-full border",
          enabled ? "bg-primary border-primary" : "border-muted-foreground",
        )}
      />
      vs período anterior
    </button>
  );
}
