"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card que recolhe/expande ao clicar no cabeçalho. Seções de detalhe (listas
 * longas) começam recolhidas por padrão (pedido do Tiago: "começar recolhido,
 * abre se quiser"). Os filhos só montam quando aberto — DOM leve quando fechado.
 */
export function CollapsibleCard({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="bg-card border-border/60 mb-6">
      <CardHeader
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="cursor-pointer select-none"
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground/70 transition-transform shrink-0",
              open ? "rotate-180" : "",
            )}
          />
        </div>
        {subtitle ? <p className="text-xs text-muted-foreground/70">{subtitle}</p> : null}
      </CardHeader>
      {open ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}
