import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import NotificationsDrawer from './components/NotificationsDrawer';
import AuthModal from './pages/AuthModal';

import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import KYCPortal from './pages/KYCPortal';
import DepositsPage from './pages/DepositsPage';
import AddMoneyPage from './pages/AddMoneyPage';
import LoansPage from './pages/LoansPage';
import RepaymentsPage from './pages/RepaymentsPage';
import CalculatorsPage from './pages/CalculatorsPage';
import HelpPage from './pages/HelpPage';
import TransferPage from './pages/TransferPage';
import ProfilePage from './pages/ProfilePage';
import { notificationsAPI } from './services/api';

// Protected Route Guard
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, openAuthModal } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      openAuthModal('login');
    }
  }, [loading, isAuthenticated, openAuthModal]);

  if (loading) {
    return (
      <div style={{ padding: '80px 0', textAlign: 'center', color: '#6E677B' }}>
        Authenticating session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

import { Bell, X, ExternalLink, AlertTriangle } from 'lucide-react';

const AppContent = () => {
  const { isAuthenticated, unreadCount, refreshUnreadCount } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeToast, setActiveToast] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleNewNotif = (e) => {
      const notif = e.detail;
      if (!notif) return;
      setActiveToast(notif);

      // Auto dismiss after 6 seconds
      const timer = setTimeout(() => {
        setActiveToast((current) => (current?._id === notif._id ? null : current));
      }, 6000);

      return () => clearTimeout(timer);
    };

    window.addEventListener('flowly:new-notification', handleNewNotif);
    return () => window.removeEventListener('flowly:new-notification', handleNewNotif);
  }, []);

  return (
    <div className="flowly-app">
      {/* Real-time Toast Notification Banner */}
      {activeToast && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '24px',
            maxWidth: '380px',
            width: 'calc(100% - 48px)',
            backgroundColor: '#FFFFFF',
            border: '1.5px solid #8B5CF6',
            borderRadius: '14px',
            boxShadow: '0 10px 30px rgba(92, 24, 123, 0.18)',
            padding: '14px 16px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            animation: 'slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#EEE7F4',
              color: '#5C187B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Bell size={17} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#201530', lineHeight: 1.2 }}>
                {activeToast.title}
              </span>
              <button
                onClick={() => setActiveToast(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#A19AA8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
            <p
              style={{
                fontSize: '12px',
                color: '#4A4453',
                margin: '4px 0 8px 0',
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {activeToast.message}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                onClick={() => {
                  setActiveToast(null);
                  setNotificationsOpen(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#5C187B',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: 0,
                }}
              >
                Open notifications <ExternalLink size={11} />
              </button>
              <button
                onClick={() => {
                  const toast = activeToast;
                  setActiveToast(null);
                  let category = 'other';
                  if (toast.type === 'kyc') category = 'kyc';
                  else if (toast.type === 'loan' || toast.type === 'emi') category = 'loan';
                  else if (['transfer', 'deposit', 'withdrawal', 'payment'].includes(toast.type)) category = 'payment';
                  else if (toast.type === 'account') category = 'account';

                  const notifTitle = toast.title || 'Notification';
                  const notifMessage = toast.message || '';
                  const notifTime = toast.createdAt ? new Date(toast.createdAt).toLocaleString() : new Date().toLocaleString();

                  let subject = `Issue regarding notification: ${notifTitle}`;
                  if (subject.length > 120) subject = subject.slice(0, 117) + '...';

                  navigate('/help?tab=create', {
                    state: {
                      activeTab: 'create',
                      tab: 'create',
                      category,
                      priority: toast.type === 'transfer' ? 'high' : 'medium',
                      subject,
                      description: `Regarding notification: "${notifTitle}"\nNotification message: ${notifMessage}\nDate: ${notifTime}\n\nPlease describe the issue or problem you encountered:\n`,
                      notificationId: toast._id || toast.id,
                      fromNotification: notifTitle,
                    },
                  });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#DC2626',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: 0,
                }}
                title="Report a problem regarding this notification"
              >
                <AlertTriangle size={11} /> Report
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar
        onOpenNotifications={() => setNotificationsOpen(true)}
        unreadCount={unreadCount}
      />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/calculators" element={<CalculatorsPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <KYCPortal />
              </ProtectedRoute>
            }
          />
          <Route
            path="/deposits"
            element={
              <ProtectedRoute>
                <DepositsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-money"
            element={
              <ProtectedRoute>
                <AddMoneyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/loans"
            element={
              <ProtectedRoute>
                <LoansPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/repayments"
            element={
              <ProtectedRoute>
                <RepaymentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfer"
            element={
              <ProtectedRoute>
                <TransferPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transfers"
            element={
              <ProtectedRoute>
                <TransferPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/help"
            element={
              <ProtectedRoute>
                <HelpPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />

      <AuthModal />
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onRefreshCount={refreshUnreadCount}
      />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;