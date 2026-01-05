import { useState } from 'react';

export type DateRangePreset = 'today' | 'last7days' | 'last30days' | 'custom';

export type DateRange = {
  start: Date;
  end: Date;
};

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  timezone?: string;
};

/**
 * Date range picker with preset options
 */
export function DateRangePicker({ value, onChange, timezone }: DateRangePickerProps) {
  const [preset, setPreset] = useState<DateRangePreset>('last30days');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const handlePresetChange = (newPreset: DateRangePreset) => {
    setPreset(newPreset);

    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);

    switch (newPreset) {
      case 'today':
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'last7days':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'last30days':
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        start.setHours(0, 0, 0, 0);
        break;
      case 'custom':
        // Don't change dates when switching to custom
        return;
      default:
        return;
    }

    onChange({ start, end });
  };

  const handleCustomChange = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        onChange({ start, end });
      }
    }
  };

  return (
    <div className="date-range-picker">
      <div className="preset-buttons">
        <button
          className={preset === 'today' ? 'active' : ''}
          onClick={() => handlePresetChange('today')}
        >
          Today
        </button>
        <button
          className={preset === 'last7days' ? 'active' : ''}
          onClick={() => handlePresetChange('last7days')}
        >
          Last 7 days
        </button>
        <button
          className={preset === 'last30days' ? 'active' : ''}
          onClick={() => handlePresetChange('last30days')}
        >
          Last 30 days
        </button>
        <button
          className={preset === 'custom' ? 'active' : ''}
          onClick={() => handlePresetChange('custom')}
        >
          Custom
        </button>
      </div>

      {preset === 'custom' && (
        <div className="custom-range">
          <input
            type="date"
            value={customStart || value.start.toISOString().split('T')[0]}
            onChange={(e) => {
              setCustomStart(e.target.value);
              if (e.target.value && customEnd) {
                const start = new Date(e.target.value);
                const end = new Date(customEnd);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  onChange({ start, end });
                }
              }
            }}
            onBlur={handleCustomChange}
          />
          <span>to</span>
          <input
            type="date"
            value={customEnd || value.end.toISOString().split('T')[0]}
            onChange={(e) => {
              setCustomEnd(e.target.value);
              if (customStart && e.target.value) {
                const start = new Date(customStart);
                const end = new Date(e.target.value);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                  onChange({ start, end });
                }
              }
            }}
            onBlur={handleCustomChange}
          />
        </div>
      )}

      <style jsx>{`
        .date-range-picker {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .preset-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .preset-buttons button {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e8e8e8;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .preset-buttons button:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .preset-buttons button.active {
          background: rgba(102, 126, 234, 0.2);
          border-color: #667eea;
          color: #a78bfa;
        }

        .custom-range {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .custom-range input {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #e8e8e8;
          font-size: 14px;
        }

        .custom-range input:focus {
          outline: none;
          border-color: #667eea;
        }

        .custom-range span {
          color: #888;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

