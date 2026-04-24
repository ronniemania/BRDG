import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, User, Lock, Bell, Check, Mail, Trash2, Send as SendIcon, Link2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';

interface MailboxView {
  id: string;
  provider: string;
  emailAddress: string;
  displayName: string;
  isDefault: boolean;
  isShared: boolean;
  status: string;
  hasSmtp: boolean;
  hasOAuth: boolean;
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'security' | 'notifications' | 'integrations'>('profile');

  // ── Password form ──────────────────────────────────────────────────────────
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  // ── Notification prefs ─────────────────────────────────────────────────────
  const [eodEmail, setEodEmail] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // ── Mailbox integrations ───────────────────────────────────────────────────
  const [mailboxes, setMailboxes] = useState<MailboxView[]>([]);
  const [mbError, setMbError] = useState('');
  const [mbSavedNote, setMbSavedNote] = useState('');
  const [smtpForm, setSmtpForm] = useState({
    emailAddress: '',
    smtpPassword: '',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    displayName: '',
  });
  const [mbBusy, setMbBusy] = useState(false);
  const [canManageMailbox, setCanManageMailbox] = useState(false);

  const loadMailboxes = async () => {
    try {
      const d = await api.get('/api/mailboxes');
      setMailboxes(d.mailboxes || []);
      setCanManageMailbox(true);
    } catch (err: any) {
      setCanManageMailbox(false);
    }
  };

  useEffect(() => { if (tab === 'integrations') loadMailboxes(); }, [tab]);

