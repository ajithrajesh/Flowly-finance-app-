import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { kycAPI, getErrorMessage } from '../services/api';
import VideoKycCall from './VideoKycCall';
import { 
  FileCheck, 
  UploadCloud, 
  CheckCircle2, 
  AlertOctagon, 
  Clock, 
  ShieldCheck, 
  User, 
  MapPin, 
  Calendar, 
  CreditCard,
  FileText,
  AlertTriangle,
  Video,
  Camera,
  RefreshCw,
  Check,
  X,
  Eye,
  Trash2
} from 'lucide-react';

const VIDEO_KYC_LABEL = {
  scheduled: 'Video KYC Scheduled',
  in_progress: 'Video KYC In Progress',
  completed: 'Video KYC Completed',
  cancelled: 'Video KYC Cancelled',
  missed: 'Video KYC Missed',
};

const VIDEO_KYC_BADGE = {
  scheduled: 'badge-amber',
  in_progress: 'badge-purple',
  completed: 'badge-green',
  cancelled: 'badge-red',
  missed: 'badge-red',
};

const KYCPortal = () => {
  const { user, refreshProfile } = useAuth();
  const [kycStatus, setKycStatus] = useState('pending');
  const [kycDetails, setKycDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [address, setAddress] = useState('');

  // Document Files
  const [aadhaarFile, setAadhaarFile] = useState(null);
  const [panFile, setPanFile] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);

  // Live Camera state for Selfie
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeCallSessionId, setActiveCallSessionId] = useState(null);

  const fetchKYCStatus = async () => {
    setLoading(true);
    try {
      const res = await kycAPI.getStatus();
      const status = res.data.kycStatus || user?.kycStatus || 'pending';
      setKycStatus(status);
      const details = res.data.kycDetails || null;
      setKycDetails(details);

      if (details) {
        setAadhaarNumber(details.idNumber || '');
        setPanNumber(details.extractedData?.panNumber || '');
        setDob(details.dob || '');
        setGender(details.gender || 'Male');
        setAddress(details.address || '');
      }
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
      setError(getErrorMessage(err, 'Failed to fetch KYC status. Please check your connection.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKYCStatus();
  }, []);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError('Unable to access camera. Please allow camera permissions or upload a selfie image.');
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureCameraSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const capturedFile = new File([blob], `selfie_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelfieFile(capturedFile);
        const previewUrl = URL.createObjectURL(blob);
        setSelfiePreview(previewUrl);
        stopCamera();
      }
    }, 'image/jpeg', 0.9);
  };

  const handleSelfieFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setSelfieFile(selected);
      setSelfiePreview(URL.createObjectURL(selected));
    }
  };

  const clearSelfie = () => {
    setSelfieFile(null);
    if (selfiePreview) {
      URL.revokeObjectURL(selfiePreview);
      setSelfiePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!address || !aadhaarNumber) {
      setError('Please provide full address and Aadhaar Card number.');
      return;
    }

    if (!aadhaarFile && !kycDetails?.aadhaarUrl && !kycDetails?.documentUrl) {
      setError('Please upload your Aadhaar Card document.');
      return;
    }

    if (!panFile && !kycDetails?.panUrl) {
      setError('Please upload your PAN Card document.');
      return;
    }

    if (!selfieFile && !kycDetails?.selfieUrl) {
      setError('Please upload or capture a clear Selfie photo.');
      return;
    }

    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const payload = new FormData();
      payload.append('idType', 'aadhaar');
      payload.append('idNumber', aadhaarNumber.replace(/\s+/g, ''));
      if (panNumber) payload.append('panNumber', panNumber.toUpperCase());
      payload.append('dob', dob);
      payload.append('gender', gender);
      payload.append('address', address);

      if (aadhaarFile) {
        payload.append('aadhaar', aadhaarFile);
        payload.append('document', aadhaarFile); // fallback legacy
      }
      if (panFile) {
        payload.append('pan', panFile);
      }
      if (selfieFile) {
        payload.append('selfie', selfieFile);
      }

      const res = await kycAPI.submitKYC(payload);
      if (res.data?.success !== false) {
        setMessage(res.data?.message || 'KYC submitted successfully!');
        setKycStatus('under_verification');
        await refreshProfile();
        await fetchKYCStatus();
      } else {
        setError(res.data?.message || 'KYC submission failed. Please verify your submitted documents.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'KYC submission failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: '#6E677B' }}>
        Loading KYC Verification status...
      </div>
    );
  }

  if (activeCallSessionId) {
    return (
      <div style={{ maxWidth: '840px', margin: '0 auto', paddingBottom: '40px' }}>
        <VideoKycCall
          sessionId={activeCallSessionId}
          onExit={() => {
            setActiveCallSessionId(null);
            fetchKYCStatus();
          }}
        />
      </div>
    );
  }

  const videoKyc = kycDetails?.videoKycSession;

  return (
    <div style={{ maxWidth: '840px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#EEE7F4', color: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileCheck size={20} />
          </div>
          <h1 style={{ fontSize: '26px', color: '#201530', margin: 0 }}>KYC Verification Portal</h1>
        </div>
        <p style={{ color: '#6E677B', fontSize: '14px' }}>
          Upload your Aadhaar Card, PAN Card, and a clear Selfie photo to activate your Flowly bank account and loan eligibility.
        </p>
      </div>

      {/* ---------------- STATUS SUMMARY CARD ---------------- */}
      <div className="flowly-card" style={{ marginBottom: '32px', backgroundColor: kycStatus === 'verified' ? '#FAFDF8' : kycStatus === 'rejected' ? '#FFFDFD' : '#FAF9F5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {kycStatus === 'verified' && <CheckCircle2 size={36} color="#2E7A22" />}
            {kycStatus === 'under_verification' && <Clock size={36} color="#5C187B" />}
            {kycStatus === 'rejected' && <AlertOctagon size={36} color="#B23A2E" />}
            {kycStatus === 'pending' && <FileText size={36} color="#9A6A0C" />}

            <div>
              <div style={{ fontSize: '12px', color: '#6E677B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                Verification Status
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#201530', textTransform: 'capitalize', fontFamily: 'Outfit' }}>
                {kycStatus.replace('_', ' ')}
              </div>
            </div>
          </div>

          <span className={`badge ${kycStatus === 'verified' ? 'badge-green' : kycStatus === 'rejected' ? 'badge-red' : kycStatus === 'under_verification' ? 'badge-purple' : 'badge-amber'}`} style={{ fontSize: '13px', padding: '6px 16px' }}>
            {kycStatus === 'verified' && 'Verified ✓ Account Active'}
            {kycStatus === 'under_verification' && 'Under Review'}
            {kycStatus === 'rejected' && 'Action Required'}
            {kycStatus === 'pending' && 'Not Verified'}
          </span>
        </div>

        {kycStatus === 'rejected' && kycDetails?.rejectionReason && (
          <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '13px', fontWeight: 600 }}>
            Rejection Reason: {kycDetails.rejectionReason}
          </div>
        )}

        {/* Display Uploaded Document Badges if available */}
        {kycDetails && (kycDetails.aadhaarUrl || kycDetails.panUrl || kycDetails.selfieUrl || kycDetails.documentUrl) && (
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #EAE7EE', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#201530', width: '100%', marginBottom: '4px' }}>
              Submitted Verification Files:
            </div>
            
            {(kycDetails.aadhaarUrl || kycDetails.documentUrl) && (
              <a
                href={kycDetails.aadhaarUrl || kycDetails.documentUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#EEE7F4',
                  color: '#5C187B',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <CheckCircle2 size={15} color="#2E7A22" /> Aadhaar Card <Eye size={14} />
              </a>
            )}

            {kycDetails.panUrl && (
              <a
                href={kycDetails.panUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#EEE7F4',
                  color: '#5C187B',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <CheckCircle2 size={15} color="#2E7A22" /> PAN Card <Eye size={14} />
              </a>
            )}

            {kycDetails.selfieUrl && (
              <a
                href={kycDetails.selfieUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#EEE7F4',
                  color: '#5C187B',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <CheckCircle2 size={15} color="#2E7A22" /> Selfie Photo <Eye size={14} />
              </a>
            )}
          </div>
        )}
      </div>

      {/* ---------------- VIDEO KYC CARD ---------------- */}
      {videoKyc && (
        <div className="flowly-card" style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <Video size={30} color="#5C187B" />
              <div>
                <div style={{ fontSize: '12px', color: '#6E677B', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  {VIDEO_KYC_LABEL[videoKyc.status] || 'Video KYC'}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#201530' }}>
                  {videoKyc.scheduledAt
                    ? new Date(videoKyc.scheduledAt).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'Not scheduled yet'}
                  {videoKyc.durationMinutes ? ` · ${videoKyc.durationMinutes} min` : ''}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className={`badge ${VIDEO_KYC_BADGE[videoKyc.status] || 'badge-amber'}`}>
                {VIDEO_KYC_LABEL[videoKyc.status] || videoKyc.status}
              </span>
              {['scheduled', 'in_progress'].includes(videoKyc.status) && (
                <button className="btn-primary" onClick={() => setActiveCallSessionId(videoKyc._id || videoKyc.id)}>
                  Join call
                </button>
              )}
            </div>
          </div>
          {videoKyc.status === 'scheduled' && (
            <p style={{ marginTop: '12px', marginBottom: 0, fontSize: '13px', color: '#6E677B' }}>
              A verification officer will video call you at the scheduled time to confirm your identity. You can join up to 10 minutes early.
            </p>
          )}
        </div>
      )}

      {/* Global Message Alert */}
      {message && (
        <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#E4F4DC', color: '#2E7A22', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          ✓ {message}
        </div>
      )}
      {error && (
        <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          ⚠ {error}
        </div>
      )}

      {/* ---------------- KYC SUBMISSION FORM ---------------- */}
      {kycStatus !== 'verified' ? (
        <div className="flowly-card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px', color: '#201530' }}>
            {kycStatus === 'rejected' ? 'Re-Submit Identification Documents' : 'KYC Identification & Document Submission'}
          </h3>

          <form onSubmit={handleSubmit}>
            {/* Identity Details */}
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Aadhaar Card Number *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1234 5678 9012"
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value)}
                  maxLength={14}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">PAN Card Number *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ABCDE1234F"
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                  maxLength={10}
                  required
                />
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Date of Birth *</label>
                <input
                  type="date"
                  className="form-input"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Full Residential Address *</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="House/Flat No., Street, Landmark, City, State, Pincode"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
            </div>

            <div style={{ marginTop: '24px', marginBottom: '16px' }}>
              <h4 style={{ fontSize: '16px', color: '#201530', margin: '0 0 4px 0' }}>Required Uploads</h4>
              <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
                Please attach clear copies of your Aadhaar Card, PAN Card, and a Selfie photo.
              </p>
            </div>

            {/* 3 DOCUMENT UPLOAD CARDS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
              
              {/* CARD 1: AADHAAR CARD UPLOAD */}
              <div style={{ border: '1px solid #EAE7EE', borderRadius: '12px', padding: '20px', backgroundColor: '#FAF9F5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CreditCard size={20} color="#5C187B" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#201530' }}>1. Aadhaar Card Document *</div>
                      <div style={{ fontSize: '12px', color: '#6E677B' }}>Front & back copy or e-Aadhaar PDF (Up to 8MB)</div>
                    </div>
                  </div>
                  {aadhaarFile ? (
                    <span className="badge badge-green" style={{ fontSize: '12px' }}>File Attached ✓</span>
                  ) : kycDetails?.aadhaarUrl ? (
                    <span className="badge badge-purple" style={{ fontSize: '12px' }}>Previously Uploaded</span>
                  ) : (
                    <span className="badge badge-amber" style={{ fontSize: '12px' }}>Required</span>
                  )}
                </div>

                <div style={{
                  border: '2px dashed #C4BFCF',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  backgroundColor: '#FFFFFF',
                  position: 'relative',
                  cursor: 'pointer'
                }}>
                  <UploadCloud size={28} color="#8B5CF6" style={{ marginBottom: '6px' }} />
                  <p style={{ fontWeight: 600, fontSize: '13px', color: '#201530', margin: '0 0 2px 0' }}>
                    {aadhaarFile ? aadhaarFile.name : 'Click to select Aadhaar Card (Image / PDF)'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#6E677B', margin: 0 }}>
                    Supports PNG, JPG, JPEG, PDF
                  </p>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setAadhaarFile(e.target.files[0])}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>

              {/* CARD 2: PAN CARD UPLOAD */}
              <div style={{ border: '1px solid #EAE7EE', borderRadius: '12px', padding: '20px', backgroundColor: '#FAF9F5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={20} color="#5C187B" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#201530' }}>2. PAN Card Document *</div>
                      <div style={{ fontSize: '12px', color: '#6E677B' }}>Clear copy of physical PAN card or e-PAN (Up to 8MB)</div>
                    </div>
                  </div>
                  {panFile ? (
                    <span className="badge badge-green" style={{ fontSize: '12px' }}>File Attached ✓</span>
                  ) : kycDetails?.panUrl ? (
                    <span className="badge badge-purple" style={{ fontSize: '12px' }}>Previously Uploaded</span>
                  ) : (
                    <span className="badge badge-amber" style={{ fontSize: '12px' }}>Required</span>
                  )}
                </div>

                <div style={{
                  border: '2px dashed #C4BFCF',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  backgroundColor: '#FFFFFF',
                  position: 'relative',
                  cursor: 'pointer'
                }}>
                  <UploadCloud size={28} color="#8B5CF6" style={{ marginBottom: '6px' }} />
                  <p style={{ fontWeight: 600, fontSize: '13px', color: '#201530', margin: '0 0 2px 0' }}>
                    {panFile ? panFile.name : 'Click to select PAN Card (Image / PDF)'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#6E677B', margin: 0 }}>
                    Supports PNG, JPG, JPEG, PDF
                  </p>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setPanFile(e.target.files[0])}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                </div>
              </div>

              {/* CARD 3: SELFIE PHOTO UPLOAD / WEBCAM CAPTURE */}
              <div style={{ border: '1px solid #EAE7EE', borderRadius: '12px', padding: '20px', backgroundColor: '#FAF9F5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={20} color="#5C187B" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#201530' }}>3. Customer Selfie Photo *</div>
                      <div style={{ fontSize: '12px', color: '#6E677B' }}>Clear front-facing photo of your face</div>
                    </div>
                  </div>
                  {selfieFile ? (
                    <span className="badge badge-green" style={{ fontSize: '12px' }}>Photo Ready ✓</span>
                  ) : kycDetails?.selfieUrl ? (
                    <span className="badge badge-purple" style={{ fontSize: '12px' }}>Previously Uploaded</span>
                  ) : (
                    <span className="badge badge-amber" style={{ fontSize: '12px' }}>Required</span>
                  )}
                </div>

                {/* Selfie Preview or Camera Stream or Upload Picker */}
                {selfiePreview ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: '#FFFFFF', padding: '14px', borderRadius: '10px', border: '1px solid #E2DDF0' }}>
                    <img
                      src={selfiePreview}
                      alt="Selfie Preview"
                      style={{ width: '80px', height: '80px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #5C187B' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#201530' }}>Selfie Photo Captured</div>
                      <div style={{ fontSize: '12px', color: '#2E7A22', fontWeight: 600 }}>Ready for verification</div>
                    </div>
                    <button type="button" className="btn-secondary" onClick={clearSelfie} style={{ padding: '6px 12px', fontSize: '12px' }}>
                      <Trash2 size={14} style={{ marginRight: '4px' }} /> Change Photo
                    </button>
                  </div>
                ) : cameraActive ? (
                  <div style={{ backgroundColor: '#1A1423', padding: '16px', borderRadius: '10px', textAlign: 'center' }}>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      style={{ width: '100%', maxHeight: '280px', borderRadius: '8px', transform: 'scaleX(-1)', backgroundColor: '#000000' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
                      <button type="button" className="btn-primary" onClick={captureCameraSnapshot} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Camera size={16} /> Take Photo
                      </button>
                      <button type="button" className="btn-secondary" onClick={stopCamera} style={{ backgroundColor: '#FFFFFF', color: '#201530' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {cameraError && (
                      <div style={{ fontSize: '12px', color: '#B23A2E', marginBottom: '8px', fontWeight: 600 }}>
                        {cameraError}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <button
                        type="button"
                        onClick={startCamera}
                        style={{
                          border: '2px dashed #8B5CF6',
                          borderRadius: '10px',
                          padding: '16px',
                          textAlign: 'center',
                          backgroundColor: '#F7F3FC',
                          color: '#5C187B',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Camera size={26} color="#5C187B" />
                        Take Live Selfie via Camera
                      </button>

                      <div style={{
                        border: '2px dashed #C4BFCF',
                        borderRadius: '10px',
                        padding: '16px',
                        textAlign: 'center',
                        backgroundColor: '#FFFFFF',
                        position: 'relative',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <UploadCloud size={26} color="#8B5CF6" />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#201530' }}>
                          Upload Selfie Image File
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleSelfieFileChange}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            opacity: 0,
                            cursor: 'pointer'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', fontSize: '16px', fontWeight: 700 }} disabled={submitting}>
              {submitting ? 'Submitting Documents to Verification Queue...' : 'Submit KYC for Verification'}
            </button>
          </form>
        </div>
      ) : (
        <div className="flowly-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <ShieldCheck size={54} color="#2E7A22" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '24px', color: '#201530', marginBottom: '8px' }}>Identity Fully Verified!</h2>
          <p style={{ color: '#6E677B', fontSize: '15px', maxWidth: '480px', margin: '0 auto 24px' }}>
            Your bank account is active. You can now apply for loans up to ₹20,00,000 and open Fixed Deposits instantly.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <a href="/deposits" className="btn-primary">Manage Savings & FDs</a>
            <a href="/loans" className="btn-secondary">Apply for Loans</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default KYCPortal;
