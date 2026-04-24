import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { FileText, ArrowLeft, Plus } from 'lucide-react';
import { getToken } from '../../context/AuthContext';
import ReportManager from '../../components/ReportManager';

interface Brand {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export default function BrandReports() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [triggerCreate, setTriggerCreate] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    const token = getToken();
    if (!token) return;
    fetch(`/api/brands/${brandId}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 404 || r.status === 403) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => {
        if (d?.brand) setBrand(d.brand);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId]);

  const handleOpenCreateHandled = useCallback(() => setTriggerCreate(false), []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto p-6 space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-72 bg-gray-100 rounded animate-pulse" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !brand) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto p-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">Brand not found or access denied.</p>
            <button
              onClick={() => navigate('/brands')}
              className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]"
            >
              Back to Brands
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/brands')}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-colors"
              title="Back to Brands"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                {brand.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  {brand.name}
                  <span className="text-gray-300">·</span>
                  <span className="flex items-center gap-1.5 text-[#10b981]">
                    <FileText className="w-5 h-5" /> Reports
                  </span>
                </h1>
                <p className="text-sm text-gray-400 mt-0.5">
                  Created {new Date(brand.createdAt).toLocaleDateString('en-IN')} ·{' '}
                  <span
                    className={`capitalize ${brand.status === 'active' ? 'text-green-600' : 'text-gray-400'}`}
                  >
                    {brand.status}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setTriggerCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572]"
          >
            <Plus className="w-4 h-4" /> New Report
          </button>
        </div>

        <ReportManager
          brandId={brand.id}
          brandName={brand.name}
          openCreate={triggerCreate}
          onOpenCreateHandled={handleOpenCreateHandled}
        />
      </div>
    </div>
  );
}
