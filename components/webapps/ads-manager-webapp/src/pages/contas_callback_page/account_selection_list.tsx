import { Checkbox } from '@/components';
import type { AccessibleAccount } from '@/types';
import { isAccountSelectable } from './contas_callback_model';

type AccountSelectionListProps = Readonly<{
  readonly accounts: readonly AccessibleAccount[];
  readonly selectedCustomerIds: ReadonlySet<string>;
  readonly onToggleAccount: (customerId: string) => void;
}>;

export const AccountSelectionList = ({
  accounts,
  selectedCustomerIds,
  onToggleAccount,
}: AccountSelectionListProps): React.JSX.Element => (
  <ul className="space-y-2">
    {accounts.map((account) => {
      const selectable = isAccountSelectable(account);
      const checked = selectable && selectedCustomerIds.has(account.customer_id);
      return (
        <li key={account.customer_id} className="flex items-center gap-3 rounded-md border p-3">
          <Checkbox
            checked={checked}
            disabled={!selectable}
            onCheckedChange={() => {
              onToggleAccount(account.customer_id);
            }}
            aria-label={`Selecionar ${account.account_name}`}
          />
          <div className="flex-1">
            <p className="font-medium">
              {account.account_name}
              {!selectable && <span className="ml-2 text-xs font-normal text-muted-foreground">(já conectada)</span>}
            </p>
            <p className="text-sm text-muted-foreground">
              {account.customer_id} · {account.currency_code} · {account.timezone}
            </p>
          </div>
        </li>
      );
    })}
  </ul>
);
