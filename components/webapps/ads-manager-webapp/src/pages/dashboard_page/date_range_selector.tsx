import { Button } from '@/components';
import { DATE_RANGE_PRESET_LABELS } from './dashboard_model';
import type { DateRangePresetOption, DateRangeState } from './dashboard_model';

const PRESET_OPTIONS: readonly DateRangePresetOption[] = ['7d', '30d', '90d'];

type DateRangeSelectorProps = Readonly<{
  readonly dateRange: DateRangeState;
  readonly customRangeError: string | null;
  readonly onSelectPreset: (preset: DateRangePresetOption) => void;
  readonly onSelectCustomRange: () => void;
  readonly onCustomStartChange: (value: string) => void;
  readonly onCustomEndChange: (value: string) => void;
}>;

export const DateRangeSelector = ({
  dateRange,
  customRangeError,
  onSelectPreset,
  onSelectCustomRange,
  onCustomStartChange,
  onCustomEndChange,
}: DateRangeSelectorProps): React.JSX.Element => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_OPTIONS.map((preset) => (
        <Button
          key={preset}
          type="button"
          size="sm"
          variant={dateRange.preset === preset ? 'secondary' : 'outline'}
          onClick={() => {
            onSelectPreset(preset);
          }}
        >
          {DATE_RANGE_PRESET_LABELS[preset]}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={dateRange.preset === 'custom' ? 'secondary' : 'outline'}
        onClick={onSelectCustomRange}
      >
        Período customizado
      </Button>
    </div>

    {dateRange.preset === 'custom' && (
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          De
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={dateRange.customStart}
            onChange={(event) => {
              onCustomStartChange(event.target.value);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Até
          <input
            type="date"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={dateRange.customEnd}
            onChange={(event) => {
              onCustomEndChange(event.target.value);
            }}
          />
        </label>
        {customRangeError && (
          <p role="alert" className="text-sm text-destructive">
            {customRangeError}
          </p>
        )}
      </div>
    )}
  </div>
);
