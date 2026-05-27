"use client";

import { useState } from "react";
import { Mail, Check, X } from "lucide-react";
import { fmt } from "./format";
import { BuyerDrawer } from "./buyer-drawer";
import type { BuyerRow } from "@/lib/queries/purchases";

interface Props {
  buyers: BuyerRow[];
  /** Mostra status "No grupo" — só faz sentido no /desafio (Guia não tem grupo WhatsApp) */
  showInGroup?: boolean;
}

function formatPhone(e164: string | null): string {
  if (!e164) return "—";
  // 5511987654321 → +55 11 98765-4321
  if (e164.length < 12) return `+${e164}`;
  const cc = e164.slice(0, 2);
  const ddd = e164.slice(2, 4);
  const rest = e164.slice(4);
  if (rest.length === 9) {
    return `+${cc} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  return `+${cc} ${ddd} ${rest.slice(0, -4)}-${rest.slice(-4)}`;
}

function whatsappLink(e164: string | null): string | null {
  return e164 ? `https://wa.me/${e164}` : null;
}

function dateOnly(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h) % 360;
}

function avatarFor(name: string | null): { initials: string; gradient: string } {
  if (!name) {
    return {
      initials: "?",
      gradient: "linear-gradient(135deg, hsl(0, 0%, 35%) 0%, hsl(0, 0%, 25%) 100%)",
    };
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase()
      : parts[0]?.slice(0, 2).toUpperCase() ?? "?";
  const hue = hashHue(name);
  const gradient = `linear-gradient(135deg, hsl(${hue}, 55%, 50%) 0%, hsl(${(hue + 20) % 360}, 60%, 38%) 100%)`;
  return { initials, gradient };
}

const WhatsappIcon = () => (
  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.5 14.4c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1-.2.2-.6.7-.7.9-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.4-.5-.6-1-1.2-1.4-1.9-.1-.2 0-.4.1-.5.1-.1.2-.3.4-.4.1-.1.2-.3.2-.4 0-.1 0-.3-.1-.4-.1-.1-.6-1.4-.8-1.9-.1-.5-.3-.4-.5-.4h-.4c-.2 0-.5.1-.7.3-.7.6-1 1.3-.9 2.2.1.9.4 1.8.9 2.6 1 1.4 2.2 2.6 3.6 3.4.4.2.8.4 1.2.5.4.1.8.2 1.3.2.5.1.9-.2 1.3-.4.4-.3.7-.7.8-1.2.1-.2.1-.4.1-.6 0-.1 0-.3-.1-.4Zm-5.2 7.3h-.1c-1.7 0-3.4-.4-4.9-1.3l-.3-.2-3.6.9.9-3.5-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9 2.7 0 5.1 1 6.9 2.9 1.9 1.9 2.9 4.3 2.9 7 0 5.4-4.4 9.8-9.9 9.8Z" />
  </svg>
);

function GroupPill({ status }: { status: boolean | null | undefined }) {
  if (status === true) {
    return (
      <span className="font-mono text-[10px] tracking-wider font-medium px-1.5 py-0.5 rounded uppercase inline-flex items-center gap-1 bg-emerald-400/15 text-emerald-400">
        <Check className="h-2.5 w-2.5" /> No grupo
      </span>
    );
  }
  if (status === false) {
    return (
      <span className="font-mono text-[10px] tracking-wider font-medium px-1.5 py-0.5 rounded uppercase inline-flex items-center gap-1 bg-rose-400/15 text-rose-400">
        <X className="h-2.5 w-2.5" /> Fora do grupo
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] tracking-wider font-medium px-1.5 py-0.5 rounded uppercase bg-muted text-muted-foreground/70">
      —
    </span>
  );
}

export function BuyersTable({ buyers, showInGroup = false }: Props) {
  const [selected, setSelected] = useState<BuyerRow | null>(null);

  if (buyers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum comprador aprovado no período.
      </p>
    );
  }

  const totalRevenue = buyers.reduce(
    (sum, b) => sum + (b.valueCents != null ? b.valueCents / 100 : 0),
    0,
  );
  const withPhone = buyers.filter((b) => b.buyerPhoneE164).length;
  const inGroup = buyers.filter((b) => b.inGroup === true).length;

  // Grid template muda quando há ou não coluna de grupo
  const gridCols = showInGroup
    ? "grid-cols-[36px_1fr_auto_auto_auto]"
    : "grid-cols-[36px_1fr_auto_auto]";

  return (
    <>
      <div className="space-y-2">
        {buyers.map((b) => {
          const phone = b.buyerPhoneE164;
          const phoneLink = whatsappLink(phone);
          const avatar = avatarFor(b.buyerName);

          return (
            <article
              key={b.transactionId}
              onClick={() => setSelected(b)}
              className="rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-hi hover:bg-accent/20 cursor-pointer"
            >
              <div className={`grid ${gridCols} items-center gap-3 sm:gap-4`}>
                {/* Avatar */}
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center font-mono text-xs font-semibold text-white border border-white/10 flex-shrink-0"
                  style={{ background: avatar.gradient }}
                >
                  {avatar.initials}
                </div>

                {/* Nome + contato */}
                <div className="min-w-0">
                  <div className="font-medium leading-tight truncate text-foreground">
                    {b.buyerName ?? "—"}
                  </div>
                  {phoneLink ? (
                    <a
                      href={phoneLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors mt-1"
                    >
                      <WhatsappIcon />
                      {formatPhone(phone)}
                    </a>
                  ) : b.buyerEmail ? (
                    <a
                      href={`mailto:${b.buyerEmail}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
                      title="Hotmart não enviou telefone — usando email"
                    >
                      <Mail className="h-3 w-3" />
                      <span className="truncate max-w-[260px]">{b.buyerEmail}</span>
                    </a>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground/60 mt-1 inline-block">
                      sem contato
                    </span>
                  )}
                </div>

                {/* Valor */}
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 font-medium">
                    Valor
                  </div>
                  <div className="font-mono tabular-nums font-medium text-[17px] tracking-tight mt-0.5">
                    {b.valueCents != null
                      ? fmt.money(b.valueCents / 100)
                      : "—"}
                  </div>
                </div>

                {/* Data */}
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60 font-medium">
                    Comprou em
                  </div>
                  <div className="font-mono tabular-nums text-sm mt-0.5">
                    {fmt.shortDate(dateOnly(b.purchasedAt))}
                  </div>
                </div>

                {/* No grupo (só /desafio) */}
                {showInGroup && (
                  <div className="ml-2">
                    <GroupPill status={b.inGroup} />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Summary strip */}
      <div className="mt-4 rounded-md border border-border bg-card p-4">
        <div
          className={`grid gap-6 ${
            showInGroup ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"
          }`}
        >
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Total
            </div>
            <div className="font-mono tabular-nums font-medium text-xl leading-none tracking-tight mt-1.5">
              {fmt.int(buyers.length)} compradores
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Receita
            </div>
            <div className="font-mono tabular-nums font-medium text-xl leading-none tracking-tight mt-1.5">
              {fmt.money(totalRevenue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              Com telefone
            </div>
            <div
              className={`font-mono tabular-nums font-medium text-xl leading-none tracking-tight mt-1.5 ${
                withPhone === buyers.length
                  ? "text-emerald-400"
                  : withPhone === 0
                    ? "text-muted-foreground"
                    : ""
              }`}
            >
              {withPhone} / {buyers.length}
            </div>
          </div>
          {showInGroup && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                No grupo
              </div>
              <div
                className={`font-mono tabular-nums font-medium text-xl leading-none tracking-tight mt-1.5 ${
                  inGroup === buyers.length
                    ? "text-emerald-400"
                    : inGroup === 0
                      ? "text-rose-400"
                      : ""
                }`}
              >
                {inGroup} / {buyers.length}
              </div>
            </div>
          )}
        </div>
      </div>

      <BuyerDrawer buyer={selected} onClose={() => setSelected(null)} />
    </>
  );
}
