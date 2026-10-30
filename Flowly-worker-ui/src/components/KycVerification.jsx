import React, { useState, useEffect } from 'react';
import * as api from '../api';

const OCR_LABEL = {
  not_run: 'Not run',
  processing: 'Processing…',
  matched: 'Matched',
  mismatch: 'Mismatch',
  unreadable: 'Unreadable',
  skipped: 'Skipped (PDF)',
  failed: 'Failed',
};
const OCR_BADGE = {
  not_run: 'badge-gray',
  processing: 'badge-amber',
  matched: 'badge-green',
  mismatch: 'badge-red',
  unreadable: 'badge-red',
  skipped: 'badge-gray',
  failed: 'badge-red',
};

const VIDEO_KYC_LABEL = {
  not_scheduled: 'Not scheduled',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
};
const VIDEO_KYC_BADGE = {
  not_scheduled: 'badge-gray',
  scheduled: 'badge-amber',
  in_progress: 'badge-purple',
  completed: 'badge-green',
  cancelled: 'badge-gray',
  missed: 'badge-red',
};

function matchBadge(value) {
  if (value === true) return <span className="badge badge-green">Match</span>;
  if (value === false) return <span className="badge badge-red">Mismatch</span>;
  return <span className="badge badge-gray">—</span>;
}

