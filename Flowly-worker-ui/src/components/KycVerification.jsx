import React, { useState } from 'react';
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
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [retrying, setRetrying] = useState(false);

  const pending = kycQueue.filter((k) => k.status === 'pending' || k.status === 'under_verification');
  const record = kycQueue.find((k) => k.id === kycSelectedId) || pending[0] || kycQueue[0];
  const customer = customers.find((c) => c.id === record?.userId);

  if (!record) {
    return <div className="panel placeholder-panel">No KYC submissions in the queue right now.</div>;
  }

  const ocr = record.ocr || {};
  const videoKycStatus = record.videoKycStatus || 'not_scheduled';
  const videoKycReady = videoKycStatus === 'completed';

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

  const openDoc = (url, label) => {
    if (!url) {
      onToast(`${label} not uploaded`);
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

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
            <div className="doc-thumb" onClick={() => openDoc(record.aadhaarUrl, 'Aadhaar')}>Aadhaar</div>
            <div className="doc-thumb" onClick={() => openDoc(record.documentUrl || record.panUrl, 'PAN card')}>PAN card</div>
            <div className="doc-thumb" onClick={() => openDoc(record.selfieUrl, 'Selfie')}>Selfie</div>

            <div className="panel-head" style={{ marginTop: 14 }}>
              <span className="panel-title">Video KYC</span>
              <span className={`badge ${VIDEO_KYC_BADGE[videoKycStatus] || 'badge-gray'}`}>
                {VIDEO_KYC_LABEL[videoKycStatus] || videoKycStatus}
              </span>
            </div>
            <div className="cell-sub" style={{ padding: '0 4px 4px' }}>
              {videoKycReady
                ? 'Completed — this application can be approved.'
                : 'A completed video KYC (face + document + liveness + recording) is required before approval.'}
            </div>
            <button className="btn-outline btn-sm" onClick={() => onNavigate?.('video-kyc')}>
              Go to Video KYC
            </button>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                className="btn"
                disabled={!videoKycReady}
                title={videoKycReady ? '' : 'Video KYC must be completed first'}
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
    </div>
  );
}
