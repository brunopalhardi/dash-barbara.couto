import Image from "next/image";
import Link from "next/link";
import {
  Eye,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  TrendingUp,
  UserPlus,
  Users,
  Camera,
} from "lucide-react";
import {
  getActiveIgAccount,
  getIgDailySeries,
  getIgKpis,
  getIgTopPosts,
} from "@/lib/queries/instagram";
import { rangeLastDays } from "@/lib/queries/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComboChart } from "@/components/dashboard/combo-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { fmt } from "@/components/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PageHeader } from "@/components/dashboard/page-header";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const days = Math.max(1, Math.min(180, Number(sp.range ?? DEFAULT_DAYS)));
  const range = rangeLastDays(days);

  const [account, kpis, daily, topPosts] = await Promise.all([
    getActiveIgAccount(),
    getIgKpis(range),
    getIgDailySeries(range),
    getIgTopPosts({ limit: 12 }),
  ]);

  const hasData = daily.length > 0 || topPosts.length > 0;

  return (
    <>
      <PageHeader
        title="Instagram"
        subtitle={
          account
            ? `@${account.username} · ${fmt.int(kpis.followers)} seguidores`
            : "Nenhuma conta Instagram conectada ainda"
        }
        rangeDays={DEFAULT_DAYS}
      />

      {!account ? (
        <Card className="bg-card border-dashed border-border/50">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div className="text-base font-medium">Conta Instagram não conectada</div>
            <p className="text-sm text-muted-foreground max-w-md">
              Configure as variáveis <code className="text-primary">IG_ACCESS_TOKEN</code> e
              <code className="text-primary"> IG_USER_ID</code> na Vercel e cadastra a conta em{" "}
              <Link href="/settings/integrations" className="text-primary underline underline-offset-2">
                Configurações
              </Link>
              . Depois dispara o sync.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard
              label="Seguidores"
              value={fmt.int(kpis.followers)}
              hint={`${fmt.int(kpis.followsCount)} seguindo`}
              icon={Users}
            />
            <KpiCard
              label="Novos seguidores"
              value={(kpis.followerDelta >= 0 ? "+" : "") + fmt.int(kpis.followerDelta)}
              hint="no período"
              icon={UserPlus}
            />
            <KpiCard
              label="Alcance"
              value={fmt.int(kpis.reach, true)}
              icon={Eye}
            />
            <KpiCard
              label="Visitas ao perfil"
              value={fmt.int(kpis.profileViews, true)}
              icon={Eye}
            />
            <KpiCard
              label="Posts no período"
              value={fmt.int(kpis.postsInPeriod)}
              hint={`${fmt.int(kpis.mediaCount)} no total`}
              icon={ImageIcon}
            />
            <KpiCard
              label="Engagement Rate"
              value={fmt.pct(kpis.avgEngagementRate, 2)}
              hint="média dos posts"
              icon={TrendingUp}
            />
          </section>

          <Card className="bg-card border-border/60 mb-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Alcance × Visitas ao perfil
              </CardTitle>
            </CardHeader>
            <CardContent>
              {daily.length === 0 ? (
                <EmptyState>
                  Ainda sem dados do Instagram pra esse período. Dispara o sync ou aguarda o cron diário.
                </EmptyState>
              ) : (
                <ComboChart
                  data={daily}
                  xKey="date"
                  series={[
                    {
                      key: "reach",
                      label: "Alcance",
                      type: "bar",
                      color: "var(--color-chart-1)",
                      format: "int",
                    },
                    {
                      key: "profileViews",
                      label: "Visitas ao perfil",
                      type: "line",
                      color: "var(--color-chart-2)",
                      format: "int",
                    },
                    {
                      key: "followerCount",
                      label: "Δ Seguidores",
                      type: "line",
                      color: "var(--color-chart-3)",
                      format: "int",
                      yAxisId: "right",
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border/60">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top posts por engajamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Sem posts sincronizados ainda.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {topPosts.map((p) => (
                    <a
                      key={p.mediaId}
                      href={p.permalink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="group rounded-lg overflow-hidden border border-border/60 bg-card/40 hover:border-primary/50 transition-colors"
                    >
                      <div className="relative aspect-square bg-muted">
                        {p.thumbnailUrl ? (
                          <Image
                            src={p.thumbnailUrl}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 25vw, 50vw"
                            className="object-cover"
                            unoptimized
                          />
                        ) : null}
                        <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-black/60 text-white px-1.5 py-0.5 rounded">
                          {p.type}
                        </div>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {p.caption ? (
                          <p className="text-xs text-foreground line-clamp-2">{p.caption}</p>
                        ) : null}
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {fmt.int(p.reach, true)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3 w-3" />
                            {fmt.int(p.engagement, true)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {fmt.pct(p.engagementRate, 1)}
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
