import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { transferAPI, getErrorMessage } from '../services/api';
import MpinModal from '../components/MpinModal';
import StripeCardModal from '../components/StripeCardModal';
import {
  ArrowLeftRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Landmark,
  CreditCard,
  ArrowRight,
  Search,
  KeyRound,
  Mail,
  Download,
  Printer,
  RotateCcw,
  Sparkles,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';

const TransferPage = () => {
  const { user, account, refreshProfile } = useAuth();
  const isSuspended = account?.status === 'suspended' || user?.status === 'suspended';

  // Page Tab: 'transfer' | 'history'
  const [activeTab, setActiveTab] = useState('transfer');

  // Payment Method: Customer-to-Customer via Stripe only
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('STRIPE');

  // Config & Branch data
  const [branches, setBranches] = useState([]);

  // Transfer Form State
  const [destinationAccountNumber, setDestinationAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [mpin, setMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [showMpin, setShowMpin] = useState(false);

  // Beneficiary Verification State
  const [validatingBeneficiary, setValidatingBeneficiary] = useState(false);
  const [beneficiaryInfo, setBeneficiaryInfo] = useState(null);
  const [beneficiaryError, setBeneficiaryError] = useState('');

  // OTP State (for > ₹2,000 internal transfers)
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);

  // Execution & Receipt State
  const [submitting, setSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [completedReceipt, setCompletedReceipt] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Stripe Card Payment Modal & Verification State
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [cardIntentData, setCardIntentData] = useState(null); // { clientSecret, paymentIntentId, amount, receiptNumber }
  const [verifyingCardPayment, setVerifyingCardPayment] = useState(false);

  // MPIN Setup modal
  const [mpinModalOpen, setMpinModalOpen] = useState(false);

  // Transfer History State
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Receipt Modal for History items
  const [viewingReceipt, setViewingReceipt] = useState(null);

  const pollTimer = useRef(null);
  const mounted = useRef(true);

  // Load configuration
  useEffect(() => {
    mounted.current = true;
    const fetchConfig = async () => {
      try {
        const res = await transferAPI.getConfig();
        if (res.data?.branches) {
          setBranches(res.data.branches);
        }
      } catch (err) {
        console.error('Failed to load transfer config:', err);
        setTransferError(getErrorMessage(err, 'Failed to load transfer configuration.'));
      }
    };
    fetchConfig();
    refreshProfile();

    const handleAccountSuspended = () => {
      refreshProfile();
    };
    window.addEventListener('flowly:account-suspended', handleAccountSuspended);
    window.addEventListener('flowly:account-update', handleAccountSuspended);

    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      window.removeEventListener('flowly:account-suspended', handleAccountSuspended);
      window.removeEventListener('flowly:account-update', handleAccountSuspended);
    };
  }, [refreshProfile]);

  // OTP Countdown Timer
  useEffect(() => {
    let timer;
    if (otpCountdown > 0) {
      timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await transferAPI.getHistory(historyPage, 10);
      if (res.data?.transfers) {
        setHistory(res.data.transfers);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('Failed to load transfer history:', err);
      setTransferError(getErrorMessage(err, 'Failed to load transfer history.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  // Load history when tab is clicked
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const currentBalance = account?.balance || 0;
  const numericAmount = Number(amount) || 0;
  const isHighValue = numericAmount > 2000;
  const isMpinSet = user?.isMpinSet ?? false;

  // Poll Stripe Transfer Status until succeeded or failed
  const pollTransferStatus = useCallback(
    async (paymentIntentId, attempt = 0) => {
      try {
        const res = await transferAPI.getStripeStatus(paymentIntentId);
        if (!mounted.current) return;
        const { status, receipt, failureReason } = res.data;

        if (status === 'completed' || status === 'success') {
          setCompletedReceipt(receipt);
          setVerifyingCardPayment(false);
          setAmount('');
          setRemarks('');
          setMpin('');
          setOtp('');
          setOtpSent(false);
          setOtpMessage('');
          setOtpError('');
          setDestinationAccountNumber('');
          setBeneficiaryInfo(null);
          await refreshProfile();
          window.dispatchEvent(new CustomEvent('flowly:account-update'));
          return;
        }

        if (status === 'failed') {
          setVerifyingCardPayment(false);
          setTransferError(failureReason || 'Card payment failed or was declined.');
          return;
        }
      } catch (err) {
        console.error('Transfer status check error:', err);
      }

      if (attempt + 1 >= 20) {
        if (mounted.current) {
          setVerifyingCardPayment(false);
          setTransferError('Payment verification is taking a moment. Please check your Transfer History tab.');
        }
        return;
      }

      pollTimer.current = setTimeout(() => pollTransferStatus(paymentIntentId, attempt + 1), 1500);
    },
    [refreshProfile]
  );

  // Handle Card Modal Success
  const handleCardSuccess = (intent) => {
    setCardModalOpen(false);
    setVerifyingCardPayment(true);
    setTransferError('');
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTransferStatus(cardIntentData?.paymentIntentId || intent.id);
  };

  const handleCardClose = () => {
    setCardModalOpen(false);
  };

  // Handle Validate Beneficiary
  const handleValidateBeneficiary = async () => {
    if (isSuspended) {
      setBeneficiaryError('Account temporarily suspended.');
      return;
    }

    const cleanAcc = String(destinationAccountNumber || '').trim();
    if (!cleanAcc) {
      setBeneficiaryError('Please enter a beneficiary account number.');
      setBeneficiaryInfo(null);
      return;
    }

    if (account?.accountNumber && cleanAcc === String(account.accountNumber)) {
      setBeneficiaryError('You cannot transfer funds to your own source account.');
      setBeneficiaryInfo(null);
      return;
    }

    setValidatingBeneficiary(true);
    setBeneficiaryError('');
    try {
      const res = await transferAPI.validateBeneficiary({
        destinationAccountNumber: cleanAcc,
        sourceAccountId: account?._id,
      });
      setBeneficiaryInfo(res.data);
      setBeneficiaryError('');
    } catch (err) {
      setBeneficiaryError(err.response?.data?.message || 'Beneficiary account validation failed.');
      setBeneficiaryInfo(null);
    } finally {
      setValidatingBeneficiary(false);
    }
  };

  // Handle Request OTP (for > ₹2,000 transfers)
  const handleRequestOTP = async () => {
    if (isSuspended) {
      setOtpError('Account temporarily suspended.');
      return;
    }

    if (!destinationAccountNumber) {
      setOtpError('Please specify and validate the beneficiary account first.');
      return;
    }
    if (numericAmount <= 0) {
      setOtpError('Please enter a valid transfer amount.');
      return;
    }
    if (numericAmount > currentBalance) {
      setOtpError(`Insufficient balance. Available: ₹${currentBalance.toFixed(2)}`);
      return;
    }

    setSendingOtp(true);
    setOtpError('');
    setOtpMessage('');
    try {
      const res = await transferAPI.requestOTP({
        destinationAccountNumber: String(destinationAccountNumber).trim(),
        sourceAccountId: account?._id,
        amount: numericAmount,
        paymentMethod: 'STRIPE',
      });
      setOtpSent(true);
      setOtpMessage(res.data?.message || 'Verification code sent to your registered email.');
      setOtpCountdown(60); // 60 seconds cooldown for resend
    } catch (err) {
      setOtpError(err.response?.data?.message || 'Failed to send OTP code.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Handle Submit Transfer (Customer-to-Customer via Stripe only)
  const handleSubmitTransfer = async (e) => {
    e.preventDefault();
    setTransferError('');

    if (isSuspended) {
      setTransferError('Account temporarily suspended.');
      return;
    }

    if (!destinationAccountNumber) {
      setTransferError('Please enter the beneficiary account number.');
      return;
    }
    if (!beneficiaryInfo) {
      setTransferError('Please validate the beneficiary account first.');
      return;
    }
    if (numericAmount <= 0) {
      setTransferError('Please enter a valid transfer amount greater than 0.');
      return;
    }
    if (numericAmount > currentBalance) {
      setTransferError(`Insufficient balance. Your available balance is ₹${currentBalance.toFixed(2)}.`);
      return;
    }

    // MPIN required for all transfers (both <= 2000 and > 2000)
    if (!mpin) {
      setTransferError('Please enter your 4-6 digit Security MPIN.');
      return;
    }

    // OTP required for transfers > ₹2,000
    if (isHighValue && !otp) {
      setTransferError('Transfers above ₹2,000 require a 6-digit email OTP in addition to your MPIN.');
      return;
    }

    // Client idempotency key for duplicate-payment prevention
    const clientKey = `tr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    setSubmitting(true);
    try {
      const res = await transferAPI.createStripeIntent({
        destinationAccountNumber: String(destinationAccountNumber).trim(),
        sourceAccountId: account?._id,
        amount: numericAmount,
        remarks: remarks || undefined,
        mpin: String(mpin).trim(),
        otp: isHighValue ? String(otp).trim() : undefined,
        idempotencyKey: clientKey,
      });

      if (res.data?.alreadyProcessed && res.data.receipt) {
        setCompletedReceipt(res.data.receipt);
        await refreshProfile();
        window.dispatchEvent(new CustomEvent('flowly:account-update'));
        return;
      } else if (res.data?.clientSecret) {
        setCardIntentData({
          clientSecret: res.data.clientSecret,
          paymentIntentId: res.data.paymentIntentId,
          amount: res.data.amount,
          receiptNumber: res.data.receiptNumber,
        });
        setCardModalOpen(true);
      } else {
        setTransferError(res.data?.message || 'Unable to initialize card transfer. Please try again.');
      }
    } catch (err) {
      console.error('Stripe transfer initiation failed:', err);
      setTransferError(getErrorMessage(err, 'Failed to initialize Stripe transfer.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Download PDF
  const handleDownloadPDF = async (receiptNumber) => {
    if (!receiptNumber) return;
    setDownloadingPdf(true);
    try {
      const res = await transferAPI.downloadReceiptPDF(receiptNumber);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Transfer_Receipt_${receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF receipt:', err);
      setTransferError(getErrorMessage(err, 'Failed to download PDF receipt. Please try again.'));
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Reset form to start a new transfer
  const handleResetForm = () => {
    setDestinationAccountNumber('');
    setAmount('');
    setRemarks('');
    setMpin('');
    setOtp('');
    setBeneficiaryInfo(null);
    setBeneficiaryError('');
    setOtpSent(false);
    setOtpMessage('');
    setOtpError('');
    setTransferError('');
    setCompletedReceipt(null);
    setCardIntentData(null);
    setVerifyingCardPayment(false);
  };

  // View Receipt from History
  const handleViewHistoryReceipt = async (receiptNumber) => {
    try {
      const res = await transferAPI.getReceipt(receiptNumber);
      const receipt = res.data?.receipt || res.data;
      if (receipt) {
        setViewingReceipt(receipt);
      } else {
        setTransferError('Transaction receipt details could not be found.');
      }
    } catch (err) {
      console.error('Failed to fetch receipt:', err);
      setTransferError(getErrorMessage(err, 'Failed to fetch transaction receipt details.'));
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* ---------------- PAGE HEADER ---------------- */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8B5CF6', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            <ArrowLeftRight size={16} /> Inter-Branch Banking
          </div>
          <h1 style={{ fontSize: '28px', color: '#201530', margin: 0, fontWeight: 800 }}>
            Internal Money Transfers
          </h1>
          <p style={{ color: '#6E677B', fontSize: '14px', marginTop: '4px' }}>
            Instant, zero-fee atomic transfers between accounts across our Kochi, Trivandrum, and Kozhikode branches.
          </p>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', backgroundColor: '#EEE7F4', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('transfer')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: activeTab === 'transfer' ? '#5C187B' : 'transparent',
              color: activeTab === 'transfer' ? '#FFFFFF' : '#6E677B',
              transition: 'all 0.2s',
            }}
          >
            Send Money
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: activeTab === 'history' ? '#5C187B' : 'transparent',
              color: activeTab === 'history' ? '#FFFFFF' : '#6E677B',
              transition: 'all 0.2s',
            }}
          >
            Transfer History
          </button>
        </div>
      </div>

      {/* ---------------- THREE BRANCHES GRID BANNER ---------------- */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        padding: '20px 24px',
        border: '1px solid #E7E4DC',
        marginBottom: '28px',
        boxShadow: '0 2px 12px rgba(32, 21, 48, 0.04)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Landmark size={18} color="#5C187B" />
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#201530' }}>
              Connected Three-Branch Core Network
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#6E677B' }}>
            Real-time Atomic Settlement \u2022 Zero Transfer Charges
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {branches.map((b) => {
            const isUserBranch = (account?.branch || '').toLowerCase().includes(b.shortName.toLowerCase());
            return (
              <div
                key={b.code}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: isUserBranch ? '#FAF5FF' : '#FBFBFA',
                  border: `1.5px solid ${isUserBranch ? '#8B5CF6' : '#ECE8DF'}`,
                  position: 'relative',
                }}
              >
                {isUserBranch && (
                  <span style={{
                    position: 'absolute',
                    top: '-9px',
                    right: '12px',
                    backgroundColor: '#8B5CF6',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    textTransform: 'uppercase',
                  }}>
                    Your Home Branch
                  </span>
                )}
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#201530', marginBottom: '2px' }}>
                  {b.name}
                </div>
                <div style={{ fontSize: '11px', color: '#6E677B', display: 'flex', gap: '12px', marginTop: '4px' }}>
                  <span>IFSC: <strong style={{ color: '#201530' }}>{b.ifscCode}</strong></span>
                  <span>City: <strong style={{ color: '#201530' }}>{b.city}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- MPIN NOT SET ALERT ---------------- */}
      {!isMpinSet && (
        <div style={{
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <KeyRound size={22} color="#D97706" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#92400E' }}>
                Security MPIN Required for Transfers
              </div>
              <div style={{ fontSize: '12px', color: '#B45309' }}>
                You must set up your 4-6 digit Security MPIN to authorize any money transfers.
              </div>
            </div>
          </div>
          <button
            onClick={() => setMpinModalOpen(true)}
            className="btn-primary"
            style={{ backgroundColor: '#D97706', padding: '8px 16px', fontSize: '13px' }}
          >
            Generate MPIN Now
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: SEND MONEY FORM & RECEIPT */}
      {/* ========================================================================= */}
      {activeTab === 'transfer' && (
        <>
          {/* SUCCESS RECEIPT VIEW */}
          {completedReceipt ? (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              padding: '36px',
              border: '1px solid #E7E4DC',
              boxShadow: '0 8px 30px rgba(92, 24, 123, 0.08)',
              maxWidth: '680px',
              margin: '0 auto',
            }}>
              {/* Header Icon */}
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#E4F4DC',
                  color: '#2E7A22',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <CheckCircle2 size={36} />
                </div>
                <h2 style={{ fontSize: '24px', color: '#201530', margin: 0, fontWeight: 800 }}>
                  Transfer Successful!
                </h2>
                <p style={{ color: '#6E677B', fontSize: '14px', marginTop: '4px' }}>
                  Funds debited and credited atomically in real-time.
                </p>
              </div>

              {/* Amount Banner */}
              <div style={{
                backgroundColor: '#FAF5FF',
                border: '1px solid #E9DCF5',
                borderRadius: '14px',
                padding: '20px',
                textAlign: 'center',
                marginBottom: '24px',
              }}>
                <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Amount Transferred
                </span>
                <div style={{ fontSize: '36px', fontWeight: 800, color: '#5C187B', fontFamily: 'Outfit', margin: '4px 0' }}>
                  ₹{Number(completedReceipt.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#E4F4DC', color: '#2E7A22', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                  <ShieldCheck size={14} /> {completedReceipt.securityTier || 'MPIN Verified'}
                </div>
              </div>

              {/* Receipt Details Table */}
              <div style={{ borderTop: '1px solid #E7E4DC', paddingTop: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>Receipt Number</span>
                  <strong style={{ color: '#5C187B' }}>{completedReceipt.receiptNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>Payment Method</span>
                  <strong style={{ color: completedReceipt.paymentMethod === 'CARD' ? '#8B5CF6' : '#201530' }}>
                    {completedReceipt.paymentMethod === 'CARD'
                      ? completedReceipt.cardDetails?.last4
                        ? `Debit / Credit Card (Stripe •••• ${completedReceipt.cardDetails.last4})`
                        : 'Debit / Credit Card (Stripe)'
                      : 'Account Balance (Internal)'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>Transfer Type</span>
                  <strong style={{ color: '#201530' }}>
                    {completedReceipt.transferType === 'INTER_BRANCH' ? 'Inter-Branch Transfer' : 'Intra-Branch Transfer'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>From (Remitter)</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#201530' }}>{completedReceipt.sourceAccount?.customerName}</div>
                    <div style={{ fontSize: '11px', color: '#6E677B' }}>
                      A/C: {completedReceipt.sourceAccount?.accountNumber} ({completedReceipt.sourceAccount?.branch})
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>To (Beneficiary)</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#201530' }}>{completedReceipt.destinationAccount?.customerName}</div>
                    <div style={{ fontSize: '11px', color: '#6E677B' }}>
                      A/C: {completedReceipt.destinationAccount?.accountNumber} ({completedReceipt.destinationAccount?.branch})
                    </div>
                  </div>
                </div>
                {completedReceipt.previousBalance != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                    <span style={{ color: '#6E677B' }}>Previous Available Balance</span>
                    <span style={{ color: '#201530' }}>₹{Number(completedReceipt.previousBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>Debited from Sender</span>
                  <strong style={{ color: '#B91C1C' }}>-₹{Number(completedReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
                {completedReceipt.updatedBalance != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                    <span style={{ color: '#6E677B' }}>Updated Available Balance</span>
                    <strong style={{ color: '#5C187B' }}>₹{Number(completedReceipt.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                  <span style={{ color: '#6E677B' }}>Beneficiary Credited</span>
                  <strong style={{ color: '#2E7A22' }}>+₹{Number(completedReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
                {completedReceipt.cardDetails?.last4 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                    <span style={{ color: '#6E677B' }}>Stripe Authentication</span>
                    <span style={{ color: '#201530', fontWeight: 600 }}>
                      {completedReceipt.cardDetails.brand ? completedReceipt.cardDetails.brand.toUpperCase() : 'CARD'} •••• {completedReceipt.cardDetails.last4}
                    </span>
                  </div>
                )}
                {completedReceipt.remarks && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px', borderBottom: '1px solid #F5F4F0' }}>
                    <span style={{ color: '#6E677B' }}>Remarks</span>
                    <span style={{ color: '#201530' }}>{completedReceipt.remarks}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px' }}>
                  <span style={{ color: '#6E677B' }}>Date & Timestamp</span>
                  <span style={{ color: '#201530' }}>{new Date(completedReceipt.timestamp || Date.now()).toLocaleString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleDownloadPDF(completedReceipt.receiptNumber)}
                  disabled={downloadingPdf}
                  className="btn-primary"
                  style={{
                    flex: 1,
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    backgroundColor: '#5C187B',
                  }}
                >
                  <Download size={18} /> {downloadingPdf ? 'Downloading PDF...' : 'Download Official PDF Receipt'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="btn-secondary"
                  style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={18} /> Print
                </button>
                <button
                  onClick={handleResetForm}
                  className="btn-secondary"
                  style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <RotateCcw size={18} /> Make Another Transfer
                </button>
              </div>
            </div>
          ) : (
            /* TRANSFER FORM */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px' }}>
              {/* Left Column: Transfer Form */}
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '28px',
                border: '1px solid #E7E4DC',
                boxShadow: '0 2px 12px rgba(32, 21, 48, 0.04)',
              }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#201530', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowRight size={18} color="#5C187B" /> Transfer Money
                </h3>

                {verifyingCardPayment && (
                  <div style={{
                    padding: '24px',
                    borderRadius: '14px',
                    backgroundColor: '#FAF5FF',
                    border: '1.5px solid #8B5CF6',
                    textAlign: 'center',
                    marginBottom: '20px',
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: '#5C187B',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}>
                      <RotateCcw size={20} />
                    </div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#201530', margin: '0 0 6px' }}>
                      Verifying Payment with Stripe...
                    </h4>
                    <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
                      Card payment authorization received. Completing atomic settlement and crediting beneficiary account.
                    </p>
                  </div>
                )}

                {transferError && (
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#FADADA',
                    color: '#B23A2E',
                    fontSize: '13px',
                    fontWeight: 600,
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <AlertCircle size={18} /> {transferError}
                  </div>
                )}

                {isSuspended && (
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: '12px',
                      backgroundColor: '#FEF2F2',
                      border: '1.5px solid #FCA5A5',
                      color: '#991B1B',
                      fontSize: '13px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <AlertCircle size={22} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '15px', color: '#7F1D1D', marginBottom: '2px' }}>
                        Account temporarily suspended.
                      </div>
                      <div style={{ lineHeight: 1.45, color: '#991B1B' }}>
                        Transactions have been temporarily suspended following a reported transfer. For security reasons, you cannot send money or initiate transactions. Only an authorized bank worker can investigate and re-enable your account.
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmitTransfer}>
                  {/* From Account Summary */}
                  <div style={{
                    backgroundColor: '#FBFBFA',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    border: '1px solid #ECE8DF',
                    marginBottom: '20px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#6E677B', fontWeight: 600, textTransform: 'uppercase' }}>
                        From Account
                      </span>
                      <span style={{ fontSize: '12px', color: '#2E7A22', fontWeight: 700 }}>
                        Active • Verified KYC
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div>
                        <strong style={{ fontSize: '14px', color: '#201530' }}>
                          {account?.accountNumber || 'Primary Account'}
                        </strong>
                        <span style={{ fontSize: '12px', color: '#6E677B', marginLeft: '6px' }}>
                          ({account?.branch || 'Kochi Main Branch'})
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '11px', color: '#6E677B', display: 'block' }}>Available Balance</span>
                        <strong style={{ fontSize: '15px', color: '#5C187B' }}>
                          ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Payment Method: Customer-to-Customer via Stripe only */}
                  <div style={{ marginBottom: '20px' }}>
                    <label className="form-label" style={{ marginBottom: '8px' }}>
                      Transfer Payment Rail <span style={{ color: '#B23A2E' }}>*</span>
                    </label>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '2px solid #5C187B',
                        backgroundColor: '#FAF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: '#5C187B',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <CreditCard size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: '#201530' }}>Stripe Customer-to-Customer Transfer</strong>
                            <span style={{
                              backgroundColor: '#059669',
                              color: '#FFFFFF',
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '6px',
                              textTransform: 'uppercase',
                            }}>
                              Stripe Only
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#6E677B', marginTop: '2px' }}>
                            Instant inter-branch atomic settlement authenticated via Stripe 3D Secure, MPIN & OTP.
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#5C187B', fontWeight: 700 }}>
                        <ShieldCheck size={16} /> 256-bit Encrypted
                      </div>
                    </div>
                  </div>

                  {/* Beneficiary Account Number Input */}
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">
                      Beneficiary Account Number <span style={{ color: '#B23A2E' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 5010010020 or 102997375"
                        value={destinationAccountNumber}
                        onChange={(e) => {
                          setDestinationAccountNumber(e.target.value);
                          if (beneficiaryInfo) setBeneficiaryInfo(null);
                        }}
                        style={{ flex: 1 }}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleValidateBeneficiary}
                        disabled={validatingBeneficiary || !destinationAccountNumber}
                        className="btn-secondary"
                        style={{
                          whiteSpace: 'nowrap',
                          padding: '0 16px',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Search size={15} /> {validatingBeneficiary ? 'Checking...' : 'Validate'}
                      </button>
                    </div>

                    {beneficiaryError && (
                      <div style={{ color: '#B23A2E', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                        ⚠️ {beneficiaryError}
                      </div>
                    )}

                    {/* Beneficiary Verified Preview Card */}
                    {beneficiaryInfo && (
                      <div style={{
                        marginTop: '12px',
                        backgroundColor: '#F3EEF9',
                        borderRadius: '10px',
                        border: '1px solid #8B5CF6',
                        padding: '12px 16px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#5C187B' }}>
                            ✓ {beneficiaryInfo.beneficiary.name}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: beneficiaryInfo.isSameBranch ? '#E4F4DC' : '#E0F2FE',
                            color: beneficiaryInfo.isSameBranch ? '#2E7A22' : '#0369A1',
                            textTransform: 'uppercase',
                          }}>
                            {beneficiaryInfo.transferType === 'INTER_BRANCH' ? 'Inter-Branch' : 'Intra-Branch'}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#4A4453', marginTop: '4px' }}>
                          Branch: <strong>{beneficiaryInfo.beneficiary.branch}</strong> ({beneficiaryInfo.beneficiary.ifscCode})
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Transfer Amount Input */}
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">
                      Transfer Amount (₹) <span style={{ color: '#B23A2E' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute',
                        left: '14px',
                        top: '12px',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#6E677B',
                      }}>
                        ₹
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="1"
                        max="200000"
                        className="form-input"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setOtpSent(false); // Reset OTP if amount changes
                        }}
                        style={{ paddingLeft: '32px', fontSize: '18px', fontWeight: 700 }}
                        required
                      />
                    </div>

                    {/* Quick Amount Pills */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                      {[500, 1000, 2000, 5000, 10000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setAmount(String(amt));
                            setOtpSent(false);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid #E7E4DC',
                            backgroundColor: Number(amount) === amt ? '#EEE7F4' : '#FFFFFF',
                            color: Number(amount) === amt ? '#5C187B' : '#4A4453',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          +₹{amt.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>

                    {numericAmount > currentBalance && (
                      <div style={{ color: '#B23A2E', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                        ⚠️ Entered amount exceeds your available balance of ₹{currentBalance.toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Remarks Input */}
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">Transfer Remarks (Optional)</label>
                    <input
                      type="text"
                      maxLength={150}
                      className="form-input"
                      placeholder="e.g. Rent, Office bills, Family support"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                    />
                  </div>

                  {/* SECURITY & AUTHORIZATION SECTION */}
                  <div style={{
                    borderRadius: '12px',
                    padding: '14px 16px',
                    marginBottom: '20px',
                    backgroundColor: isHighValue ? '#FEF3C7' : '#F3EEF9',
                    border: `1.5px solid ${isHighValue ? '#F59E0B' : '#8B5CF6'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', color: isHighValue ? '#92400E' : '#5C187B' }}>
                      {isHighValue ? <ShieldCheck size={18} /> : <KeyRound size={18} />}
                      {isHighValue ? 'Dual-Factor Authorization (Tier 2: > ₹2,000)' : 'Security MPIN Authorization (Tier 1: ≤ ₹2,000)'}
                    </div>
                    <div style={{ fontSize: '12px', color: isHighValue ? '#78350F' : '#4A4453', marginTop: '4px' }}>
                      {isHighValue
                        ? 'Because this transfer exceeds ₹2,000, bank protocol requires both your 6-digit email OTP and Security MPIN before Stripe payment.'
                        : 'Transfers of ₹2,000 or less are authorized with your 4-6 digit Security MPIN.'}
                    </div>
                  </div>

                  {/* HIGH VALUE: 6-DIGIT EMAIL OTP INPUT SECTION */}
                  {isHighValue && (
                    <div style={{
                      backgroundColor: '#FAF5FF',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '1px solid #D8B4FE',
                      marginBottom: '20px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <label className="form-label" style={{ color: '#5C187B', margin: 0, fontWeight: 700 }}>
                          Step 1: Enter 6-Digit Email OTP <span style={{ color: '#B23A2E' }}>*</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleRequestOTP}
                          disabled={sendingOtp || otpCountdown > 0}
                          className="btn-secondary"
                          style={{
                            padding: '4px 12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#5C187B',
                          }}
                        >
                          {sendingOtp
                            ? 'Sending...'
                            : otpCountdown > 0
                            ? `Resend in ${otpCountdown}s`
                            : otpSent
                            ? 'Resend OTP'
                            : 'Send Transfer OTP'}
                        </button>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          maxLength={6}
                          className="form-input"
                          placeholder="Enter 6-digit OTP code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          required={isHighValue}
                          style={{ letterSpacing: '4px', fontSize: '16px', fontWeight: 700 }}
                        />
                        <Mail size={18} style={{ position: 'absolute', right: '12px', top: '12px', color: '#A19AA8' }} />
                      </div>

                      {otpMessage && (
                        <div style={{ color: '#2E7A22', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                          ✓ {otpMessage}
                        </div>
                      )}
                      {otpError && (
                        <div style={{ color: '#B23A2E', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                          ⚠️ {otpError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MPIN INPUT SECTION (Mandatory for all amounts) */}
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ margin: 0 }}>
                        {isHighValue ? 'Step 2: Enter Security MPIN' : 'Enter Security MPIN'} <span style={{ color: '#B23A2E' }}>*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setMpinModalOpen(true)}
                        style={{ background: 'none', border: 'none', color: '#8B5CF6', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {isMpinSet ? 'Forgot MPIN?' : 'Set MPIN'}
                      </button>
                    </div>

                    <div style={{ position: 'relative' }}>
                      <input
                        type={showMpin ? 'text' : 'password'}
                        maxLength={6}
                        className="form-input"
                        placeholder="Enter 4-6 digit MPIN"
                        value={mpin}
                        onChange={(e) => setMpin(e.target.value)}
                        required
                        style={{ paddingRight: '40px', letterSpacing: showMpin ? '2px' : '4px', fontSize: '16px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowMpin(!showMpin)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '12px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#A19AA8',
                        }}
                      >
                        {showMpin ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      isSuspended ||
                      submitting ||
                      numericAmount <= 0 ||
                      numericAmount > currentBalance ||
                      !destinationAccountNumber ||
                      !beneficiaryInfo ||
                      !isMpinSet ||
                      !mpin ||
                      (isHighValue && !otp)
                    }
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '14px',
                      fontSize: '15px',
                      fontWeight: 700,
                      backgroundColor: isSuspended ? '#9CA3AF' : '#5C187B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      opacity: (isSuspended || submitting || numericAmount <= 0 || numericAmount > currentBalance || !destinationAccountNumber || !beneficiaryInfo || !isMpinSet || !mpin || (isHighValue && !otp)) ? 0.6 : 1,
                      cursor: (isSuspended || submitting || numericAmount <= 0 || numericAmount > currentBalance || !destinationAccountNumber || !beneficiaryInfo || !isMpinSet || !mpin || (isHighValue && !otp)) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSuspended ? (
                      'Account Temporarily Suspended'
                    ) : submitting ? (
                      'Opening Stripe Secure Payment...'
                    ) : (
                      <>
                        <CreditCard size={18} />
                        Pay & Transfer ₹{numericAmount > 0 ? numericAmount.toLocaleString('en-IN') : '0'} via Stripe
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column: Security Rules & Branch Network Cards */}
              <div>
                {/* How Inter-Branch Transfers Work */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '24px',
                  border: '1px solid #E7E4DC',
                  marginBottom: '20px',
                  boxShadow: '0 2px 12px rgba(32, 21, 48, 0.04)',
                }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#201530', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Info size={18} color="#5C187B" /> Transfer Rules & Limits
                  </h4>

                  <ul style={{ paddingLeft: '18px', color: '#4A4453', fontSize: '13px', lineHeight: 1.7, margin: 0 }}>
                    <li>
                      <strong>Transfers up to ₹2,000:</strong> Fast authorization using your 4-6 digit Security MPIN.
                    </li>
                    <li>
                      <strong>Transfers above ₹2,000:</strong> Enhanced dual-factor protection requiring both MPIN and a 6-digit email OTP.
                    </li>
                    <li>
                      <strong>Atomic Real-Time Settlement:</strong> Transfers between any of the 3 branches are settled immediately with ledger consistency.
                    </li>
                    <li>
                      <strong>Official Receipts:</strong> Every transfer generates a verifiable receipt and downloadable PDF statement.
                    </li>
                    <li>
                      <strong>Account Validation:</strong> Destination account and branch IFSC are verified before any money is moved.
                    </li>
                  </ul>
                </div>

                {/* Test Accounts Quick Reference */}
                <div style={{
                  backgroundColor: '#F8F7FA',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  border: '1px solid #E7E4DC',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#5C187B', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={16} /> Three-Branch Testing Directory
                  </div>
                  <p style={{ fontSize: '12px', color: '#6E677B', marginBottom: '12px' }}>
                    You can test transfers between these seeded branch accounts:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                    <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: '#FFFFFF', border: '1px solid #ECE8DF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Kochi Main Branch:</strong>
                        <div style={{ color: '#6E677B' }}>Account: 5010010006 (Ajith Kumar)</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationAccountNumber('5010010006');
                          setBeneficiaryInfo(null);
                        }}
                        style={{ fontSize: '11px', color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Copy
                      </button>
                    </div>

                    <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: '#FFFFFF', border: '1px solid #ECE8DF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Trivandrum Branch:</strong>
                        <div style={{ color: '#6E677B' }}>Account: 102997375 (Meera Nambiar)</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationAccountNumber('102997375');
                          setBeneficiaryInfo(null);
                        }}
                        style={{ fontSize: '11px', color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Copy
                      </button>
                    </div>

                    <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: '#FFFFFF', border: '1px solid #ECE8DF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>Kozhikode Branch:</strong>
                        <div style={{ color: '#6E677B' }}>Account: 5010010030 (Fahad Kabeer)</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationAccountNumber('5010010030');
                          setBeneficiaryInfo(null);
                        }}
                        style={{ fontSize: '11px', color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRANSFER HISTORY */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #E7E4DC',
          boxShadow: '0 2px 12px rgba(32, 21, 48, 0.04)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#201530', margin: 0 }}>
              Recent Internal Transfers
            </h3>
            <button
              onClick={fetchHistory}
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6E677B' }}>
              Loading transfers...
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#6E677B' }}>
              <ArrowLeftRight size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No transfer history recorded yet.</p>
              <button
                onClick={() => setActiveTab('transfer')}
                className="btn-primary"
                style={{ marginTop: '14px', padding: '8px 18px', fontSize: '13px' }}
              >
                Send Money Now
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E7E4DC', color: '#6E677B' }}>
                    <th style={{ padding: '12px 10px' }}>Receipt / Ref</th>
                    <th style={{ padding: '12px 10px' }}>Type</th>
                    <th style={{ padding: '12px 10px' }}>Method</th>
                    <th style={{ padding: '12px 10px' }}>Branch</th>
                    <th style={{ padding: '12px 10px' }}>Amount</th>
                    <th style={{ padding: '12px 10px' }}>Balance After</th>
                    <th style={{ padding: '12px 10px' }}>Status</th>
                    <th style={{ padding: '12px 10px' }}>Date</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx) => (
                    <tr key={tx.fullReceiptNumber || tx.transactionId} style={{ borderBottom: '1px solid #F5F4F0' }}>
                      <td style={{ padding: '12px 10px', fontWeight: 600, color: '#5C187B' }}>
                        {tx.receiptNumber}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: tx.type === 'credit' ? '#E4F4DC' : '#FAF5FF',
                          color: tx.type === 'credit' ? '#2E7A22' : '#5C187B',
                        }}>
                          {tx.type === 'credit' ? '+ CREDIT' : '- DEBIT'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: tx.paymentMethod === 'CARD' ? '#FAF5FF' : '#F5F4F0',
                          color: tx.paymentMethod === 'CARD' ? '#5C187B' : '#4A4453',
                          border: tx.paymentMethod === 'CARD' ? '1px solid #E9DCF5' : '1px solid #E7E4DC',
                        }}>
                          {tx.paymentMethod === 'CARD' ? <CreditCard size={11} /> : <Landmark size={11} />}
                          {tx.paymentMethod === 'CARD' ? 'Card (Stripe)' : 'Account'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', color: '#4A4453' }}>
                        {tx.branch || 'Branch'}
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 700, color: tx.type === 'credit' ? '#2E7A22' : '#B23A2E' }}>
                        {tx.type === 'credit' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 10px', color: '#201530' }}>
                        ₹{Number(tx.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          backgroundColor:
                            tx.status === 'completed'
                              ? '#E4F4DC'
                              : tx.status === 'failed'
                              ? '#FADADA'
                              : '#FFF7E6',
                          color:
                            tx.status === 'completed'
                              ? '#2E7A22'
                              : tx.status === 'failed'
                              ? '#B23A2E'
                              : '#7A5200',
                        }}>
                          {tx.status || 'completed'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', color: '#6E677B' }}>
                        {new Date(tx.timestamp).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleViewHistoryReceipt(tx.receiptNumber)}
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '11px' }}
                          >
                            Receipt
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(tx.receiptNumber)}
                            className="btn-secondary"
                            style={{ padding: '5px 8px', fontSize: '11px' }}
                            title="Download PDF"
                          >
                            <Download size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------- RECEIPT MODAL FOR HISTORY ---------------- */}
      {viewingReceipt && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#201530', margin: 0 }}>
                Transfer Receipt Details
              </h3>
              <button onClick={() => setViewingReceipt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: '#6E677B' }}>
                ✕
              </button>
            </div>

            <div style={{
              backgroundColor: '#FAF5FF',
              padding: '16px',
              borderRadius: '12px',
              textAlign: 'center',
              marginBottom: '20px',
            }}>
              <span style={{ fontSize: '12px', color: '#6E677B' }}>Amount</span>
              <div style={{ fontSize: '30px', fontWeight: 800, color: '#5C187B', fontFamily: 'Outfit' }}>
                ₹{Number(viewingReceipt.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '11px', color: '#2E7A22', fontWeight: 700, marginTop: '2px' }}>
                {viewingReceipt.securityTier || 'MPIN Verified'}
              </div>
            </div>

            <div style={{ fontSize: '13px', lineHeight: 1.8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Receipt Number</span>
                <strong style={{ color: '#5C187B' }}>{viewingReceipt.receiptNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Payment Method</span>
                <strong style={{ color: viewingReceipt.paymentMethod === 'CARD' ? '#8B5CF6' : '#201530' }}>
                  {viewingReceipt.paymentMethod === 'CARD'
                    ? viewingReceipt.cardDetails?.last4
                      ? `Debit / Credit Card (Stripe •••• ${viewingReceipt.cardDetails.last4})`
                      : 'Debit / Credit Card (Stripe)'
                    : 'Account Balance (Internal)'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Status</span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor:
                    viewingReceipt.status === 'completed'
                      ? '#E4F4DC'
                      : viewingReceipt.status === 'failed'
                      ? '#FADADA'
                      : '#FFF7E6',
                  color:
                    viewingReceipt.status === 'completed'
                      ? '#2E7A22'
                      : viewingReceipt.status === 'failed'
                      ? '#B23A2E'
                      : '#7A5200',
                }}>
                  {viewingReceipt.status || 'completed'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Transfer Mode</span>
                <span>{viewingReceipt.transferType === 'INTER_BRANCH' ? 'Inter-Branch Transfer' : 'Intra-Branch'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Remitter</span>
                <span>{viewingReceipt.sourceAccount?.customerName} ({viewingReceipt.sourceAccount?.branch})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Beneficiary</span>
                <span>{viewingReceipt.destinationAccount?.customerName} ({viewingReceipt.destinationAccount?.branch})</span>
              </div>
              {viewingReceipt.previousBalance != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                  <span style={{ color: '#6E677B' }}>Previous Available Balance</span>
                  <span>₹{Number(viewingReceipt.previousBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Debited from Sender</span>
                <strong style={{ color: '#B91C1C' }}>-₹{Number(viewingReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </div>
              {viewingReceipt.updatedBalance != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                  <span style={{ color: '#6E677B' }}>Updated Available Balance</span>
                  <strong style={{ color: '#5C187B' }}>₹{Number(viewingReceipt.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Beneficiary Credited</span>
                <strong style={{ color: '#2E7A22' }}>+₹{Number(viewingReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </div>
              {viewingReceipt.cardDetails?.last4 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F4F0', padding: '6px 0' }}>
                  <span style={{ color: '#6E677B' }}>Stripe Authentication</span>
                  <span style={{ color: '#201530', fontWeight: 600 }}>
                    {viewingReceipt.cardDetails.brand ? viewingReceipt.cardDetails.brand.toUpperCase() : 'CARD'} •••• {viewingReceipt.cardDetails.last4}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: '#6E677B' }}>Date</span>
                <span>{new Date(viewingReceipt.timestamp).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                onClick={() => handleDownloadPDF(viewingReceipt.receiptNumber)}
                className="btn-primary"
                style={{ flex: 1, padding: '10px', fontSize: '13px', backgroundColor: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Download size={16} /> Download PDF
              </button>
              <button
                onClick={() => window.print()}
                className="btn-secondary"
                style={{ padding: '10px 16px', fontSize: '13px' }}
              >
                Print
              </button>
              <button
                onClick={() => setViewingReceipt(null)}
                className="btn-secondary"
                style={{ padding: '10px 16px', fontSize: '13px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stripe Card Modal */}
      <StripeCardModal
        isOpen={cardModalOpen}
        onClose={handleCardClose}
        clientSecret={cardIntentData?.clientSecret}
        amount={cardIntentData?.amount}
        title={`Card Transfer to ${beneficiaryInfo?.beneficiary?.name || 'Beneficiary'}`}
        onSuccess={handleCardSuccess}
      />

      {/* MPIN Modal */}
      <MpinModal
        isOpen={mpinModalOpen}
        onClose={() => setMpinModalOpen(false)}
        onSuccess={() => refreshProfile()}
      />
    </div>
  );
};

export default TransferPage;
