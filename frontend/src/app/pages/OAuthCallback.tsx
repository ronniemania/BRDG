import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { setTokenFromOAuth } from '../context/AuthContext';

/**
 * Landing page for the Google OAuth callback redirect.
 * The backend sets a short-lived readable cookie `oauthAccessToken` before redirecting here.
 * This page reads it, hydrates the auth context, and navigates to the dashboard.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const didRun = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (didRun.current) return;
    didRun.current = true;

    (async () => {
      // Read the one-time access token cookie the backend set
      const cookie = document.cookie
        .split('; ')
        .find((row) => row.startsWith('oauthAccessToken='));
      const oauthToken = cookie?.split('=')[1] ?? null;

      if (oauthToken) {
        // Hand the token to AuthContext memory and immediately clear the cookie
        setTokenFromOAuth(oauthToken);
        document.cookie = 'oauthAccessToken=; Max-Age=0; path=/';
      }

      // Verify the session is valid before navigating
      try {
        const res = await fetch('/api/auth/me', {
          headers: oauthToken ? { Authorization: `Bearer ${oauthToken}` } : {},
          credentials: 'include',
        });
        if (res.ok) {
          navigate('/', { replace: true });
          return;
        }
      } catch {
        // Fall through to error state
      }

      navigate('/login?error=google_failed', { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#10b981] border-t-transparent" />
        <span className="text-sm text-muted-foreground">Completing sign-in...</span>
      </div>
    </div>
  );
}
