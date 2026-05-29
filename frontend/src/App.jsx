import { useState, useEffect } from "react";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import "./App.css";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("prm_token"));
  const [user, setUser]   = useState(JSON.parse(localStorage.getItem("prm_user") || "null"));

  const handleLogin = (tokenData) => {
    localStorage.setItem("prm_token", tokenData.access_token);
    localStorage.setItem("prm_user", JSON.stringify({ id: tokenData.user_id, email: tokenData.email }));
    setToken(tokenData.access_token);
    setUser({ id: tokenData.user_id, email: tokenData.email });
  };

  const handleLogout = () => {
    localStorage.removeItem("prm_token");
    localStorage.removeItem("prm_user");
    setToken(null);
    setUser(null);
  };

  return (
    <div className="app">
      {token
        ? <Dashboard token={token} user={user} onLogout={handleLogout} />
        : <Auth onLogin={handleLogin} />
      }
    </div>
  );
}
