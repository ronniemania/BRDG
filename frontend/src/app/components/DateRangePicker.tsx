import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useDateRange, PRESETS, type PresetKey } from '../context/DateRangeContext';

function rangeLabel(preset: PresetKey, start: Date, end: Date): string {
  if (preset === 'custom') {
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }
  const found = PRESETS.find(p => p.key === preset);
  return found ? found.label : 'Select range';
}

export default function DateRangePicker({ className = '' }: { className?: string }) {
  const { preset, range, setPreset, setCustomRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState<Date | undefined>(range.start);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(range.end);
  const [showCalendar, setShowCalendar] = useState(false);

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    setShowCalendar(false);
    setOpen(false);
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      setCustomRange(customStart, customEnd);
      setOpen(false);
      setShowCalendar(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="hidden md:flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => handlePreset(p.key)}
            className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
              preset === p.key ? 'bg-white text-[#10b981] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.shortLabel}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors shadow-sm">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
            <span className="max-w-[160px] truncate">{rangeLabel(preset, range.start, range.end)}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0 bg-white border border-gray-200 shadow-xl rounded-xl" sideOffset={8}>
          <div className="p-3">
            <div className="md:hidden grid grid-cols-4 gap-1 mb-3">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                    preset === p.key ? 'bg-[#10b981] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {p.shortLabel}
                </button>
              ))}
            </div>

            <div className="hidden md:block">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quick Select</p>
              <div className="grid grid-cols-4 gap-1 mb-3">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => handlePreset(p.key)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                      preset === p.key && !showCalendar ? 'bg-[#10b981] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 my-2" />

            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`w-full text-left px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
                showCalendar || preset === 'custom' ? 'bg-[#10b981]/10 text-[#10b981]' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 inline mr-1.5" />
              Custom Range
              {preset === 'custom' && (
                <span className="ml-2 text-gray-400">{format(range.start, 'MMM d')} – {format(range.end, 'MMM d')}</span>
              )}
            </button>

            {showCalendar && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Start</label>
                    <div className="px-2 py-1.5 bg-gray-50 rounded-md text-xs text-gray-700 font-medium">
                      {customStart ? format(customStart, 'MMM d, yyyy') : 'Select...'}
                    </div>
                  </div>
                  <div className="flex items-end pb-1.5 text-gray-300">→</div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">End</label>
                    <div className="px-2 py-1.5 bg-gray-50 rounded-md text-xs text-gray-700 font-medium">
                      {customEnd ? format(customEnd, 'MMM d, yyyy') : 'Select...'}
                    </div>
                  </div>
                </div>

                <Calendar
                  mode="range"
                  selected={{ from: customStart, to: customEnd }}
                  onSelect={(r: any) => {
                    if (r?.from) setCustomStart(r.from);
                    if (r?.to) setCustomEnd(r.to);
                  }}
                  numberOfMonths={1}
                  className="rounded-lg border border-gray-100"
                  disabled={{ after: new Date() }}
                />

                <button
                  onClick={handleApplyCustom}
                  disabled={!customStart || !customEnd}
                  className="mt-3 w-full py-2 bg-[#10b981] text-white rounded-lg text-xs font-semibold hover:bg-[#10b981]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Apply Custom Range
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
