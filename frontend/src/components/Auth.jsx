import { useState } from "react";
import { api } from "../services/api";

export default function Auth({ onLogin }) {
  const [mode, setMode]     = useState("login"); // "login" | "register"
  const [email, setEmail]   = useState("");
  const [password, setPw]   = useState("");
  const [name, setName]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password, name);
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-mark">◈</span>
          <span className="logo-text">RiskMonitor</span>
        </div>
        <h2 className="auth-title">
          {mode === "login" ? "Sign in to your account" : "Create your account"}
        </h2>

        <form onSubmit={submit} className="auth-form">
          {mode === "register" && (
            <div className="field">
              <label>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Yuvraj Singh Chauhan" />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPw(e.target.value)} required placeholder="Min 8 characters" />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login"
            ? <>No account? <span onClick={() => setMode("register")}>Create one</span></>
            : <>Have an account? <span onClick={() => setMode("login")}>Sign in</span></>
          }
        </div>
      </div>
    </div>
  );
}
