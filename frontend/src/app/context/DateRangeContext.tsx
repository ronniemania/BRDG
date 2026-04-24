import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { startOfDay, subDays, subMonths, subYears } from 'date-fns';

export type PresetKey = '1d' | '3d' | '7d' | '30d' | '90d' | '365d' | 'all' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface DateRangeState {
  preset: PresetKey;
  range: DateRange;
  params: { start_date: string; end_date: string };
  generation: number;
}

export interface DateRangeContextValue extends DateRangeState {
  setPreset: (key: PresetKey) => void;
  setCustomRange: (start: Date, end: Date) => void;
}

export const PRESETS: { key: PresetKey; label: string; shortLabel: string }[] = [
  { key: '1d',   label: '1 Day',    shortLabel: '1D' },
  { key: '3d',   label: '3 Days',   shortLabel: '3D' },
  { key: '7d',   label: '7 Days',   shortLabel: '7D' },
  { key: '30d',  label: 'Month',    shortLabel: '1M' },
  { key: '90d',  label: 'Quarter',  shortLabel: '3M' },
  { key: '365d', label: 'Year',     shortLabel: '1Y' },
  { key: 'all',  label: 'All Time', shortLabel: 'All' },
];

export function resolvePreset(key: PresetKey): DateRange {
  const now = new Date();
  const end = now;
  switch (key) {
    case '1d':   return { start: startOfDay(now), end };
    case '3d':   return { start: startOfDay(subDays(now, 2)), end };
    case '7d':   return { start: startOfDay(subDays(now, 6)), end };
    case '30d':  return { start: startOfDay(subMonths(now, 1)), end };
    case '90d':  return { start: startOfDay(subMonths(now, 3)), end };
    case '365d': return { start: startOfDay(subYears(now, 1)), end };
    case 'all':  return { start: new Date(2000, 0, 1), end };
    default:     return { start: startOfDay(subMonths(now, 1)), end };
  }
}

function toParams(range: DateRange) {
  return {
    start_date: range.start.toISOString(),
    end_date: range.end.toISOString(),
  };
}

function buildState(preset: PresetKey, range: DateRange, gen: number): DateRangeState {
  return { preset, range, params: toParams(range), generation: gen };
}

const DateRangeContext = createContext<DateRangeContextValue | null>(null);

export function DateRangeProvider({ children, defaultPreset = '30d' }: { children: ReactNode; defaultPreset?: PresetKey }) {
  const [state, setState] = useState<DateRangeState>(() => {
    const range = resolvePreset(defaultPreset);
    return buildState(defaultPreset, range, 0);
  });

  const setPreset = useCallback((key: PresetKey) => {
    const range = resolvePreset(key);
    setState(prev => buildState(key, range, prev.generation + 1));
  }, []);

  const setCustomRange = useCallback((start: Date, end: Date) => {
    setState(prev => buildState('custom', { start, end }, prev.generation + 1));
  }, []);

  return (
    <DateRangeContext.Provider value={{ ...state, setPreset, setCustomRange }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange(): DateRangeContextValue {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within <DateRangeProvider>');
  return ctx;
}

export function presetToRangeParam(preset: PresetKey): string | undefined {
  if (preset === 'custom' || preset === 'all') return preset === 'all' ? 'all' : undefined;
  return preset;
}
