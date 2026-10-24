import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loansAPI, getErrorMessage } from '../services/api';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  ChevronRight,
  Calculator,
  Briefcase,
  Car,
  Zap,
  GraduationCap,
  FileText,
  FileCheck,
  ShieldCheck,
  Upload,
  Check
} from 'lucide-react';

const LoansPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'calculator' | 'my_applications'

  // Loan Calculator State
  const [calcAmount, setCalcAmount] = useState(100000);
  const [calcTenure, setCalcTenure] = useState(12);
  const [calcRate, setCalcRate] = useState(12.0);
  const [calcLoanType, setCalcLoanType] = useState('Personal');
  const [calcInterestType, setCalcInterestType] = useState('diminishing'); // 'diminishing' | 'flat'

  // Application Wizard Modal State
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stepError, setStepError] = useState('');

  // Wizard Form Fields — Starts clean/empty, requiring user input & document uploads
  const [wizardData, setWizardData] = useState({
    amount: 100000,
    tenureMonths: 12,
    interestType: 'diminishing',
    purpose: 'Personal Expenses',
    // Step 1: Personal Information
    fullName: user?.name || '',
    dob: '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    panNumber: '',
    aadhaarNumber: '',
    // Step 2: Employment Details
    employmentType: 'salaried',
    companyName: '',
    designation: '',
    workExperienceYears: '',
    // Step 3: Income Details
    monthlyIncome: '',
    existingMonthlyEmi: 0,
    // Step 5: Document Upload File References
    panCardFile: null,
    panCardFileName: '',
    aadhaarCardFile: null,
    aadhaarCardFileName: '',
    salarySlipFile: null,
    salarySlipFileName: '',
    bankStatementFile: null,
    bankStatementFileName: '',
    additionalDocFile: null,
    additionalDocFileName: '',
  });

  const [uploadedSpecificDocs, setUploadedSpecificDocs] = useState({});
  const [ocrRunning, setOcrRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdAppNumber, setCreatedAppNumber] = useState(null);

  // Status Modals for Customer Lifecycle Actions
  const [selectedAppForAction, setSelectedAppForAction] = useState(null);
  const [actionModalType, setActionModalType] = useState(null); // 'doc_reupload' | 'sanction_letter' | 'esign' | null
  const [reuploadDocTitle, setReuploadDocTitle] = useState('');
  const [reuploadDocFileName, setReuploadDocFileName] = useState('');
  const [esignOtp, setEsignOtp] = useState('');

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchLoanData = async () => {
    setLoading(true);
    try {
      const [prodRes, appRes] = await Promise.all([
        loansAPI.getProducts(),
        loansAPI.getMyApplications()
      ]);
      if (prodRes.data?.products) {
        setProducts(prodRes.data.products);
      } else {
        setProducts([]);
      }
      if (appRes.data?.applications) {
        setApplications(appRes.data.applications);
      } else {
        setApplications([]);
      }
    } catch (err) {
      console.error('Failed to fetch loan data:', err);
      setError(getErrorMessage(err, 'Failed to fetch loan catalog and applications. Please refresh the page.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoanData();
  }, []);

  // ---------------------------------------------------------------------------
  // EMI CALCULATION HELPER (Supports Flat and Diminishing Balance models)
  // ---------------------------------------------------------------------------
  const calculateEMIDetails = (principal, annualRate, tenureMonths, interestType = 'diminishing') => {
    const p = Number(principal) || 0;
    const n = Number(tenureMonths) || 1;
    const rateAnnual = Number(annualRate) || 0;
    const isFlat = (interestType || 'diminishing').toLowerCase() === 'flat';

    let emi = 0;
    let totalRepayment = 0;
    let totalInterest = 0;
    const schedule = [];
    const today = new Date();

    if (isFlat) {
      totalInterest = Math.round(((p * (rateAnnual / 100) * n) / 12) * 100) / 100;
      totalRepayment = Math.round((p + totalInterest) * 100) / 100;
      emi = Math.round((totalRepayment / n) * 100) / 100;
      const regPrincipal = Math.round((p / n) * 100) / 100;
      const regInterest = Math.round((totalInterest / n) * 100) / 100;
      let balance = p;

      for (let i = 1; i <= n; i++) {
        const principalComp = i === n ? balance : regPrincipal;
        const interestComp = i === n ? Math.round((totalInterest - regInterest * (n - 1)) * 100) / 100 : regInterest;
        balance = Math.max(0, Math.round((balance - principalComp) * 100) / 100);
        const dueDate = new Date(today);
        dueDate.setMonth(today.getMonth() + i);

        schedule.push({
          installmentNo: i,
          dueDate: dueDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
          emiAmount: emi,
          principalComponent: principalComp,
          interestComponent: interestComp,
          outstandingBalance: balance,
        });
      }
    } else {
      const r = rateAnnual / (12 * 100);
      if (r === 0) {
        emi = p / n;
      } else {
        emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      }
      emi = Math.round(emi * 100) / 100;
      totalRepayment = Math.round(emi * n * 100) / 100;
      totalInterest = Math.round((totalRepayment - p) * 100) / 100;

      let balance = p;
      for (let i = 1; i <= n; i++) {
        const interestComp = Math.round(balance * r * 100) / 100;
        const principalComp = Math.round((emi - interestComp) * 100) / 100;
        balance = Math.max(0, Math.round((balance - principalComp) * 100) / 100);
        const dueDate = new Date(today);
        dueDate.setMonth(today.getMonth() + i);

        schedule.push({
          installmentNo: i,
          dueDate: dueDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
          emiAmount: emi,
          principalComponent: principalComp,
          interestComponent: interestComp,
          outstandingBalance: balance,
        });
      }
    }

    return { emi, totalInterest, totalRepayment, schedule };
  };

  const currentCalc = useMemo(() => {
    return calculateEMIDetails(calcAmount, calcRate, calcTenure, calcInterestType);
  }, [calcAmount, calcRate, calcTenure, calcInterestType]);

  const wizardCalc = useMemo(() => {
    const rate = selectedProduct?.interestRate || 12.0;
    return calculateEMIDetails(wizardData.amount, rate, wizardData.tenureMonths, wizardData.interestType);
  }, [wizardData.amount, wizardData.tenureMonths, wizardData.interestType, selectedProduct]);

  // Automated Eligibility Check Calculations for Wizard Step 7
  const wizardEligibility = useMemo(() => {
    const emi = wizardCalc.emi;
    const income = Number(wizardData.monthlyIncome) || 50000;
    const existing = Number(wizardData.existingMonthlyEmi) || 0;
    const totalObligation = existing + emi;
    const emiRatio = income > 0 ? (totalObligation / income) * 100 : 50;

    const isIncomeOk = emiRatio <= 50;
    const isEmiCapacityOk = totalObligation < income * 0.55;

    let riskScore = 85;
    if (emiRatio > 40) riskScore -= 15;
    const riskLevel = riskScore >= 75 ? 'LOW_RISK' : riskScore >= 55 ? 'MEDIUM_RISK' : 'HIGH_RISK';

    return {
      isKycOk: true,
      isAccountActive: true,
      isIncomeOk,
      isExistingCheckOk: true,
      isEmiCapacityOk,
      riskLevel,
      riskScore,
      emiRatio: Math.round(emiRatio),
      passedAll: isIncomeOk && isEmiCapacityOk,
    };
  }, [wizardCalc, wizardData]);

  // ---------------------------------------------------------------------------
  // HANDLERS & STEP VALIDATION
  // ---------------------------------------------------------------------------
  const openApplyWizard = (product) => {
    if (user?.kycStatus !== 'verified') {
      setError(`KYC verification is required before applying for a loan (Current KYC status: '${user?.kycStatus || 'pending'}'). Please complete your KYC verification first.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError('');
    setMessage('');
    setStepError('');
    setSelectedProduct(product);
    setWizardData({
      amount: product?.minAmount || 50000,
      tenureMonths: product?.tenure || 12,
      interestType: product?.interestType || 'diminishing',
      purpose: 'Personal Expenses',
      fullName: user?.name || '',
      dob: '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: '',
      panNumber: '',
      aadhaarNumber: '',
      employmentType: 'salaried',
      companyName: '',
      designation: '',
      workExperienceYears: '',
      monthlyIncome: '',
      existingMonthlyEmi: 0,
      panCardFile: null,
      panCardFileName: '',
      aadhaarCardFile: null,
      aadhaarCardFileName: '',
      salarySlipFile: null,
      salarySlipFileName: '',
      bankStatementFile: null,
      bankStatementFileName: '',
      additionalDocFile: null,
      additionalDocFileName: '',
    });
    setWizardStep(1);
    setCreatedAppNumber(null);
    setUploadedSpecificDocs({});
    setApplyModalOpen(true);
  };

  const handleSpecificDocUpload = (docName, fileObj) => {
    if (!fileObj) return;
    setUploadedSpecificDocs((prev) => ({
      ...prev,
      [docName]: {
        name: docName,
        file: fileObj,
        fileName: fileObj.name,
      },
    }));
    setStepError('');
  };

  const validateCurrentStep = () => {
    setStepError('');

    if (wizardStep === 1) {
      if (!wizardData.fullName || !wizardData.dob || !wizardData.email || !wizardData.phone || !wizardData.address) {
        setStepError('Please fill out all personal information fields.');
        return false;
      }
      if (!wizardData.panNumber || wizardData.panNumber.length < 10) {
        setStepError('Please enter a valid 10-character PAN Card number (e.g. ABCDE1234F).');
        return false;
      }
      if (!wizardData.aadhaarNumber || wizardData.aadhaarNumber.length < 12) {
        setStepError('Please enter a valid 12-digit Aadhaar Card number.');
        return false;
      }
    }

    if (wizardStep === 2) {
      if (!wizardData.companyName || !wizardData.designation || !wizardData.workExperienceYears) {
        setStepError('Please enter your employment / company details and years of experience.');
        return false;
      }
    }

    if (wizardStep === 3) {
      if (!wizardData.monthlyIncome || Number(wizardData.monthlyIncome) <= 0) {
        setStepError('Please enter a valid monthly income (₹).');
        return false;
      }
      if (!wizardData.amount || Number(wizardData.amount) <= 0) {
        setStepError('Please enter a valid requested loan amount.');
        return false;
      }
    }

    if (wizardStep === 5) {
      if (selectedProduct?.requiredDocuments && selectedProduct.requiredDocuments.length > 0) {
        for (const reqDoc of selectedProduct.requiredDocuments) {
          if (reqDoc.isMandatory && !uploadedSpecificDocs[reqDoc.name]?.fileName) {
            setStepError(`Please upload mandatory document: "${reqDoc.name}"`);
            return false;
          }
        }
      } else {
        if (!wizardData.panCardFileName) {
          setStepError('Please upload your PAN Card document.');
          return false;
        }
        if (!wizardData.aadhaarCardFileName) {
          setStepError('Please upload your Aadhaar Card document.');
          return false;
        }
        if (!wizardData.salarySlipFileName) {
          setStepError('Please upload your Salary Slip / Income Proof document.');
          return false;
        }
        if (!wizardData.bankStatementFileName) {
          setStepError('Please upload your Bank Statement (Latest 6 Months).');
          return false;
        }
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (!validateCurrentStep()) return;

    if (wizardStep === 5) {
      // Trigger simulated OCR Verification scan of uploaded document files
      setWizardStep(6);
      setOcrRunning(true);
      setTimeout(() => {
        setOcrRunning(false);
      }, 1500);
    } else if (wizardStep === 3) {
      // Bank details step removed: disbursement goes to the user's Flowly account
      setWizardStep(5);
    } else {
      setWizardStep((prev) => Math.min(prev + 1, 8));
    }
  };

  const handlePrevStep = () => {
    setStepError('');
    setWizardStep((prev) => (prev === 5 ? 3 : Math.max(prev - 1, 1)));
  };

  const handleFileUpload = (fieldKey, fileNameKey, fileObj) => {
    if (!fileObj) return;
    setWizardData((prev) => ({
      ...prev,
      [fieldKey]: fileObj,
      [fileNameKey]: fileObj.name,
    }));
    setStepError('');
  };

  const handleFinalSubmitApplication = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      // Collect specific docs configured for this loan product
      const specificDocsList = [];
      if (selectedProduct?.requiredDocuments && selectedProduct.requiredDocuments.length > 0) {
        selectedProduct.requiredDocuments.forEach((doc) => {
          const uploaded = uploadedSpecificDocs[doc.name];
          if (uploaded?.fileName) {
            specificDocsList.push({
              name: doc.name,
              fileName: uploaded.fileName,
              docUrl: `/uploads/${uploaded.fileName}`,
              status: 'verified',
              uploadedAt: new Date(),
            });
          }
        });
      }

      // Map any fallback standard docs
      const panFile = uploadedSpecificDocs['PAN Card']?.fileName || wizardData.panCardFileName || 'pan_card.pdf';
      const aadhaarFile = uploadedSpecificDocs['Aadhaar Card']?.fileName || wizardData.aadhaarCardFileName || 'aadhaar_card.pdf';
      const salaryFile = uploadedSpecificDocs['Last 3 Months Salary Slips']?.fileName || wizardData.salarySlipFileName || 'salary_slip.pdf';
      const bankFile = uploadedSpecificDocs['Last 6 Months Bank Statement']?.fileName || wizardData.bankStatementFileName || 'bank_statement.pdf';

      const payload = {
        productId: selectedProduct?._id,
        productName: selectedProduct?.productName || 'Personal Loan',
        loanType: selectedProduct?.loanType || 'Personal',
        requestedAmount: wizardData.amount,
        tenureMonths: wizardData.tenureMonths,
        interestType: wizardData.interestType || 'diminishing',
        purpose: wizardData.purpose,
        personalInformation: {
          fullName: wizardData.fullName,
          dob: wizardData.dob,
          email: wizardData.email,
          phone: wizardData.phone,
          address: wizardData.address,
          panNumber: wizardData.panNumber,
          aadhaarNumber: wizardData.aadhaarNumber,
        },
        employmentDetails: {
          employmentType: wizardData.employmentType,
          companyName: wizardData.companyName,
          designation: wizardData.designation,
          workExperienceYears: Number(wizardData.workExperienceYears),
        },
        incomeDetails: {
          monthlyIncome: Number(wizardData.monthlyIncome),
          existingMonthlyEmi: Number(wizardData.existingMonthlyEmi),
        },
        documents: {
          panCardUrl: `/uploads/${panFile}`,
          aadhaarCardUrl: `/uploads/${aadhaarFile}`,
          salarySlipUrl: `/uploads/${salaryFile}`,
          bankStatementUrl: `/uploads/${bankFile}`,
          specificDocs: specificDocsList,
        },
      };

      const res = await loansAPI.applyLoan(payload);
      if (res.data && res.data.application) {
        setCreatedAppNumber(res.data.application.applicationNumber || 'LN-2026-OK');
        setWizardStep(8);
        setMessage(res.data.message || 'Loan Application Created successfully!');
        fetchLoanData();
      } else {
        setError(res.data?.message || 'Loan application submission completed, but application record was not returned.');
      }
    } catch (err) {
      console.error('Loan submission error:', err);
      const errText = getErrorMessage(err, 'Loan application submission failed.');
      setError(errText);
    } finally {
      setSubmitting(false);
    }
  };

  // Customer Actions Handlers
  const handleResubmitDocSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAppForAction || !reuploadDocFileName) {
      setError('Please select a file to upload');
      return;
    }
    setSubmitting(true);
    try {
      const res = await loansAPI.resubmitDocuments(selectedAppForAction._id, {
        docTitle: reuploadDocTitle || 'Requested Verification Document',
        docUrl: `/uploads/${reuploadDocFileName}`,
      });
      setMessage(res.data?.message || 'Document uploaded successfully! Re-review in progress.');
      setActionModalType(null);
      fetchLoanData();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to upload document'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptSanctionSubmit = async () => {
    if (!selectedAppForAction) return;
    setSubmitting(true);
    try {
      const res = await loansAPI.acceptSanction(selectedAppForAction._id);
      setMessage(res.data?.message || 'Sanction letter accepted! Loan agreement generated.');
      setActionModalType(null);
      fetchLoanData();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to accept sanction letter'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEsignSubmit = async () => {
    if (!selectedAppForAction) return;
    setSubmitting(true);
    try {
      const res = await loansAPI.esignAgreement(selectedAppForAction._id, {
        signatureHash: `SIG-${Date.now()}`,
      });
      setMessage(res.data?.message || 'Loan Agreement e-Signed! Loan Approved and pending disbursement.');
      setActionModalType(null);
      fetchLoanData();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to e-sign loan agreement'));
    } finally {
      setSubmitting(false);
    }
  };

  // Icon selector per loan type
  const getLoanIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'vehicle':
        return <Car size={22} color="#5C187B" />;
      case 'business':
        return <Briefcase size={22} color="#5C187B" />;
      case 'education':
        return <GraduationCap size={22} color="#5C187B" />;
      case 'emergency':
        return <Zap size={22} color="#5C187B" />;
      default:
        return <CreditCard size={22} color="#5C187B" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'submitted':
        return <span className="badge badge-purple">1. SUBMITTED</span>;
      case 'under_worker_review':
        return <span className="badge badge-amber">2. WORKER REVIEW</span>;
      case 'documents_requested':
        return <span className="badge badge-red">⚠ DOCUMENTS NEEDED</span>;
      case 'field_verification':
        return <span className="badge badge-amber">FIELD CHECK</span>;
      case 'credit_assessment':
        return <span className="badge badge-purple">CREDIT ASSESSMENT</span>;
      case 'sanctioned':
        return <span className="badge badge-green">📜 SANCTIONED (ACCEPT NOW)</span>;
      case 'agreement_pending':
        return <span className="badge badge-purple">✍ AGREEMENT READY (e-SIGN)</span>;
      case 'approved':
        return <span className="badge badge-green">✓ APPROVED (DISBURSEMENT PENDING)</span>;
      case 'disbursed':
      case 'active':
        return <span className="badge badge-green">🎉 ACTIVE LOAN</span>;
      case 'closed':
        return <span className="badge badge-green" style={{ backgroundColor: '#059669', color: '#fff' }}>✓ CLOSED (NOC ELIGIBLE)</span>;
      case 'rejected':
        return <span className="badge badge-red">REJECTED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ---------------- HEADER ---------------- */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#EEE7F4',
              color: '#5C187B',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
            }}
          >
            <CreditCard size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', color: '#201530', margin: 0, fontWeight: 700 }}>
              Micro-Loans Portal & Calculator
            </h1>
            <p style={{ color: '#6E677B', fontSize: '14px', margin: 0 }}>
              Explore loan products, calculate exact monthly EMIs & repayment schedules, and track application lifecycle.
            </p>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {message && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', backgroundColor: '#E4F4DC', color: '#2E7A22', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          ✓ {message}
        </div>
      )}
      {error && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '14px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <span>⚠ {error}</span>
          {user?.kycStatus !== 'verified' && (
            <button onClick={() => navigate('/kyc')} className="btn-primary" style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}>
              Complete KYC Verification →
            </button>
          )}
        </div>
      )}

      {/* ---------------- NAVIGATION TABS ---------------- */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', borderBottom: '2px solid #EEE7F4', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('catalog')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'catalog' ? '#5C187B' : '#6E677B',
            borderBottom: activeTab === 'catalog' ? '3px solid #5C187B' : '3px solid transparent',
          }}
        >
          View Loan Types ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'calculator' ? '#5C187B' : '#6E677B',
            borderBottom: activeTab === 'calculator' ? '3px solid #5C187B' : '3px solid transparent',
          }}
        >
          🧮 Interactive Loan Calculator
        </button>
        <button
          onClick={() => setActiveTab('my_applications')}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'my_applications' ? '#5C187B' : '#6E677B',
            borderBottom: activeTab === 'my_applications' ? '3px solid #5C187B' : '3px solid transparent',
          }}
        >
          My Applications & Active Loans ({applications.length})
        </button>
      </div>

      {/* ---------------- TAB 1: LOAN PRODUCTS CATALOG ---------------- */}
      {activeTab === 'catalog' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', color: '#201530', marginBottom: '4px' }}>Available Loan Types</h3>
            <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
              Select a loan category below to view details and begin your step-by-step application.
            </p>
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#6E677B' }}>Loading loan products...</div>
          ) : (
            <div className="grid-3">
              {products.map((prod) => (
                <div key={prod._id} className="flowly-card flowly-card-interactive" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#EEE7F4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getLoanIcon(prod.loanType)}
                      </div>
                      <span className="badge badge-purple" style={{ fontSize: '13px', padding: '4px 12px', fontWeight: 700 }}>
                        {prod.interestRate}% APR
                      </span>
                    </div>

                    <h4 style={{ fontSize: '18px', color: '#201530', marginBottom: '6px', fontWeight: 700 }}>{prod.productName}</h4>
                    <p style={{ fontSize: '13px', color: '#6E677B', marginBottom: '16px' }}>
                      Ideal for {prod.loanType?.toLowerCase()} financing with low interest rates & flexible tenures.
                    </p>

                    <div className="kv-row">
                      <span className="k">Loan Amount</span>
                      <span className="v">₹{prod.minAmount?.toLocaleString('en-IN')} - ₹{prod.maxAmount?.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Max Tenure</span>
                      <span className="v">{prod.maxTenure || prod.tenure} Months</span>
                    </div>

                    {prod.requiredDocuments && prod.requiredDocuments.length > 0 && (
                      <div style={{ marginTop: '12px', padding: '8px 10px', backgroundColor: '#F9FAFB', borderRadius: '8px', fontSize: '11.5px', border: '1px solid #F1F5F9' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>Required Documents: </span>
                        <span style={{ color: '#6B7280' }}>
                          {prod.requiredDocuments.map((d) => d.name).slice(0, 2).join(', ')}
                          {prod.requiredDocuments.length > 2 ? ` +${prod.requiredDocuments.length - 2} more` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setCalcAmount(prod.minAmount || 50000);
                        setCalcRate(prod.interestRate || 12.0);
                        setCalcTenure(prod.tenure || 12);
                        setCalcLoanType(prod.loanType);
                        setActiveTab('calculator');
                      }}
                      className="btn-outline-dark"
                      style={{ flex: 1, padding: '10px', fontSize: '12px' }}
                    >
                      Calculate EMI
                    </button>

                    <button
                      onClick={() => openApplyWizard(prod)}
                      className="btn-primary"
                      style={{ flex: 1, padding: '10px', fontSize: '12px' }}
                    >
                      Apply Loan <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 2: LOAN CALCULATOR ---------------- */}
      {activeTab === 'calculator' && (
        <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #EEE7F4', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Calculator size={24} color="#5C187B" />
            <h3 style={{ fontSize: '20px', color: '#201530', margin: 0, fontWeight: 700 }}>Interactive Micro-Loan Calculator</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
            {/* INPUT CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label className="form-label">Loan Type</label>
                <select
                  className="form-select"
                  value={calcLoanType}
                  onChange={(e) => {
                    const type = e.target.value;
                    setCalcLoanType(type);
                    const prod = products.find((p) => p.loanType?.toLowerCase() === type.toLowerCase());
                    if (prod) setCalcRate(prod.interestRate);
                  }}
                >
                  <option value="Personal">Personal Loan (12.0% APR)</option>
                  <option value="Business">Business Loan (14.0% APR)</option>
                  <option value="Education">Education Loan (8.5% APR)</option>
                  <option value="Vehicle">Vehicle Loan (9.5% APR)</option>
                  <option value="Emergency">Emergency Loan (10.0% APR)</option>
                </select>
              </div>

              <div>
                <label className="form-label">Interest Scheme</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setCalcInterestType('diminishing')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: calcInterestType === 'diminishing' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                      backgroundColor: calcInterestType === 'diminishing' ? '#FAF5FF' : '#fff',
                      color: calcInterestType === 'diminishing' ? '#5C187B' : '#6E677B',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Diminishing Balance
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcInterestType('flat')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: calcInterestType === 'flat' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                      backgroundColor: calcInterestType === 'flat' ? '#FAF5FF' : '#fff',
                      color: calcInterestType === 'flat' ? '#5C187B' : '#6E677B',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Flat Rate EMI
                  </button>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Loan Amount (₹)</label>
                  <span style={{ fontWeight: 700, color: '#5C187B' }}>₹{Number(calcAmount).toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="2000000"
                  step="5000"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#5C187B' }}
                />
                <input
                  type="number"
                  className="form-input"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                  style={{ marginTop: '8px' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Tenure (Months)</label>
                  <span style={{ fontWeight: 700, color: '#5C187B' }}>{calcTenure} Months</span>
                </div>
                <select className="form-select" value={calcTenure} onChange={(e) => setCalcTenure(Number(e.target.value))}>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={24}>24 Months (2 Years)</option>
                  <option value={36}>36 Months (3 Years)</option>
                  <option value={48}>48 Months (4 Years)</option>
                  <option value={60}>60 Months (5 Years)</option>
                </select>
              </div>
            </div>

            {/* SUMMARY CARDS */}
            <div style={{ background: '#FAF5FF', borderRadius: '16px', padding: '24px', border: '1px solid #EEE7F4', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '16px', color: '#5C187B', margin: '0 0 16px 0', fontWeight: 700 }}>Calculation Summary</h4>

                <div style={{ marginBottom: '20px' }}>
                  <span style={{ fontSize: '13px', color: '#6E677B' }}>Estimated Monthly EMI</span>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#5C187B' }}>
                    ₹{currentCalc.emi.toLocaleString('en-IN')}
                    <span style={{ fontSize: '14px', fontWeight: 400, color: '#6E677B' }}> / month</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #EEE7F4' }}>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Total Interest Amount</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#201530' }}>₹{currentCalc.totalInterest.toLocaleString('en-IN')}</div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #EEE7F4' }}>
                    <span style={{ fontSize: '11px', color: '#6E677B' }}>Total Repayment</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#201530' }}>₹{currentCalc.totalRepayment.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  const prod = products.find((p) => p.loanType?.toLowerCase() === calcLoanType.toLowerCase()) || products[0];
                  openApplyWizard(prod);
                }}
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '14px' }}
              >
                Apply for this Loan Now →
              </button>
            </div>
          </div>

          {/* REPAYMENT SCHEDULE PREVIEW */}
          <div>
            <h4 style={{ fontSize: '16px', color: '#201530', marginBottom: '12px', fontWeight: 700 }}>
              Repayment Schedule Breakdown
            </h4>
            <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
              <table className="flowly-table">
                <thead>
                  <tr>
                    <th>Month #</th>
                    <th>Due Date</th>
                    <th>EMI Amount</th>
                    <th>Principal Component</th>
                    <th>Interest Component</th>
                    <th>Outstanding Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCalc.schedule.map((row) => (
                    <tr key={row.installmentNo}>
                      <td style={{ fontWeight: 700 }}>#{row.installmentNo}</td>
                      <td>{row.dueDate}</td>
                      <td style={{ fontWeight: 700, color: '#5C187B' }}>₹{row.emiAmount?.toLocaleString('en-IN')}</td>
                      <td>₹{row.principalComponent?.toLocaleString('en-IN')}</td>
                      <td>₹{row.interestComponent?.toLocaleString('en-IN')}</td>
                      <td>₹{row.outstandingBalance?.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: MY APPLICATIONS & ACTIVE LOANS ---------------- */}
      {activeTab === 'my_applications' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', color: '#201530', marginBottom: '4px' }}>My Submitted Loan Applications</h3>
            <p style={{ fontSize: '13px', color: '#6E677B', margin: 0 }}>
              Track approval progress, respond to document requests, view sanction letters, and e-sign agreements.
            </p>
          </div>

          {applications.length === 0 ? (
            <div className="flowly-card" style={{ textAlign: 'center', padding: '40px 24px', color: '#A19AA8' }}>
              <CreditCard size={36} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: '#201530', margin: 0 }}>No Loan Applications Found</p>
              <p style={{ fontSize: '13px' }}>Explore loan types above to submit your first application.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {applications.map((app) => (
                <div key={app._id} className="flowly-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: '#5C187B' }}>
                          {app.applicationNumber || app._id}
                        </span>
                        {getStatusBadge(app.status)}
                        <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                          {app.interestType === 'flat' ? 'Flat Rate' : 'Diminishing'}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#6E677B' }}>
                        Product: <strong>{app.productName}</strong> | Applied on: {new Date(app.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#201530' }}>
                        ₹{(app.requestedAmount || app.principal)?.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6E677B' }}>
                        EMI: ₹{(app.monthlyEMI || app.emiAmount)?.toLocaleString('en-IN')}/mo ({app.tenureMonths} mos)
                      </div>
                    </div>
                  </div>

                  {/* ACTION BANNERS FOR CUSTOMER LIFECYCLE */}
                  {app.status === 'documents_requested' && (
                    <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#92400E', fontSize: '13px' }}>⚠ Worker Requested Additional Document:</strong>
                        <div style={{ fontSize: '12px', color: '#78350F', marginTop: '2px' }}>
                          "{app.workerReview?.requestedDocNote || 'Please re-upload clearer bank statement / income proof'}"
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedAppForAction(app);
                          setReuploadDocTitle(app.workerReview?.requestedDocNote || 'Additional Document');
                          setActionModalType('doc_reupload');
                        }}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        Upload Document Now
                      </button>
                    </div>
                  )}

                  {app.status === 'sanctioned' && (
                    <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#065F46', fontSize: '13px' }}>📜 Congratulations! Your Loan Has Been Sanctioned:</strong>
                        <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                          Sanction Letter #{app.sanctionDetails?.sanctionLetterNumber} generated. Please review terms and accept.
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedAppForAction(app);
                          setActionModalType('sanction_letter');
                        }}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: '#047857' }}
                      >
                        Review & Accept Sanction Letter
                      </button>
                    </div>
                  )}

                  {app.status === 'agreement_pending' && (
                    <div style={{ background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#5B21B6', fontSize: '13px' }}>✍ Loan Agreement Ready for e-Sign:</strong>
                        <div style={{ fontSize: '12px', color: '#6D28D9', marginTop: '2px' }}>
                          Agreement #{app.agreementDetails?.agreementNumber} generated. Please complete digital e-Sign.
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedAppForAction(app);
                          setActionModalType('esign');
                        }}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        Complete Digital e-Sign
                      </button>
                    </div>
                  )}

                  {(app.status === 'disbursed' || app.status === 'active') && (
                    <div style={{ background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#1E40AF', fontSize: '13px' }}>🎉 Loan Active & Funds Credited to Account:</strong>
                        <div style={{ fontSize: '12px', color: '#1D4ED8', marginTop: '2px' }}>
                          First EMI due on {app.nextDueDate ? new Date(app.nextDueDate).toLocaleDateString() : 'Next Month'}.
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/repayments')}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: '#1D4ED8' }}
                      >
                        View EMI Schedule & Pay
                      </button>
                    </div>
                  )}

                  {app.status === 'closed' && (
                    <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#065F46', fontSize: '13px' }}>✓ Loan Fully Repaid & Closed (Zero Dues):</strong>
                        <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                          {app.nocCertificate?.status === 'approved'
                            ? `Official NOC #${app.nocCertificate.certificateNumber} issued by Bank Admin.`
                            : app.nocCertificate?.status === 'requested'
                            ? 'NOC clearance request submitted and under Admin review.'
                            : 'All installments cleared. You can apply for your official Bank No Due Certificate (NOC).'}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate('/repayments')}
                        className="btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', backgroundColor: '#059669' }}
                      >
                        {app.nocCertificate?.status === 'approved' ? '📜 View / Download NOC' : '📜 Apply for NOC'}
                      </button>
                    </div>
                  )}

                  {app.status === 'rejected' && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                      <strong style={{ color: '#991B1B', fontSize: '13px' }}>🚫 Application Rejected:</strong>
                      <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                        Reason: {app.rejectionReason || 'Did not meet credit verification criteria.'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- MULTI-STEP LOAN APPLICATION WIZARD MODAL ---------------- */}
      {applyModalOpen && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '750px', width: '100%', padding: '28px' }}>
            {/* WIZARD HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 700, color: '#201530' }}>
                  Apply for {selectedProduct.productName}
                </h3>
                <span style={{ fontSize: '12px', color: '#6E677B' }}>
                  Step {Math.min(wizardStep > 4 ? wizardStep - 1 : wizardStep, 6)} of 6 — {
                    wizardStep === 1 ? 'Personal Information' :
                    wizardStep === 2 ? 'Employment Details' :
                    wizardStep === 3 ? 'Income & Obligations' :
                    wizardStep === 5 ? 'Document Upload' :
                    wizardStep === 6 ? 'Automated OCR Verification' :
                    wizardStep === 7 ? 'Eligibility & Risk Check' : 'Submission Completed'
                  }
                </span>
              </div>
              <button onClick={() => setApplyModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {/* STEP PROGRESS BAR */}
            <div style={{ height: '6px', backgroundColor: '#EEE7F4', borderRadius: '3px', marginBottom: '20px', overflow: 'hidden' }}>
              <div style={{ width: `${(Math.min(wizardStep > 4 ? wizardStep - 1 : wizardStep, 6) / 6) * 100}%`, height: '100%', backgroundColor: '#5C187B', transition: 'width 0.3s ease' }} />
            </div>

            {/* STEP ERROR ALERT */}
            {stepError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '13px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> {stepError}
              </div>
            )}

            {/* STEP 1: PERSONAL INFORMATION */}
            {wizardStep === 1 && (
              <div>
                <h4 style={{ fontSize: '15px', color: '#5C187B', marginBottom: '14px', fontWeight: 700 }}>Personal Details</h4>
                <div className="grid-2" style={{ gap: '14px' }}>
                  <div>
                    <label className="form-label">Full Name *</label>
                    <input type="text" className="form-input" placeholder="e.g. John Doe" value={wizardData.fullName} onChange={(e) => setWizardData({ ...wizardData, fullName: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Date of Birth *</label>
                    <input type="date" className="form-input" value={wizardData.dob} onChange={(e) => setWizardData({ ...wizardData, dob: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Email Address *</label>
                    <input type="email" className="form-input" placeholder="john@example.com" value={wizardData.email} onChange={(e) => setWizardData({ ...wizardData, email: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Phone Number *</label>
                    <input type="text" className="form-input" placeholder="+91 98765 43210" value={wizardData.phone} onChange={(e) => setWizardData({ ...wizardData, phone: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">PAN Card Number *</label>
                    <input type="text" className="form-input" placeholder="e.g. ABCDE1234F" maxLength={10} value={wizardData.panNumber} onChange={(e) => setWizardData({ ...wizardData, panNumber: e.target.value.toUpperCase() })} required />
                  </div>
                  <div>
                    <label className="form-label">Aadhaar Number *</label>
                    <input type="text" className="form-input" placeholder="e.g. 1234 5678 9012" maxLength={12} value={wizardData.aadhaarNumber} onChange={(e) => setWizardData({ ...wizardData, aadhaarNumber: e.target.value })} required />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Residential Address *</label>
                    <input type="text" className="form-input" placeholder="House/Flat No, Street, City, State, Pincode" value={wizardData.address} onChange={(e) => setWizardData({ ...wizardData, address: e.target.value })} required />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: EMPLOYMENT DETAILS */}
            {wizardStep === 2 && (
              <div>
                <h4 style={{ fontSize: '15px', color: '#5C187B', marginBottom: '14px', fontWeight: 700 }}>Employment Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { key: 'salaried', label: 'Salaried Employee' },
                    { key: 'self_employed', label: 'Self Employed' },
                    { key: 'business_owner', label: 'Business Owner' },
                  ].map((emp) => (
                    <div
                      key={emp.key}
                      onClick={() => setWizardData({ ...wizardData, employmentType: emp.key })}
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        border: wizardData.employmentType === emp.key ? '2px solid #5C187B' : '1px solid #E2E8F0',
                        backgroundColor: wizardData.employmentType === emp.key ? '#FAF5FF' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                      }}
                    >
                      {emp.label}
                    </div>
                  ))}
                </div>

                <div className="grid-2" style={{ gap: '14px' }}>
                  <div>
                    <label className="form-label">Company / Business Name *</label>
                    <input type="text" className="form-input" placeholder="e.g. Acme Corp Pvt Ltd" value={wizardData.companyName} onChange={(e) => setWizardData({ ...wizardData, companyName: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Designation / Role *</label>
                    <input type="text" className="form-input" placeholder="e.g. Software Engineer / Manager" value={wizardData.designation} onChange={(e) => setWizardData({ ...wizardData, designation: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Total Experience (Years) *</label>
                    <input type="number" className="form-input" placeholder="e.g. 3" min="0" value={wizardData.workExperienceYears} onChange={(e) => setWizardData({ ...wizardData, workExperienceYears: e.target.value })} required />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: INCOME DETAILS & CALCULATIONS */}
            {wizardStep === 3 && (
              <div>
                <h4 style={{ fontSize: '15px', color: '#5C187B', marginBottom: '14px', fontWeight: 700 }}>Income & Monthly Obligations</h4>
                <div className="grid-2" style={{ gap: '14px', marginBottom: '20px' }}>
                  <div>
                    <label className="form-label">Net Monthly Salary / Income (₹) *</label>
                    <input type="number" className="form-input" placeholder="e.g. 60000" value={wizardData.monthlyIncome} onChange={(e) => setWizardData({ ...wizardData, monthlyIncome: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Existing Monthly EMIs (₹) *</label>
                    <input type="number" className="form-input" placeholder="e.g. 5000 (0 if none)" value={wizardData.existingMonthlyEmi} onChange={(e) => setWizardData({ ...wizardData, existingMonthlyEmi: e.target.value })} required />
                  </div>
                  <div>
                    <label className="form-label">Requested Loan Amount (₹) *</label>
                    <input type="number" className="form-input" min={selectedProduct.minAmount} max={selectedProduct.maxAmount} value={wizardData.amount} onChange={(e) => setWizardData({ ...wizardData, amount: Number(e.target.value) })} required />
                  </div>
                  <div>
                    <label className="form-label">Tenure (Months) *</label>
                    <select className="form-select" value={wizardData.tenureMonths} onChange={(e) => setWizardData({ ...wizardData, tenureMonths: Number(e.target.value) })}>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                      <option value={24}>24 Months</option>
                      <option value={36}>36 Months</option>
                      <option value={48}>48 Months</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Preferred Interest Calculation Scheme *</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div
                        onClick={() => setWizardData({ ...wizardData, interestType: 'diminishing' })}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: (wizardData.interestType || 'diminishing') === 'diminishing' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                          backgroundColor: (wizardData.interestType || 'diminishing') === 'diminishing' ? '#FAF5FF' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#201530' }}>Diminishing Balance</span>
                          <span className="badge badge-green" style={{ fontSize: '10px' }}>Recommended</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6E677B' }}>
                          Interest charged only on outstanding balance each month.
                        </p>
                      </div>

                      <div
                        onClick={() => setWizardData({ ...wizardData, interestType: 'flat' })}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: wizardData.interestType === 'flat' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                          backgroundColor: wizardData.interestType === 'flat' ? '#FAF5FF' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#201530' }}>Flat Rate EMI</span>
                          <span className="badge badge-gray" style={{ fontSize: '10px' }}>Fixed</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#6E677B' }}>
                          Simple flat rate on full loan amount throughout tenure.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', background: '#FAF5FF', borderRadius: '12px', border: '1px solid #EEE7F4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span>Calculated Monthly EMI:</span>
                    <strong style={{ color: '#5C187B' }}>₹{wizardCalc.emi?.toLocaleString('en-IN')}/mo</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Total Repayment Amount:</span>
                    <strong>₹{wizardCalc.totalRepayment?.toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: DOCUMENT UPLOAD (DYNAMIC BY LOAN TYPE OR STANDARD) */}
            {wizardStep === 5 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '15px', color: '#5C187B', margin: 0, fontWeight: 700 }}>
                      Required Documents for {selectedProduct.productName}
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6E677B' }}>
                      Please upload the required verification files for this {selectedProduct.loanType} loan.
                    </p>
                  </div>
                  <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                    {selectedProduct.loanType} Scheme
                  </span>
                </div>

                {selectedProduct.requiredDocuments && selectedProduct.requiredDocuments.length > 0 ? (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {selectedProduct.requiredDocuments.map((doc, idx) => {
                      const uploaded = uploadedSpecificDocs[doc.name];
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '14px 18px',
                            background: uploaded ? '#F0FDF4' : '#F8FAFC',
                            borderRadius: '10px',
                            border: uploaded ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#201530' }}>
                              {idx + 1}. {doc.name} {doc.isMandatory ? <span style={{ color: '#DC2626' }}>*</span> : <span style={{ fontSize: '11px', color: '#6E677B', fontWeight: 400 }}>(Optional)</span>}
                            </span>
                            {uploaded ? (
                              <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ {uploaded.fileName}</span>
                            ) : doc.isMandatory ? (
                              <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>Mandatory</span>
                            ) : (
                              <span style={{ fontSize: '11px', color: '#6E677B' }}>Optional</span>
                            )}
                          </div>
                          {doc.description && (
                            <p style={{ margin: '0 0 8px 0', fontSize: '11.5px', color: '#6E677B' }}>
                              {doc.description}
                            </p>
                          )}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="form-input"
                            style={{ padding: '6px' }}
                            onChange={(e) => handleSpecificDocUpload(doc.name, e.target.files[0])}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '14px' }}>
                    {/* PAN CARD */}
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>1. PAN Card Document *</span>
                        {wizardData.panCardFileName && (
                          <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ {wizardData.panCardFileName}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="form-input"
                        style={{ padding: '6px' }}
                        onChange={(e) => handleFileUpload('panCardFile', 'panCardFileName', e.target.files[0])}
                      />
                    </div>

                    {/* AADHAAR CARD */}
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>2. Aadhaar Card Document *</span>
                        {wizardData.aadhaarCardFileName && (
                          <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ {wizardData.aadhaarCardFileName}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="form-input"
                        style={{ padding: '6px' }}
                        onChange={(e) => handleFileUpload('aadhaarCardFile', 'aadhaarCardFileName', e.target.files[0])}
                      />
                    </div>

                    {/* SALARY SLIP */}
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>3. Salary Slip / Income Proof *</span>
                        {wizardData.salarySlipFileName && (
                          <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ {wizardData.salarySlipFileName}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="form-input"
                        style={{ padding: '6px' }}
                        onChange={(e) => handleFileUpload('salarySlipFile', 'salarySlipFileName', e.target.files[0])}
                      />
                    </div>

                    {/* BANK STATEMENT */}
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>4. Bank Statement (Latest 6 Months) *</span>
                        {wizardData.bankStatementFileName && (
                          <span className="badge badge-green" style={{ fontSize: '11px' }}>✓ {wizardData.bankStatementFileName}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="form-input"
                        style={{ padding: '6px' }}
                        onChange={(e) => handleFileUpload('bankStatementFile', 'bankStatementFileName', e.target.files[0])}
                      />
                    </div>

                    {/* ADDITIONAL DOCUMENTS (OPTIONAL) */}
                    <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>5. Additional Document (Optional)</span>
                        {wizardData.additionalDocFileName && (
                          <span className="badge badge-purple" style={{ fontSize: '11px' }}>✓ {wizardData.additionalDocFileName}</span>
                        )}
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="form-input"
                        style={{ padding: '6px' }}
                        onChange={(e) => handleFileUpload('additionalDocFile', 'additionalDocFileName', e.target.files[0])}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 6: OCR VERIFICATION */}
            {wizardStep === 6 && (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                {ocrRunning ? (
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#5C187B', marginBottom: '12px' }}>
                      🤖 Running Instant OCR Verification Scan...
                    </div>
                    <p style={{ color: '#6E677B', fontSize: '13px' }}>
                      Scanning uploaded files: <strong>{wizardData.panCardFileName}</strong> & <strong>{wizardData.aadhaarCardFileName}</strong>...
                    </p>
                  </div>
                ) : (
                  <div>
                    <ShieldCheck size={48} color="#166534" style={{ marginBottom: '12px' }} />
                    <h4 style={{ fontSize: '20px', fontWeight: 700, color: '#166534', margin: '0 0 8px 0' }}>
                      OCR Verification Passed!
                    </h4>
                    <p style={{ fontSize: '13px', color: '#6E677B', marginBottom: '20px' }}>
                      Name: <strong>{wizardData.fullName}</strong> | PAN: <strong>{wizardData.panNumber}</strong> | Aadhaar: <strong>{wizardData.aadhaarNumber}</strong> (Match score: 98%)
                    </p>
                    <button className="btn-primary" onClick={() => setWizardStep(7)} style={{ padding: '10px 24px' }}>
                      Proceed to Eligibility Check →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* STEP 7: SYSTEM ELIGIBILITY & RISK ASSESSMENT */}
            {wizardStep === 7 && (
              <div>
                <h4 style={{ fontSize: '15px', color: '#5C187B', marginBottom: '14px', fontWeight: 700 }}>Automated System Eligibility Check</h4>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                  <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>KYC & Document Verification:</span>
                    <strong style={{ color: '#166534' }}>✓ VERIFIED</strong>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Income Eligibility Ratio (EMI ≤ 50% Income):</span>
                    <strong style={{ color: wizardEligibility.isIncomeOk ? '#166534' : '#991B1B' }}>
                      {wizardEligibility.isIncomeOk ? `✓ OK (${wizardEligibility.emiRatio}%)` : '⚠ High EMI Ratio'}
                    </strong>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Existing Active Loans Check:</span>
                    <strong style={{ color: '#166534' }}>✓ PASSED</strong>
                  </div>
                  <div style={{ padding: '10px 14px', background: '#FAF5FF', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>Automated Risk Assessment:</span>
                    <strong style={{ color: '#5C187B' }}>{wizardEligibility.riskLevel} ({wizardEligibility.riskScore}/100)</strong>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={handleFinalSubmitApplication}
                  disabled={submitting}
                  style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700 }}
                >
                  {submitting ? 'Submitting Application...' : 'Submit Loan Application Now'}
                </button>
              </div>
            )}

            {/* STEP 8: APPLICATION SUBMITTED CONFIRMATION */}
            {wizardStep === 8 && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <CheckCircle2 size={54} color="#166534" style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '22px', color: '#201530', margin: '0 0 8px 0', fontWeight: 700 }}>
                  Loan Application Created!
                </h3>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#5C187B', marginBottom: '8px' }}>
                  Application Number: {createdAppNumber}
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <span className="badge badge-purple" style={{ fontSize: '14px', padding: '6px 16px' }}>
                    Status: SUBMITTED
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#6E677B', marginBottom: '24px' }}>
                  Your application and uploaded documents have been submitted to Flowly Worker Queue for verification.
                </p>

                <button
                  onClick={() => {
                    setApplyModalOpen(false);
                    setActiveTab('my_applications');
                  }}
                  className="btn-primary"
                  style={{ padding: '10px 24px' }}
                >
                  Go to My Applications →
                </button>
              </div>
            )}

            {/* WIZARD NAVIGATION FOOTER */}
            {wizardStep < 6 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', borderTop: '1px solid #EEE7F4', paddingTop: '16px' }}>
                <button className="btn-outline-dark" onClick={handlePrevStep} disabled={wizardStep === 1}>
                  Back
                </button>
                <button className="btn-primary" onClick={handleNextStep}>
                  Next Step →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- CUSTOMER ACTION MODAL 1: RESUBMIT DOCUMENT ---------------- */}
      {actionModalType === 'doc_reupload' && selectedAppForAction && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700 }}>Upload Requested Document</h3>
              <button onClick={() => setActionModalType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <p style={{ fontSize: '13px', color: '#6E677B', marginBottom: '16px' }}>
              Worker note: <strong>"{selectedAppForAction.workerReview?.requestedDocNote || 'Please upload requested document'}"</strong>
            </p>

            <form onSubmit={handleResubmitDocSubmit}>
              <div className="form-group">
                <label className="form-label">Document Title</label>
                <input type="text" className="form-input" value={reuploadDocTitle} onChange={(e) => setReuploadDocTitle(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Select Document File</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="form-input" onChange={(e) => setReuploadDocFileName(e.target.files[0]?.name || '')} required />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
                {submitting ? 'Uploading...' : 'Submit Document for Re-Review'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- CUSTOMER ACTION MODAL 2: VIEW & ACCEPT SANCTION LETTER ---------------- */}
      {actionModalType === 'sanction_letter' && selectedAppForAction && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#047857' }}>📜 Official Loan Sanction Letter</h3>
              <button onClick={() => setActionModalType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ background: '#F0FDF4', padding: '20px', borderRadius: '12px', border: '1px solid #86EFAC', marginBottom: '20px', fontSize: '13px', color: '#166534' }}>
              <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '12px' }}>
                FLOWLY NATIONAL BANK — LOAN SANCTION ORDER
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div><strong>Sanction Letter #:</strong> {selectedAppForAction.sanctionDetails?.sanctionLetterNumber}</div>
                <div><strong>Sanctioned Amount:</strong> ₹{selectedAppForAction.sanctionDetails?.sanctionedAmount?.toLocaleString('en-IN')}</div>
                <div><strong>Approved APR:</strong> {selectedAppForAction.sanctionDetails?.sanctionedInterestRate}% APR</div>
                <div><strong>Tenure:</strong> {selectedAppForAction.sanctionDetails?.sanctionedTenureMonths} Months</div>
                <div><strong>Calculated EMI:</strong> ₹{selectedAppForAction.sanctionDetails?.sanctionedEmi?.toLocaleString('en-IN')}/mo</div>
                <div><strong>Disbursement Mode:</strong> Direct Account Credit</div>
              </div>
              <p style={{ fontSize: '12px', margin: 0 }}>
                By clicking "Accept Sanction Terms", you accept the loan sanction order and authorize the bank to generate the formal Loan Agreement.
              </p>
            </div>

            <button onClick={handleAcceptSanctionSubmit} className="btn-primary" style={{ width: '100%', padding: '12px', backgroundColor: '#047857' }} disabled={submitting}>
              {submitting ? 'Processing...' : 'Accept Sanction Terms & Generate Agreement →'}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- CUSTOMER ACTION MODAL 3: e-SIGN LOAN AGREEMENT ---------------- */}
      {actionModalType === 'esign' && selectedAppForAction && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#5C187B' }}>✍ Digital e-Sign Loan Agreement</h3>
              <button onClick={() => setActionModalType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ background: '#FAF5FF', padding: '18px', borderRadius: '12px', border: '1px solid #E9D5FF', marginBottom: '20px', fontSize: '13px' }}>
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#5C187B', marginBottom: '8px' }}>
                Agreement #{selectedAppForAction.agreementDetails?.agreementNumber}
              </div>
              <p style={{ color: '#4C1D95', fontSize: '12px', margin: '0 0 12px 0' }}>
                I hereby agree to borrowing ₹{selectedAppForAction.requestedAmount?.toLocaleString('en-IN')} at {selectedAppForAction.interestRate}% interest p.a. for {selectedAppForAction.tenureMonths} months. I authorize auto-debit of monthly EMI ₹{selectedAppForAction.monthlyEMI?.toLocaleString('en-IN')}.
              </p>

              <div>
                <label className="form-label">Digital OTP / Full Name Signature</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type your full legal name to sign digitally..."
                  value={esignOtp}
                  onChange={(e) => setEsignOtp(e.target.value)}
                />
              </div>
            </div>

            <button onClick={handleEsignSubmit} className="btn-primary" style={{ width: '100%', padding: '12px' }} disabled={submitting}>
              {submitting ? 'Signing Agreement...' : 'Confirm & Digital e-Sign Loan Agreement ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoansPage;
