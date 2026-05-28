import { ExternalLink, ImageOff } from "lucide-react";
import { fmt } from "./format";
import type { AdDetail } from "@/lib/queries/dashboard";

interface CreativeDetailPanelProps {
  ad: AdDetail;
}

interface Tone {
  cpaText: string;
  rail: string;
}

function roasTone(roas: number): Tone {
  if (roas >= 2) return { cpaText: "text-emerald-400", rail: "bg-emerald-400" };
  if (roas >= 1) return { cpaText: "text-amber-400", rail: "bg-amber-400" };
  if (roas > 0) return { cpaText: "text-rose-400", rail: "bg-rose-400" };
  return { cpaText: "text-muted-foreground", rail: "bg-muted-foreground/30" };
}

function StatCard({
  label,
  value,
  tone,
  rail,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  rail?: string;
  hint?: string;
}) {
  return (
    <div className="relative rounded-md border border-border bg-card pl-[18px] pr-4 py-4 overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-[2px] ${rail ?? "bg-muted-foreground/30"}`} />
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70 font-medium">
        {label}
      </div>
      <div
        className={`font-mono font-medium tabular-nums text-2xl leading-none tracking-tight mt-2 ${tone ?? ""}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mt-1.5">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

interface FunnelStageProps {
  label: string;
  pct: number;
  /** Override de cor por tone */
  tone?: "good" | "bad" | "warn" | "default";
  position: "top" | "mid" | "bottom";
  empty?: boolean;
}

function FunnelStage({ label, pct, tone = "default", position, empty }: FunnelStageProps) {
  const display = empty || !isFinite(pct) ? "—" : fmt.pct1(pct);
  const valueColor =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : tone === "warn"
          ? "text-amber-400"
          : "text-foreground";
  const fillStyle: React.CSSProperties = (() => {
    if (empty) return { width: 0 };
    const w = Math.max(0, Math.min(100, pct));
    if (tone === "good") return { width: `${w}%`, background: "#34d399" };
    if (tone === "bad") return { width: `${w}%`, background: "#f87171" };
    if (tone === "warn") return { width: `${w}%`, background: "#fbbf24" };
    if (position === "top")
      return { width: `${w}%`, background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)" };
    if (position === "mid")
      return { width: `${w}%`, background: "linear-gradient(90deg, #8b5cf6 0%, #a855f7 100%)" };
    return { width: `${w}%`, background: "#34d399" };
  })();

  return (
    <div className={empty ? "opacity-40" : ""}>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="font-mono text-[11px] text-muted-foreground lowercase">{label}</span>
        <span className={`font-mono tabular-nums font-medium text-sm ${valueColor}`}>
          {display}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
        <div className="h-full rounded-full" style={fillStyle} />
      </div>
    </div>
  );
}

export function CreativeDetailPanel({ ad }: CreativeDetailPanelProps) {
  const isVideo = ad.videoViews > 0;
  const tone = roasTone(ad.roas);

  // Heuristics pra rails secundários
  const cacTone =
    ad.purchases === 0
      ? "bg-muted-foreground/30"
      : ad.cac > 200
        ? "bg-amber-400"
        : "bg-emerald-400";

  return (
    <div className="space-y-4">
      {/* Hero: thumbnail + name + actions */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <div className="aspect-video bg-muted/30 relative flex items-center justify-center overflow-hidden">
          {ad.thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={ad.thumbnailUrl}
              alt={ad.adName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <span className="font-mono text-xs lowercase">sem thumb</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card/95 via-card/30 to-transparent pointer-events-none" />
          {ad.previewShareableLink ? (
            <a
              href={ad.previewShareableLink}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/90 backdrop-blur-sm border border-border text-xs font-medium hover:bg-background transition-colors"
            >
              ver no meta <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <div className="p-5">
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mb-1">
            {ad.campaignName}
          </div>
          <h2 className="text-xl font-medium leading-tight tracking-tight">{ad.adName}</h2>
        </div>
      </div>

      {/* Stats grid 2x3 (mobile) / 3x2 (desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Gasto" value={fmt.money(ad.spend)} />
        <StatCard label="Leads" value={fmt.int(ad.leads)} />
        <StatCard
          label="Vendas"
          value={fmt.int(ad.purchases)}
          tone={ad.purchases > 0 ? "text-emerald-400" : ""}
          rail={ad.purchases > 0 ? "bg-emerald-400" : "bg-muted-foreground/30"}
        />
        <StatCard label="Receita" value={fmt.money(ad.revenue)} />
        <StatCard
          label="ROAS"
          value={fmt.ratio(ad.roas)}
          tone={tone.cpaText}
          rail={tone.rail}
          hint={ad.roas >= 2 ? "acima do alvo 2x" : ad.roas > 0 ? "abaixo do alvo 2x" : undefined}
        />
        <StatCard
          label="CAC"
          value={ad.purchases > 0 ? fmt.money(ad.cac) : "—"}
          rail={cacTone}
        />
      </div>

      {/* Funnel breakdown — CTR + (vídeo: hook/hold/body) + CPL */}
      <div className="rounded-md border border-border bg-card p-5">
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground/60 lowercase mb-4">
          {isVideo ? "performance do criativo · vídeo" : "performance do criativo"}
        </div>
        <div className="space-y-3">
          <FunnelStage
            label="CTR · cliques sobre impressões"
            pct={Math.min(100, ad.ctr * 10)}
            position="top"
            tone={ad.ctr >= 2 ? "good" : ad.ctr >= 1 ? "default" : "warn"}
          />
          {isVideo ? (
            <>
              <FunnelStage
                label="Hook · visualizou 3s"
                pct={ad.hookRate}
                position="mid"
                tone={ad.hookRate >= 25 ? "good" : "default"}
              />
              <FunnelStage
                label="Hold · visualizou 25%"
                pct={ad.holdRate}
                position="mid"
                tone={ad.holdRate >= 15 ? "good" : "default"}
              />
              <FunnelStage
                label="Body · visualizou 50%"
                pct={ad.bodyRate}
                position="mid"
                tone={ad.bodyRate >= 10 ? "good" : "default"}
              />
            </>
          ) : null}
          <FunnelStage
            label={`CPL · ${ad.leads > 0 ? fmt.money(ad.cpl) : "—"}`}
            // CPL "menor é melhor" — barra inversa: 100% quando muito barato, 0% quando muito caro
            pct={ad.cpl > 0 ? Math.min(100, Math.max(5, 100 - ad.cpl * 2)) : 0}
            position="bottom"
            tone={ad.leads === 0 ? "default" : ad.cpl < 10 ? "good" : ad.cpl < 25 ? "default" : "bad"}
            empty={ad.leads === 0}
          />
        </div>
      </div>
    </div>
  );
}

export function CreativeDetailEmpty() {
  return (
    <div className="rounded-md border border-border bg-card p-8 text-center">
      <div className="font-mono text-xs text-muted-foreground/60 lowercase">
        criativo não encontrado no período selecionado
      </div>
    </div>
  );
}
