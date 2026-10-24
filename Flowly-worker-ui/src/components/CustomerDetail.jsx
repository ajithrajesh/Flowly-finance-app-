import { useState, useEffect } from 'react';
import * as api from '../api';

const TABS = ['profile', 'kyc', 'transactions', 'loans', 'fd'];
const TAB_LABELS = {
  profile: 'Profile',
  kyc: 'KYC status',
  transactions: 'Transactions',
  loans: 'Loans',
  fd: 'Fixed deposits',
};

function kycBadge(kyc) {
  if (kyc === 'Verified') return <span className="badge badge-green">Verified</span>;
  if (kyc === 'Rejected') return <span className="badge badge-red">Rejected</span>;
  return <span className="badge badge-amber">{kyc}</span>;
}

function statusBadge(status) {
  if (status === 'blocked') return <span className="badge badge-red">Blocked</span>;
  if (status === 'suspended') return <span className="badge badge-red">Suspended</span>;
  if (status === 'inactive') return <span className="badge badge-amber">Inactive</span>;
  if (status === 'no_account') return <span className="badge badge-gray">No account</span>;
  return <span className="badge badge-green">Active</span>;
}

export default function CustomerDetail({ customer, onBackToCustomers, onGoToKyc, onToast, onCustomerUpdated }) {
  const [tab, setTab] = useState('profile');
  const [c, setC] = useState(customer);
  const [reenabling, setReenabling] = useState(false);

  useEffect(() => {
    setC(customer);
  }, [customer]);

  const isSuspended = c.status === 'suspended' || c.userStatus === 'suspended';

  const handleReenableTransactions = async () => {
    if (!c.id) return;
    const confirmAction = window.confirm(
      `Re-enable transactions and restore active account status for ${c.name}? This will lift the "Account temporarily suspended." lock.`
    );
    if (!confirmAction) return;

    setReenabling(true);
    try {
      await api.reenableCustomerTransactions(c.id, {
        resolutionNotes: 'Worker verified and re-enabled customer transactions and account.',
      });
      const refreshed = await api.fetchCustomerById(c.id);
      if (refreshed) {
        setC(refreshed);
        onCustomerUpdated && onCustomerUpdated(refreshed);
        onToast && onToast('Customer account reactivated and transactions re-enabled.');
      } else {
        onToast && onToast('Account reactivated, but unable to refresh customer details.');
      }
    } catch (err) {
      onToast && onToast(err.message || 'Failed to re-enable transactions.');
    } finally {
      setReenabling(false);
    }
  };

  return (
    <>
      <button className="btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={onBackToCustomers}>
        ← Back to customers
      </button>

      {isSuspended && (
        <div
          className="panel"
          style={{
            background: '#fff5f5',
            borderColor: '#feb2b2',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: '#c53030', fontSize: 14 }}>
              Account Temporarily Suspended
            </div>
            <div style={{ fontSize: 12, color: '#742a2a', marginTop: 4 }}>
              Transactions are currently locked with "Account temporarily suspended." Only an authorized bank worker can re-enable transactions.
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ background: '#2f855a', borderColor: '#276749' }}
            onClick={handleReenableTransactions}
            disabled={reenabling}
          >
            {reenabling ? 'Re-enabling...' : '✓ Re-enable Transactions & Account'}
          </button>
        </div>
      )}

      <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>{c.avatar}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: '#8b8880' }}>
              {c.account} {c.since ? `· Customer since ${c.since}` : ''} {c.branch && c.branch !== '—' ? `· ${c.branch} branch` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Stat label="Balance" value={c.balance} />
          <div><div className="cell-sub">KYC status</div>{kycBadge(c.kyc)}</div>
          <div><div className="cell-sub">Account status</div>{statusBadge(c.status)}</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </div>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Personal details</span></div>
          <KV k="Full name" v={c.name} />
          <KV k="Phone" v={c.phone} />
          <KV k="Email" v={c.email} />
          <KV k="Address" v={c.address || '—'} />
          <KV k="Account number" v={c.account} />
          <KV k="Account type" v={c.accountType || '—'} />
          <KV k="IFSC code" v={c.ifscCode || '—'} last />
        </div>
      )}

      {tab === 'kyc' && (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">KYC status</span>
            {kycBadge(c.kyc)}
          </div>
          <KV k="Current status" v={c.kyc} />
          {(c.kyc === 'Pending' || c.kyc === 'Under review') && (
            <div style={{ marginTop: 14 }}>
              <button className="btn-outline btn-sm" onClick={onGoToKyc}>
                Go to KYC review queue
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="panel placeholder-panel">
          Per-customer transaction history isn't exposed by the current API yet.
        </div>
      )}

      {tab === 'loans' && (
        <div className="panel placeholder-panel">
          Per-customer loan details aren't exposed by the current API yet — check the Loan processing screen for the full applications list.
        </div>
      )}

      {tab === 'fd' && (
        <div className="panel placeholder-panel">
          Per-customer fixed deposit details aren't exposed by the current API yet.
        </div>
      )}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="cell-sub">{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function KV({ k, v, last }) {
  return (
    <div className="kv-row" style={last ? { borderBottom: 'none' } : undefined}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}