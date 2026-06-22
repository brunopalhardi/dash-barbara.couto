# Ajustes do Desafio (Bárbara/Portugal) — pedidos do Tiago

> Origem: call Bruno × Tiago em 2026-06-16 (Fathom `713580906`). Alvo: aba `/desafio`
> do fork `dash-barbara.couto`. Tiago disse que "70% já estava pronto".
> Referência de padrões: a `/guia` da OBA (`Traqueamento`), que já tem detalhamento
> de funil por página/criativo. O fork já trouxe os componentes e queries — boa parte
> é **religar**, não construir do zero.

## Sequência das seções na página (ordem que o Tiago pediu)

1. **Funil 3 linhas + Ascensão** — Total / Ingresso / Produto principal com investido/compradores/receita/CAC/ROAS + taxa de ascensão. ✅ feito 2026-06-21
2. **Performance diária** — ingresso. ✅ feito; série do **produto principal removida da página por ora** (Bruno 2026-06-21: na aba do desafio quer só a ascensão pro principal; decidem o resto depois). Capacidade segue dormente no `DailyBarChart` (prop `principal` + `getDailyPurchaseSeriesForSlugs`) — reativa só re-passando o prop.
3. **Top criativos** — top 5 por vendas + toggle gasto/venda/ROAS/CTR ("igual o do Gui"). ✅ feito 2026-06-21
4. **Performance de página** — páginas do tráfego (Meta): impressões/gasto/compras/CPA + funil pós-clique, padrão `/guia`. ✅ feito 2026-06-21, aberta por padrão. **VSL/VTurb NÃO entra** no desafio (Bruno 2026-06-21: desafio não tem VSL).
5. **Grupos WhatsApp** — mantém; compactar/recolher por padrão. 🟡 ajuste de UI
6. **Retenção de aulas (YouTube)** — 1ª hora / 24h / retenção dia-a-dia / % / perca. 🔴 NOVO, dep. YouTube API
7. **Ficha de interesse** — inscritos × preencheram. 🔴 NOVO, incerto (dep. multitenant)
8. **Monitoramento de vendas (produto principal)** — deriva do #1.

### Seção à parte
- **Recuperação** — vendas link abertura ("automático") vs link recuperação, via UTM. 🔴 NOVO.

### SendFlow — score + "entrou no grupo" na lista de compradores (pedido Bruno 2026-06-21)
Diagnóstico (rodei o sync manual, job 139):
- **Score (leadscoring):** API do SendFlow retorna **400 "Cannot read ... fileURL"** no
  `/releases/{id}/leadscoring/download` da release captação (avfd7ZtxV9z0LLTIWWQs). SendFlow
  não gera o arquivo de leadscore pra essa release → `sendflow_leadscoring` vazio. **Não é
  código** (está plugado). Ação: Bruno/time ver no SendFlow por que leadscoring não sai
  pra essa release (habilitar? release sem engajamento suficiente?).
- **Entrou/não no grupo:** membros (`whatsapp_group_members`) vêm **só do webhook** SendFlow
  (sync NÃO popula). Webhook **não cadastrado** pra Bárbara → pill "No grupo" mostra "—".
  Ação: cadastrar webhook no painel SendFlow → `https://dash-barbara-couto.vercel.app/api/webhooks/sendflow?token=<SENDFLOW_WEBHOOK_TOKEN>`.
- **Bom:** sync trouxe **64 linhas de analytics** (adds/saídas/cliques) → gráfico diário do
  painel de grupos agora tem dado. UI do pill "No grupo" e do painel de leadscore já existem;
  ativam sozinhas quando o dado chegar.

### EM ABERTO — métrica por campanha SendFlow (Bruno discute com Tiago)
Ideia melhor pra "compradores após as aulas": as **3 campanhas SendFlow são releases
separados** — captação (compra ingresso) → live (recebe aulas) → ofertas (recebe
oferta). Cruzar **roster da campanha de Ofertas ∩ compras do principal** = conversão
pós-aulas exata. **BLOQUEIO descoberto 2026-06-21:** o banco da Bárbara não tem NENHUM
dado de pessoa do SendFlow (whatsapp_group_members, _events e sendflow_leadscoring
TODOS zerados). Só a release "LCP - CAPTAÇÃO" está configurada e mesmo ela não trouxe
ninguém → o KPI "No grupo" deve estar 0%. Pra ligar: (1) IDs das releases live+ofertas,
(2) consertar o sync de pessoas do SendFlow (token/webhook/sync). Até lá, a ascensão por
janela de 21d é o proxy. **Aguardando decisão do Tiago.**

