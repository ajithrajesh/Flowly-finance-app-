import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, getErrorMessage } from '../services/api';
import {
  X,
  Mail,
  Phone,
  User,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';

const AuthModal = () => {
  const { authModalOpen, authMode, closeAuthModal, setAuthMode, login, register, googleAuth } = useAuth();

  // Login Method: 'password' | 'mpin'
  const [loginMethod, setLoginMethod] = useState('password');

  // Form Fields
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mpin, setMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [newMpin, setNewMpin] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showMpin, setShowMpin] = useState(false);

  // Flow & State Management
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [requiresMpinPrompt, setRequiresMpinPrompt] = useState(false);

  // Google OAuth Client Configuration
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');

  // Fetch Google Client ID from backend if not set in frontend env
  useEffect(() => {
    let isMounted = true;
    const fetchClientId = async () => {
      if (googleClientId && !googleClientId.includes('your_google_client_id')) return;
      try {
        const res = await authAPI.getGoogleClientId();
        if (isMounted && res.data?.clientId) {
          setGoogleClientId(res.data.clientId);
        }
      } catch {
        // Fallback / silent fail if backend route not reached
      }
    };
    if (authModalOpen) {
      fetchClientId();
    }
    return () => {
      isMounted = false;
    };
  }, [authModalOpen, googleClientId]);

  if (!authModalOpen) return null;

  const resetFormState = () => {
    setError('');
    setMessage('');
    setOtpSent(false);
    setOtpVerified(false);
    setRequiresMpinPrompt(false);
  };

  const handleSendOTP = async (purpose = 'registration') => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await authAPI.sendOTP({ email: email.toLowerCase().trim(), purpose });
      setOtpSent(true);
      setMessage(res.data.message || `OTP verification code sent to ${email}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send OTP code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (purpose = 'registration') => {
    if (!otp) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await authAPI.verifyOTP({ email: email.toLowerCase().trim(), otp: otp.trim(), purpose });
      setOtpVerified(true);
      setMessage('OTP verified successfully!');
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid or expired OTP code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setRequiresMpinPrompt(false);

    if (loginMethod === 'password') {
      if (!email) {
        setError('Please enter your registered email address.');
        return;
      }
      if (!password) {
        setError('Please enter your account password.');
        return;
      }

      setError('');
      setLoading(true);
      try {
        await login({ email: email.toLowerCase().trim(), password });
      } catch (err) {
        setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
      } finally {
        setLoading(false);
      }
    } else {
      // MPIN Login flow (Preserved!)
      if (!email && !phone) {
        setError('Please enter your email address or phone number.');
        return;
      }
      if (!mpin) {
        setError('Please enter your 4-6 digit MPIN.');
        return;
      }

      setError('');
      setLoading(true);
      try {
        await login({
          email: email ? email.toLowerCase().trim() : undefined,
          phone: phone ? phone.trim() : undefined,
          mpin: mpin.trim(),
        });
      } catch (err) {
        const errorData = err.response?.data;
        if (errorData?.requiresMpinSetup) {
          setRequiresMpinPrompt(true);
          setError(
            errorData.message ||
              'MPIN has not been generated for this account yet. Please log in using your registered password.'
          );
        } else {
          setError(getErrorMessage(err, 'Login failed. Please check your MPIN.'));
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !phone) {
      setError('Please fill in your Name, Email, and Mobile Number.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password is required and must be at least 6 characters long.');
      return;
    }
    if (!otp) {
      setError('Email OTP verification code is mandatory for registration.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone.trim(),
        password,
        otp: otp.trim(),
      });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetMpinSubmit = async (e) => {
    e.preventDefault();
    if (!email || !otp || !newMpin) {
      setError('Please provide Email, OTP code, and New MPIN.');
      return;
    }
    if (!/^\d{4,6}$/.test(newMpin)) {
      setError('New MPIN must be a 4 to 6 digit numerical PIN.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authAPI.resetMPIN({ email: email.toLowerCase().trim(), otp: otp.trim(), newMpin: newMpin.trim() });
      setMessage('MPIN reset successfully! You can now log in.');
      setAuthMode('login');
      setLoginMethod('mpin');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reset MPIN.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!email || !otp || !newPassword) {
      setError('Please provide Email, OTP code, and New Password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authAPI.resetPassword({
        email: email.toLowerCase().trim(),
        otp: otp.trim(),
        newPassword,
      });
      setMessage('Password updated successfully! You can now log in with your email and password.');
      setAuthMode('login');
      setLoginMethod('password');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reset password.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRealGoogleOAuthPopup = () => {
    setError('');

    const hasRealClientId =
      googleClientId &&
      !googleClientId.includes('your_google_client_id') &&
      googleClientId.includes('.apps.googleusercontent.com');

    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity SDK is loading. Please try again in a moment or verify your connection.');
      return;
    }

    if (!hasRealClientId) {
      setError(
        'Google OAuth requires a configured Google Client ID. Please set GOOGLE_CLIENT_ID in Flowly-Finance-backend/.env or VITE_GOOGLE_CLIENT_ID in user-frontend/.env.'
      );
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse?.error) {
            setError(`Google Sign-In canceled or failed: ${tokenResponse.error}`);
            return;
          }
          if (tokenResponse?.access_token) {
            setLoading(true);
            try {
              await googleAuth({ accessToken: tokenResponse.access_token });
            } catch (err) {
              setError(getErrorMessage(err, 'Google token verification failed on server.'));
            } finally {
              setLoading(false);
            }
          }
        },
      });
      client.requestAccessToken();
    } catch (err) {
      setError(`Unable to launch Google OAuth popup: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ position: 'relative', maxWidth: '440px', width: '100%' }}>
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6E677B',
          }}
          aria-label="Close authentication modal"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #5C187B 0%, #8B5CF6 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px',
              fontWeight: 800,
              fontSize: '20px',
              boxShadow: '0 4px 14px rgba(92, 24, 123, 0.3)',
            }}
          >
            F
          </div>
          <h2 style={{ fontSize: '22px', color: '#201530', marginBottom: '4px' }}>
            {authMode === 'login' && 'Welcome Back to Flowly'}
            {authMode === 'register' && 'Create Your Flowly Account'}
            {authMode === 'forgot_mpin' && 'Reset Security MPIN'}
            {authMode === 'forgot_password' && 'Reset Account Password'}
          </h2>
          <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
            {authMode === 'login' &&
              (loginMethod === 'password'
                ? 'Sign in securely using your registered email and password.'
                : 'Sign in quickly using your registered email/phone and 4-6 digit MPIN.')}
            {authMode === 'register' && 'Register in seconds and unlock smart savings and instant transfers.'}
            {authMode === 'forgot_mpin' && 'Verify your email with OTP to set a new security PIN.'}
            {authMode === 'forgot_password' && 'Verify your registered email with OTP to update your password.'}
          </p>
        </div>

        {/* Notifications & Error Alerts */}
        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: '#FADADA',
              color: '#B23A2E',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
            {requiresMpinPrompt && (
              <button
                type="button"
                onClick={() => {
                  setLoginMethod('password');
                  setRequiresMpinPrompt(false);
                  setError('');
                }}
                className="btn-secondary"
                style={{
                  alignSelf: 'flex-start',
                  marginTop: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                  backgroundColor: '#ffffff',
                  borderColor: '#B23A2E',
                  color: '#B23A2E',
                }}
              >
                Log in with Password instead
              </button>
            )}
          </div>
        )}

        {message && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: '#E4F4DC',
              color: '#2E7A22',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle size={16} /> {message}
          </div>
        )}

        {/* Mode Switcher Tabs (Login vs Register) */}
        {(authMode === 'login' || authMode === 'register') && (
          <div className="tabs-nav" style={{ justifyContent: 'center', marginBottom: '18px' }}>
            <button
              className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => {
                resetFormState();
                setAuthMode('login');
              }}
            >
              Customer Login
            </button>
            <button
              className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => {
                resetFormState();
                setAuthMode('register');
              }}
            >
              New Registration
            </button>
          </div>
        )}

        {/* ---------------- LOGIN FORM ---------------- */}
        {authMode === 'login' && (
          <form onSubmit={handleLoginSubmit}>
            {/* Sub-selector: Password Login vs MPIN Login */}
            <div
              style={{
                display: 'flex',
                background: '#F3EEF9',
                borderRadius: '8px',
                padding: '3px',
                marginBottom: '16px',
                gap: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setLoginMethod('password');
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: loginMethod === 'password' ? '#ffffff' : 'transparent',
                  color: loginMethod === 'password' ? '#5C187B' : '#6E677B',
                  boxShadow: loginMethod === 'password' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                Password Login (No MPIN needed)
              </button>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setLoginMethod('mpin');
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: loginMethod === 'mpin' ? '#ffffff' : 'transparent',
                  color: loginMethod === 'mpin' ? '#5C187B' : '#6E677B',
                  boxShadow: loginMethod === 'mpin' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                MPIN Login
              </button>
            </div>

            {/* Email / Identifier Field */}
            <div className="form-group">
              <label className="form-label">
                {loginMethod === 'password' ? 'Registered Email Address' : 'Email Address or Mobile Number'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={loginMethod === 'password' ? 'email' : 'text'}
                  className="form-input"
                  placeholder={
                    loginMethod === 'password' ? 'e.g. customer@example.com' : 'e.g. user@example.com or 9876543210'
                  }
                  value={loginMethod === 'password' ? email : email || phone}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (loginMethod === 'password') {
                      setEmail(val);
                    } else {
                      if (val.includes('@')) {
                        setEmail(val);
                        setPhone('');
                      } else {
                        setPhone(val);
                        setEmail('');
                      }
                    }
                  }}
                  required
                />
                <Mail size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
              </div>
            </div>

            {/* Password Login Field */}
            {loginMethod === 'password' && (
              <div className="form-group">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label className="form-label" style={{ margin: 0 }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormState();
                      setAuthMode('forgot_password');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '12px',
                      color: '#5C187B',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Enter your account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#A19AA8',
                    }}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* MPIN Login Field (Preserved!) */}
            {loginMethod === 'mpin' && (
              <div className="form-group">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label className="form-label" style={{ margin: 0 }}>
                    4-6 Digit Security MPIN
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormState();
                      setAuthMode('forgot_mpin');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '12px',
                      color: '#5C187B',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot MPIN?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showMpin ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••"
                    maxLength={6}
                    value={mpin}
                    onChange={(e) => setMpin(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowMpin(!showMpin)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '10px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#A19AA8',
                    }}
                    aria-label="Toggle MPIN visibility"
                  >
                    {showMpin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              disabled={loading}
            >
              {loading
                ? 'Signing In...'
                : loginMethod === 'password'
                ? 'Sign In with Password'
                : 'Sign In with MPIN'}
            </button>
          </form>
        )}

        {/* ---------------- REGISTER FORM ---------------- */}
        {authMode === 'register' && (
          <form onSubmit={handleRegisterSubmit}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <User size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Mail size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
                </div>
                <button
                  type="button"
                  onClick={() => handleSendOTP('registration')}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '12px' }}
                  disabled={loading || !email}
                >
                  {otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
              </div>
            </div>

            {/* Mandatory OTP Code Entry */}
            <div
              className="form-group"
              style={{
                backgroundColor: '#FAF5FF',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #8B5CF6',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}
              >
                <label className="form-label" style={{ color: '#5C187B', margin: 0, fontWeight: 600 }}>
                  6-Digit Email OTP (Mandatory)
                </label>
                {!otpSent && <span style={{ fontSize: '11px', color: '#6E677B' }}>Click &apos;Send OTP&apos; above</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter 6-digit OTP code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
                {otpSent && (
                  <button
                    type="button"
                    onClick={() => handleVerifyOTP('registration')}
                    className="btn-primary"
                    style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '12px' }}
                    disabled={loading || !otp}
                  >
                    {otpVerified ? 'Verified ✓' : 'Verify'}
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Mobile Number</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
                <Phone size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Create Password (Min. 6 characters)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#A19AA8',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#6E677B', marginTop: '4px', marginBottom: 0 }}>
                💡 Allows instant login without an MPIN. You can generate your MPIN anytime later in your dashboard.
              </p>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Complete Registration'}
            </button>
          </form>
        )}

        {/* ---------------- FORGOT MPIN FORM (Preserved!) ---------------- */}
        {authMode === 'forgot_mpin' && (
          <form onSubmit={handleResetMpinSubmit}>
            <div className="form-group">
              <label className="form-label">Registered Email Address</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => handleSendOTP('reset_mpin')}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '12px' }}
                  disabled={loading || !email}
                >
                  {otpSent ? 'Resend' : 'Send OTP'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">OTP Verification Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="6-digit code sent to email"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New 4-6 Digit MPIN</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showMpin ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter new 4-6 digit PIN"
                  maxLength={6}
                  value={newMpin}
                  onChange={(e) => setNewMpin(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowMpin(!showMpin)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#A19AA8',
                  }}
                  aria-label="Toggle MPIN visibility"
                >
                  {showMpin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              disabled={loading}
            >
              {loading ? 'Resetting MPIN...' : 'Confirm Reset MPIN'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetFormState();
                setAuthMode('login');
              }}
              style={{
                width: '100%',
                marginTop: '12px',
                background: 'none',
                border: 'none',
                color: '#6E677B',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Back to Login
            </button>
          </form>
        )}

        {/* ---------------- FORGOT PASSWORD FORM ---------------- */}
        {authMode === 'forgot_password' && (
          <form onSubmit={handleResetPasswordSubmit}>
            <div className="form-group">
              <label className="form-label">Registered Email Address</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  className="form-input"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => handleSendOTP('reset_password')}
                  className="btn-secondary"
                  style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '12px' }}
                  disabled={loading || !email}
                >
                  {otpSent ? 'Resend' : 'Send OTP'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">OTP Verification Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="6-digit verification code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password (Min. 6 characters)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter new password"
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '10px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#A19AA8',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              disabled={loading}
            >
              {loading ? 'Updating Password...' : 'Save New Password'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetFormState();
                setAuthMode('login');
              }}
              style={{
                width: '100%',
                marginTop: '12px',
                background: 'none',
                border: 'none',
                color: '#6E677B',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Back to Login
            </button>
          </form>
        )}

        {/* Divider */}
        {(authMode === 'login' || authMode === 'register') && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 16px' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E7E4DC' }}></div>
              <span style={{ fontSize: '12px', color: '#A19AA8', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E7E4DC' }}></div>
            </div>

            {/* Google OAuth Button (with direct OAuth 2.0 popup / token client) */}
            <button
              type="button"
              onClick={handleRealGoogleOAuthPopup}
              className="btn-outline-dark"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '11px',
                fontSize: '14px',
                borderRadius: '8px',
                borderColor: '#D0C9D6',
                cursor: 'pointer',
              }}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.39 7.35 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.99 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.61 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
