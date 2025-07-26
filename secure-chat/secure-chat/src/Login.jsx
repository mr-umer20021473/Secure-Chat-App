// src/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

export default function Login({ onLogin }) {
  const [step, setStep]         = useState("creds");    // "creds" or "otp"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp]           = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const navigate = useNavigate();

  // STEP 1: submit username+password → /api/login
  async function submitCreds(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      setLoading(false);

      if (data.success && data.otp_sent) {
        // proceed to OTP input
        setStep("otp");
      } else {
        setError(data.error || "Login failed.");
      }
    } catch (e) {
      setLoading(false);
      setError("Network error.");
    }
  }

  // STEP 2: submit otp → /api/verify_otp
  async function submitOtp(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("http://localhost:5000/api/verify_otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, otp })
      });
      const data = await resp.json();
      setLoading(false);

      if (data.success) {
        // fully logged in—notify parent and redirect
        onLogin(data.username);
        navigate("/users");
      } else {
        setError(data.error || "Invalid or expired code.");
      }
    } catch (e) {
      setLoading(false);
      setError("Network error.");
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {step === "creds" ? (
          <>
            <h2 className="login-header">SecureChat Login</h2>
            <form onSubmit={submitCreds}>
              <div className="login-form-group">
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="login-form-group">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? "Verifying..." : "Log In"}
              </button>
              {error && <div className="login-error">{error}</div>}
            </form>
          </>
        ) : (
          <>
            <h2 className="login-header">Enter One-Time Code</h2>
            <p className="login-subtext">
              We’ve sent a 6-digit code to your email.
            </p>
            <form onSubmit={submitOtp}>
              <div className="login-form-group">
                <input
                  type="text"
                  placeholder="123456"
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  required
                  maxLength={6}
                />
              </div>
              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? "Verifying..." : "Verify Code"}
              </button>
              {error && <div className="login-error">{error}</div>}
            </form>
            <button
              className="login-secondary"
              onClick={() => {
                /* allow user to go back & re-enter creds */
                setStep("creds");
                setError("");
              }}
            >
              ← Back to username/password
            </button>
          </>
        )}
      </div>
    </div>
  );
}
