import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Badge } from '@/components';
import type { Campaign } from '@/types';
import {
  CAMPAIGN_STATUS_LABELS,
  campaignStatusBadgeVariant,
  formatBudget,
  formatCurrency,
  formatInteger,
  formatPercent,
  formatRoas,
} from './dashboard_model';

type CampaignsTableProps = Readonly<{
  readonly campaigns: readonly Campaign[];
  readonly currencyCode: string;
}>;

const columnHelper = createColumnHelper<Campaign>();

export const CampaignsTable = ({ campaigns, currencyCode }: CampaignsTableProps): React.JSX.Element => {
  const columns = [
    columnHelper.accessor('name', { header: 'Campanha' }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        return <Badge variant={campaignStatusBadgeVariant(status)}>{CAMPAIGN_STATUS_LABELS[status]}</Badge>;
      },
    }),
    columnHelper.accessor('impressions', {
      header: 'Impressões',
      cell: (info) => formatInteger(info.getValue()),
    }),
    columnHelper.accessor('clicks', {
      header: 'Cliques',
      cell: (info) => formatInteger(info.getValue()),
    }),
    columnHelper.accessor('ctr', {
      header: 'CTR',
      cell: (info) => formatPercent(info.getValue()),
    }),
    columnHelper.accessor('avg_cpc', {
      header: 'CPC médio',
      cell: (info) => formatCurrency(info.getValue(), currencyCode),
    }),
    columnHelper.accessor('cost', {
      header: 'Custo',
      cell: (info) => formatCurrency(info.getValue(), currencyCode),
    }),
    columnHelper.accessor('conversions', {
      header: 'Conversões',
      cell: (info) => formatInteger(info.getValue()),
    }),
    columnHelper.accessor('conversion_rate', {
      header: 'Taxa de conversão',
      cell: (info) => formatPercent(info.getValue()),
    }),
    columnHelper.accessor('cost_per_conversion', {
      header: 'Custo/conversão',
      cell: (info) => formatCurrency(info.getValue(), currencyCode),
    }),
    columnHelper.accessor('roas', {
      header: 'ROAS',
      cell: (info) => formatRoas(info.getValue()),
    }),
    columnHelper.accessor('budget', {
      header: 'Orçamento diário',
      cell: (info) => formatBudget(info.getValue(), currencyCode),
    }),
  ];

  const table = useReactTable({ data: [...campaigns], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b text-left">
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="whitespace-nowrap p-3 font-medium text-muted-foreground">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="whitespace-nowrap p-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
