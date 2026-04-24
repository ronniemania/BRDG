function Pulse({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function KPICardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 min-h-[112px]">
      <Pulse className="h-3 w-20 mb-3" />
      <Pulse className="h-7 w-28 mb-2" />
      <Pulse className="h-2.5 w-16" />
    </div>
  );
}

export function KPIGridSkeleton({ count = 4, cols = 'grid-cols-2 md:grid-cols-4' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => <KPICardSkeleton key={i} />)}
    </div>
  );
}

export function ChartSkeleton({ height = 'h-[280px]' }: { height?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${height}`}>
      <Pulse className="h-4 w-40 mb-6" />
      <div className="flex items-end gap-2 h-[calc(100%-40px)]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex-1 bg-gray-100 rounded-t animate-pulse" style={{ height: `${20 + (i * 7) % 60}%` }} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => <Pulse key={i} className="h-3 flex-1 max-w-[100px]" />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3.5 flex gap-6 border-b border-gray-50">
          {Array.from({ length: cols }).map((_, c) => (
            <Pulse key={c} className={`h-3 flex-1 ${c === 0 ? 'max-w-[60px]' : 'max-w-[120px]'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatStripSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-h-[80px]">
          <Pulse className="h-3 w-3 mb-2 rounded-sm" />
          <Pulse className="h-6 w-16 mb-1" />
          <Pulse className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

export function PieSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[280px]">
      <Pulse className="h-4 w-32 mb-6" />
      <div className="flex justify-center mb-4">
        <div className="w-36 h-36 rounded-full border-[12px] border-gray-100 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-1.5">
            <Pulse className="w-2.5 h-2.5 rounded-full" />
            <Pulse className="h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageLoadingSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#10b981] mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading data...</p>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <KPIGridSkeleton count={6} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
          <div className="lg:col-span-2"><ChartSkeleton /></div>
          <PieSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <ChartSkeleton height="h-[240px]" />
          <ChartSkeleton height="h-[240px]" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <KPIGridSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
          <div className="lg:col-span-2"><ChartSkeleton /></div>
          <PieSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <ChartSkeleton height="h-[240px]" />
          <ChartSkeleton height="h-[240px]" />
        </div>
      </div>
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Pulse className="h-7 w-32 mb-2" />
        <Pulse className="h-3 w-64" />
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <KPIGridSkeleton count={7} cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-7" />
        <div className="mt-6"><TableSkeleton rows={8} cols={8} /></div>
      </div>
    </div>
  );
}
