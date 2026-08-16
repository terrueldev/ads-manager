import { Button } from '../ui';

// Presentational, fully controlled: no internal state, so the confirmation state machine itself
// lives in the page's Model (see pages/contas_page/contas_model.ts#disconnectConfirmReducer) where
// it's unit-testable without rendering. FR5: an in-UI confirmation, never `window.confirm`.
type InlineConfirmProps = Readonly<{
  readonly isConfirming: boolean;
  readonly triggerLabel: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly onRequestConfirm: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly isBusy?: boolean;
}>;

export const InlineConfirm = ({
  isConfirming,
  triggerLabel,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onRequestConfirm,
  onCancel,
  onConfirm,
  disabled = false,
  isBusy = false,
}: InlineConfirmProps): React.JSX.Element => {
  if (!isConfirming) {
    return (
      <Button variant="destructive" size="sm" onClick={onRequestConfirm} disabled={disabled}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Tem certeza?</span>
      <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isBusy}>
        {isBusy ? 'Removendo...' : confirmLabel}
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel} disabled={isBusy}>
        {cancelLabel}
      </Button>
    </div>
  );
};
