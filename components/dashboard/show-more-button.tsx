"use client";

/**
 * Botão de paginação incremental ("Ver mais N") + contador "X de Y". O estado
 * (quantos visíveis) vive no componente-pai client; aqui só apresenta.
 */
export function ShowMoreButton({
  shown,
  total,
  step,
  onMore,
}: {
  shown: number;
  total: number;
  step: number;
  onMore: () => void;
}) {
  const remaining = total - shown;
  if (remaining <= 0) return null;
  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={onMore}
        className="px-3 py-1.5 rounded-md border border-border/60 bg-card text-xs text-muted-foreground hover:bg-card/80 transition-colors"
      >
        Ver mais {Math.min(step, remaining)}
      </button>
      <span className="text-[11px] text-muted-foreground/70 tabular-nums">
        {shown} de {total}
      </span>
    </div>
  );
}
