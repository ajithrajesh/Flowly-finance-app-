import React, { useState } from 'react';

const CONFIRM_CONFIG = {
  'approve-kyc': (name) => ({
    icon: '✓', color: '#3E7A22', bg: '#E4F1DC',
    title: `Approve ${name}'s KYC?`,
    sub: 'The customer will be notified and can start using loan/FD features immediately.',
    confirmLabel: 'Approve',
  }),
  'reject-kyc': (name) => ({
    icon: '✕', color: '#B23A2E', bg: '#FADADA',
    title: `Reject ${name}'s KYC?`,
    sub: 'A rejection reason is required and will be sent to the customer.',
    confirmLabel: 'Reject',
  }),
  'request-doc': (name) => ({
    icon: '↻', color: '#5C187B', bg: '#EEE7F4',
    title: `Request a new document from ${name}?`,
    sub: 'The customer will get a notification asking them to re-upload.',
    confirmLabel: 'Send request',
  }),
};

export default function Modal({ modal, submitting, onClose, onConfirm, onCreateCustomer }) {
  if (!modal) {
    return null;
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  let body = null;

  if (modal.type === 'confirm') {
    const cfg = CONFIRM_CONFIG[modal.kind](modal.name);
    body = (
      <>
        <div className="modal-icon" style={{ background: cfg.bg, color: cfg.color }}>{cfg.icon}</div>
        <div className="modal-title">{cfg.title}</div>
        <div className="modal-sub">{cfg.sub}</div>
        {modal.kind === 'reject-kyc' && modal.extra?.reason && (
          <div className="kv-row" style={{ borderBottom: 'none' }}>
            <span className="k">Reason on file</span>
            <span className="v">{modal.extra.reason}</span>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-outline btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className="btn btn-sm"
            disabled={submitting}
            onClick={() => onConfirm(modal.kind, modal.name, modal.extra)}
          >
            {submitting ? 'Working…' : cfg.confirmLabel}
          </button>
        </div>
      </>
    );
  } else if (modal.type === 'add-customer') {
    body = <AddCustomerForm submitting={submitting} onClose={onClose} onCreateCustomer={onCreateCustomer} />;
  }

  return (
    <div className="modal-overlay open" onClick={handleOverlayClick}>
      <div className="modal-box">{body}</div>
    </div>
  );
}

function AddCustomerForm({ submitting, onClose, onCreateCustomer }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('Kochi');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone number are required.');
      return;
    }
    setError('');
    onCreateCustomer({ name: name.trim(), phone: phone.trim(), branch });
  };

  return (
    <>
      <div className="modal-title">Add customer</div>
      <div className="modal-sub">Create a new customer profile. KYC can be completed later.</div>

      {error && <div className="field-error">{error}</div>}

      <div className="field-group">
        <label className="field-label">Full name</label>
        <input
          className="field"
          placeholder="e.g. Vishnu Pillai"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field-group">
        <label className="field-label">Phone number</label>
        <input
          className="field"
          placeholder="+91 90000 00000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="field-group">
        <label className="field-label">Branch</label>
        <select className="field" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option>Kochi</option>
          <option>Trivandrum</option>
          <option>Kozhikode</option>
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn-outline btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
        <button className="btn btn-sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create customer'}
        </button>
      </div>
    </>
  );
}