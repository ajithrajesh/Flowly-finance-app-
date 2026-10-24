import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { walletAPI, getErrorMessage } from '../services/api';
import StripeCardModal from '../components/StripeCardModal';
import {
  PlusCircle,
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Receipt,
  ArrowDownLeft,
  Copy,
  RefreshCw,
} from 'lucide-react';

const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

const formatINR = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateTime = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

const STATUS_BADGE = {
  success: { cls: 'badge badge-green', label: 'Success' },
  pending: { cls: 'badge badge-amber', label: 'Pending' },
  failed: { cls: 'badge badge-red', label: 'Failed' },
};

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 20; // ~30 seconds

const Row = ({ label, value, bold }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', padding: '9px 0', borderBottom: '1px solid #F0EDF5', fontSize: '13px' }}>
    <span style={{ color: '#6E677B' }}>{label}</span>
    <span style={{ color: '#201530', fontWeight: bold ? 800 : 600, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
  </div>
);

const AddMoneyPage = () => {
  const { user, account: ctxAccount, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [config, setConfig] = useState({ minAmount: 10, maxAmount: 100000 });
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [amount, setAmount] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Active payment (card modal) and the result shown afterwards
  const [intentData, setIntentData] = useState(null); // { clientSecret, paymentIntentId, amount }
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [result, setResult] = useState(null); // { status, receipt, currentBalance }
  const [verifying, setVerifying] = useState(false);
  const [history, setHistory] = useState([]);

  const pollTimer = useRef(null);
  const mounted = useRef(true);

  const kycVerified = user?.kycStatus === 'verified';
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;

  const loadAccounts = useCallback(async () => {
    try {
      const res = await walletAPI.getAccounts();
      if (res.data?.accounts) {
        const list = res.data.accounts;
        setAccounts(list);
        setSelectedAccountId((prev) => {
          if (prev && list.some((a) => a.id === prev)) return prev;
          const savings = list.find((a) => a.accountType === 'savings');
          return (savings || list[0])?.id || '';
        });
      } else {
        setError(res.data?.message || 'Failed to load eligible deposit accounts.');
      }
    } catch (e) {
      console.error('Failed to load accounts', e);
      setError(getErrorMessage(e, 'Failed to load your bank accounts. Please refresh the page.'));
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await walletAPI.getTopUps(1, 8);
      if (res.data?.topups) {
        setHistory(res.data.topups);
      } else {
        setHistory([]);
      }
    } catch (e) {
      console.error('Failed to load top-up history', e);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    walletAPI
      .getConfig()
      .then((res) => {
        if (res.data) {
          setConfig(res.data);
        } else {
          setError(res.data?.message || 'Failed to load payment configuration.');
        }
      })
      .catch((err) => {
        console.error('Failed to load wallet config:', err);
        setError(getErrorMessage(err, 'Failed to load payment configuration.'));
      });
    loadAccounts();
    loadHistory();
    return () => {
      mounted.current = false;
      clearTimeout(pollTimer.current);
    };
  }, [loadAccounts, loadHistory]);

  // ---------- Step 1: create the Payment Intent ----------
  const handleStartPayment = async (e) => {
    e.preventDefault();
    setError('');

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (value < config.minAmount || value > config.maxAmount) {
      setError(`Amount must be between ${formatINR(config.minAmount)} and ${formatINR(config.maxAmount)}.`);
      return;
    }
    if (!selectedAccountId) {
      setError('No account available to add money to.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await walletAPI.createTopUpIntent({ amount: value, accountId: selectedAccountId });
      if (res.data?.clientSecret) {
        setIntentData({
          clientSecret: res.data.clientSecret,
          paymentIntentId: res.data.paymentIntentId,
          amount: res.data.amount,
        });
        setResult(null);
        setCardModalOpen(true);
      } else {
        setError(res.data?.message || 'Could not start payment. Payment intent was not generated.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the payment. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Steps 2-4: card paid -> wait for backend verification (webhook) ----------
  const pollStatus = useCallback(
    async (paymentIntentId, attempt = 0) => {
      try {
        const res = await walletAPI.getTopUpStatus(paymentIntentId);
        if (!mounted.current) return;
        const { status } = res.data;

        if (status === 'success' || status === 'failed') {
          setResult(res.data);
          setVerifying(false);
          if (status === 'success') {
            setAmount('');
            refreshProfile(); // updates the balance shown across the app
            loadAccounts();
            loadHistory();
          }
          return;
        }
      } catch (err) {
        console.error('Status check failed', err);
      }

      if (attempt + 1 >= POLL_MAX_ATTEMPTS) {
        if (mounted.current) {
          setVerifying(false);
          setResult({ status: 'pending', receipt: null });
        }
        return;
      }
      pollTimer.current = setTimeout(() => pollStatus(paymentIntentId, attempt + 1), POLL_INTERVAL_MS);
    },
    [refreshProfile, loadAccounts, loadHistory]
  );

  const handleCardSuccess = () => {
    setCardModalOpen(false);
    setVerifying(true);
    setResult(null);
    clearTimeout(pollTimer.current);
    pollStatus(intentData.paymentIntentId);
  };

  const handleCardClose = () => {
    setCardModalOpen(false);
  };

  const resetFlow = () => {
    clearTimeout(pollTimer.current);
    setResult(null);
    setVerifying(false);
    setIntentData(null);
    setError('');
  };

  const copyRef = (text) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  const receipt = result?.receipt;
  const liveBalance = selectedAccount?.balance ?? ctxAccount?.balance ?? 0;

  return (
    <div style={{ paddingBottom: '40px', maxWidth: '980px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', color: '#201530', marginBottom: '4px' }}>Add Money</h1>
        <p style={{ color: '#6E677B', fontSize: '14px' }}>
          Top up your savings or current account instantly with a card. Powered by Stripe (test mode).
        </p>
      </div>

      {!kycVerified && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '14px',
            backgroundColor: '#FBEFD9',
            border: '1px solid #E6C887',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert size={22} color="#9A6A0C" />
            <div>
              <h4 style={{ fontSize: '15px', color: '#201530', margin: 0 }}>KYC verification required</h4>
              <p style={{ fontSize: '13px', color: '#4A4453', margin: 0 }}>
                You can add money once your KYC is verified and your account is active.
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/kyc')} className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px', backgroundColor: '#5C187B' }}>
            Go to KYC
          </button>
        </div>
      )}

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        {/* ---------------- LEFT: current balance + amount form ---------------- */}
        <div>
          <div className="hero-gradient-card" style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', color: '#C9C3DA', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              {selectedAccount ? `${selectedAccount.accountType === 'current' ? 'Current' : 'Savings'} Account Balance` : 'Account Balance'}
            </span>
            <div style={{ fontSize: '36px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
              {formatINR(liveBalance)}
            </div>
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#E9E4F0' }}>
              Account #: <strong>{selectedAccount?.accountNumber || ctxAccount?.accountNumber || '—'}</strong>
            </div>
          </div>

          <form onSubmit={handleStartPayment} className="flowly-card">
            <h3 style={{ fontSize: '16px', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={18} color="#5C187B" /> Enter amount
            </h3>

            {accounts.length > 1 && (
              <div className="form-group">
                <label className="form-label">Add to account</label>
                <select
                  className="form-input"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  disabled={submitting || verifying}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.accountType === 'current' ? 'Current' : 'Savings'} — {a.maskedAccountNumber}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Amount (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                className="form-input"
                placeholder={`Min ${config.minAmount} · Max ${Number(config.maxAmount).toLocaleString('en-IN')}`}
                min={config.minAmount}
                max={config.maxAmount}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!kycVerified || submitting || verifying}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="btn-outline-dark"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => setAmount(String(q))}
                  disabled={!kycVerified || submitting || verifying}
                >
                  +₹{q.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', backgroundColor: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              disabled={!kycVerified || submitting || verifying || !selectedAccountId}
            >
              <PlusCircle size={16} />
              {submitting ? 'Starting payment...' : 'Proceed to pay'}
            </button>
          </form>
        </div>

        {/* ---------------- RIGHT: result / receipt ---------------- */}
        <div>
          {verifying && (
            <div className="flowly-card" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <RefreshCw size={30} color="#5C187B" className="spin" />
              <h3 style={{ fontSize: '17px', margin: '14px 0 6px' }}>Confirming your payment…</h3>
              <p style={{ color: '#6E677B', fontSize: '13px', margin: 0 }}>
                Your card payment went through. We are verifying it with the bank before crediting your account.
              </p>
            </div>
          )}

          {!verifying && result?.status === 'success' && receipt && (
            <div className="flowly-card" style={{ borderColor: '#B7E1A8' }}>
              <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                <CheckCircle2 size={44} color="#2E7A22" />
                <h3 style={{ fontSize: '18px', margin: '10px 0 2px', color: '#2E7A22' }}>Money added successfully</h3>
                <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: 'Outfit', color: '#201530' }}>{formatINR(receipt.amount)}</div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#F4FBF1', border: '1px solid #D5EDCB', marginBottom: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#6E677B' }}>Updated balance</div>
                <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'Outfit', color: '#201530' }}>
                  {formatINR(result.accountBalance ?? receipt.balanceAfter)}
                </div>
              </div>

              <Row
                label="Reference no."
                value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {receipt.receiptNumber}
                    <button type="button" onClick={() => copyRef(receipt.receiptNumber)} aria-label="Copy reference" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <Copy size={13} color="#5C187B" />
                    </button>
                  </span>
                }
                bold
              />
              <Row label="Type" value="Credit — Add money" />
              <Row label="Account" value={`${receipt.account?.accountNumber || ''} (${receipt.account?.accountType || ''})`} />
              <Row
                label="Paid with"
                value={receipt.paymentMethod?.last4 ? `${(receipt.paymentMethod.brand || 'Card').toUpperCase()} •••• ${receipt.paymentMethod.last4}` : 'Card'}
              />
              <Row label="Date & time" value={formatDateTime(receipt.completedAt)} />
              <Row label="Status" value={<span className="badge badge-green">Success</span>} />

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button className="btn-outline-dark" style={{ flex: 1 }} onClick={resetFlow}>
                  Add more
                </button>
                <button className="btn-primary" style={{ flex: 1, backgroundColor: '#5C187B' }} onClick={() => navigate('/dashboard')}>
                  Go to dashboard
                </button>
              </div>
            </div>
          )}

          {!verifying && result?.status === 'failed' && (
            <div className="flowly-card" style={{ borderColor: '#E3B3AC', textAlign: 'center' }}>
              <XCircle size={44} color="#B23A2E" />
              <h3 style={{ fontSize: '18px', margin: '10px 0 6px', color: '#B23A2E' }}>Payment failed</h3>
              <p style={{ color: '#4A4453', fontSize: '13px', margin: '0 0 6px' }}>
                {receipt?.failureReason || 'The payment could not be completed.'}
              </p>
              <p style={{ color: '#6E677B', fontSize: '12px', margin: '0 0 16px' }}>No money was added to your account.</p>
              <button className="btn-primary" style={{ backgroundColor: '#5C187B' }} onClick={resetFlow}>
                Try again
              </button>
            </div>
          )}

          {!verifying && result?.status === 'pending' && (
            <div className="flowly-card" style={{ borderColor: '#E6C887', textAlign: 'center' }}>
              <Clock size={40} color="#9A6A0C" />
              <h3 style={{ fontSize: '17px', margin: '10px 0 6px' }}>Still processing</h3>
              <p style={{ color: '#4A4453', fontSize: '13px', margin: '0 0 16px' }}>
                Your payment is taking longer than usual to confirm. If it succeeded, the money will appear in your account shortly and you will get a notification.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button
                  className="btn-outline-dark"
                  onClick={() => {
                    setVerifying(true);
                    pollStatus(intentData.paymentIntentId);
                  }}
                >
                  Check again
                </button>
                <button className="btn-primary" style={{ backgroundColor: '#5C187B' }} onClick={() => navigate('/dashboard')}>
                  Go to dashboard
                </button>
              </div>
            </div>
          )}

          {!verifying && !result && (
            <div className="flowly-card" style={{ textAlign: 'center', padding: '36px 20px', color: '#6E677B' }}>
              <Receipt size={34} color="#B7AEC8" />
              <p style={{ fontSize: '14px', margin: '12px 0 0' }}>
                Your transaction details will appear here after the payment is confirmed.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- RECENT ADD-MONEY TRANSACTIONS ---------------- */}
      <div className="flowly-card" style={{ marginTop: '28px' }}>
        <h3 style={{ fontSize: '16px', marginTop: 0, marginBottom: '14px' }}>Recent add-money transactions</h3>
        {history.length === 0 ? (
          <p style={{ color: '#6E677B', fontSize: '13px', margin: 0 }}>No add-money transactions yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="flowly-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Account</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => {
                  const badge = STATUS_BADGE[t.status] || STATUS_BADGE.pending;
                  return (
                    <tr key={t.paymentIntentId}>
                      <td>{formatDateTime(t.completedAt || t.initiatedAt)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{t.receiptNumber || '—'}</td>
                      <td>{t.account ? `${t.account.accountType} · ${t.account.accountNumber}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: t.status === 'success' ? '#2E7A22' : '#201530' }}>
                        {t.status === 'success' && <ArrowDownLeft size={13} style={{ verticalAlign: 'middle', marginRight: '3px' }} />}
                        {formatINR(t.amount)}
                      </td>
                      <td>
                        <span className={badge.cls}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StripeCardModal
        isOpen={cardModalOpen}
        onClose={handleCardClose}
        clientSecret={intentData?.clientSecret}
        amount={intentData?.amount}
        title="Add Money"
        onSuccess={handleCardSuccess}
      />
    </div>
  );
};

export default AddMoneyPage;