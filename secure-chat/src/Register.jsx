// src/Register.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";  // assume you have similar styles to Login.css

export default function Register({ onRegister }) {
  const [username, setUsername] = useState("");
  const [email,    setEmail   ] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError   ] = useState("");
  const [loading,  setLoading ] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("http://localhost:5000/api/register", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ username, email, password })
      });
      const data = await resp.json();
      setLoading(false);
      if (data.success) {
        onRegister(data.username);
        navigate("/users");
      } else {
        setError(data.error || "Registration failed.");
      }
    } catch (e) {
      setLoading(false);
      setError("Network error.");
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-header">SecureChat Register</h2>
        <form onSubmit={handleSubmit}>
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
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
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
            {loading ? "Registering..." : "Register"}
          </button>
          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
