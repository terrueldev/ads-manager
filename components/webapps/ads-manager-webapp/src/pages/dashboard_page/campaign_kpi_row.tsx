import { Card, CardContent } from '@/components';
import type { Campaign } from '@/types';
import { computeCampaignKpiTotals, formatCurrency, formatInteger, formatRoas } from './dashboard_model';

// SPEC.md-aligned KPI row: headline totals (gasto, cliques, conversões, ROAS geral) rendered as
// stat tiles, not charts — per the dataviz brief, single numbers belong in tiles, comparisons
// across categories belong in the bar chart below (campaigns_bar_chart.tsx).
type CampaignKpiRowProps = Readonly<{
  readonly campaigns: readonly Campaign[];
  readonly currencyCode: string;
}>;

type KpiTile = Readonly<{
  readonly label: string;
  readonly value: string;
}>;

export const CampaignKpiRow = ({ campaigns, currencyCode }: CampaignKpiRowProps): React.JSX.Element => {
  const totals = computeCampaignKpiTotals(campaigns);

  // Zero campaigns still computes to all-zero totals (computeCampaignKpiTotals handles the empty
  // array and the cost=0 division safely) — rendered as "0" tiles rather than a broken/NaN display,
  // consistent with how the table area already shows an explicit empty message instead of nothing.
  const tiles: readonly KpiTile[] = [
    { label: 'Gasto total', value: formatCurrency(totals.totalCost, currencyCode) },
    { label: 'Cliques totais', value: formatInteger(totals.totalClicks) },
    { label: 'Conversões totais', value: formatInteger(totals.totalConversions) },
    { label: 'ROAS geral', value: formatRoas(totals.roas) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            <p className="text-2xl font-bold">{tile.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
