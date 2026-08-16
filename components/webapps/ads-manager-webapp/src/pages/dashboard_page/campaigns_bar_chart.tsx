import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components';
import type { Campaign } from '@/types';
import {
  CAMPAIGN_CHART_METRIC_LABELS,
  formatCampaignChartValue,
  mapCampaignsToChartData,
  truncateChartLabel,
} from './dashboard_model';
import type { CampaignChartMetric } from './dashboard_model';

// Single accent hue for the bars (magnitude encoding, not per-campaign identity — the x-axis labels
// already carry campaign identity). Indigo-600, matching the dataviz brief's "blue/indigo in the
// 600 range" guidance. Recharts needs a literal color value (SVG fill), not a Tailwind class name.
const BAR_ACCENT_COLOR = '#4f46e5';
const GRIDLINE_COLOR = '#e5e7eb';
const AXIS_COLOR = '#9ca3af';

const CHART_METRICS: readonly CampaignChartMetric[] = ['cost', 'conversions', 'roas'];

type CampaignsBarChartProps = Readonly<{
  readonly campaigns: readonly Campaign[];
  readonly currencyCode: string;
}>;

type ChartTooltipProps = Readonly<{
  readonly active?: boolean;
  readonly payload?: ReadonlyArray<{ readonly payload: { readonly name: string; readonly value: number } }>;
  readonly metric: CampaignChartMetric;
  readonly currencyCode: string;
}>;

// Custom tooltip so the exact formatted value (currency/integer/"Nx") is shown per the dataviz
// brief, and the full (untruncated) campaign name — the x-axis tick only shows a truncated label.
const ChartTooltip = ({ active, payload, metric, currencyCode }: ChartTooltipProps): React.JSX.Element | null => {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  if (!entry) return null;
  const datum = entry.payload;

  return (
    <div className="rounded-md border bg-background p-2 text-sm shadow-md">
      <p className="font-medium">{datum.name}</p>
      <p className="text-muted-foreground">{formatCampaignChartValue(datum.value, metric, currencyCode)}</p>
    </div>
  );
};

// Campaign comparison bar chart (dataviz brief): ONE metric drives the ONE y-axis at a time via the
// toggle above the chart, never a dual-axis combination of cost + ROAS. Bars share a single accent
// color since the x-axis labels already encode campaign identity.
export const CampaignsBarChart = ({ campaigns, currencyCode }: CampaignsBarChartProps): React.JSX.Element => {
  const [metric, setMetric] = useState<CampaignChartMetric>('cost');
  const chartData = mapCampaignsToChartData(campaigns, metric);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Comparativo de campanhas por {CAMPAIGN_CHART_METRIC_LABELS[metric].toLowerCase()}</CardTitle>
        <div className="flex items-center gap-2">
          {CHART_METRICS.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={metric === option ? 'secondary' : 'outline'}
              onClick={() => {
                setMetric(option);
              }}
            >
              {CAMPAIGN_CHART_METRIC_LABELS[option]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma campanha para exibir no gráfico.</p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...chartData]} margin={{ top: 8, right: 8, left: 8, bottom: 32 }}>
                <CartesianGrid stroke={GRIDLINE_COLOR} vertical={false} />
                <XAxis
                  dataKey="name"
                  tickFormatter={(value: string) => truncateChartLabel(value)}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  stroke={AXIS_COLOR}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value: number) => formatCampaignChartValue(value, metric, currencyCode)}
                  stroke={AXIS_COLOR}
                  tick={{ fontSize: 12 }}
                  width={80}
                />
                <Tooltip content={<ChartTooltip metric={metric} currencyCode={currencyCode} />} />
                <Bar dataKey="value" fill={BAR_ACCENT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
