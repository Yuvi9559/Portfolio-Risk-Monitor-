import React, { useState, useEffect, lazy, Suspense } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './App.css';
import Auth from './components/Auth';

const Dashboard = lazy(() => import('./components/Dashboard'));

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || '736682930147-2p9ee01tarshsu87iihdovf2qf9aps1c.apps.googleusercontent.com';

const STORAGE_KEY = 'prm_session';

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Keep localStorage in sync
  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  const handleLogin = (data) => {
    // data: { access_token, user: { email, name, picture } }
    setSession(data);
  };

  const handleLogout = () => {
    setSession(null);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {session ? (
        <Suspense fallback={
          <div className="dash-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
          </div>
        }>
          <Dashboard
            token={session.access_token}
            user={session.user}
            onLogout={handleLogout}
          />
        </Suspense>
      ) : (
        <Auth onLogin={handleLogin} />
      )}
    </GoogleOAuthProvider>
  );
}