### Ajustes pontuais
- **Carrinho** só pra quem comprou o **produto principal** (vira score visual). 🟡 BLOQUEADO (depende do dado de pessoa do SendFlow, hoje vazio — ver "EM ABERTO")
- **Compactação** — seções de detalhe recolhidas por padrão. ✅ feito 2026-06-21 (`CollapsibleCard`: Campanhas, Páginas, Compradores, Grupos começam fechadas)
- **Bug "dia anterior"** — solução real = banco próprio (deferido).

## Bloqueios
- **#1 funil 2 etapas:** exige ID Hotmart do **produto principal** da Bárbara (hoje só o
  ingresso "Desafio" está em `lib/products.ts`) + definição do período da 2ª etapa.
- **Token Hotmart (André)** — projeto Portugal.
- **Planilha de retenção do Léo** — referência do #6.
- **YouTube API** — Bruno vai checar viabilidade/custo (#6).
- **Taxa £→€** da Olinda.

## Fora deste ciclo
- Multitenant + banco próprio + dash self-service por modelo (desafio/perpétuo/lançamento)
  → julho/2026, declarado pelo Bruno na call.

## Produtos principais (confirmado Bruno 2026-06-21, time refina o checkout exato depois)
- **principal_base** = `6886262` ("KIT - CURSO SHIATSU MEDICINA")
- **principal_prof** = cluster `6176589, 4396164, 5428090, 5428163, 7377653, 7362920`
  (mesmo curso por checkouts diferentes: base/REN/FL/CSM)
- Registrados em `lib/products.ts` como slugs de classificação (`PurchaseSlug`,
  desacoplado de `ProductSlug` — não entram em nav/Geral/dashboard).

## Log
- 2026-06-21: #3 e #4 implementados. #3 = novo componente client `TopCreativesToggle`
  (re-ordena pool de ativos por vendas/gasto/ROAS/CTR client-side, default vendas).
  #4 = `FunnelHighlights` + `FunnelTablePage` plugados (query `getPageFunnel` já existia).
- 2026-06-21: registrados os IDs dos 2 produtos principais + reescritos os 5 testes
  herdados da OBA pra realidade da Bárbara. Suíte: 179/179 verde (antes 10 quebrados).
- 2026-06-21: `scripts/backfill-purchase-slug.ts` **APLICADO** (idempotente).
  Reclassificou 1754 → principal_prof, 65 → principal_base. Estado: desafio=423,
  principal_prof=1754, principal_base=65, outros=3158.
- 2026-06-21: **Ascensão implementada.** `getAscensionToPrincipal(range)` em
  `lib/queries/purchases.ts` (CTE: coorte de compradores do Desafio por email/
  telefone → 1ª compra de principal com data >= a do ingresso). Componente
  `ascension-panel.tsx` + seção na página. Validação no histórico completo:
  **416 compradores, 33 ascenderam (7,9%) — 6 base / 27 prof — €14.227.**
- 2026-06-21: **janela de ascensão definida com base no dado.** Tiago confirmou
  cadência rolante semanal (compra essa semana → assiste/recebe oferta na semana
  seguinte). Distribuição real dos dias ingresso→principal: mediana 14d, 55% ≤14d,
  76% ≤21d, cauda longa 61+d. Escolhido **janela relativa por comprador = 21 dias**
  (semana do curso + recuperação), constante `ASCENSION_WINDOW_DAYS` em purchases.ts
  (trocar pra 14 = só a oferta). **Taxa calculada só sobre coorte MADURA** (janela
  fechada) pra não diluir com semana fresca; maturando aparece à parte. Histórico:
  319 maduros, taxa **7,5%**, 97 ainda na janela.
