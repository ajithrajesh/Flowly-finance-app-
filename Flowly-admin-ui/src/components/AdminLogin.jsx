import React, { useState } from 'react';
import * as api from '../api';

export default function AdminLogin({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your admin credentials.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const admin = await api.loginAdmin({ email: email.trim(), password });
      onLoggedIn(admin);
    } catch (err) {
      setError(err.message || 'Admin authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-login-shell">
      <div className="admin-login-box">
        <div className="admin-login-logo">
          <div className="mark">A</div>
          <div className="word">Flowly Executive</div>
        </div>

        <h2 className="admin-login-title">Executive Admin Portal</h2>
        <p className="admin-login-sub">Restricted system access for executives & admins.</p>

        {error && <div className="error-banner">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label">Administrator Email</label>
            <input
              className="field-input"
              type="email"
              autoComplete="username"
              placeholder="admin@flowly.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Authenticating Admin...' : 'Sign in to Admin Dashboard'}
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', lineHeight: '1.5' }}>
          🔒 Protected system. Unauthorized access attempts are monitored and logged. Default admin: <code>admin@flowly.com</code>
        </div>
      </div>
    </div>
  );
}
