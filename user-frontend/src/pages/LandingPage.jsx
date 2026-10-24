import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldCheck, 
  TrendingUp, 
  Percent, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Calculator, 
  Zap, 
  ChevronRight,
  Landmark,
  CreditCard
} from 'lucide-react';

const LandingPage = () => {
  const { isAuthenticated, openAuthModal } = useAuth();
  const navigate = useNavigate();

  // Quick EMI Calculator State
  const [calcAmount, setCalcAmount] = useState(100000);
  const [calcTenure, setCalcTenure] = useState(12);
  const [calcRate, setCalcRate] = useState(12.0);

  // Quick FD Calculator State
  const [fdAmount, setFdAmount] = useState(50000);
  const [fdTenure, setFdTenure] = useState(12);
  const [fdRate, setFdRate] = useState(7.5);

  // EMI Math: E = [P x R x (1+R)^N]/[(1+R)^N-1]
  const monthlyRate = calcRate / (12 * 100);
  const calculatedEMI = Math.round(
    (calcAmount * monthlyRate * Math.pow(1 + monthlyRate, calcTenure)) /
    (Math.pow(1 + monthlyRate, calcTenure) - 1)
  ) || 0;
  const totalLoanPayable = calculatedEMI * calcTenure;

  // FD Quarterly Compounding Math: A = P * (1 + r/400)^(4 * t_years)
  const fdYears = fdTenure / 12;
  const estimatedFdMaturity = Math.round(fdAmount * Math.pow(1 + fdRate / 400, 4 * fdYears));
  const estimatedFdInterest = estimatedFdMaturity - fdAmount;

  return (
    <div>
      {/* ---------------- HERO SECTION ---------------- */}
      <section style={{
        background: 'linear-gradient(135deg, #180D24 0%, #241531 40%, #4A1364 100%)',
        color: 'white',
        padding: '70px 20px 90px',
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid #362747'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '48px', alignItems: 'center' }} className="hero-grid">
          <div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: 'rgba(139, 92, 246, 0.2)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#C9C3DA',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '20px'
            }}>
              <Zap size={15} color="#8B5CF6" /> Next-Gen Microfinance & Banking
            </div>

            <h1 style={{
              fontSize: '48px',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#FFFFFF',
              marginBottom: '20px',
              fontFamily: 'Outfit'
            }}>
              Smart Micro-Loans & <span style={{ color: '#8B5CF6' }}>High-Yield FDs</span> for Everyone.
            </h1>

            <p style={{
              fontSize: '17px',
              color: '#C9C3DA',
              lineHeight: 1.6,
              marginBottom: '32px',
              maxWidth: '560px'
            }}>
              Get instant personal, vehicle, & business micro-loans up to ₹20,00,000. Earn up to 7.5% p.a. interest on Fixed Deposits with zero hassle.
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {isAuthenticated ? (
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn-primary"
                  style={{ padding: '14px 32px', fontSize: '16px' }}
                >
                  Go to Dashboard <ArrowRight size={18} />
                </button>
              ) : (
                <>
                  <button
                    onClick={() => openAuthModal('register')}
                    className="btn-primary"
                    style={{ padding: '14px 32px', fontSize: '16px' }}
                  >
                    Open Account Now <ArrowRight size={18} />
                  </button>
                  <button
                    onClick={() => navigate('/calculators')}
                    className="btn-secondary"
                    style={{ padding: '14px 28px', fontSize: '16px', background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
                  >
                    Calculate EMI
                  </button>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '24px', marginTop: '40px', paddingTop: '28px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'white', fontFamily: 'Outfit' }}>₹50Cr+</div>
                <div style={{ fontSize: '12px', color: '#A19AA8' }}>Loans Disbursed</div>
              </div>
              <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#8B5CF6', fontFamily: 'Outfit' }}>7.5% p.a.</div>
                <div style={{ fontSize: '12px', color: '#A19AA8' }}>Max FD Returns</div>
              </div>
              <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }}></div>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: 'white', fontFamily: 'Outfit' }}>100%</div>
                <div style={{ fontSize: '12px', color: '#A19AA8' }}>Digital KYC & Approval</div>
              </div>
            </div>
          </div>

          {/* Quick Calculator Card on Hero */}
          <div className="flowly-card" style={{ backgroundColor: '#FFFFFF', padding: '28px', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #E7E4DC', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={20} color="#5C187B" />
                <h3 style={{ fontSize: '17px', margin: 0 }}>Instant Loan Estimator</h3>
              </div>
              <span className="badge badge-purple">12% APR Standard</span>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                <span>Loan Amount</span>
                <span style={{ color: '#5C187B', fontWeight: 700 }}>₹{calcAmount.toLocaleString('en-IN')}</span>
              </div>
              <input
                type="range"
                min="10000"
                max="1000000"
                step="5000"
                value={calcAmount}
                onChange={(e) => setCalcAmount(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5C187B' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                <span>Tenure (Months)</span>
                <span style={{ color: '#5C187B', fontWeight: 700 }}>{calcTenure} Months</span>
              </div>
              <input
                type="range"
                min="3"
                max="60"
                step="3"
                value={calcTenure}
                onChange={(e) => setCalcTenure(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#5C187B' }}
              />
            </div>

            <div style={{
              backgroundColor: '#FAF5FF',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #EEE7F4',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div>
                <span style={{ fontSize: '12px', color: '#6E677B', display: 'block' }}>Monthly EMI Payment</span>
                <span style={{ fontSize: '26px', fontWeight: 800, color: '#5C187B', fontFamily: 'Outfit' }}>
                  ₹{calculatedEMI.toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#6E677B', display: 'block' }}>Total Payable</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#201530' }}>
                  ₹{totalLoanPayable.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <button
              onClick={() => isAuthenticated ? navigate('/loans') : openAuthModal('register')}
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
            >
              Apply for Loan <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- FEATURES SECTION ---------------- */}
      <section style={{ padding: '80px 20px', backgroundColor: '#F6F5F1' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 50px' }}>
            <h2 style={{ fontSize: '32px', color: '#201530', marginBottom: '12px' }}>
              Why Choose Flowly Finance?
            </h2>
            <p style={{ color: '#6E677B', fontSize: '16px' }}>
              Designed to make personal micro-banking transparent, instant, and effortless.
            </p>
          </div>

          <div className="grid-4">
            <div className="flowly-card">
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#EEE7F4', color: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Zap size={24} />
              </div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Instant Approval</h3>
              <p style={{ color: '#6E677B', fontSize: '14px', lineHeight: 1.5 }}>
                Submit KYC details online and get worker approvals within hours. Funds disburse straight to your savings account.
              </p>
            </div>

            <div className="flowly-card">
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#E4F4DC', color: '#2E7A22', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <TrendingUp size={24} />
              </div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>7.5% High Yield FD</h3>
              <p style={{ color: '#6E677B', fontSize: '14px', lineHeight: 1.5 }}>
                Grow your idle savings with guaranteed quarterly compounding and flexible auto-renewal options.
              </p>
            </div>

            <div className="flowly-card">
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#FBEFD9', color: '#9A6A0C', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <ShieldCheck size={24} />
              </div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Bank-Grade Security</h3>
              <p style={{ color: '#6E677B', fontSize: '14px', lineHeight: 1.5 }}>
                4-6 digit MPIN authentication, 256-bit encryption, and secure audit logs protect every transaction.
              </p>
            </div>

            <div className="flowly-card">
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#EEE7F4', color: '#8B5CF6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <Clock size={24} />
              </div>
              <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Easy EMI Repayments</h3>
              <p style={{ color: '#6E677B', fontSize: '14px', lineHeight: 1.5 }}>
                Track installment due dates, pay EMIs in one click, and avoid late fees with automated job sweeps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FIXED DEPOSIT SPOTLIGHT ---------------- */}
      <section style={{ padding: '60px 20px', backgroundColor: '#FFFFFF', borderTop: '1px solid #E7E4DC', borderBottom: '1px solid #E7E4DC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
          <div>
            <span className="badge badge-green" style={{ marginBottom: '14px' }}>Guaranteed Wealth Growth</span>
            <h2 style={{ fontSize: '36px', color: '#201530', marginBottom: '16px', lineHeight: 1.2 }}>
              Lock in High Interest Rates on Fixed Deposits
            </h2>
            <p style={{ color: '#6E677B', fontSize: '16px', lineHeight: 1.6, marginBottom: '24px' }}>
              Open a Fixed Deposit starting from as low as ₹1,000. Interest compounds quarterly, and mature funds roll over automatically when you choose auto-renewal.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#201530' }}>
                <CheckCircle2 size={18} color="#2E7A22" /> Contracted 7.5% annual interest rate
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#201530' }}>
                <CheckCircle2 size={18} color="#2E7A22" /> Early closure flexibility after 1 month lock-in
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', color: '#201530' }}>
                <CheckCircle2 size={18} color="#2E7A22" /> Auto-credit payouts straight to savings account
              </li>
            </ul>

            <button
              onClick={() => isAuthenticated ? navigate('/deposits') : openAuthModal('login')}
              className="btn-primary"
              style={{ padding: '12px 24px' }}
            >
              Start Fixed Deposit <ArrowRight size={16} />
            </button>
          </div>

          <div className="hero-gradient-card">
            <h3 style={{ fontSize: '20px', color: 'white', marginBottom: '16px' }}>FD Growth Estimator</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', color: '#C9C3DA', display: 'block', marginBottom: '4px' }}>Deposit Principal</label>
              <input
                type="number"
                className="form-input"
                value={fdAmount}
                onChange={(e) => setFdAmount(Number(e.target.value))}
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#C9C3DA', display: 'block', marginBottom: '4px' }}>Tenure in Months</label>
              <select
                className="form-select"
                value={fdTenure}
                onChange={(e) => setFdTenure(Number(e.target.value))}
                style={{ backgroundColor: '#241531', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                <option value={6}>6 Months (7.5%)</option>
                <option value={12}>12 Months (7.5%)</option>
                <option value={24}>24 Months (7.5%)</option>
                <option value={36}>36 Months (7.5%)</option>
              </select>
            </div>

            <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#C9C3DA' }}>Interest Earned</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#8B5CF6' }}>+₹{estimatedFdInterest.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#C9C3DA' }}>Maturity Payout</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: 'white', fontFamily: 'Outfit' }}>₹{estimatedFdMaturity.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- CTA FOOTER BANNER ---------------- */}
      <section style={{ padding: '70px 20px', textAlign: 'center', backgroundColor: '#FAF9F5' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '32px', color: '#201530', marginBottom: '12px' }}>
            Ready to Take Control of Your Financial Growth?
          </h2>
          <p style={{ color: '#6E677B', fontSize: '16px', marginBottom: '28px' }}>
            Open your account in less than 2 minutes. Complete KYC and start borrowing or saving today.
          </p>
          <button
            onClick={() => isAuthenticated ? navigate('/dashboard') : openAuthModal('register')}
            className="btn-primary"
            style={{ padding: '14px 36px', fontSize: '16px' }}
          >
            Get Started with Flowly
          </button>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
