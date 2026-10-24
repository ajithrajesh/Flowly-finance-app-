import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, 
  Wallet, 
  FileCheck, 
  Bell, 
  User, 
  LogOut, 
  Menu, 
  X, 
  CreditCard,
  Landmark,
  Sparkles,
  LifeBuoy
} from 'lucide-react';

const Navbar = ({ onOpenNotifications, unreadCount = 0 }) => {
  const { isAuthenticated, user, account, openAuthModal, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <header style={{
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #E7E4DC',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: '0 2px 10px rgba(32, 21, 48, 0.03)'
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 20px',
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Brand Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #5C187B 0%, #8B5CF6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 800,
            fontSize: '18px',
            boxShadow: '0 4px 12px rgba(92, 24, 123, 0.3)'
          }}>
            F
          </div>
          <div>
            <span style={{ fontStyle: 'normal', fontFamily: 'Outfit', fontWeight: 800, fontSize: '20px', color: '#201530', letterSpacing: '-0.02em' }}>
              Flowly<span style={{ color: '#8B5CF6' }}>.</span>
            </span>
            <span style={{ display: 'block', fontSize: '10px', color: '#6E677B', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Finance Customer
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="desktop-nav">
          <Link to="/" style={{
            padding: '8px 14px',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '14px',
            color: isActive('/') ? '#5C187B' : '#6E677B',
            backgroundColor: isActive('/') ? '#EEE7F4' : 'transparent',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            Home
          </Link>

          {isAuthenticated && (
            <>
              <Link to="/dashboard" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/dashboard') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/dashboard') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Wallet size={16} /> Dashboard
              </Link>

              <Link to="/deposits" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/deposits') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/deposits') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Landmark size={16} /> Savings & FD
              </Link>

              <Link to="/loans" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/loans') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/loans') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CreditCard size={16} /> Loans
              </Link>

              <Link to="/repayments" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/repayments') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/repayments') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                EMI Pay
              </Link>

              <Link to="/kyc" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/kyc') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/kyc') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <FileCheck size={16} /> KYC Verification
                {user?.kycStatus === 'verified' && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2E7A22' }}></span>
                )}
              </Link>

              <Link to="/help" style={{
                padding: '8px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                color: isActive('/help') ? '#5C187B' : '#6E677B',
                backgroundColor: isActive('/help') ? '#EEE7F4' : 'transparent',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <LifeBuoy size={16} /> Help & Support
              </Link>
            </>
          )}
        </nav>

        {/* User / Auth Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAuthenticated ? (
            <>
              {/* Notifications Icon Button */}
              <button
                onClick={onOpenNotifications}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#F6F5F1',
                  border: '1px solid #E7E4DC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  color: '#201530'
                }}
                title="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    backgroundColor: '#B23A2E',
                    color: 'white',
                    fontSize: '10px',
                    fontWeight: 700,
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* User Profile Badge & Logout */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px', borderLeft: '1px solid #E7E4DC' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#EEE7F4',
                  color: '#5C187B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '14px',
                  border: '1.5px solid #8B5CF6'
                }}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }} className="user-text-meta">
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#201530', lineHeight: 1.2 }}>
                    {user?.name}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6E677B' }}>
                    {account ? `₹${account.balance.toLocaleString('en-IN')}` : user?.phone}
                  </span>
                </div>
                <button
                  onClick={logout}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6E677B',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px'
                  }}
                  title="Log out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => openAuthModal('login')}
                className="btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Log In
              </button>
              <button
                onClick={() => openAuthModal('register')}
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: '13px' }}
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;