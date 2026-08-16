import type { ConnectedAccount } from '@/types';

// FR1: a plain native <select> — a full Radix Select primitive would add a trigger/content/item
// component tree for no behavioral gain here (single-choice list, no search/multi-select), so this
// stays a native control per frontend-standards' "only add new UI primitives if genuinely needed".
type AccountSelectorProps = Readonly<{
  readonly accounts: readonly ConnectedAccount[];
  readonly selectedAccountId: string | null;
  readonly onSelectAccount: (accountId: string) => void;
}>;

export const AccountSelector = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
}: AccountSelectorProps): React.JSX.Element => (
  <select
    aria-label="Conta"
    className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
    value={selectedAccountId ?? ''}
    onChange={(event) => {
      onSelectAccount(event.target.value);
    }}
  >
    {accounts.map((account) => (
      <option key={account.id} value={account.id}>
        {account.account_name} ({account.customer_id})
      </option>
    ))}
  </select>
);
