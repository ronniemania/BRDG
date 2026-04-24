import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Signup failed');
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-white rounded-3xl border border-[#e8eaed] shadow-sm px-8 py-10 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-[#10b981]" />
          </div>
          <h2 className="text-xl font-semibold text-[#202124] mb-2">Account Created</h2>
          <p className="text-sm text-[#5f6368] mb-6 leading-relaxed">
            Your account is pending approval.<br />You&apos;ll be notified when access is granted.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 bg-[#10b981] text-white rounded-full text-sm font-medium hover:bg-emerald-600 transition-colors shadow-sm"
          >
            Go to Sign in
          </button>
        </div>
      </div>
    );
  }

  const field = (
    id: string,
    label: string,
    type: string,
    value: string,
    onChange: (v: string) => void,
    placeholder?: string,
  ) => (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        placeholder=" "
        className="peer w-full px-4 pt-5 pb-2 text-sm text-[#202124] bg-white border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 transition-all"
      />
      <label
        htmlFor={id}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#80868b] pointer-events-none transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-[#10b981] peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
      >
        {label}
      </label>
      {placeholder && (
        <span className="hidden">{placeholder}</span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#10b981] flex items-center justify-center mb-4 shadow-md">
          <span className="text-white font-black text-2xl leading-none">B</span>
        </div>
        <h1 className="text-2xl font-normal text-[#202124] tracking-tight">Create your account</h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-white rounded-3xl border border-[#e8eaed] shadow-sm px-8 py-8">
        <p className="text-sm text-[#5f6368] mb-6 text-center">Request access to BRDG Alpha</p>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            {field('signup-first', 'First name', 'text', form.firstName, v => setForm(p => ({ ...p, firstName: v })))}
            {field('signup-last', 'Last name', 'text', form.lastName, v => setForm(p => ({ ...p, lastName: v })))}
          </div>

          {field('signup-email', 'Email', 'email', form.email, v => setForm(p => ({ ...p, email: v })))}
          {field('signup-password', 'Password (min 8 chars)', 'password', form.password, v => setForm(p => ({ ...p, password: v })))}
          {field('signup-confirm', 'Confirm password', 'password', form.confirmPassword, v => setForm(p => ({ ...p, confirmPassword: v })))}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-1 bg-[#10b981] text-white rounded-full text-sm font-medium hover:bg-emerald-600 active:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creating account…
              </span>
            ) : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#5f6368]">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[#10b981] hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <p className="mt-8 text-xs text-[#80868b]">&copy; {new Date().getFullYear()} BRDG Alpha</p>
    </div>
  );
}
