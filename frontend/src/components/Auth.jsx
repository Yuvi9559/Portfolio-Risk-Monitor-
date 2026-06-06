import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import api from '../services/api';

const FEATURES = [
  { icon: '📊', label: 'Value at Risk (VaR) Analysis' },
  { icon: '🎲', label: 'Monte Carlo Simulation' },
  { icon: '⚡', label: 'Real-time Price Streaming' },
  { icon: '🤖', label: 'AI News Sentiment' },
  { icon: '📈', label: 'Portfolio Beta & Sharpe' },
  { icon: '📉', label: 'Max Drawdown Tracking' },
];

export default function Auth({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastCredential, setLastCredential] = useState(null);

  const attemptLogin = async (credential) => {
    setError('');
    setLoading(true);
    try {
      console.log('[Auth] Sending credential to backend…');
      const data = await api.loginWithGoogle(credential);
      console.log('[Auth] Login successful');
      onLogin(data);
    } catch (err) {
      console.error('[Auth] Login failed:', err);
      setLastCredential(credential); // Store for retry
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    await attemptLogin(credentialResponse.credential);
  };

  const handleGoogleError = () => {
    setError('Google Sign-In was cancelled or failed. Please try again.');
    setLastCredential(null);
  };

  const handleRetry = () => {
    if (lastCredential) {
      attemptLogin(lastCredential);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-grid-bg" />

      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🛡️</div>
          <div className="auth-logo-name">
            Risk<span>Monitor</span> Pro
          </div>
        </div>
        <div className="auth-tagline">Professional Portfolio Risk Intelligence</div>

        {/* Features */}
        <div className="auth-divider" />
        <ul className="auth-features">
          {FEATURES.map((f) => (
            <li key={f.label}>
              <span className="feat-icon">{f.icon}</span>
              {f.label}
            </li>
          ))}
        </ul>
        <div className="auth-divider" />

        {/* Google Login */}
        {loading ? (
          <button className="google-btn" disabled>
            <span className="spinner" />
            Signing in…
          </button>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              useOneTap={false}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signin_with"
              width="384"
            />
          </div>
        )}

        {error && (
          <div className="auth-error">
            {error}
            {lastCredential && (
              <button
                className="retry-btn"
                onClick={handleRetry}
                style={{
                  display: 'block',
                  margin: '8px auto 0',
                  padding: '6px 20px',
                  background: 'rgba(0,206,209,0.15)',
                  color: '#00ced1',
                  border: '1px solid rgba(0,206,209,0.3)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                ↻ Retry
              </button>
            )}
          </div>
        )}

        <div className="auth-terms">
          By signing in, you agree to our Terms of Service and Privacy Policy.
          <br />
          Your data is encrypted and never shared.
        </div>
      </div>
    </div>
  );
}
