import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  google_failed: 'Google sign-in failed. Please try again.',
  google_state_mismatch: 'Sign-in request expired. Please try again.',
  google_invalid: 'Invalid sign-in request. Please try again.',
};

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, authenticated, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    GOOGLE_ERROR_MESSAGES[searchParams.get('error') ?? ''] ?? '',
  );

  useEffect(() => {
    if (!authLoading && authenticated) navigate('/', { replace: true });
  }, [authLoading, authenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-[#10b981] flex items-center justify-center mb-4 shadow-md">
          <span className="text-white font-black text-2xl leading-none">B</span>
        </div>
        <h1 className="text-2xl font-normal text-[#202124] tracking-tight">Sign in to BRDG Alpha</h1>
      </div>

      {/* Card */}
      <div className="w-full max-w-[400px] bg-white rounded-3xl border border-[#e8eaed] shadow-sm px-8 py-8">
        {/* Error */}
        {error && (
          <div className="mb-5 flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Google OAuth — primary CTA */}
        <a
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white border border-[#dadce0] rounded-full text-sm font-medium text-[#202124] hover:bg-[#f8f9fa] hover:border-[#c6c6c6] transition-colors shadow-sm"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </a>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#e8eaed]" />
          <span className="text-xs text-[#80868b] font-medium">or sign in with email</span>
          <div className="flex-1 h-px bg-[#e8eaed]" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder=" "
              className="peer w-full px-4 pt-5 pb-2 text-sm text-[#202124] bg-white border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 transition-all"
            />
            <label
              htmlFor="login-email"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#80868b] pointer-events-none transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-[#10b981] peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
            >
              Email
            </label>
          </div>

          <div className="relative">
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder=" "
              className="peer w-full px-4 pt-5 pb-2 text-sm text-[#202124] bg-white border border-[#dadce0] rounded-xl focus:outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/20 transition-all"
            />
            <label
              htmlFor="login-password"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#80868b] pointer-events-none transition-all peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-[#10b981] peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
            >
              Password
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#10b981] text-white rounded-full text-sm font-medium hover:bg-emerald-600 active:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </button>
        </form>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm text-[#5f6368]">
          Don&apos;t have an account?{' '}
          <button
            onClick={() => navigate('/signup')}
            className="font-medium text-[#10b981] hover:underline"
          >
            Create account
          </button>
        </p>
      </div>

      <p className="mt-8 text-xs text-[#80868b]">&copy; {new Date().getFullYear()} BRDG Alpha</p>
    </div>
  );
}
