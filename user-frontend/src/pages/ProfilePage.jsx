import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, getErrorMessage } from '../services/api';
import UserAvatar from '../components/UserAvatar';
import MpinModal from '../components/MpinModal';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Briefcase,
  Heart,
  Landmark,
  ShieldCheck,
  ShieldAlert,
  Camera,
  Trash2,
  Edit3,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ArrowLeft,
  Building,
  CreditCard,
  Check
} from 'lucide-react';

const ProfilePage = () => {
  const { user, account, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [mpinModalOpen, setMpinModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    dateOfBirth: '',
    gender: '',
    occupation: '',
    maritalStatus: '',
    city: '',
    state: '',
    pincode: '',
    alternatePhone: '',
  });

  // Sync state when user changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        address: user.address || '',
        dateOfBirth: user.personalDetails?.dateOfBirth || '',
        gender: user.personalDetails?.gender || '',
        occupation: user.personalDetails?.occupation || '',
        maritalStatus: user.personalDetails?.maritalStatus || '',
        city: user.contactDetails?.city || '',
        state: user.contactDetails?.state || '',
        pincode: user.contactDetails?.pincode || '',
        alternatePhone: user.contactDetails?.alternatePhone || '',
      });
    }
  }, [user]);

  const showNotification = (msg, isSuccess = true) => {
    if (isSuccess) {
      setSuccessMessage(msg);
      setErrorMessage('');
      setTimeout(() => setSuccessMessage(''), 4500);
    } else {
      setErrorMessage(msg);
      setSuccessMessage('');
      setTimeout(() => setErrorMessage(''), 5500);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (<= 5MB)
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.mimetype || file.type)) {
      showNotification('Please upload a valid image file (JPG, PNG, WEBP, or GIF).', false);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showNotification('Image size exceeds 5 MB. Please select a smaller photo.', false);
      return;
    }

    const uploadData = new FormData();
    uploadData.append('avatar', file);

    setUploadingAvatar(true);
    setErrorMessage('');
    try {
      await authAPI.uploadAvatar(uploadData);
      await refreshProfile();
      showNotification('Profile avatar updated successfully!');
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      showNotification(getErrorMessage(err, 'Failed to upload profile photo. Please try again.'), false);
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.profileImage && !user?.avatar) return;
    setUploadingAvatar(true);
    setErrorMessage('');
    try {
      await authAPI.removeAvatar();
      await refreshProfile();
      showNotification('Profile photo removed. Default initials avatar restored.');
    } catch (err) {
      console.error('Failed to remove avatar:', err);
      showNotification(getErrorMessage(err, 'Failed to remove profile photo.'), false);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCancelEdit = () => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || '',
        address: user.address || '',
        dateOfBirth: user.personalDetails?.dateOfBirth || '',
        gender: user.personalDetails?.gender || '',
        occupation: user.personalDetails?.occupation || '',
        maritalStatus: user.personalDetails?.maritalStatus || '',
        city: user.contactDetails?.city || '',
        state: user.contactDetails?.state || '',
        pincode: user.contactDetails?.pincode || '',
        alternatePhone: user.contactDetails?.alternatePhone || '',
      });
    }
    setIsEditing(false);
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      showNotification('Full name must be at least 2 characters.', false);
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        personalDetails: {
          dateOfBirth: formData.dateOfBirth,
          gender: formData.gender,
          occupation: formData.occupation.trim(),
          maritalStatus: formData.maritalStatus,
        },
        contactDetails: {
          city: formData.city.trim(),
          state: formData.state.trim(),
          pincode: formData.pincode.trim(),
          alternatePhone: formData.alternatePhone.trim(),
        },
      };

      await authAPI.updateProfile(payload);
      await refreshProfile();
      setIsEditing(false);
      showNotification('Personal details updated successfully!');
    } catch (err) {
      console.error('Failed to update profile:', err);
      showNotification(getErrorMessage(err, 'Failed to update profile details. Please try again.'), false);
    } finally {
      setSaving(false);
    }
  };

  const kycStatus = user?.kycStatus || 'pending';
  const isKycVerified = kycStatus === 'verified';
  const isMpinSet = user?.isMpinSet ?? false;
  const hasCustomAvatar = Boolean(user?.profileImage || user?.avatar);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 16px 64px' }}>
      {/* Top Header & Breadcrumb */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'none',
              border: 'none',
              color: '#6E677B',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '8px',
            }}
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#201530', margin: 0, fontFamily: 'Outfit' }}>
            User Profile & Account
          </h1>
          <p style={{ color: '#6E677B', fontSize: '14px', margin: '4px 0 0' }}>
            View and update your personal identity, contact info, and profile avatar.
          </p>
        </div>

        <div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontSize: '13px',
                backgroundColor: '#5C187B',
              }}
            >
              <Edit3 size={15} /> Edit Profile
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={saving}
                className="btn-outline-dark"
                style={{ padding: '8px 14px', fontSize: '13px' }}
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 18px',
                  fontSize: '13px',
                  backgroundColor: '#5C187B',
                }}
              >
                <Save size={15} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {successMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: '#E4F4DC',
          border: '1px solid #C4E4B5',
          color: '#2E7A22',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease',
        }}>
          <CheckCircle2 size={18} /> {successMessage}
        </div>
      )}

      {errorMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: '#FADADA',
          border: '1px solid #F3BDB7',
          color: '#B23A2E',
          marginBottom: '20px',
          fontSize: '13px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease',
        }}>
          <AlertCircle size={18} /> {errorMessage}
        </div>
      )}

      {/* ---------------- 1. PROFILE HERO & AVATAR CARD ---------------- */}
      <div className="flowly-card" style={{ marginBottom: '24px', padding: '28px 24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}>
          {/* Circular Avatar Container with Photo Actions */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <UserAvatar
              user={user}
              size={96}
              fontSize="32px"
              border="2.5px solid #8B5CF6"
              style={{
                boxShadow: '0 8px 24px rgba(92, 24, 123, 0.15)',
                opacity: uploadingAvatar ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            />

            {/* Quick Upload Action Button Pill */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Upload / Change profile photo"
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#5C187B',
                color: '#FFFFFF',
                border: '2px solid #FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              aria-label="Upload profile image"
            >
              <Camera size={15} />
            </button>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarFileSelect}
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
            />
          </div>

          {/* User Primary Identity Details */}
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#201530', margin: 0, fontFamily: 'Outfit' }}>
                {user?.name || 'Customer'}
              </h2>
              <span className={`badge ${isKycVerified ? 'badge-green' : 'badge-purple'}`} style={{ textTransform: 'capitalize' }}>
                {isKycVerified ? 'KYC Verified ✓' : `KYC: ${kycStatus.replace('_', ' ')}`}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: '#6E677B', marginBottom: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} color="#8B5CF6" /> {user?.email}
              </span>
              {user?.phone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} color="#8B5CF6" /> {user?.phone}
                </span>
              )}
              {account?.accountNumber && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Landmark size={14} color="#8B5CF6" /> A/C: {account.accountNumber}
                </span>
              )}
            </div>

            {/* Avatar management buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="btn-outline-dark"
                style={{
                  fontSize: '11px',
                  padding: '5px 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: uploadingAvatar ? 'wait' : 'pointer',
                }}
              >
                <Camera size={13} /> {uploadingAvatar ? 'Uploading...' : hasCustomAvatar ? 'Change Photo' : 'Upload Photo'}
              </button>

              {hasCustomAvatar && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingAvatar}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#B23A2E',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: uploadingAvatar ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 8px',
                  }}
                  title="Remove custom photo and use initials avatar"
                >
                  <Trash2 size={13} /> Remove Photo
                </button>
              )}

              <span style={{ fontSize: '11px', color: '#A19AA8' }}>
                JPG, PNG, or WEBP up to 5MB. Circular avatar with initials fallback.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 2. MAIN DETAILS & ACCOUNT GRID ---------------- */}
      <div className="grid-2" style={{ alignItems: 'start', gap: '24px' }}>
        {/* Left Column: Personal & Contact Information Form */}
        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #F0EEF4' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#201530', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="#5C187B" /> Personal Details
            </h3>
            <span style={{ fontSize: '12px', color: isEditing ? '#5C187B' : '#6E677B', fontWeight: 600 }}>
              {isEditing ? 'Editing Mode' : 'Read-Only View'}
            </span>
          </div>

          <form onSubmit={handleSaveProfile}>
            {/* Full Name */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. Johnathan Doe"
                  className="form-input"
                  style={{ fontSize: '13px', padding: '10px 12px' }}
                />
              ) : (
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#201530', padding: '8px 0' }}>
                  {formData.name || 'Not provided'}
                </div>
              )}
            </div>

            {/* Email Address (Immutable by customer) */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                  Email Address
                </label>
                <span style={{ fontSize: '10px', color: '#2E7A22', fontWeight: 700, backgroundColor: '#E4F4DC', padding: '2px 6px', borderRadius: '4px' }}>
                  Verified Primary
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#6E677B', padding: '8px 12px', backgroundColor: '#F8F6FA', borderRadius: '8px', border: '1px solid #ECE8F2' }}>
                {user?.email || 'N/A'}
              </div>
            </div>

            {/* Phone Number */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                Primary Phone Number
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+91 9876543210"
                  className="form-input"
                  style={{ fontSize: '13px', padding: '10px 12px' }}
                />
              ) : (
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#201530', padding: '8px 0' }}>
                  {formData.phone || 'No phone registered'}
                </div>
              )}
            </div>

            {/* Date of Birth & Gender row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                  Date of Birth
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleInputChange}
                    className="form-input"
                    style={{ fontSize: '13px', padding: '9px 10px' }}
                  />
                ) : (
                  <div style={{ fontSize: '13px', color: '#201530', padding: '8px 0', fontWeight: 500 }}>
                    {formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString() : 'Not specified'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                  Gender
                </label>
                {isEditing ? (
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleInputChange}
                    className="form-select"
                    style={{ fontSize: '13px', padding: '9px 10px' }}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '13px', color: '#201530', padding: '8px 0', fontWeight: 500 }}>
                    {formData.gender || 'Not specified'}
                  </div>
                )}
              </div>
            </div>

            {/* Occupation & Marital Status row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                  Occupation
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="occupation"
                    value={formData.occupation}
                    onChange={handleInputChange}
                    placeholder="e.g. Engineer, Business"
                    className="form-input"
                    style={{ fontSize: '13px', padding: '9px 10px' }}
                  />
                ) : (
                  <div style={{ fontSize: '13px', color: '#201530', padding: '8px 0', fontWeight: 500 }}>
                    {formData.occupation || 'Not specified'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                  Marital Status
                </label>
                {isEditing ? (
                  <select
                    name="maritalStatus"
                    value={formData.maritalStatus}
                    onChange={handleInputChange}
                    className="form-select"
                    style={{ fontSize: '13px', padding: '9px 10px' }}
                  >
                    <option value="">Select Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Other">Other</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '13px', color: '#201530', padding: '8px 0', fontWeight: 500 }}>
                    {formData.maritalStatus || 'Not specified'}
                  </div>
                )}
              </div>
            </div>

            {/* Address */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 600, color: '#4B4254' }}>
                Primary Residential Address
              </label>
              {isEditing ? (
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  rows={2}
                  placeholder="Street address, house/flat number, landmark"
                  className="form-textarea"
                  style={{ fontSize: '13px', padding: '10px 12px' }}
                />
              ) : (
                <div style={{ fontSize: '13px', color: '#201530', padding: '8px 0', lineHeight: 1.4 }}>
                  {formData.address || 'No registered address on file'}
                </div>
              )}
            </div>

            {/* City, State, PIN */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 600, color: '#4B4254' }}>
                  City
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="City"
                    className="form-input"
                    style={{ fontSize: '12px', padding: '8px' }}
                  />
                ) : (
                  <div style={{ fontSize: '12px', color: '#201530', padding: '6px 0' }}>
                    {formData.city || '—'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 600, color: '#4B4254' }}>
                  State
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    placeholder="State"
                    className="form-input"
                    style={{ fontSize: '12px', padding: '8px' }}
                  />
                ) : (
                  <div style={{ fontSize: '12px', color: '#201530', padding: '6px 0' }}>
                    {formData.state || '—'}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '11px', fontWeight: 600, color: '#4B4254' }}>
                  PIN Code
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                    placeholder="PIN"
                    className="form-input"
                    style={{ fontSize: '12px', padding: '8px' }}
                  />
                ) : (
                  <div style={{ fontSize: '12px', color: '#201530', padding: '6px 0' }}>
                    {formData.pincode || '—'}
                  </div>
                )}
              </div>
            </div>

            {/* Save Button inside form for mobile/convenience */}
            {isEditing && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '13px', backgroundColor: '#5C187B' }}
                >
                  {saving ? 'Saving Changes...' : 'Save Profile Details'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="btn-outline-dark"
                  style={{ padding: '10px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Banking Information & Security Overview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Linked Bank Account Card */}
          <div className="flowly-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F0EEF4' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#201530', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Landmark size={18} color="#5C187B" /> Bank Account Overview
              </h3>
              <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                {account?.status || 'Active'}
              </span>
            </div>

            <div className="kv-row">
              <span className="k">Account Number</span>
              <span className="v" style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {account?.accountNumber || 'Pending Account Allocation'}
              </span>
            </div>

            <div className="kv-row">
              <span className="k">Account Type</span>
              <span className="v">{account?.accountType || 'Core Savings'}</span>
            </div>

            <div className="kv-row">
              <span className="k">Registered Branch</span>
              <span className="v">{account?.branch || 'Kochi Main Branch'}</span>
            </div>

            <div className="kv-row">
              <span className="k">Available Balance</span>
              <span className="v" style={{ color: '#2E7A22', fontWeight: 800 }}>
                ₹{account ? account.balance?.toLocaleString('en-IN') : '0.00'}
              </span>
            </div>

            <button
              onClick={() => navigate('/deposits')}
              className="btn-outline-dark"
              style={{ width: '100%', marginTop: '16px', padding: '9px', fontSize: '12px' }}
            >
              View Full Account Passbook & Ledger
            </button>
          </div>

          {/* Security & Authentication Settings Card */}
          <div className="flowly-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #F0EEF4' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#201530', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={18} color="#5C187B" /> Security & MPIN
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: isMpinSet ? '#E4F4DC' : '#FBEFD9',
                  color: isMpinSet ? '#2E7A22' : '#9A6A0C',
                }}
              >
                {isMpinSet ? 'MPIN Configured ✓' : 'MPIN Not Set'}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: '#6E677B', margin: '0 0 16px' }}>
              A 4-digit Transaction MPIN is required to authorize money transfers, withdrawals, and high-value loan repayments.
            </p>

            <button
              onClick={() => setMpinModalOpen(true)}
              className={isMpinSet ? 'btn-outline-dark' : 'btn-primary'}
              style={{
                width: '100%',
                padding: '9px',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                ...(isMpinSet ? {} : { backgroundColor: '#5C187B' }),
              }}
            >
              <KeyRound size={14} /> {isMpinSet ? 'Change / Reset 4-Digit MPIN' : 'Set Up 4-Digit MPIN'}
            </button>
          </div>

          {/* Identity & KYC Verification Card */}
          <div className="flowly-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#201530', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="#5C187B" /> KYC Verification
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: isKycVerified ? '#E4F4DC' : '#FBEFD9',
                  color: isKycVerified ? '#2E7A22' : '#9A6A0C',
                  textTransform: 'capitalize',
                }}
              >
                {kycStatus.replace('_', ' ')}
              </span>
            </div>

            <p style={{ fontSize: '12px', color: '#6E677B', margin: '0 0 12px' }}>
              {isKycVerified
                ? 'Your government identity documents (Aadhaar & PAN) have been verified by Flowly compliance officers.'
                : 'Complete your KYC verification to lift deposit and withdrawal limits on your account.'}
            </p>

            {!isKycVerified && (
              <button
                onClick={() => navigate('/kyc')}
                className="btn-primary"
                style={{ width: '100%', padding: '8px', fontSize: '12px', backgroundColor: '#5C187B' }}
              >
                Go to KYC Portal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* MPIN Modal */}
      <MpinModal
        isOpen={mpinModalOpen}
        onClose={() => setMpinModalOpen(false)}
        onSuccess={() => {
          refreshProfile();
          showNotification('Transaction MPIN successfully updated!');
        }}
      />
    </div>
  );
};

export default ProfilePage;