  const connectOutlookSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setMbError(''); setMbBusy(true);
    try {
      await api.post('/api/mailboxes/outlook/smtp', smtpForm);
      await loadMailboxes();
      setSmtpForm(s => ({ ...s, smtpPassword: '' }));
      setMbSavedNote('Outlook mailbox connected via SMTP');
      setTimeout(() => setMbSavedNote(''), 3000);
    } catch (err: any) {
      setMbError(err.message || 'Failed to connect mailbox');
    } finally { setMbBusy(false); }
  };

  const connectOutlookOAuth = async () => {
    try {
      const d = await api.post('/api/mailboxes/outlook/oauth/start', {});
      if (d.url) window.open(d.url, '_blank', 'width=600,height=700');
    } catch (err: any) {
      setMbError(err.message || 'Failed to start OAuth flow');
    }
  };

  const testMailbox = async (id: string) => {
    setMbError(''); setMbBusy(true);
    try {
      const d = await api.post(`/api/mailboxes/${id}/test`, {});
      setMbSavedNote(d.message || 'Test sent');
      setTimeout(() => setMbSavedNote(''), 3000);
    } catch (err: any) {
      setMbError(err.message || 'Test failed');
    } finally { setMbBusy(false); }
  };

  const disconnectMailbox = async (id: string) => {
    if (!confirm('Disconnect this mailbox?')) return;
    try {
      await api.delete(`/api/mailboxes/${id}`);
      await loadMailboxes();
    } catch (err: any) {
      setMbError(err.message || 'Disconnect failed');
    }
  };

  useEffect(() => {
    api.get('/api/user/preferences')
      .then((d: any) => { if (d?.preferences?.eodEmail != null) setEodEmail(!!d.preferences.eodEmail); })
      .catch(() => {});
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('New passwords do not match'); return; }
    if (pwForm.newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess(true);
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSavePrefs = async () => {
    setPrefsLoading(true);
    try {
      await api.patch('/api/user/preferences', { eodEmail });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2500);
    } catch { /* silent */ } finally {
      setPrefsLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-[#10b981]" /> Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your account preferences</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          {[
            { key: 'profile',       label: 'Profile',       icon: User },
            { key: 'security',      label: 'Security',      icon: Lock },
            { key: 'notifications', label: 'Notifications', icon: Bell },
            { key: 'integrations',  label: 'Integrations',  icon: Link2 },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Profile Information</h2>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold">
                {user?.firstName?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{user?.firstName} {user?.lastName}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'First Name',    value: user?.firstName },
                { label: 'Last Name',     value: user?.lastName  },
                { label: 'Email Address', value: user?.email     },
                { label: 'Account ID',    value: user?.id        },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">{f.value || '—'}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">To update profile details, contact your administrator.</p>
          </div>
        )}

        {/* Security tab */}
        {tab === 'security' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Change Password</h2>
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-sm">
              {[
                { label: 'Current Password',     key: 'currentPassword' },
                { label: 'New Password',         key: 'newPassword'     },
                { label: 'Confirm New Password', key: 'confirmPassword' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type="password"
                    value={(pwForm as any)[f.key]}
                    onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#10b981]"
                  />
                </div>
              ))}

              {pwError && <p className="text-sm text-red-600">{pwError}</p>}
              {pwSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <Check className="w-4 h-4" /> Password changed successfully
                </div>
              )}

              <button type="submit" disabled={pwLoading}
                className="w-full py-2.5 bg-[#10b981] text-white rounded-lg text-sm font-semibold hover:bg-[#0ea572] disabled:opacity-50">
                {pwLoading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        )}

        {/* Integrations tab */}
        {tab === 'integrations' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Outlook mailbox</h2>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed max-w-xl">
                    Link a shared Microsoft 365 / Outlook mailbox so every admin can email scheduled reports from one address. Use SMTP + app password (simpler) or full OAuth (preferred — needs admin app registration).
                  </p>
                </div>
              </div>

              {!canManageMailbox && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Only admin accounts can connect the shared mailbox.</p>
              )}

              {canManageMailbox && (
                <>
                  {/* Existing mailboxes */}
                  {mailboxes.length > 0 && (
                    <div className="space-y-2 mb-5">
                      {mailboxes.map(mb => (
                        <div key={mb.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              {mb.emailAddress}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full ${mb.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{mb.status}</span>
                              {mb.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">default</span>}
                            </p>
                            <p className="text-xs text-gray-500">{mb.provider} · {mb.hasOAuth ? 'OAuth' : mb.hasSmtp ? 'SMTP' : 'no credentials'} {mb.isShared ? '· shared with all admins' : ''}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => testMailbox(mb.id)} disabled={mbBusy}
                              className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5">
                              <SendIcon className="w-3 h-3" /> Test
                            </button>
                            <button onClick={() => disconnectMailbox(mb.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Connect via OAuth */}
                  <div className="border border-gray-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Option A — Microsoft OAuth</p>
                    <p className="text-xs text-gray-500 mb-3">Needs <code className="font-mono bg-gray-100 px-1">OUTLOOK_CLIENT_ID</code> (and optional <code>OUTLOOK_CLIENT_SECRET</code>, <code>OUTLOOK_TENANT_ID</code>) set on the server. Admin app registration: grant <code>Mail.Send</code> + <code>offline_access</code>.</p>
                    <button onClick={connectOutlookOAuth}
                      className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-semibold hover:bg-[#0ea572]">
                      Connect via Microsoft
                    </button>
                  </div>

                  {/* Connect via SMTP */}
                  <form onSubmit={connectOutlookSmtp} className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-0.5">Option B — SMTP + app password</p>
                      <p className="text-xs text-gray-500">Faster to set up. Create an <a className="text-[#10b981] underline" href="https://account.microsoft.com/security" target="_blank" rel="noreferrer">app password</a> on the Microsoft account, then paste below.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-500">Mailbox email *</label>
                        <input required type="email" value={smtpForm.emailAddress}
                          onChange={e => setSmtpForm(s => ({ ...s, emailAddress: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">Display name</label>
                        <input value={smtpForm.displayName}
                          onChange={e => setSmtpForm(s => ({ ...s, displayName: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-gray-500">App password *</label>
                        <input required type="password" value={smtpForm.smtpPassword}
                          onChange={e => setSmtpForm(s => ({ ...s, smtpPassword: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">SMTP host</label>
                        <input value={smtpForm.smtpHost}
                          onChange={e => setSmtpForm(s => ({ ...s, smtpHost: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">SMTP port</label>
                        <input type="number" value={smtpForm.smtpPort}
                          onChange={e => setSmtpForm(s => ({ ...s, smtpPort: Number(e.target.value) || 587 }))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" />
                      </div>
                    </div>
                    <button type="submit" disabled={mbBusy}
                      className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-semibold hover:bg-[#0ea572] disabled:opacity-50">
                      {mbBusy ? 'Connecting…' : 'Connect SMTP Mailbox'}
                    </button>
                  </form>

                  {mbError && <p className="text-xs text-red-600 mt-3">{mbError}</p>}
                  {mbSavedNote && <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {mbSavedNote}</p>}
                </>
              )}
            </div>
          </div>
        )}

        {/* Notifications tab */}
        {tab === 'notifications' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Notification Preferences</h2>
            <p className="text-sm text-gray-500 mb-6">Control which automated emails you receive from BRDG.</p>

            <div className="space-y-5">
              {/* EOD email toggle */}
              <div className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">End-of-Day Summary</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Receive a daily digest at 11:59 PM with today's revenue, order count, SLA breach count, and top SKUs — sent via your connected Gmail account.
                    </p>
                  </div>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => setEodEmail(v => !v)}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${eodEmail ? 'bg-[#10b981]' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${eodEmail ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSavePrefs}
                disabled={prefsLoading}
                className="px-5 py-2 bg-[#10b981] text-white rounded-lg text-sm font-semibold hover:bg-[#0ea572] disabled:opacity-50"
              >
                {prefsLoading ? 'Saving…' : 'Save Preferences'}
              </button>
              {prefsSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-700">
                  <Check className="w-4 h-4" /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
