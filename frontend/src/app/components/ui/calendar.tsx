import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameDay, isBefore, isAfter, isToday } from 'date-fns';

interface DateRange {
  from?: Date;
  to?: Date;
}

type DisabledMatcher = { before?: Date; after?: Date } | ((date: Date) => boolean);

interface CalendarProps {
  mode?: 'single' | 'range';
  selected?: DateRange | Date;
  onSelect?: (value: any) => void;
  numberOfMonths?: number;
  className?: string;
  disabled?: DisabledMatcher;
}

function isDisabled(date: Date, disabled?: DisabledMatcher): boolean {
  if (!disabled) return false;
  if (typeof disabled === 'function') return disabled(date);
  if (disabled.after && isAfter(date, disabled.after)) return true;
  if (disabled.before && isBefore(date, disabled.before)) return true;
  return false;
}

function isInRange(date: Date, from?: Date, to?: Date): boolean {
  if (!from || !to) return false;
  return isAfter(date, from) && isBefore(date, to);
}

function MonthView({
  month,
  selected,
  onSelect,
  disabled,
  mode,
  hovered,
  onHover,
}: {
  month: Date;
  selected?: DateRange | Date;
  onSelect?: (d: Date) => void;
  disabled?: DisabledMatcher;
  mode: 'single' | 'range';
  hovered?: Date;
  onHover?: (d: Date | undefined) => void;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (!isAfter(d, calEnd)) {
    days.push(d);
    d = addDays(d, 1);
  }

  const from = mode === 'range' ? (selected as DateRange)?.from : (selected as Date);
  const to = mode === 'range' ? (selected as DateRange)?.to : undefined;

  return (
    <div className="p-2">
      <div className="text-center text-sm font-semibold text-gray-800 mb-2">
        {format(month, 'MMMM yyyy')}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const inCurrentMonth = day.getMonth() === month.getMonth();
          const isStart = from && isSameDay(day, from);
          const isEnd = to && isSameDay(day, to);
          const inSel = isInRange(day, from, to);
          const inHover = !to && from && hovered && isInRange(day, from, hovered);
          const dis = isDisabled(day, disabled);
          const isTod = isToday(day);

          return (
            <button
              key={i}
              type="button"
              disabled={dis}
              onClick={() => !dis && onSelect?.(day)}
              onMouseEnter={() => onHover?.(day)}
              onMouseLeave={() => onHover?.(undefined)}
              className={[
                'relative h-8 w-full text-xs rounded-md transition-colors',
                !inCurrentMonth ? 'text-gray-300' : 'text-gray-700',
                dis ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:bg-emerald-50',
                (isStart || isEnd) ? 'bg-[#10b981] text-white hover:bg-[#0ea572] rounded-full' : '',
                (inSel || inHover) ? 'bg-emerald-100 rounded-none' : '',
                isTod && !isStart && !isEnd ? 'font-bold underline underline-offset-2' : '',
              ].filter(Boolean).join(' ')}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Calendar({
  mode = 'single',
  selected,
  onSelect,
  numberOfMonths = 1,
  className = '',
  disabled,
}: CalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = mode === 'range'
      ? (selected as DateRange)?.from
      : (selected as Date);
    return startOfMonth(base || new Date());
  });
  const [hovered, setHovered] = useState<Date | undefined>();

  const handleDayClick = (day: Date) => {
    if (mode === 'single') {
      onSelect?.(day);
    } else {
      const range = selected as DateRange | undefined;
      if (!range?.from || (range.from && range.to)) {
        onSelect?.({ from: day, to: undefined });
      } else {
        if (isBefore(day, range.from)) {
          onSelect?.({ from: day, to: range.from });
        } else {
          onSelect?.({ from: range.from, to: day });
        }
      }
    }
  };

  const months = Array.from({ length: numberOfMonths }, (_, i) =>
    addMonths(viewMonth, i)
  );

  return (
    <div className={`inline-block ${className}`}>
      <div className="flex items-center justify-between px-2 mb-1">
        <button
          type="button"
          onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className={`flex gap-2`}>
        {months.map((month, i) => (
          <MonthView
            key={i}
            month={month}
            selected={selected}
            onSelect={handleDayClick}
            disabled={disabled}
            mode={mode}
            hovered={hovered}
            onHover={setHovered}
          />
        ))}
      </div>
    </div>
  );
}
