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

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const data = await api.loginWithGoogle(credentialResponse.credential);
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In was cancelled or failed. Please try again.');
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

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-terms">
          By signing in, you agree to our Terms of Service and Privacy Policy.
          <br />
          Your data is encrypted and never shared.
        </div>
      </div>
    </div>
  );
}
