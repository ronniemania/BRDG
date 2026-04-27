import { useState, useEffect, useCallback } from 'react';
import {
  Users, Upload, Cloud, ShoppingBag, Archive, Trash2,
  CheckCircle, Clock, AlertCircle, RefreshCw, Plus, X,
  FileText, Package, RotateCcw, UserPlus, Shield,
} from 'lucide-react';
import { api } from '../../lib/apiClient';
import { getToken, useAuth } from '../../context/AuthContext';
import { toast } from '../../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Uploader {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface DataItem {
  id: string;
  brandId: string;
  source: string;
  name: string;
  dataType: string;
  recordCount: number;
  status: string;
  error?: string;
  createdAt: string;
  uploadedBy: Uploader;
}

interface Member {
  id: string;
  role: string;
  joinedAt: string;
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

interface SharedDataResponse {
  items?: DataItem[];
  pendingCount?: number;
}

interface BrandMembersResponse {
  members?: Member[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-700',
  retained: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
};

const DATA_TYPE_STYLES: Record<string, string> = {
  orders:    'bg-blue-50 text-blue-700',
  inventory: 'bg-purple-50 text-purple-700',
  customers: 'bg-teal-50 text-teal-700',
  returns:   'bg-orange-50 text-orange-700',
  mixed:     'bg-indigo-50 text-indigo-700',
  unknown:   'bg-gray-50 text-gray-500',
};

function DataTypeIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4';
  if (type === 'orders')    return <ShoppingBag className={cls} />;
  if (type === 'inventory') return <Package className={cls} />;
  if (type === 'customers') return <Users className={cls} />;
  if (type === 'returns')   return <RotateCcw className={cls} />;
  if (type === 'mixed')     return <Cloud className={cls} />;
  return <FileText className={cls} />;
}

function SourceIcon({ source }: { source: string }) {
  if (source === 'google_drive') return <Cloud className="w-5 h-5 text-blue-500" />;
  if (source === 'csv_upload')   return <Upload className="w-5 h-5 text-emerald-500" />;
  if (source === 'shopify')      return <ShoppingBag className="w-5 h-5 text-green-600" />;
  return <FileText className="w-5 h-5 text-gray-400" />;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function initials(u: Uploader): string {
  return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'retained', label: 'Retained' },
  { value: 'archived', label: 'Archived' },
];

export default function TeamData() {
  const { user } = useAuth();
  const [brandId, setBrandId] = useState('');
  const [brandOwnerId, setBrandOwnerId] = useState('');
  const [items, setItems] = useState<DataItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Load brand on mount
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch('/api/brands', { credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.brands?.[0]) {
          setBrandId(d.brands[0].id);
          setBrandOwnerId(d.brands[0].ownerId);
        }
      })
      .catch(() => {});
  }, []);

  const loadItems = useCallback(() => {
    if (!brandId) return;
    setLoading(true);
    const params = new URLSearchParams({ brandId });
    if (activeTab) params.set('status', activeTab);
    api.get(`/api/shared-data?${params}`)
      .then((d: SharedDataResponse) => {
        setItems(d.items || []);
        setPendingCount(d.pendingCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [brandId, activeTab]);

  const loadMembers = useCallback(() => {
    if (!brandId) return;
    api.get(`/api/brands/${brandId}/members`)
      .then((d: BrandMembersResponse) => setMembers(d.members || []))
      .catch(() => {});
  }, [brandId]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { if (showMembers) loadMembers(); }, [showMembers, loadMembers]);

  const handleAction = async (id: string, action: 'retained' | 'archived') => {
    setActioning(id);
    try {
      await api.patch(`/api/shared-data/${id}`, { status: action });
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: action } : i));
      if (action === 'retained' || action === 'archived') {
        setPendingCount(c => Math.max(0, c - 1));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this item from the feed?')) return;
    setActioning(id);
    try {
      await api.delete(`/api/shared-data/${id}`);
      const removed = items.find(i => i.id === id);
      setItems(prev => prev.filter(i => i.id !== id));
      if (removed?.status === 'pending') setPendingCount(c => Math.max(0, c - 1));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setActioning(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    try {
      await api.post(`/api/brands/${brandId}/members`, { email: inviteEmail.trim() });
      setInviteEmail('');
      loadMembers();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this team member from the brand?')) return;
    try {
      await api.delete(`/api/brands/${brandId}/members/${memberId}`);
      setMembers(prev => prev.filter(m => m.user.id !== memberId));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const isOwner = user?.id === brandOwnerId;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-[#10b981]" />
              Team Data
              {pendingCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                  {pendingCount} pending
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Files and data uploaded by your team — retain, archive, or remove them
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadItems}
              disabled={loading}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white"
            >
              <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowMembers(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 bg-white"
            >
              <UserPlus className="w-4 h-4" />
              Team
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-[#10b981] text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Feed */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm font-medium">No data items yet</p>
            <p className="text-gray-400 text-xs mt-1">
              Items appear here when you or a teammate uploads files or syncs Google Drive data
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div
                key={item.id}
                className={`bg-white rounded-xl border shadow-sm p-5 transition-opacity ${
                  actioning === item.id ? 'opacity-50 pointer-events-none' : ''
                } ${item.status === 'archived' ? 'border-gray-100 opacity-75' : 'border-gray-200'}`}
              >
                <div className="flex items-start gap-4">
                  {/* Source icon */}
                  <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <SourceIcon source={item.source} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate max-w-xs">{item.name}</span>
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${DATA_TYPE_STYLES[item.dataType] || DATA_TYPE_STYLES.unknown}`}>
                        <DataTypeIcon type={item.dataType} />
                        {item.dataType}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[item.status] || 'bg-gray-100 text-gray-600'}`}>
                        {item.status === 'retained' && <CheckCircle className="w-3 h-3 inline mr-0.5" />}
                        {item.status === 'pending'  && <Clock className="w-3 h-3 inline mr-0.5" />}
                        {item.status === 'archived' && <Archive className="w-3 h-3 inline mr-0.5" />}
                        {item.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      {/* Uploader avatar + name */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                          {initials(item.uploadedBy)}
                        </div>
                        <span className="font-medium text-gray-600">
                          {item.uploadedBy.id === user?.id
                            ? 'You'
                            : `${item.uploadedBy.firstName} ${item.uploadedBy.lastName}`}
                        </span>
                      </div>
                      <span>·</span>
                      <span>{timeAgo(item.createdAt)}</span>
                      {item.recordCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{item.recordCount.toLocaleString()} records</span>
                        </>
                      )}
                    </div>

                    {item.error && (
                      <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        {item.error}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {item.status !== 'archived' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.status !== 'retained' && (
                        <button
                          onClick={() => handleAction(item.id, 'retained')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Retain
                        </button>
                      )}
                      {item.status !== 'archived' && (
                        <button
                          onClick={() => handleAction(item.id, 'archived')}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-100"
                        >
                          <Archive className="w-3.5 h-3.5" /> Archive
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                        title="Remove from feed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Restore archived */}
                  {item.status === 'archived' && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleAction(item.id, 'retained')}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Retain
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                        title="Remove from feed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team Members Drawer */}
      {showMembers && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowMembers(false)} />
          <div className="w-full max-w-sm bg-white flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-[#10b981]" /> Team Members
              </h2>
              <button onClick={() => setShowMembers(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Invite (owner only) */}
              {isOwner && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Invite by Email</p>
                  <div className="flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      placeholder="teammate@email.com"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]"
                    />
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="px-3 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#0ea572] disabled:opacity-50"
                    >
                      {inviting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>
                  {inviteError && (
                    <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {inviteError}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">
                    The person must have an existing BRDG account
                  </p>
                </div>
              )}

              {/* Owner */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Owner</p>
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  </div>
                  <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                </div>
              </div>

              {/* Members */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Members {members.length > 0 && `(${members.length})`}
                </p>
                {members.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No members yet</p>
                ) : (
                  <div className="space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {m.user.firstName.charAt(0)}{m.user.lastName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.user.firstName} {m.user.lastName}
                            {m.user.id === user?.id && <span className="text-[#10b981] ml-1">(you)</span>}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{m.user.email}</p>
                        </div>
                        {isOwner && m.user.id !== user?.id && (
                          <button
                            onClick={() => handleRemoveMember(m.user.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 flex-shrink-0"
                            title="Remove member"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