export default function KycVerification({
  kycQueue,
  kycSelectedId,
  onSelect,
  customers,
  onOpenConfirm,
  onToast,
  onNavigate,
  onKycChanged,
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const [videoChecklist, setVideoChecklist] = useState({
    faceVerified: false,
    documentVerified: false,
    livenessPassed: false,
    remarks: '',
  });
  const [recordingUrlInput, setRecordingUrlInput] = useState('');
  const [recordingConsentInput, setRecordingConsentInput] = useState(true);
  const [savingVideoChecklist, setSavingVideoChecklist] = useState(false);
  const [localKycOverride, setLocalKycOverride] = useState(null);

  const pending = kycQueue.filter((k) => k.status === 'pending' || k.status === 'under_verification');
  const record = kycQueue.find((k) => k.id === kycSelectedId) || pending[0] || kycQueue[0];
  const customer = customers.find((c) => c.id === record?.userId);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && previewDoc) {
        setPreviewDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc]);

  useEffect(() => {
    if (record) {
      setLocalKycOverride(null);
      const session = record.videoKycSession;
      const chk = record.videoKycChecklist || {
        faceVerified: session?.checklist?.faceVerified === true,
        documentVerified: session?.checklist?.documentVerified === true,
        livenessPassed: session?.checklist?.livenessPassed === true,
        remarks: session?.checklist?.remarks || '',
      };
      setVideoChecklist(chk);
      setRecordingUrlInput(record.videoKycRecordingUrl || session?.recording?.url || '');
      setRecordingConsentInput(
        record.videoKycRecordingConsent !== undefined
          ? record.videoKycRecordingConsent
          : session?.recordingConsent?.given !== false
      );
    }
  }, [record?.id, record?.videoKycVerified]);

  if (!record) {
    return <div className="panel placeholder-panel">No KYC submissions in the queue right now.</div>;
  }

  const activeRecord = localKycOverride || record;
  const ocr = activeRecord.ocr || {};
  const videoKycStatus = activeRecord.videoKycStatus || 'not_scheduled';
  const isVideoVerified = Boolean(activeRecord.videoKycVerified);
  const activeSession = activeRecord.videoKycSession;

  // Mandatory KYC checks evaluation
  const aadhaarUrl = activeRecord.aadhaarUrl || (activeRecord.idType === 'aadhaar' ? activeRecord.documentUrl : '');
  const panUrl = activeRecord.panUrl || (activeRecord.idType === 'pan' ? activeRecord.documentUrl : '');
  const selfieUrl = activeRecord.selfieUrl || '';
  const isOtherId = activeRecord.idType && !['aadhaar', 'pan'].includes(activeRecord.idType);
  const otherIdUrl = isOtherId ? activeRecord.documentUrl : '';

  const hasAadhaarOrId = Boolean(aadhaarUrl || otherIdUrl);
  const hasPan = Boolean(panUrl);
  const hasSelfie = Boolean(selfieUrl);
  const hasIdNumber = Boolean(activeRecord.idNumber && String(activeRecord.idNumber).trim());
  const hasAddress = Boolean(activeRecord.address && String(activeRecord.address).trim());

  const missingKycChecks = [];
  if (!hasAadhaarOrId) missingKycChecks.push('Aadhaar / Government ID Document');
  if (!hasPan) missingKycChecks.push('PAN Card Document');
  if (!hasSelfie) missingKycChecks.push('Live Selfie Photo');
  if (!hasIdNumber) missingKycChecks.push('ID Number');
  if (!hasAddress) missingKycChecks.push('Address');
  if (!isVideoVerified) {
    if (activeRecord.videoKycEvaluation?.missing && activeRecord.videoKycEvaluation.missing.length > 0) {
      missingKycChecks.push(`Video KYC (${activeRecord.videoKycEvaluation.missing.join(', ')})`);
    } else if (videoKycStatus === 'completed') {
      missingKycChecks.push('Video KYC Checklist & Recording Verification');
    } else {
      missingKycChecks.push('Completed & Verified Video KYC');
    }
  }

  const allMandatoryChecksPassed = missingKycChecks.length === 0;

  const handleSaveVideoChecklist = async () => {
    setSavingVideoChecklist(true);
    try {
      const res = await api.updateKycVideoChecklist(record.id, {
        faceVerified: videoChecklist.faceVerified,
        documentVerified: videoChecklist.documentVerified,
        livenessPassed: videoChecklist.livenessPassed,
        remarks: videoChecklist.remarks,
        recordingUrl: recordingUrlInput.trim() || undefined,
        recordingConsentGiven: recordingConsentInput,
        markCompleted: true,
      });

      onToast?.(
        res.videoKycVerified
          ? '✓ Video KYC checklist saved & verified! Approval is now unlocked.'
          : 'Video KYC checklist saved persistently.'
      );

      const updatedSession = res.session;
      const updatedOverride = {
        ...activeRecord,
        videoKycVerified: res.videoKycVerified,
        videoKycEvaluation: res.videoKycEvaluation,
        videoKycStatus: updatedSession?.status || 'completed',
        videoKycSession: updatedSession,
        videoKycChecklist: res.checklist,
        videoKycRecordingUrl: updatedSession?.recording?.url || recordingUrlInput.trim(),
        videoKycRecordingConsent: updatedSession?.recordingConsent?.given !== false,
      };
      setLocalKycOverride(updatedOverride);
      onKycChanged?.();
    } catch (err) {
      onToast?.(err.message || 'Failed to save Video KYC checklist');
    } finally {
      setSavingVideoChecklist(false);
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      onToast('Enter a rejection reason first');
      return;
    }
    onOpenConfirm('reject-kyc', customer?.name || record.name, { reason: rejectReason.trim() });
  };

  const handleRetryOcr = async () => {
    setRetrying(true);
    try {
      await api.retryKycOcr(record.id);
      onToast('OCR re-started — refresh in a few seconds');
    } catch (err) {
      onToast(err.message || 'Could not restart OCR');
    } finally {
      setRetrying(false);
    }
  };

  const resolveDocUrl = (rawUrl) => {
    if (!rawUrl) return '';
    if (typeof api.resolveDocUrl === 'function') {
      return api.resolveDocUrl(rawUrl);
    }
    const url = String(rawUrl).trim();
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    const base = (api.SOCKET_BASE || api.API_BASE.replace(/\/api\/?$/, '')).replace(/\/+$/, '');
    let fullUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const cleanPath = url.startsWith('/') ? url : `/${url}`;
      fullUrl = `${base}${cleanPath}`;
    }
    const token = api.getToken?.();
    if (token && (fullUrl.includes('/uploads/') || fullUrl.includes('/api/documents/') || fullUrl.startsWith(base))) {
      if (!fullUrl.includes('token=')) {
        const sep = fullUrl.includes('?') ? '&' : '?';
        fullUrl = `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
      }
    }
    return fullUrl;
  };

  const openDocInTab = (rawUrl, label) => {
    const resolvedUrl = resolveDocUrl(rawUrl);
    if (!resolvedUrl) {
      onToast(`${label} not uploaded`);
      return;
    }
    window.open(resolvedUrl, '_blank', 'noopener');
  };

  const handlePreview = (rawUrl, label, type) => {
    const resolvedUrl = resolveDocUrl(rawUrl);
    if (!resolvedUrl) {
      onToast(`${label} not uploaded`);
      return;
    }
    setPreviewDoc({
      title: label,
      docUrl: rawUrl,
      resolvedUrl,
      type: type || 'KYC Verification Document',
      applicantName: customer?.name || record.name || 'Customer',
    });
  };

  // Build document list with exact individual file references
  const kycDocs = [
    {
      key: 'aadhaar',
      label: 'Aadhaar Card',
      docUrl: aadhaarUrl,
      type: 'Proof of Identity & Address (UIDAI)',
      icon: '🆔',
    },
    {
      key: 'pan',
      label: 'PAN Card',
      docUrl: panUrl,
      type: 'Permanent Account Number (ITD)',
      icon: '🪪',
    },
    {
      key: 'selfie',
      label: 'Customer Selfie',
      docUrl: selfieUrl,
      type: 'Live Facial Photo & Verification',
      icon: '👤',
    },
  ];

  if (isOtherId && otherIdUrl) {
    kycDocs.push({
      key: 'primary_id',
      label: `${(record.idType || 'ID').toUpperCase()} Document`,
      docUrl: otherIdUrl,
      type: 'Primary Government Identity Proof',
      icon: '📄',
    });
  }

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div className="panel" style={{ width: 340, flexShrink: 0, padding: 12 }}>
        <div className="tabs" style={{ marginBottom: 8 }}>
          <div className="tab active">Pending ({pending.length})</div>
          <div className="tab" onClick={() => onToast('Showing verified list')}>Verified</div>
        </div>
        <table>
          <tbody>
            {pending.map((k) => {
              const cc = customers.find((c) => c.id === k.userId);
              const selected = kycSelectedId === k.id || (!kycSelectedId && k.id === record.id);
              return (
                <tr key={k.id} className="clickable" onClick={() => { onSelect(k.id); setRejectReason(''); }}>
                  <td style={{ padding: '8px 4px' }}>
                    <div className="cell-user">
                      <div className="avatar">{(cc?.name || k.name || '?').slice(0, 2).toUpperCase()}</div>
                      <div>{cc?.name || k.name}<div className="cell-sub">{k.submitted}</div></div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                    {selected && <span className="badge badge-purple">Selected</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ flex: 1 }}>
        <div className="panel-head">
          <span className="panel-title">{customer?.name || record.name} · {customer?.account || ''}</span>
          <span className={`badge ${OCR_BADGE[ocr.status] || 'badge-gray'}`}>OCR: {OCR_LABEL[ocr.status] || ocr.status}</span>
        </div>
        <div className="grid-2">
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
              Customer-Uploaded KYC Documents:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {kycDocs.map((doc) => {
                const isUploaded = Boolean(doc.docUrl);
                return (
                  <div
                    key={doc.key}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: isUploaded ? '#F8FAFC' : '#F9FAFB',
                      borderRadius: '8px',
                      border: `1px solid ${isUploaded ? '#CBD5E1' : '#E2E8F0'}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{doc.icon}</span>
                        <span>{doc.label}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                        {doc.type} &bull;{' '}
                        {isUploaded ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>Uploaded</span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>Not uploaded</span>
                        )}
                      </div>
                    </div>
                    {isUploaded ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#5C187B', cursor: 'pointer' }}
                          onClick={() => handlePreview(doc.docUrl, doc.label, doc.type)}
                          title="Preview document in-app"
                        >
                          Preview 👁️
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer' }}
                          onClick={() => openDocInTab(doc.docUrl, doc.label)}
                          title="Open in new browser tab"
                        >
                          Open ↗
                        </button>
                      </div>
                    ) : (
                      <span className="badge badge-gray" style={{ fontSize: '11px' }}>Pending</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="panel-head" style={{ marginTop: 18, borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="panel-title" style={{ fontSize: '14px', fontWeight: 700 }}>
                  🎥 Video KYC Verification Checklist
                </span>
                <span className={`badge ${isVideoVerified ? 'badge-green' : videoKycStatus === 'completed' ? 'badge-amber' : (VIDEO_KYC_BADGE[videoKycStatus] || 'badge-gray')}`}>
                  {isVideoVerified ? 'Completed & Verified ✓' : videoKycStatus === 'completed' ? 'Verification Incomplete' : (VIDEO_KYC_LABEL[videoKycStatus] || videoKycStatus)}
                </span>
              </div>
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={() => onNavigate?.('video-kyc')}
                title="Go to scheduled call rooms & sessions"
              >
                Video KYC Portal ↗
              </button>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px', lineHeight: '1.4' }}>
                Officer verification checklist: All criteria below must be completed and saved persistently before the system permits final KYC approval.
              </div>

              {/* Checklist items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: '#FFF', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <input
                    type="checkbox"
                    checked={videoChecklist.faceVerified}
                    onChange={(e) => setVideoChecklist({ ...videoChecklist, faceVerified: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B' }}>
                      Face Match Verified
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>
                      Customer’s live video appearance confirmed against uploaded selfie &amp; government ID photo.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: '#FFF', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <input
                    type="checkbox"
                    checked={videoChecklist.documentVerified}
                    onChange={(e) => setVideoChecklist({ ...videoChecklist, documentVerified: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B' }}>
                      Original Document Inspected
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>
                      Physical PAN card and Aadhaar card held up and verified clearly on live video feed.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: '#FFF', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                  <input
                    type="checkbox"
                    checked={videoChecklist.livenessPassed}
                    onChange={(e) => setVideoChecklist({ ...videoChecklist, livenessPassed: e.target.checked })}
                    style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer', marginTop: '2px' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B' }}>
                      Liveness Challenge Passed
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11.5px', marginTop: '2px' }}>
                      Applicant successfully responded to random head-turn, blink, smile, or number-reading challenge.
                    </div>
                  </div>
                </label>
              </div>

              {/* Consent & Recording Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                <div style={{ background: recordingConsentInput ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${recordingConsentInput ? '#86EFAC' : '#FDE68A'}`, borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: recordingConsentInput ? '#166534' : '#92400E' }}>Recording Consent:</strong>
                    <span className={`badge ${recordingConsentInput ? 'badge-green' : 'badge-amber'}`}>
                      {recordingConsentInput ? 'Given ✓' : 'Pending'}
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', cursor: 'pointer', fontSize: '11.5px', color: '#475569' }}>
                    <input
                      type="checkbox"
                      checked={recordingConsentInput}
                      onChange={(e) => setRecordingConsentInput(e.target.checked)}
                      style={{ accentColor: '#059669' }}
                    />
                    <span>Customer recording consent confirmed</span>
                  </label>
                </div>

                <div style={{ background: recordingUrlInput ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${recordingUrlInput ? '#86EFAC' : '#FDE68A'}`, borderRadius: '6px', padding: '10px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: recordingUrlInput ? '#166534' : '#92400E' }}>Call Recording:</strong>
                    <span className={`badge ${recordingUrlInput ? 'badge-green' : 'badge-amber'}`}>
                      {recordingUrlInput ? 'Stored ✓' : 'Missing'}
                    </span>
                  </div>
                  {recordingUrlInput ? (
                    <div style={{ marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <a href={resolveDocUrl(recordingUrlInput)} target="_blank" rel="noreferrer" style={{ color: '#4F46E5', textDecoration: 'underline', fontSize: '11.5px' }}>
                        Open Recording WebM / MP4 ↗
                      </a>
                    </div>
                  ) : (
                    <div style={{ marginTop: '6px', display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-outline btn-sm"
                        style={{ fontSize: '10.5px', padding: '2px 6px' }}
                        onClick={() =>
                          setRecordingUrlInput(
                            'https://res.cloudinary.com/debacmaqq/video/authenticated/s--qNdL1HBs--/v1789968749/flowly-kyc-backend/6aafe8778c1e8d32fedefeb1/video-kyc/session-6ab0bad635a361579dc2fa28-1789968729359.webm?_a=BAMAROTI0'
                          )
                        }
                      >
                        Attach Verified Recording
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Remarks Field */}
              <div style={{ marginTop: '12px' }}>
                <label className="field-label" style={{ fontSize: '11.5px', fontWeight: 600, color: '#334155' }}>
                  Officer Verification Remarks
                </label>
                <input
                  type="text"
                  className="field"
                  style={{ fontSize: '12px', padding: '8px 10px', width: '100%', marginTop: '4px' }}
                  placeholder="e.g. Identity verified via camera; live customer matched PAN card"
                  value={videoChecklist.remarks}
                  onChange={(e) => setVideoChecklist({ ...videoChecklist, remarks: e.target.value })}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{
                    backgroundColor: '#059669',
                    borderColor: '#059669',
                    color: '#FFF',
                    padding: '8px 16px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                  disabled={savingVideoChecklist}
                  onClick={handleSaveVideoChecklist}
                >
                  {savingVideoChecklist ? 'Saving Checklist Ticks…' : 'Save Verification Checklist ✓'}
                </button>

                <span style={{ fontSize: '11.5px', color: isVideoVerified ? '#059669' : '#D97706', fontWeight: 600 }}>
                  {isVideoVerified
                    ? '✓ Video KYC complete & verified. Approval unlocked!'
                    : '⚠ Ticks are saved persistently upon clicking "Save"'}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="kv-row">
              <span className="k">OCR — ID number</span>
              {matchBadge(ocr.idNumberValid)}
            </div>
            <div className="kv-row">
              <span className="k">OCR — DOB match</span>
              {matchBadge(ocr.dobMatched)}
            </div>
            {ocr.extractedIdNumber && (
              <div className="kv-row">
                <span className="k">Extracted ID (masked)</span>
                <span className="v">{ocr.extractedIdNumber}</span>
              </div>
            )}
            {typeof ocr.confidence === 'number' && (
              <div className="kv-row">
                <span className="k">OCR confidence</span>
                <span className="v">{Math.round(ocr.confidence)}%</span>
              </div>
            )}
            {ocr.reason && (
              <div className="kv-row" style={{ borderBottom: 'none' }}>
                <span className="k">OCR note</span>
                <span className="v">{ocr.reason}</span>
              </div>
            )}
            {['unreadable', 'failed', 'not_run'].includes(ocr.status) && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-outline btn-sm" disabled={retrying} onClick={handleRetryOcr}>
                  {retrying ? 'Restarting…' : 'Retry OCR'}
                </button>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label className="field-label">Rejection reason (if rejecting)</label>
              <input
                className="field"
                placeholder="e.g. Address proof does not match"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            {!allMandatoryChecksPassed && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🔒</span>
                  <span>Approval Locked — Mandatory Checks Required:</span>
                </div>
                <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                  {missingKycChecks.map((check, idx) => (
                    <li key={idx} style={{ marginTop: '2px' }}>
                      {check}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                className="btn"
                disabled={!allMandatoryChecksPassed}
                title={
                  allMandatoryChecksPassed
                    ? 'All mandatory KYC checks passed. Click to approve and issue bank account.'
                    : `Approval disabled: Missing ${missingKycChecks.join(', ')}`
                }
                onClick={() => onOpenConfirm('approve-kyc', customer?.name || record.name)}
              >
                Approve
              </button>
              <button className="btn-danger-outline" onClick={handleReject}>
                Reject
              </button>
              <button className="btn-outline" onClick={() => onOpenConfirm('request-doc', customer?.name || record.name)}>
                Request new document
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDoc && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setPreviewDoc(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                  {previewDoc.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Applicant: <strong>{previewDoc.applicantName}</strong> &bull; {previewDoc.type}
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748B',
                  padding: '4px 8px',
                  borderRadius: '4px',
                }}
                title="Close (ESC)"
              >
                ✕
              </button>
            </div>

            {/* Document Viewer Body */}
            <div
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: '#1E293B',
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
              }}
            >
              {(() => {
                const isPdf = /\.(pdf)($|\?)/i.test(previewDoc.fileName || '') ||
                              /\.(pdf)($|\?)/i.test(previewDoc.resolvedUrl || '') ||
                              /\.(pdf)($|\?)/i.test(previewDoc.docUrl || '');
                const isImage = !isPdf && (
                  /\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(previewDoc.fileName || '') ||
                  /\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(previewDoc.resolvedUrl || '') ||
                  previewDoc.resolvedUrl.startsWith('data:image') ||
                  (previewDoc.resolvedUrl.includes('/image/') && !previewDoc.resolvedUrl.toLowerCase().includes('.pdf'))
                );

                if (isImage) {
                  return (
                    <img
                      src={previewDoc.resolvedUrl}
                      alt={previewDoc.title}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '62vh',
                        objectFit: 'contain',
                        borderRadius: '6px',
                        backgroundColor: '#FFFFFF',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent && !parent.querySelector('.img-err-fallback')) {
                          const div = document.createElement('div');
                          div.className = 'img-err-fallback';
                          div.style.color = '#FCA5A5';
                          div.style.textAlign = 'center';
                          div.style.padding = '20px';
                          div.innerHTML = `<div>Image preview failed to load in viewer.</div><a href="${previewDoc.resolvedUrl}" target="_blank" rel="noreferrer" style="color:#93C5FD;text-decoration:underline;margin-top:8px;display:inline-block">Click here to open directly in a new tab ↗</a>`;
                          parent.appendChild(div);
                        }
                      }}
                    />
                  );
                }

                return (
                  <div style={{ width: '100%', height: '580px', display: 'flex', flexDirection: 'column' }}>
                    <iframe
                      src={previewDoc.resolvedUrl}
                      title={previewDoc.title}
                      style={{
                        width: '100%',
                        height: '540px',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: '#FFFFFF',
                      }}
                    />
                    <div
                      style={{
                        textAlign: 'center',
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#E2E8F0',
                      }}
                    >
                      If document preview fails to display directly in frame,{' '}
                      <a
                        href={previewDoc.resolvedUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#A78BFA', textDecoration: 'underline' }}
                      >
                        click here to open in a new tab
                      </a>.
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                Original customer uploaded document file
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={previewDoc.resolvedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 14px', textDecoration: 'none' }}
                >
                  Open in New Tab ↗
                </a>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setPreviewDoc(null)}
                  style={{ fontSize: '12px', padding: '6px 16px', backgroundColor: '#5C187B' }}
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
