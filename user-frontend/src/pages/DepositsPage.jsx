import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { depositsAPI, getErrorMessage, resolveDocUrl } from '../services/api';
import { 
  Landmark, 
  PlusCircle, 
  TrendingUp, 
  Clock, 
  AlertCircle, 
  X, 
  CheckCircle2, 
  Calendar,
  Lock,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Percent,
  Layers,
  Award,
  ChevronRight,
  Calculator,
  CreditCard,
  FileText,
  Download,
  Upload,
  MessageSquare
} from 'lucide-react';
import StripeCardModal from '../components/StripeCardModal';

const CATEGORIES = [
  { id: 'all', label: 'All Schemes' },
  { id: 'regular', label: 'Regular FD' },
  { id: 'senior_citizen', label: 'Senior Citizen' },
  { id: 'tax_saver', label: 'Tax Saver' },
  { id: 'special', label: 'Special FD' },
  { id: 'flexi', label: 'Flexi Savings' },
];

const DepositsPage = () => {
  const { account, refreshProfile } = useAuth();
  const [depositsData, setDepositsData] = useState({ accountBalance: 0, fixedDeposits: [] });
  const [schemes, setSchemes] = useState([]);
  const [schemesLoading, setSchemesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modals
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [fdModalOpen, setFdModalOpen] = useState(false);
  const [calculatorModalOpen, setCalculatorModalOpen] = useState(false);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [infoSubmitModalOpen, setInfoSubmitModalOpen] = useState(false);
  const [earlyCloseModalOpen, setEarlyCloseModalOpen] = useState(false);
  const [selectedFd, setSelectedFd] = useState(null);
  const [selectedScheme, setSelectedScheme] = useState(null);

  // Deposit Form
  const [depositAmount, setDepositAmount] = useState('');

  // Stripe Card Modal State
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeAmount, setStripeAmount] = useState(0);

  // FD Creation Form
  const [fdPrincipal, setFdPrincipal] = useState('25000');
  const [fdTenure, setFdTenure] = useState(12);
  const [fdType, setFdType] = useState('regular');
  const [fdInterestRate, setFdInterestRate] = useState(7.5);
  const [autoRenew, setAutoRenew] = useState(false);
  const [payoutOption, setPayoutOption] = useState('cumulative');

  // Calculator Form & Results
  const [calcPrincipal, setCalcPrincipal] = useState('50000');
  const [calcType, setCalcType] = useState('regular');
  const [calcTenure, setCalcTenure] = useState(12);
  const [calcPayoutOption, setCalcPayoutOption] = useState('cumulative');
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // TopUp Form
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpTxnId, setTopUpTxnId] = useState('');

  // Info Submit Form
  const [infoNote, setInfoNote] = useState('');
  const [infoFile, setInfoFile] = useState(null);

  // Messages & Loading state
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchDeposits = async () => {
    setLoading(true);
    try {
      const res = await depositsAPI.getMyDeposits();
      if (res.data) {
        setDepositsData(res.data);
      } else {
        setError('Failed to retrieve deposit account records.');
      }
    } catch (err) {
      console.error('Failed to fetch deposits:', err);
      setError(getErrorMessage(err, 'Failed to fetch deposits. Please check your connection.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSchemes = async () => {
    setSchemesLoading(true);
    try {
      const res = await depositsAPI.getFDSchemes();
      if (res.data?.schemes) {
        setSchemes(res.data.schemes);
      } else {
        setSchemes([]);
      }
    } catch (err) {
      console.error('Failed to fetch FD schemes:', err);
      setError(getErrorMessage(err, 'Failed to load investment schemes.'));
    } finally {
      setSchemesLoading(false);
    }
  };

  useEffect(() => {
    fetchDeposits();
    fetchSchemes();
  }, []);

  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(depositAmount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid deposit amount greater than ₹0.');
      return;
    }

    setError('');
    setMessage('');
    setSubmitting(true);

    // Money is only ever added through a verified Stripe payment: the backend
    // creates the PaymentIntent here and credits the balance only after it has
    // verified the payment with Stripe (webhook / confirm).
    try {
      const res = await depositsAPI.initiateTopUp({ amount });
      if (res.data?.clientSecret) {
        setStripeClientSecret(res.data.clientSecret);
        setTopUpTxnId(res.data?.transactionId || '');
        setStripeAmount(amount);
        setDepositModalOpen(false);
        setStripeModalOpen(true);
      } else {
        setError(res.data?.message || 'Failed to start payment. Payment intent was not generated.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to start the payment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripePaymentSuccess = async (paymentIntent) => {
    setStripeModalOpen(false);
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const txnId = topUpTxnId || paymentIntent?.id;
      const confirmRes = await depositsAPI.confirmTopUp({ transactionId: txnId });
      if (confirmRes.data?.success !== false) {
        setMessage(confirmRes.data?.message || `Successfully deposited ₹${stripeAmount?.toLocaleString('en-IN')} into your savings account via Stripe!`);
        setDepositAmount('');
        setTopUpAmount('');
        setStripeClientSecret('');
        setTopUpTxnId('');
        await refreshProfile();
        await fetchDeposits();
      } else {
        setError(confirmRes.data?.message || 'Payment received, but failed to credit savings balance. Please refresh.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Stripe payment confirmation failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenFdForScheme = (scheme) => {
    setSelectedScheme(scheme);
    setFdPrincipal(scheme.minDeposit ? String(scheme.minDeposit) : '10000');
    setFdTenure(scheme.minTenureMonths || 12);
    setFdType(scheme.category || 'regular');
    setFdInterestRate(scheme.interestRate || 7.5);
    setPayoutOption(scheme.allowedPayoutOptions?.[0] || 'cumulative');
    setError('');
    setMessage('');
    setFdModalOpen(true);
  };

  const handleCreateFDSubmit = async (e) => {
    e.preventDefault();
    const principal = Number(fdPrincipal);
    if (!principal || principal <= 0) {
      setError('Please enter a valid FD amount.');
      return;
    }

    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const res = await depositsAPI.createFD({
        principalAmount: principal,
        interestRate: fdInterestRate,
        tenureMonths: fdTenure,
        autoRenew,
        fdType: selectedScheme?.category || fdType,
        interestPayoutOption: payoutOption,
      });
      setMessage(res.data.message || 'Fixed Deposit request submitted!');
      setFdModalOpen(false);
      setFdPrincipal('');
      setSelectedScheme(null);
      await refreshProfile();
      await fetchDeposits();
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.code === 'INSUFFICIENT_BALANCE' || errData?.shortfall > 0) {
        setError(`Insufficient savings balance. You need ₹${errData.shortfall?.toLocaleString('en-IN') || 'more'} to open this FD.`);
        setTopUpAmount(String(errData.shortfall || 5000));
        setTopUpModalOpen(true);
      } else {
        setError(errData?.message || 'Fixed Deposit creation failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCalculateSubmit = async (e) => {
    if (e) e.preventDefault();
    const principal = Number(calcPrincipal);
    if (!principal || principal <= 0) return;

    setCalcLoading(true);
    try {
      const res = await depositsAPI.calculateFD({
        principal,
        fdType: calcType,
        tenureMonths: Number(calcTenure),
        interestPayoutOption: calcPayoutOption,
      });
      if (res.data?.calculation) {
        setCalcResult(res.data.calculation);
      } else {
        setError(res.data?.message || 'Calculation could not be completed.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Calculation failed'));
    } finally {
      setCalcLoading(false);
    }
  };

  const handleInitiateTopUpSubmit = async (e) => {
    e.preventDefault();
    const amt = Number(topUpAmount);
    if (!amt || amt <= 0) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await depositsAPI.initiateTopUp({ amount: amt });
      if (res.data?.clientSecret) {
        setStripeClientSecret(res.data.clientSecret);
        setTopUpTxnId(res.data?.transactionId || '');
        setStripeAmount(amt);
        setTopUpModalOpen(false);
        setStripeModalOpen(true);
      } else {
        setError(res.data?.message || 'Top-up initialization failed. Payment intent was not generated.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Top-up failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenInfoSubmitModal = (fd) => {
    setSelectedFd(fd);
    setInfoNote('');
    setInfoFile(null);
    setError('');
    setMessage('');
    setInfoSubmitModalOpen(true);
  };

  const handleInfoSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFd) return;
    setSubmitting(true);
    setError('');

    try {
      const form = new FormData();
      if (infoNote) form.append('note', infoNote);
      if (infoFile) form.append('document', infoFile);

      const res = await depositsAPI.submitAdditionalInfo(selectedFd._id, form);
      setMessage(res.data?.message || 'Information submitted successfully!');
      setInfoSubmitModalOpen(false);
      setSelectedFd(null);
      await fetchDeposits();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit information');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEarlyCloseSubmit = async () => {
    if (!selectedFd) return;
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      const res = await depositsAPI.closeFDEarly(selectedFd._id);
      setMessage(res.data.message || 'Fixed Deposit closed early successfully!');
      setEarlyCloseModalOpen(false);
      setSelectedFd(null);
      await refreshProfile();
      await fetchDeposits();
    } catch (err) {
      setError(err.response?.data?.message || 'FD Closure failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSchemes = selectedCategory === 'all'
    ? schemes
    : schemes.filter(s => s.category === selectedCategory);

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ---------------- HEADER & ACTIONS ---------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: '#E4F4DC', color: '#2E7A22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={20} />
            </div>
            <h1 style={{ fontSize: '26px', color: '#201530', margin: 0 }}>Savings & Fixed Deposits</h1>
          </div>
          <p style={{ color: '#6E677B', fontSize: '14px' }}>
            Manage liquid savings, browse compound FD schemes, and compute investment returns.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setCalculatorModalOpen(true); handleCalculateSubmit(); }} className="btn-secondary" style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calculator size={16} /> FD Calculator
          </button>
          <button onClick={() => { setError(''); setMessage(''); setDepositModalOpen(true); }} className="btn-secondary" style={{ fontSize: '13px' }}>
            <PlusCircle size={16} /> Deposit Funds
          </button>
          <button onClick={() => { setSelectedScheme(null); setError(''); setMessage(''); setFdModalOpen(true); }} className="btn-primary" style={{ fontSize: '13px' }}>
            <TrendingUp size={16} /> Quick Open FD
          </button>
        </div>
      </div>

      {/* Global Alerts */}
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

      {/* ---------------- BALANCE SUMMARY BANNER ---------------- */}
      <div className="grid-2" style={{ marginBottom: '32px' }}>
        <div className="hero-gradient-card">
          <span style={{ fontSize: '12px', color: '#C9C3DA', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            Savings Account Balance
          </span>
          <div style={{ fontSize: '36px', fontWeight: 800, color: 'white', fontFamily: 'Outfit', marginBottom: '16px' }}>
            ₹{depositsData.accountBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => setDepositModalOpen(true)} className="btn-secondary" style={{ fontSize: '12px', padding: '8px 16px' }}>
              + Add Funds
            </button>
            <button onClick={() => setTopUpModalOpen(true)} className="btn-secondary" style={{ fontSize: '12px', padding: '8px 16px' }}>
              💳 Card Top-Up
            </button>
          </div>
        </div>

        <div className="flowly-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
            Fixed Deposits Summary
          </span>
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#5C187B', fontFamily: 'Outfit', marginBottom: '8px' }}>
            {depositsData.fixedDepositsCount || 0} FD(s)
          </div>
          <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
            Guaranteed returns up to 8.10% p.a. with quarterly compounding.
          </p>
        </div>
      </div>

      {/* ---------------- FD SCHEMES CATALOG SECTION ---------------- */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: '#5C187B' }} />
              <h2 style={{ fontSize: '20px', color: '#201530', margin: 0 }}>Explore High-Yield FD Schemes</h2>
            </div>
            <p style={{ fontSize: '13px', color: '#6E677B', margin: '4px 0 0 0' }}>Choose from tailored rates, lock-in periods, and senior citizen bonuses.</p>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: selectedCategory === cat.id ? '#5C187B' : '#F4F2F7',
                  color: selectedCategory === cat.id ? '#FFFFFF' : '#6E677B',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {schemesLoading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: '#6E677B' }}>Loading scheme catalog...</div>
        ) : filteredSchemes.length === 0 ? (
          <div className="flowly-card" style={{ textAlign: 'center', padding: '32px', color: '#6E677B' }}>
            No schemes found under this category.
          </div>
        ) : (
          <div className="grid-3" style={{ gap: '20px' }}>
            {filteredSchemes.map((scheme) => (
              <div 
                key={scheme._id} 
                className="flowly-card" 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justify: 'space-between', 
                  position: 'relative',
                  border: scheme.badge ? '1.5px solid #5C187B' : '1px solid #E8E5EE',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: '#F0E6F5', color: '#5C187B', textTransform: 'uppercase' }}>
                      {scheme.code}
                    </span>
                    {scheme.badge && (
                      <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                        ★ {scheme.badge}
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '17px', color: '#201530', margin: '0 0 6px 0', fontWeight: 700 }}>
                    {scheme.name}
                  </h3>
                  <p style={{ fontSize: '12px', color: '#6E677B', margin: '0 0 16px 0', lineHeight: '1.4' }}>
                    {scheme.description || 'Flexible tenure fixed deposit with compound interest earnings.'}
                  </p>

                  <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#FAF8FC', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#6E677B', display: 'block' }}>Base Interest Rate</span>
                      <span style={{ fontSize: '22px', fontWeight: 800, color: '#2E7A22', fontFamily: 'Outfit' }}>
                        {scheme.interestRate}% <span style={{ fontSize: '12px', fontWeight: 600 }}>p.a.</span>
                      </span>
                    </div>
                    {scheme.seniorCitizenBonusRate > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: '#6E677B', display: 'block' }}>Senior Bonus</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#5C187B' }}>
                          +{scheme.seniorCitizenBonusRate}% Extra
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="kv-row" style={{ fontSize: '12px' }}>
                    <span className="k">Tenure Range</span>
                    <span className="v">{scheme.minTenureMonths} - {scheme.maxTenureMonths} Months</span>
                  </div>

                  <div className="kv-row" style={{ fontSize: '12px' }}>
                    <span className="k">Min Deposit</span>
                    <span className="v">₹{scheme.minDeposit?.toLocaleString('en-IN') || '0'}</span>
                  </div>

                  <div className="kv-row" style={{ fontSize: '12px' }}>
                    <span className="k">Payout Options</span>
                    <span className="v" style={{ textTransform: 'capitalize' }}>
                      {scheme.allowedPayoutOptions?.join(', ') || 'cumulative'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenFdForScheme(scheme)}
                  className="btn-primary"
                  style={{ width: '100%', marginTop: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  Open FD Under Scheme <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- FIXED DEPOSITS LIST ---------------- */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '18px', color: '#201530', marginBottom: '16px' }}>Your Fixed Deposits</h3>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#6E677B' }}>Loading deposits...</div>
        ) : depositsData.fixedDeposits.length === 0 ? (
          <div className="flowly-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#A19AA8' }}>
            <Landmark size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <h4 style={{ color: '#201530', fontSize: '16px', margin: '0 0 4px 0' }}>No Active Fixed Deposits</h4>
            <p style={{ fontSize: '13px', margin: '0 0 16px 0' }}>Select a scheme above to start earning high returns.</p>
          </div>
        ) : (
          <div className="grid-3">
            {depositsData.fixedDeposits.map((fd) => (
              <div key={fd._id} className="flowly-card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <span className={`badge ${
                    fd.status === 'active' ? 'badge-green' : 
                    fd.status === 'matured' ? 'badge-purple' : 
                    fd.status === 'info_requested' ? 'badge-amber' : 
                    fd.status === 'rejected' ? 'badge-red' : 'badge-amber'
                  }`}>
                    {fd.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#5C187B' }}>
                    {fd.interestRate}% APR
                  </span>
                </div>

                <div style={{ fontSize: '22px', fontWeight: 800, color: '#201530', fontFamily: 'Outfit', marginBottom: '4px' }}>
                  ₹{fd.principalAmount?.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '12px', color: '#6E677B', marginBottom: '14px' }}>
                  Tenure: {fd.tenureMonths} Months ({fd.fdType || 'regular'})
                </div>

                <div className="kv-row">
                  <span className="k">FD Number</span>
                  <span className="v">{fd.fdNumber || 'Pending Assignment'}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Maturity Payout</span>
                  <span className="v">₹{fd.maturityAmount?.toLocaleString('en-IN')}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Maturity Date</span>
                  <span className="v">{new Date(fd.maturityDate).toLocaleDateString()}</span>
                </div>

                {/* Worker Info Requested Prompt Banner */}
                {fd.status === 'info_requested' && (
                  <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', padding: '10px', borderRadius: '8px', margin: '12px 0', fontSize: '12px' }}>
                    <strong style={{ color: '#92400E', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MessageSquare size={14} /> Information Requested by Officer:
                    </strong>
                    <p style={{ color: '#78350F', margin: '4px 0 8px 0' }}>
                      {fd.infoRequests?.[fd.infoRequests.length - 1]?.message || 'Please provide additional documentation.'}
                    </p>
                    <button
                      onClick={() => handleOpenInfoSubmitModal(fd)}
                      className="btn-primary"
                      style={{ fontSize: '11px', padding: '4px 10px', width: '100%' }}
                    >
                      Submit Requested Information
                    </button>
                  </div>
                )}

                {/* Download Certificate PDF Button */}
                {fd.certificateUrl && (
                  <a
                    href={resolveDocUrl(fd.certificateUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px', marginTop: '12px', textDecoration: 'none' }}
                  >
                    <Download size={14} /> Download Certificate PDF
                  </a>
                )}

                {fd.status === 'active' && (
                  <button
                    onClick={() => { setSelectedFd(fd); setEarlyCloseModalOpen(true); }}
                    className="btn-outline-dark"
                    style={{ width: '100%', marginTop: '12px', fontSize: '12px', color: '#B23A2E', borderColor: '#FADADA' }}
                  >
                    Close Early
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- CALCULATOR MODAL ---------------- */}
      {calculatorModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={20} style={{ color: '#5C187B' }} /> Fixed Deposit Yield Calculator
              </h3>
              <button onClick={() => setCalculatorModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Principal Amount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={calcPrincipal}
                  onChange={(e) => setCalcPrincipal(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tenure (Months)</label>
                <input
                  type="number"
                  className="form-input"
                  value={calcTenure}
                  onChange={(e) => setCalcTenure(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">FD Type</label>
                <select className="form-select" value={calcType} onChange={(e) => setCalcType(e.target.value)}>
                  <option value="regular">Regular FD</option>
                  <option value="senior_citizen">Senior Citizen (+0.5%)</option>
                  <option value="tax_saver">Tax Saver 5-Year</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payout Frequency</label>
                <select className="form-select" value={calcPayoutOption} onChange={(e) => setCalcPayoutOption(e.target.value)}>
                  <option value="cumulative">Cumulative (Compounded)</option>
                  <option value="monthly">Monthly Payout</option>
                  <option value="quarterly">Quarterly Payout</option>
                  <option value="annually">Annual Payout</option>
                </select>
              </div>
            </div>

            <button onClick={handleCalculateSubmit} className="btn-primary" style={{ width: '100%', margin: '12px 0 16px 0' }} disabled={calcLoading}>
              {calcLoading ? 'Calculating...' : 'Recalculate Returns'}
            </button>

            {calcResult && (
              <div style={{ padding: '16px', backgroundColor: '#FAF8FC', borderRadius: '10px', border: '1px solid #F0E6F5' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Derived Interest Rate</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#5C187B' }}>{calcResult.interestRate}% p.a.</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Maturity Date</span>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#201530' }}>{new Date(calcResult.maturityDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Total Interest Earned</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#2E7A22' }}>+₹{calcResult.totalInterestEarned?.toLocaleString('en-IN')}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Maturity Amount</span>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#201530' }}>₹{calcResult.maturityAmount?.toLocaleString('en-IN')}</div>
                  </div>
                </div>

                {calcResult.payoutSchedule && (
                  <div style={{ paddingTop: '8px', borderTop: '1px solid #E8E5EE', fontSize: '12px' }}>
                    <strong>Payout Schedule ({calcResult.payoutSchedule.frequency}):</strong>{' '}
                    {calcResult.payoutSchedule.numberOfPayouts} payouts of ₹{calcResult.payoutSchedule.amountPerPayout} each
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- CARD TOP-UP MODAL ---------------- */}
      {topUpModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={20} style={{ color: '#5C187B' }} /> Card Top-Up (Add Funds)
              </h3>
              <button onClick={() => setTopUpModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <p style={{ fontSize: '13px', color: '#6E677B', marginBottom: '16px' }}>
              Add money to your savings balance via instant debit/credit card processing to fund your FD.
            </p>

            <form onSubmit={handleInitiateTopUpSubmit}>
              <div className="form-group">
                <label className="form-label">Top-Up Amount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  required
                />
              </div>

              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#F4F2F7', fontSize: '12px', color: '#5C187B', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="#059669" /> Secure card payment powered by Stripe. Funds are verified and credited immediately.
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
                {submitting ? 'Starting payment...' : 'Proceed to Stripe Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- SUBMIT REQUESTED INFO MODAL ---------------- */}
      {infoSubmitModalOpen && selectedFd && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0 }}>Respond to Officer Request</h3>
              <button onClick={() => setInfoSubmitModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleInfoSubmit}>
              <div className="form-group">
                <label className="form-label">Note / Response Explanation</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Explain details requested by officer..."
                  value={infoNote}
                  onChange={(e) => setInfoNote(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Attach Supporting Document (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setInfoFile(e.target.files[0])}
                  style={{ fontSize: '13px' }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit & Send for Re-Review'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- DEPOSIT FUNDS MODAL ---------------- */}
      {depositModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <PlusCircle size={20} color="#5C187B" /> Deposit Money into Savings
              </h3>
              <button onClick={() => setDepositModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleDepositSubmit}>
              <div className="form-group">
                <label className="form-label">Deposit Amount (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 5000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  min="10"
                  required
                />
              </div>

              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#F4F2F7', fontSize: '12px', color: '#5C187B', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="#059669" /> Secure card payment by Stripe (test mode). Your balance updates only after the payment is verified.
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
                {submitting ? 'Starting payment...' : 'Proceed to Stripe Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- CREATE FIXED DEPOSIT MODAL ---------------- */}
      {fdModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', margin: 0 }}>
                  {selectedScheme ? `Open FD: ${selectedScheme.name}` : 'Open Fixed Deposit'}
                </h3>
                {selectedScheme && (
                  <span style={{ fontSize: '12px', color: '#5C187B', fontWeight: 600 }}>
                    Scheme Code: {selectedScheme.code}
                  </span>
                )}
              </div>
              <button onClick={() => setFdModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateFDSubmit}>
              <div className="form-group">
                <label className="form-label">Principal Deposit Amount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g. 25000"
                  value={fdPrincipal}
                  onChange={(e) => setFdPrincipal(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: '#6E677B' }}>
                  <span>Available Balance: ₹{account?.balance?.toLocaleString('en-IN') || '0'}</span>
                  {selectedScheme?.minDeposit > 0 && <span>Min: ₹{selectedScheme.minDeposit.toLocaleString('en-IN')}</span>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tenure (Months)</label>
                <input
                  type="number"
                  className="form-input"
                  min={selectedScheme?.minTenureMonths || 1}
                  max={selectedScheme?.maxTenureMonths || 120}
                  value={fdTenure}
                  onChange={(e) => setFdTenure(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Interest Rate (% p.a.)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={fdInterestRate}
                  onChange={(e) => setFdInterestRate(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Interest Payout Frequency</label>
                <select className="form-select" value={payoutOption} onChange={(e) => setPayoutOption(e.target.value)}>
                  {(selectedScheme?.allowedPayoutOptions || ['cumulative', 'monthly', 'quarterly', 'annually']).map(opt => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                  />
                  Auto-renew principal + interest upon maturity
                </label>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
                {submitting ? 'Creating FD...' : 'Confirm & Lock Fixed Deposit'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- EARLY CLOSURE CONFIRMATION MODAL ---------------- */}
      {earlyCloseModalOpen && selectedFd && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, color: '#B23A2E' }}>Early FD Closure</h3>
              <button onClick={() => setEarlyCloseModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '14px', backgroundColor: '#FADADA', borderRadius: '10px', color: '#B23A2E', fontSize: '13px', marginBottom: '16px' }}>
              ⚠ Closing an FD before its maturity date incurs a 1.0% penalty shave on the contracted interest rate.
            </div>

            <div className="kv-row">
              <span className="k">FD Principal</span>
              <span className="v">₹{selectedFd.principalAmount?.toLocaleString('en-IN')}</span>
            </div>
            <div className="kv-row">
              <span className="k">Contracted Rate</span>
              <span className="v">{selectedFd.interestRate}% APR</span>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button onClick={() => setEarlyCloseModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleEarlyCloseSubmit} className="btn-primary" style={{ flex: 1, backgroundColor: '#B23A2E' }} disabled={submitting}>
                {submitting ? 'Closing...' : 'Confirm Early Close'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---------------- STRIPE CARD PAYMENT MODAL ---------------- */}
      <StripeCardModal
        isOpen={stripeModalOpen}
        onClose={() => setStripeModalOpen(false)}
        clientSecret={stripeClientSecret}
        amount={stripeAmount}
        title="Deposit Money via Stripe"
        onSuccess={handleStripePaymentSuccess}
      />
    </div>
  );
};

export default DepositsPage;