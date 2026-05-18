"use client";

import { useEffect, useState } from "react";
import { X, Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "./format";
import type { BuyerRow, BuyerJourney } from "@/lib/queries/purchases";

interface BuyerDrawerProps {
  buyer: BuyerRow | null;
  onClose: () => void;
}

function dateOnly(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function BuyerDrawer({ buyer, onClose }: BuyerDrawerProps) {
  const [journey, setJourney] = useState<BuyerJourney | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!buyer) {
      setJourney(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (buyer.buyerEmail) params.set("email", buyer.buyerEmail);
    if (buyer.buyerPhoneE164) params.set("phone", buyer.buyerPhoneE164);
    fetch(`/api/buyer-journey?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: BuyerJourney) => setJourney(j))
      .catch(() => setJourney({ purchases: [], whatsappEvents: [] }))
      .finally(() => setLoading(false));
  }, [buyer]);

  const open = !!buyer;
  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[480px] bg-card border-l border-border shadow-xl flex flex-col transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {!buyer ? null : (
          <>
            <div className="flex items-start justify-between p-5 border-b border-border/60">
              <div>
                <div className="text-lg font-semibold">{buyer.buyerName ?? "—"}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {buyer.buyerEmail ?? ""}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {buyer.buyerPhoneE164 ? `+${buyer.buyerPhoneE164}` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 w-8 rounded hover:bg-accent flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* No grupo */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  No grupo WhatsApp
                </div>
                <div className="flex items-center gap-2">
                  {buyer.inGroup === true ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">Sim</span>
                    </>
                  ) : buyer.inGroup === false ? (
                    <>
                      <X className="h-4 w-4 text-rose-400" />
                      <span className="text-rose-400 font-medium">Não</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Sem telefone</span>
                    </>
                  )}
                </div>
              </div>

              {/* Compras */}
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Compras{journey ? ` · ${journey.purchases.length}` : ""}
                </div>
                {loading ? (
                  <p className="text-xs text-muted-foreground">Carregando…</p>
                ) : !journey || journey.purchases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem compras encontradas.</p>
                ) : (
                  <div className="space-y-2">
                    {journey.purchases.map((p) => (
                      <div
                        key={p.transactionId}
                        className="rounded-md border border-border/60 p-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {p.productNameRaw ?? p.productSlug}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {fmt.shortDate(dateOnly(p.purchasedAt))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm tabular-nums">
                            {p.valueCents != null ? fmt.money(p.valueCents / 100) : "—"}
                          </div>
                          <div
                            className={cn(
                              "text-[10px] uppercase tracking-wider mt-0.5 font-semibold",
                              p.status === "approved" && "text-emerald-400",
                              p.status === "refunded" && "text-amber-400",
                              p.status === "chargeback" && "text-rose-400",
                            )}
                          >
                            {p.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Eventos de grupo */}
              {journey && journey.whatsappEvents.length > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Eventos WhatsApp
                  </div>
                  <div className="space-y-2">
                    {journey.whatsappEvents.map((ev, i) => (
                      <div
                        key={i}
                        className="text-xs flex items-center gap-2 text-muted-foreground"
                      >
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase",
                            ev.eventType === "joined"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400",
                          )}
                        >
                          {ev.eventType}
                        </span>
                        <span>{ev.groupName ?? "—"}</span>
                        <span className="ml-auto tabular-nums">
                          {fmt.shortDate(dateOnly(ev.occurredAt))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}
