import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus } from 'lucide-react';
import { getToken } from '../context/AuthContext';
import ReportManager from '../components/ReportManager';

interface Brand {
  id: string;
  name: string;
  status: string;
}

export default function Reports() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [triggerCreate, setTriggerCreate] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Brand[] = d?.brands || [];
        setBrands(list);
        if (list.length > 0) setSelectedBrand(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingBrands(false));
  }, []);

  const handleOpenCreateHandled = useCallback(() => setTriggerCreate(false), []);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-[#10b981]" /> Reports
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Create and run custom reports per brand
            </p>
          </div>
          {selectedBrand && (
            <button
              onClick={() => setTriggerCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]"
            >
              <Plus className="w-4 h-4" /> New Report
            </button>
          )}
        </div>

        {loadingBrands ? (
          <div className="space-y-3">
            <div className="h-10 bg-white rounded-xl border border-gray-200 animate-pulse mb-6" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : brands.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-1">No brands found.</p>
            <p className="text-xs text-gray-400">
              Create a brand first from the{' '}
              <a href="/brands" className="text-[#10b981] hover:underline">
                Brands
              </a>{' '}
              page.
            </p>
          </div>
        ) : (
          <>
            {/* Brand selector tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => setSelectedBrand(brand)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                    selectedBrand?.id === brand.id
                      ? 'bg-[#10b981] text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-[#10b981] hover:text-[#10b981]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                      selectedBrand?.id === brand.id
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {brand.name.charAt(0).toUpperCase()}
                  </span>
                  {brand.name}
                </button>
              ))}
            </div>

            {/* Reports for the selected brand */}
            {selectedBrand && (
              <ReportManager
                key={selectedBrand.id}
                brandId={selectedBrand.id}
                brandName={selectedBrand.name}
                openCreate={triggerCreate}
                onOpenCreateHandled={handleOpenCreateHandled}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
