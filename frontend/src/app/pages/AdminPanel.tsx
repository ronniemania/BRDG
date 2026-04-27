import { useState, useEffect } from 'react';
import { Shield, Users, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { toast } from '../components/Toast';

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
  disabled: 'bg-gray-100 text-gray-600',
};

const ROLE_LABELS: Record<string, string> = {
  boss:         'Boss',
  marketing:    'Marketing',
  supply_chain: 'Supply Chain',
  ops:          'Operations',
  support:      'Support',
  member:       'Member',
};

const VALID_ROLES = ['boss', 'marketing', 'supply_chain', 'ops', 'support', 'member'];

const ADMIN_EMAILS = ['ronnieburjorji@gmail.com', 'ronnie@brdggroup.com'];

export default function AdminPanel() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'users' | 'audit'>('users');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, statsData, logsData]: any[] = await Promise.all([
        api.get('/api/admin/users'),
        api.get('/api/admin/stats'),
        api.get('/api/admin/audit-logs'),
      ]);
      setUsers(usersData.users || []);
      setStats(statsData || {});
      setAuditLogs(logsData.logs || []);
    } catch {
      // Not admin
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) loadData(); else setLoading(false); }, [isAdmin]);

  const handleStatusChange = async (userId: string, status: string) => {
    setUpdatingId(userId);
    try {
      const d: any = await api.patch(`/api/admin/users/${userId}`, { status });
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, status: d.user.status } : usr));
    } catch (err: any) { toast.error(err.message); }
    finally { setUpdatingId(null); }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdatingId(userId);
    try {
      const d: any = await api.patch(`/api/admin/users/${userId}`, { role });
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, role: d.user.role } : usr));
    } catch (err: any) { toast.error(err.message); }
    finally { setUpdatingId(null); }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#10b981]" /> Admin Panel
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Platform management</p>
          </div>
          <button onClick={loadData} disabled={loading} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Platform stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Users', value: stats.totalUsers || 0 },
            { label: 'Active Users', value: stats.activeUsers || 0 },
            { label: 'Pending Approval', value: stats.pendingUsers || 0 },
            { label: 'Total Brands', value: stats.totalBrands || 0 },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-2xl font-bold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
          {[{ key: 'users', label: 'Users', icon: Users }, { key: 'audit', label: 'Audit Log', icon: Shield }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['User', 'Email', 'Role', 'Status', 'Created', 'Last Login', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                            {u.firstName?.charAt(0) || '?'}
                          </div>
                          <span className="font-medium text-gray-800">{u.firstName} {u.lastName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[u.status] || 'bg-gray-100 text-gray-600'}`}>{u.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-IN') : 'Never'}</td>
                      <td className="px-4 py-3">
                        {u.id !== user?.id && (
                          <div className="flex items-center gap-2">
                            <select value={u.status} onChange={e => handleStatusChange(u.id, e.target.value)}
                              disabled={updatingId === u.id}
                              className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:border-[#10b981] disabled:opacity-50">
                              <option value="approved">Approved</option>
                              <option value="pending">Pending</option>
                              <option value="rejected">Rejected</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                              disabled={updatingId === u.id}
                              className="px-2 py-1 border border-gray-200 rounded-md text-xs bg-white focus:outline-none focus:border-[#10b981] disabled:opacity-50">
                              {VALID_ROLES.map(r => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['User', 'Action', 'Resource', 'Details', 'Time'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length > 0 ? auditLogs.map((log: any) => (
                    <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-xs text-gray-500">{log.user?.email || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-700 text-xs">{log.action}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{log.resource}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{log.details}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No audit logs yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
