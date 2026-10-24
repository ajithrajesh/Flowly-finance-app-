import React from 'react';
import { ShieldCheck, Lock, Heart, Award } from 'lucide-react';

const Footer = () => {
  return (
    <footer style={{
      backgroundColor: '#241531',
      color: '#E9E4F0',
      padding: '48px 20px 24px',
      marginTop: 'auto',
      borderTop: '1px solid #362747'
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '32px',
          marginBottom: '40px'
        }}>
          {/* Brand Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#8B5CF6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 800
              }}>
                F
              </div>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '20px', color: 'white' }}>
                Flowly Finance
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#B2A9C0', lineHeight: 1.6, marginBottom: '16px' }}>
              Next-generation microfinance, instant personal loans, high-yield fixed deposits, and secure digital banking.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#8B5CF6' }}>
              <ShieldCheck size={16} /> 256-Bit Bank Grade Encryption
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 style={{ fontFamily: 'Outfit', fontSize: '15px', color: 'white', marginBottom: '16px' }}>
              Products
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <li><a href="/loans" style={{ color: '#C9C3DA' }}>Personal Micro-Loans</a></li>
              <li><a href="/deposits" style={{ color: '#C9C3DA' }}>High-Yield Fixed Deposits (7.5%)</a></li>
              <li><a href="/deposits" style={{ color: '#C9C3DA' }}>Instant Savings Account</a></li>
              <li><a href="/calculators" style={{ color: '#C9C3DA' }}>Loan EMI Calculator</a></li>
            </ul>
          </div>

          {/* Help & Support */}
          <div>
            <h4 style={{ fontFamily: 'Outfit', fontSize: '15px', color: 'white', marginBottom: '16px' }}>
              Customer Support
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#C9C3DA' }}>
              <li>24/7 Helpline: 1800-FLOWLY</li>
              <li>Support Email: support@flowlyfinance.com</li>
              <li>Branch: Kochi Main Branch, Kerala</li>
              <li>IFSC Code: FLOW0001001</li>
            </ul>
          </div>

          {/* Security & Compliance */}
          <div>
            <h4 style={{ fontFamily: 'Outfit', fontSize: '15px', color: 'white', marginBottom: '16px' }}>
              Trust & Security
            </h4>
            <p style={{ fontSize: '12px', color: '#B2A9C0', lineHeight: 1.6, marginBottom: '12px' }}>
              Flowly Finance is fully compliant with RBI digital lending guidelines and security frameworks.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <span className="badge" style={{ background: '#392A4A', color: '#E9E4F0' }}>
                <Lock size={12} /> SSL Secured
              </span>
              <span className="badge" style={{ background: '#392A4A', color: '#E9E4F0' }}>
                <Award size={12} /> RBI Compliant
              </span>
            </div>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid #362747',
          paddingTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '12px',
          color: '#8F89A3'
        }}>
          <div>
            © {new Date().getFullYear()} Flowly Finance. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <a href="#" style={{ color: '#8F89A3' }}>Privacy Policy</a>
            <a href="#" style={{ color: '#8F89A3' }}>Terms of Service</a>
            <a href="#" style={{ color: '#8F89A3' }}>Fair Practice Code</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
