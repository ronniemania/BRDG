import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { setLogoutCallback } from '../lib/apiClient';

export default function AuthGuard() {
  const { authenticated, loading, logout } = useAuth();
  const navigate = useNavigate();

  // Wire up apiClient's logout callback to trigger real logout + redirect
  useEffect(() => {
    setLogoutCallback(() => {
      logout().then(() => navigate('/login', { replace: true }));
    });
  }, [logout, navigate]);

  // Redirect to login when not authenticated (after hydration completes)
  useEffect(() => {
    if (!loading && !authenticated) {
      navigate('/login', { replace: true });
    }
  }, [loading, authenticated, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#10b981] border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <Outlet />;
}
