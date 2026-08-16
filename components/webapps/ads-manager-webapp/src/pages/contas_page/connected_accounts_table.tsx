import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Badge, Button, InlineConfirm } from '@/components';
import type { ConnectedAccount } from '@/types';
import { ACCOUNT_STATUS_LABELS, accountNeedsReconnect, accountStatusBadgeVariant, formatConnectedAt } from './contas_model';

type ConnectedAccountsTableProps = Readonly<{
  readonly accounts: readonly ConnectedAccount[];
  readonly confirmingAccountId: string | null;
  readonly isDisconnecting: boolean;
  readonly onRequestDisconnect: (accountId: string) => void;
  readonly onCancelDisconnect: () => void;
  readonly onConfirmDisconnect: (accountId: string) => void;
  readonly onReconnect: () => void;
}>;

const columnHelper = createColumnHelper<ConnectedAccount>();

export const ConnectedAccountsTable = ({
  accounts,
  confirmingAccountId,
  isDisconnecting,
  onRequestDisconnect,
  onCancelDisconnect,
  onConfirmDisconnect,
  onReconnect,
}: ConnectedAccountsTableProps): React.JSX.Element => {
  const columns = [
    columnHelper.accessor('account_name', { header: 'Nome' }),
    columnHelper.accessor('customer_id', { header: 'Customer ID' }),
    columnHelper.accessor('currency_code', { header: 'Moeda' }),
    columnHelper.accessor('timezone', { header: 'Fuso horário' }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: (info) => {
        const status = info.getValue();
        return <Badge variant={accountStatusBadgeVariant(status)}>{ACCOUNT_STATUS_LABELS[status]}</Badge>;
      },
    }),
    columnHelper.accessor('connected_at', {
      header: 'Conectado em',
      cell: (info) => formatConnectedAt(info.getValue()),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Ações',
      cell: (info) => {
        const account = info.row.original;
        const needsReconnect = accountNeedsReconnect(account);
        return (
          <div className="flex flex-col items-start gap-2">
            {needsReconnect && (
              <div role="alert" className="flex items-center gap-2">
                <span className="text-xs font-medium text-amber-600">Esta conta precisa ser reconectada</span>
                <Button variant="outline" size="sm" onClick={onReconnect}>
                  Reconectar
                </Button>
              </div>
            )}
            <InlineConfirm
              isConfirming={confirmingAccountId === account.id}
              triggerLabel="Desconectar"
              onRequestConfirm={() => {
                onRequestDisconnect(account.id);
              }}
              onCancel={onCancelDisconnect}
              onConfirm={() => {
                onConfirmDisconnect(account.id);
              }}
              isBusy={isDisconnecting && confirmingAccountId === account.id}
            />
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({ data: [...accounts], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <table className="w-full text-sm">
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b text-left">
            {headerGroup.headers.map((header) => (
              <th key={header.id} className="p-3 font-medium text-muted-foreground">
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
              <td key={cell.id} className="p-3 align-top">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
