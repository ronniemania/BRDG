import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, X, Check, Shield, Users } from 'lucide-react';
import { api } from '../lib/apiClient';
import { useBrand, ALL_MODULE_IDS } from '../context/BrandContext';
import { useRBAC, type RBACPolicy } from '../context/RBACContext';

// ─── Team / department presets ────────────────────────────────────────────────

const TEAM_OPTIONS = ['sales', 'ops', 'marketing', 'support', 'finance', 'logistics'];
const DEPT_OPTIONS = ['operations', 'marketing', 'finance', 'customer-success', 'technology'];

const MODULE_LABELS: Record<string, string> = {
  orders: 'Orders', inventory: 'Inventory', fulfillment: 'Fulfillment',
  customers: 'Customers', returns: 'Returns', analytics: 'Analytics',
  metrics: 'Metrics', 'ecom-metrics': 'Ecom Metrics', reports: 'Reports',
  insights: 'Insights', 'data-sources': 'Data Sources', 'team-data': 'Team Data',
  touchpoints: 'Touchpoints', alerts: 'Alerts',
};

// ─── Policy editor modal ──────────────────────────────────────────────────────

interface PolicyModalProps {
  initial?: Partial<RBACPolicy>;
  brandId: string;
  onSave: (p: RBACPolicy) => void;
  onClose: () => void;
}

function PolicyModal({ initial, brandId, onSave, onClose }: PolicyModalProps) {
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? '');
  const [team, setTeam] = useState(initial?.team ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [allowedModules, setAllowedModules] = useState<string[]>(initial?.allowedModules ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleModule = (mod: string) => {
    setAllowedModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]);
  };

  const selectAll = () => setAllowedModules([...ALL_MODULE_IDS]);
  const clearAll = () => setAllowedModules([]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!team && !department) { setError('Specify at least one of Team or Department'); return; }
    setSaving(true); setError('');
    try {
      const payload = { brandId, name, team: team || null, department: department || null, allowedModules };
      let result: RBACPolicy;
      if (isEdit && initial?.id) {
        result = (await api.patch(`/api/rbac/policies/${initial.id}`, payload)).policy;
      } else {
        result = (await api.post('/api/rbac/policies', payload)).policy;
      }
      onSave(result);
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit RBAC Policy' : 'New RBAC Policy'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Policy Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30"
              placeholder="e.g. Sales Team Access" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Team</label>
              <select value={team} onChange={e => setTeam(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30">
                <option value="">— any —</option>
                {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#10b981]/30">
                <option value="">— any —</option>
                {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Allowed Modules</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-[#10b981] hover:underline">All</button>
                <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_MODULE_IDS.map(mod => (
                <button key={mod} onClick={() => toggleModule(mod)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${
                    allowedModules.includes(mod)
                      ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    allowedModules.includes(mod) ? 'bg-[#10b981] border-[#10b981]' : 'border-gray-300'
                  }`}>
                    {allowedModules.includes(mod) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className="truncate">{MODULE_LABELS[mod] ?? mod}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm bg-[#10b981] text-white rounded-lg hover:bg-[#10b981]/90 disabled:opacity-50 flex items-center gap-2">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Member row (with inline team/dept editor) ────────────────────────────────

interface MemberRowProps {
  member: any;
  onUpdate: (memberId: string, team: string | null, dept: string | null) => Promise<void>;
}

function MemberRow({ member, onUpdate }: MemberRowProps) {
  const [editing, setEditing] = useState(false);
  const [team, setTeam] = useState(member.team ?? '');
  const [dept, setDept] = useState(member.department ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onUpdate(member.id, team || null, dept || null);
    setSaving(false);
    setEditing(false);
  };

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="py-3 px-4">
        <p className="text-sm font-medium text-gray-900">{member.user.firstName} {member.user.lastName}</p>
        <p className="text-xs text-gray-400">{member.user.email}</p>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{member.role}</span>
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex items-center gap-2">
            <select value={team} onChange={e => setTeam(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none">
              <option value="">no team</option>
              {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={dept} onChange={e => setDept(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none">
              <option value="">no dept</option>
              {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={save} disabled={saving}
              className="p-1 text-[#10b981] hover:bg-[#10b981]/10 rounded">
              {saving ? <div className="w-3 h-3 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {member.team ? <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded mr-1">{member.team}</span> : null}
              {member.department ? <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{member.department}</span> : null}
              {!member.team && !member.department && <span className="text-gray-400">— unassigned —</span>}
            </span>
            <button onClick={() => setEditing(true)} className="p-1 text-gray-300 hover:text-gray-600">
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RBACSettings() {
  const { brandId } = useBrand();
  const { policies, loading, refetch } = useRBAC();
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RBACPolicy | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchMembers = useCallback(async () => {
    if (!brandId) return;
    setMembersLoading(true);
    try {
      const data = await api.get(`/api/rbac?brandId=${brandId}`);
      setMembers(data?.members ?? []);
    } catch { /* silent */ } finally { setMembersLoading(false); }
  }, [brandId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleSavePolicy = (p: RBACPolicy) => {
    refetch();
    setModalOpen(false);
    setEditTarget(null);
    showToast(editTarget ? 'Policy updated' : 'Policy created');
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm('Delete this RBAC policy?')) return;
    try {
      await api.delete(`/api/rbac/policies/${id}`);
      refetch();
      showToast('Policy deleted');
    } catch (err: any) {
      showToast(err.message || 'Delete failed', false);
    }
  };

  const handleUpdateMember = async (memberId: string, team: string | null, dept: string | null) => {
    try {
      const data = await api.patch(`/api/rbac/members/${memberId}`, { team, department: dept });
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...data.member } : m));
      showToast('Member attributes updated');
    } catch (err: any) {
      showToast(err.message || 'Update failed', false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#10b981]" /> RBAC Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Control module-level access by team and department.
          </p>
        </div>
        <button onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#10b981] text-white rounded-xl text-sm font-medium hover:bg-[#10b981]/90">
          <Plus className="w-4 h-4" /> New Policy
        </button>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-[#10b981]' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Policies */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Access Policies</h2>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
            <Shield className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No policies yet. Create one to restrict module access by team or department.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {policies.map(policy => (
              <div key={policy.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-gray-900">{policy.name}</p>
                    {policy.team && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">team: {policy.team}</span>
                    )}
                    {policy.department && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">dept: {policy.department}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {policy.allowedModules.map(mod => (
                      <span key={mod} className="text-[10px] bg-[#10b981]/10 text-[#10b981] px-1.5 py-0.5 rounded">
                        {MODULE_LABELS[mod] ?? mod}
                      </span>
                    ))}
                    {policy.allowedModules.length === 0 && (
                      <span className="text-xs text-gray-400">No modules allowed</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditTarget(policy); setModalOpen(true); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeletePolicy(policy.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Members */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Users className="w-4 h-4" /> Team Members
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Member</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Team / Department</th>
              </tr>
            </thead>
            <tbody>
              {membersLoading ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : members.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">No members found</td></tr>
              ) : (
                members.map(m => (
                  <MemberRow key={m.id} member={m} onUpdate={handleUpdateMember} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <PolicyModal
          initial={editTarget ?? undefined}
          brandId={brandId}
          onSave={handleSavePolicy}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}
    </div>
  );
}
