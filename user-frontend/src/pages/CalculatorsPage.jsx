import React, { useState, useEffect } from 'react';
import { calculatorAPI } from '../services/api';
import { Calculator, TrendingUp, DollarSign, Percent, Clock, PieChart, Sparkles } from 'lucide-react';

const CalculatorsPage = () => {
  const [activeTab, setActiveTab] = useState('loan');

  // Loan Calculator State
  const [loanAmount, setLoanAmount] = useState(200000);
  const [loanRate, setLoanRate] = useState(12.0);
  const [loanTenure, setLoanTenure] = useState(24);
  const [interestType, setInterestType] = useState('diminishing'); // 'diminishing' | 'flat'
  const [comparison, setComparison] = useState(null);

  // FD Calculator State
  const [fdPrincipal, setFdPrincipal] = useState(100000);
  const [fdRate, setFdRate] = useState(7.5);
  const [fdTenure, setFdTenure] = useState(12);

  // Fetch comparison from backend whenever parameters change
  useEffect(() => {
    let isCurrent = true;
    const fetchCalc = async () => {
      try {
        const res = await calculatorAPI.calculateLoanEMI({
          amount: loanAmount,
          interestRate: loanRate,
          tenureMonths: loanTenure,
          interestType,
        });
        if (isCurrent && res.data?.calculation) {
          setComparison(res.data.calculation);
        } else if (isCurrent) {
          setComparison(null);
        }
      } catch (e) {
        console.error('Calculation error', e);
        if (isCurrent) setComparison(null);
      }
    };
    fetchCalc();
    return () => {
      isCurrent = false;
    };
  }, [loanAmount, loanRate, loanTenure, interestType]);

  // Immediate client fallback while API request is in-flight
  const fallbackCalc = React.useMemo(() => {
    const p = Number(loanAmount) || 0;
    const r = (Number(loanRate) || 0) / 12 / 100;
    const n = Number(loanTenure) || 1;

    // Diminishing
    let dimEmi = 0;
    if (r === 0) dimEmi = p / n;
    else {
      const factor = Math.pow(1 + r, n);
      dimEmi = Math.round((p * r * factor) / (factor - 1));
    }
    const dimPayable = Math.round(dimEmi * n);
    const dimInterest = Math.max(0, dimPayable - p);

    // Flat
    const flatInterest = Math.round((p * (loanRate / 100) * n) / 12);
    const flatPayable = p + flatInterest;
    const flatEmi = Math.round(flatPayable / n);

    return {
      diminishing: { monthlyEMI: dimEmi, totalInterest: dimInterest, totalRepayment: dimPayable },
      flat: { monthlyEMI: flatEmi, totalInterest: flatInterest, totalRepayment: flatPayable },
      savingsWithDiminishing: Math.max(0, flatInterest - dimInterest),
      monthlyDifference: Math.abs(flatEmi - dimEmi),
    };
  }, [loanAmount, loanRate, loanTenure]);

  const activeCalcSource = comparison
    ? (interestType === 'flat' ? comparison.flat : comparison.diminishing)
    : (interestType === 'flat' ? fallbackCalc.flat : fallbackCalc.diminishing);

  const activeCalc = {
    monthlyEMI: activeCalcSource?.monthlyEMI || 0,
    totalInterest: activeCalcSource?.totalInterest || 0,
    totalPayable: activeCalcSource?.totalRepayment || activeCalcSource?.totalPayable || 0,
  };

  const currentSavings = comparison?.savingsWithDiminishing ?? fallbackCalc.savingsWithDiminishing;
  const currentDiminishing = comparison?.diminishing ?? fallbackCalc.diminishing;
  const currentFlat = comparison?.flat ?? fallbackCalc.flat;

  // FD Quarterly Compounding Calculation: A = P * (1 + r/400)^(4 * t_years)
  const fdYears = fdTenure / 12;
  const maturityAmount = Math.round(fdPrincipal * Math.pow(1 + fdRate / 400, 4 * fdYears));
  const totalFdInterest = maturityAmount - fdPrincipal;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* ---------------- HEADER ---------------- */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: 'linear-gradient(135deg, #5C187B 0%, #8B5CF6 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px',
          boxShadow: '0 6px 20px rgba(92, 24, 123, 0.25)'
        }}>
          <Calculator size={24} />
        </div>
        <h1 style={{ fontSize: '32px', color: '#201530', marginBottom: '8px' }}>
          Financial Calculators Hub
        </h1>
        <p style={{ color: '#6E677B', fontSize: '15px' }}>
          Accurate, real-time EMI & Fixed Deposit growth projections for smart financial planning.
        </p>
      </div>

      {/* Calculator Tabs */}
      <div className="tabs-nav" style={{ justifyContent: 'center', marginBottom: '32px' }}>
        <button
          className={`tab-btn ${activeTab === 'loan' ? 'active' : ''}`}
          onClick={() => setActiveTab('loan')}
          style={{ fontSize: '15px' }}
        >
          <Calculator size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
          Loan EMI Calculator
        </button>
        <button
          className={`tab-btn ${activeTab === 'fd' ? 'active' : ''}`}
          onClick={() => setActiveTab('fd')}
          style={{ fontSize: '15px' }}
        >
          <TrendingUp size={18} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
          Fixed Deposit Growth Calculator
        </button>
      </div>

      {/* ---------------- LOAN EMI CALCULATOR ---------------- */}
      {activeTab === 'loan' && (
        <div>
          {/* Interest Type Toggle */}
          <div style={{
            background: '#FAF5FF',
            border: '1px solid #EEE7F4',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 700, color: '#201530', fontSize: '15px' }}>Calculation Model:</span>
                <span className="badge badge-purple" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  {interestType === 'diminishing' ? 'Diminishing Balance' : 'Flat Rate'}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6E677B' }}>
                {interestType === 'diminishing'
                  ? 'Interest is computed on reducing principal balance every month (Standard Banking Practice).'
                  : 'Interest is computed on original principal for the entire loan duration.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', background: '#EEE7F4', padding: '4px', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => setInterestType('diminishing')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: interestType === 'diminishing' ? '#5C187B' : 'transparent',
                  color: interestType === 'diminishing' ? '#FFFFFF' : '#6E677B',
                  transition: 'all 0.2s ease',
                  boxShadow: interestType === 'diminishing' ? '0 2px 6px rgba(92, 24, 123, 0.25)' : 'none',
                }}
              >
                Diminishing Balance
              </button>
              <button
                type="button"
                onClick={() => setInterestType('flat')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: interestType === 'flat' ? '#5C187B' : 'transparent',
                  color: interestType === 'flat' ? '#FFFFFF' : '#6E677B',
                  transition: 'all 0.2s ease',
                  boxShadow: interestType === 'flat' ? '0 2px 6px rgba(92, 24, 123, 0.25)' : 'none',
                }}
              >
                Flat Rate EMI
              </button>
            </div>
          </div>

          <div className="grid-2">
            <div className="flowly-card">
              <h3 style={{ fontSize: '18px', color: '#201530', marginBottom: '20px' }}>Adjust Loan Parameters</h3>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="form-label" style={{ margin: 0 }}>Loan Amount (₹)</span>
                  <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>₹{loanAmount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="2000000"
                  step="5000"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#5C187B' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="form-label" style={{ margin: 0 }}>Annual Interest Rate (% APR)</span>
                  <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>{loanRate}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="24"
                  step="0.5"
                  value={loanRate}
                  onChange={(e) => setLoanRate(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#5C187B' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="form-label" style={{ margin: 0 }}>Tenure (Months)</span>
                  <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>{loanTenure} Months</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="60"
                  step="3"
                  value={loanTenure}
                  onChange={(e) => setLoanTenure(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#5C187B' }}
                />
              </div>
            </div>

            <div className="hero-gradient-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: '#C9C3DA', fontWeight: 600 }}>
                  Monthly EMI Payment ({interestType === 'flat' ? 'Flat Rate' : 'Diminishing'})
                </span>
                <span className="badge" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '11px' }}>
                  {interestType === 'diminishing' ? 'Reducing Rate' : 'Fixed Rate'}
                </span>
              </div>
              <div style={{ fontSize: '42px', fontWeight: 800, color: 'white', fontFamily: 'Outfit', marginBottom: '24px' }}>
                ₹{activeCalc.monthlyEMI.toLocaleString('en-IN')}
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
                <div className="kv-row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <span className="k" style={{ color: '#C9C3DA' }}>Principal Amount</span>
                  <span className="v" style={{ color: 'white' }}>₹{loanAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="kv-row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                  <span className="k" style={{ color: '#C9C3DA' }}>Total Interest Payable</span>
                  <span className="v" style={{ color: '#8B5CF6' }}>+₹{activeCalc.totalInterest.toLocaleString('en-IN')}</span>
                </div>
                <div className="kv-row" style={{ border: 'none' }}>
                  <span className="k" style={{ color: '#C9C3DA', fontWeight: 700 }}>Total Amount Payable</span>
                  <span className="v" style={{ color: 'white', fontWeight: 800, fontSize: '16px' }}>₹{activeCalc.totalPayable.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SIDE-BY-SIDE EMI COMPARISON CARDS */}
          <div style={{ marginTop: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '16px', color: '#201530', margin: 0, fontWeight: 700 }}>
                  ⚖ Flat Rate vs Diminishing Balance Comparison
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6E677B' }}>
                  See exact financial differences between both calculation models for ₹{loanAmount.toLocaleString('en-IN')} over {loanTenure} months.
                </p>
              </div>

              {currentSavings > 0 && (
                <div style={{ backgroundColor: '#E4F4DC', color: '#2E7A22', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>
                  ✓ Diminishing saves ₹{currentSavings.toLocaleString('en-IN')} in interest!
                </div>
              )}
            </div>

            <div className="grid-2" style={{ gap: '16px' }}>
              {/* Diminishing Card */}
              <div
                onClick={() => setInterestType('diminishing')}
                className="flowly-card"
                style={{
                  border: interestType === 'diminishing' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                  backgroundColor: interestType === 'diminishing' ? '#FAF5FF' : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '16px', color: '#201530', margin: 0, fontWeight: 700 }}>
                    Diminishing Balance (Reducing)
                  </h4>
                  {interestType === 'diminishing' ? (
                    <span className="badge badge-purple">Active Selection</span>
                  ) : (
                    <span className="badge badge-green">Recommended</span>
                  )}
                </div>

                <div style={{ fontSize: '28px', fontWeight: 800, color: '#5C187B', marginBottom: '12px' }}>
                  ₹{currentDiminishing.monthlyEMI.toLocaleString('en-IN')}
                  <span style={{ fontSize: '13px', fontWeight: 400, color: '#6E677B' }}> / month</span>
                </div>

                <div className="kv-row" style={{ fontSize: '13px' }}>
                  <span className="k">Total Interest</span>
                  <span className="v" style={{ color: '#2E7A22', fontWeight: 700 }}>
                    ₹{currentDiminishing.totalInterest.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="kv-row" style={{ fontSize: '13px', border: 'none' }}>
                  <span className="k">Total Repayment</span>
                  <span className="v" style={{ fontWeight: 700 }}>
                    ₹{currentDiminishing.totalRepayment.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Flat Rate Card */}
              <div
                onClick={() => setInterestType('flat')}
                className="flowly-card"
                style={{
                  border: interestType === 'flat' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                  backgroundColor: interestType === 'flat' ? '#FAF5FF' : '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '16px', color: '#201530', margin: 0, fontWeight: 700 }}>
                    Flat Rate EMI
                  </h4>
                  {interestType === 'flat' ? (
                    <span className="badge badge-purple">Active Selection</span>
                  ) : (
                    <span className="badge badge-gray">Fixed Basis</span>
                  )}
                </div>

                <div style={{ fontSize: '28px', fontWeight: 800, color: '#201530', marginBottom: '12px' }}>
                  ₹{currentFlat.monthlyEMI.toLocaleString('en-IN')}
                  <span style={{ fontSize: '13px', fontWeight: 400, color: '#6E677B' }}> / month</span>
                </div>

                <div className="kv-row" style={{ fontSize: '13px' }}>
                  <span className="k">Total Interest</span>
                  <span className="v" style={{ color: '#B23A2E', fontWeight: 700 }}>
                    ₹{currentFlat.totalInterest.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="kv-row" style={{ fontSize: '13px', border: 'none' }}>
                  <span className="k">Total Repayment</span>
                  <span className="v" style={{ fontWeight: 700 }}>
                    ₹{currentFlat.totalRepayment.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- FIXED DEPOSIT CALCULATOR ---------------- */}
      {activeTab === 'fd' && (
        <div className="grid-2">
          <div className="flowly-card">
            <h3 style={{ fontSize: '18px', color: '#201530', marginBottom: '20px' }}>Adjust FD Parameters</h3>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="form-label" style={{ margin: 0 }}>Deposit Principal (₹)</span>
                <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>₹{fdPrincipal.toLocaleString('en-IN')}</span>
              </div>
              <input
                type="range"
                min="1000"
                max="1000000"
                step="5000"
                value={fdPrincipal}
                onChange={(e) => setFdPrincipal(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5C187B' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="form-label" style={{ margin: 0 }}>Interest Rate (% p.a.)</span>
                <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>{fdRate}%</span>
              </div>
              <input
                type="range"
                min="4"
                max="10"
                step="0.25"
                value={fdRate}
                onChange={(e) => setFdRate(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5C187B' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="form-label" style={{ margin: 0 }}>Tenure (Months)</span>
                <span style={{ fontWeight: 800, color: '#5C187B', fontSize: '16px' }}>{fdTenure} Months</span>
              </div>
              <input
                type="range"
                min="3"
                max="60"
                step="3"
                value={fdTenure}
                onChange={(e) => setFdTenure(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5C187B' }}
              />
            </div>
          </div>

          <div className="hero-gradient-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span style={{ fontSize: '13px', color: '#C9C3DA', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
              Estimated Maturity Value
            </span>
            <div style={{ fontSize: '42px', fontWeight: 800, color: 'white', fontFamily: 'Outfit', marginBottom: '24px' }}>
              ₹{maturityAmount.toLocaleString('en-IN')}
            </div>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div className="kv-row" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <span className="k" style={{ color: '#C9C3DA' }}>Invested Principal</span>
                <span className="v" style={{ color: 'white' }}>₹{fdPrincipal.toLocaleString('en-IN')}</span>
              </div>
              <div className="kv-row" style={{ border: 'none' }}>
                <span className="k" style={{ color: '#C9C3DA', fontWeight: 700 }}>Compounded Interest Earned</span>
                <span className="v" style={{ color: '#8B5CF6', fontWeight: 800, fontSize: '16px' }}>+₹{totalFdInterest.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalculatorsPage;
