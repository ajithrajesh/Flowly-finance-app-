import React, { useState } from 'react';
import { authAPI, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { X, ShieldCheck, Mail, KeyRound, AlertTriangle, CheckCircle } from 'lucide-react';

const MpinModal = ({ isOpen, onClose, onSuccess }) => {
  const { user, refreshProfile } = useAuth();

  const [otp, setOtp] = useState('');
  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const targetEmail = user?.email || '';

  const handleSendOTP = async () => {
    if (!targetEmail) {
      setError('No registered email address found.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await authAPI.sendOTP({ email: targetEmail, purpose: 'generate_mpin' });
      setOtpSent(true);
      setMessage(res.data.message || `Verification code sent to ${targetEmail}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send OTP code.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp) {
      setError('Please enter the 6-digit OTP code sent to your email.');
      return;
    }
    if (!mpin || !/^\d{4,6}$/.test(mpin)) {
      setError('MPIN must be a 4 to 6 digit numerical PIN.');
      return;
    }
    if (mpin !== confirmMpin) {
      setError('MPIN and Confirm MPIN do not match.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await authAPI.generateMPIN({
        email: targetEmail,
        phone: user?.phone,
        otp: otp.trim(),
        mpin: mpin.trim(),
      });

      setMessage('Security MPIN generated successfully!');
      await refreshProfile();
      if (onSuccess) onSuccess(res.data);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(getErrorMessage(err, 'MPIN generation failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ position: 'relative', maxWidth: '440px' }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6E677B'
          }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            backgroundColor: '#EEE7F4',
            color: '#5C187B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 4px 14px rgba(92, 24, 123, 0.15)'
          }}>
            <ShieldCheck size={26} />
          </div>
          <h2 style={{ fontSize: '20px', color: '#201530', marginBottom: '6px' }}>
            Generate Security MPIN
          </h2>
          <p style={{ fontSize: '13px', color: '#6E677B' }}>
            Set up your 4-6 digit Security MPIN via 2-step OTP email verification.
          </p>
        </div>

        {/* Global Notifications */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#FADADA',
            color: '#B23A2E',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {message && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#E4F4DC',
            color: '#2E7A22',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle size={16} /> {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Send OTP to Email */}
          <div className="form-group">
            <label className="form-label">Registered Email</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="email"
                  className="form-input"
                  value={targetEmail}
                  disabled
                  style={{ backgroundColor: '#F6F5F1', color: '#201530', paddingRight: '36px' }}
                />
                <Mail size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
              </div>
              <button
                type="button"
                onClick={handleSendOTP}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: '12px' }}
                disabled={loading}
              >
                {otpSent ? 'Resend OTP' : 'Send OTP'}
              </button>
            </div>
          </div>

          {/* Step 2: OTP & MPIN Inputs */}
          {otpSent && (
            <>
              <div className="form-group" style={{ backgroundColor: '#FAF5FF', padding: '12px', borderRadius: '8px', border: '1px solid #8B5CF6' }}>
                <label className="form-label" style={{ color: '#5C187B' }}>Enter 6-Digit Verification Code</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Set 4-6 Digit Security MPIN</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter 4 to 6 numeric digits"
                    maxLength={6}
                    value={mpin}
                    onChange={(e) => setMpin(e.target.value)}
                    required
                  />
                  <KeyRound size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Security MPIN</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Re-enter MPIN"
                    maxLength={6}
                    value={confirmMpin}
                    onChange={(e) => setConfirmMpin(e.target.value)}
                    required
                  />
                  <KeyRound size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '8px' }}
                disabled={loading}
              >
                {loading ? 'Generating MPIN...' : 'Confirm & Save Security MPIN'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default MpinModal;
