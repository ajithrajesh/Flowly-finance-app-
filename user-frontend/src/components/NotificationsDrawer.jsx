import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsAPI, transferAPI, getErrorMessage } from '../services/api';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  FileCheck,
  Landmark,
  Calendar,
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  UserCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';

const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTypeConfig = (type) => {
  switch (type) {
    case 'kyc':
      return {
        icon: <FileCheck size={16} color="#2E7A22" />,
        badgeBg: '#E4F4DC',
        badgeColor: '#2E7A22',
        label: 'KYC',
        actionRoute: '/kyc',
        actionLabel: 'Go to KYC',
      };
    case 'loan':
      return {
        icon: <Landmark size={16} color="#5C187B" />,
        badgeBg: '#EEE7F4',
        badgeColor: '#5C187B',
        label: 'Loan',
        actionRoute: '/loans',
        actionLabel: 'View Loan',
      };
    case 'emi':
      return {
        icon: <Calendar size={16} color="#B45309" />,
        badgeBg: '#FEF3C7',
        badgeColor: '#B45309',
        label: 'EMI',
        actionRoute: '/repayments',
        actionLabel: 'Pay EMI',
      };
    case 'transfer':
      return {
        icon: <ArrowLeftRight size={16} color="#6D28D9" />,
        badgeBg: '#EDE9FE',
        badgeColor: '#6D28D9',
        label: 'Transfer',
        actionRoute: '/transfer',
        actionLabel: 'Transfers',
      };
    case 'deposit':
      return {
        icon: <ArrowDownCircle size={16} color="#047857" />,
        badgeBg: '#D1FAE5',
        badgeColor: '#047857',
        label: 'Deposit',
        actionRoute: '/deposits',
        actionLabel: 'View Deposit',
      };
    case 'withdrawal':
      return {
        icon: <ArrowUpCircle size={16} color="#C2410C" />,
        badgeBg: '#FFEDD5',
        badgeColor: '#C2410C',
        label: 'Withdrawal',
        actionRoute: '/dashboard',
        actionLabel: 'Dashboard',
      };
    case 'payment':
      return {
        icon: <CreditCard size={16} color="#1D4ED8" />,
        badgeBg: '#DBEAFE',
        badgeColor: '#1D4ED8',
        label: 'Payment',
        actionRoute: '/repayments',
        actionLabel: 'Repayments',
      };
    case 'account':
      return {
        icon: <UserCheck size={16} color="#4338CA" />,
        badgeBg: '#E0E7FF',
        badgeColor: '#4338CA',
        label: 'Account',
        actionRoute: '/dashboard',
        actionLabel: 'Account',
      };
    default:
      return {
        icon: <Bell size={16} color="#5C187B" />,
        badgeBg: '#F3F4F6',
        badgeColor: '#4B5563',
        label: 'Notice',
        actionRoute: null,
        actionLabel: null,
      };
  }
};

const NotificationsDrawer = ({ isOpen, onClose, onRefreshCount }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'

  const isRead = (item) => item.status === 'read' || item.isRead === true;

  const fetchNotifications = async () => {
    if (!isOpen) return;
    setLoading(true);
    setDrawerError('');
    try {
      const res = await notificationsAPI.getMyNotifications({ limit: 40 });
      const raw = res.data;
      const list = Array.isArray(raw?.notifications)
        ? raw.notifications
        : Array.isArray(raw?.data?.notifications)
        ? raw.data.notifications
        : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw)
        ? raw
        : [];
      setNotifications(list);
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNotifications([]);
      setDrawerError(getErrorMessage(err, 'Failed to fetch notifications.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [isOpen]);

  // Real-time socket event listeners via window custom events
  useEffect(() => {
    const handleNewNotif = (e) => {
      const newNotif = e.detail;
      if (!newNotif) return;
      setNotifications((prev) => {
        // Prevent duplicates
        const exists = prev.some((n) => (n._id || n.id) === (newNotif._id || newNotif.id));
        if (exists) return prev;
        return [newNotif, ...prev];
      });
    };

    const handleRead = (e) => {
      const { id } = e.detail || {};
      if (!id) return;
      setNotifications((prev) =>
        prev.map((n) => (n._id === id || n.id === id ? { ...n, status: 'read', isRead: true } : n))
      );
    };

    const handleAllRead = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read', isRead: true })));
    };

    window.addEventListener('flowly:new-notification', handleNewNotif);
    window.addEventListener('flowly:notification-read', handleRead);
    window.addEventListener('flowly:notifications-all-read', handleAllRead);

    return () => {
      window.removeEventListener('flowly:new-notification', handleNewNotif);
      window.removeEventListener('flowly:notification-read', handleRead);
      window.removeEventListener('flowly:notifications-all-read', handleAllRead);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read', isRead: true })));
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      setDrawerError(getErrorMessage(err, 'Failed to mark all notifications as read.'));
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id || n.id === id ? { ...n, status: 'read', isRead: true } : n))
      );
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      setDrawerError(getErrorMessage(err, 'Failed to update notification.'));
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id && n.id !== id));
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to delete notification:', err);
      setDrawerError(getErrorMessage(err, 'Failed to delete notification.'));
    }
  };

  const handleActionClick = (route, id, unread) => {
    if (unread && id) {
      handleMarkRead(id);
    }
    if (onClose) onClose();
    if (route) navigate(route);
  };

  // Helper to determine if notification represents a money credit, debit, or transaction
  const isTransactionNotification = (item) => {
    if (!item) return false;
    const type = String(item.type || '').toLowerCase();
    if (['transfer', 'deposit', 'withdrawal', 'payment', 'transaction'].includes(type)) {
      return true;
    }
    if (item.meta && (item.meta.receiptNumber || item.meta.transactionId || item.meta.paymentId || item.meta.transferId || item.meta.amount)) {
      return true;
    }
    const text = `${item.title || ''} ${item.message || ''}`.toLowerCase();
    const txnKeywords = [
      'credited',
      'debited',
      'transferred',
      'transfer sent',
      'transfer received',
      'cash deposit',
      'cash withdrawal',
      'withdrawn',
      'deposited',
      'money added',
      'payment received',
      'payment sent',
      'emi paid',
      'loan disbursed',
      'sent to',
      'received from',
    ];
    return txnKeywords.some((kw) => text.includes(kw));
  };

  // Helper to determine if transaction is a debit (funds outgoing / withdrawn / sent)
  const isDebitNotification = (item) => {
    if (!item) return false;
    const type = String(item.type || '').toLowerCase();
    if (type === 'withdrawal') return true;
    if (item.meta?.type === 'debit' || item.meta?.direction === 'debit' || item.meta?.transactionType === 'debit') return true;
    const text = `${item.title || ''} ${item.message || ''}`.toLowerCase();
    const debitKeywords = [
      'debited',
      'transfer sent',
      'card transfer sent',
      'withdrawn',
      'cash withdrawal',
      'sent to',
      'deducted',
      'paid ₹',
      'payment sent',
      'emi paid',
      'paid to',
    ];
    return debitKeywords.some((kw) => text.includes(kw));
  };

  const handleReportProblem = (item) => {
    if (!item) return;

    let category = 'payment';
    const isDebit = isDebitNotification(item);
    const notifTitle = item.title || 'Transaction';
    const notifMessage = item.message || '';
    const notifTime = item.createdAt ? new Date(item.createdAt).toLocaleString() : new Date().toLocaleString();

    let subject = isDebit
      ? `Report Debit: ${notifTitle}`
      : `Transaction Inquiry: ${notifTitle}`;
    if (subject.length > 120) {
      subject = subject.slice(0, 117) + '...';
    }

    const description = `Regarding transaction notification: "${notifTitle}"\nMessage: ${notifMessage}\nDate: ${notifTime}\nType: ${isDebit ? 'Money Debited (Freeze requested)' : 'Money Credited / Financial'}\n\nPlease describe the issue: `;

    if (!isRead(item)) {
      handleMarkRead(item._id || item.id);
    }
    if (onClose) onClose();
    navigate('/help?tab=create', {
      state: {
        activeTab: 'create',
        tab: 'create',
        category,
        priority: isDebit ? 'urgent' : 'high',
        subject,
        description,
        notificationId: item._id || item.id,
        fromNotification: notifTitle,
        isDebit,
      },
    });
  };

  // Report Transaction Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingItem, setReportingItem] = useState(null);
  const [reportReason, setReportReason] = useState('Unauthorized / suspicious transaction');
  const [reportingLoading, setReportingLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const handleOpenReport = (item) => {
    if (!item) return;
    const isDebit = isDebitNotification(item);
    setReportingItem(item);
    setReportReason(
      isDebit
        ? 'Unauthorized / suspicious debit transaction'
        : 'Disputed transaction / incorrect amount credited'
    );
    setReportError('');
    setReportSuccess('');
    setReportModalOpen(true);
  };

  const handleCloseReport = () => {
    if (reportingLoading) return;
    setReportModalOpen(false);
    setReportingItem(null);
    setReportError('');
    setReportSuccess('');
  };

  const handleConfirmReport = async () => {
    if (!reportingItem) return;
    setReportingLoading(true);
    setReportError('');
    try {
      const receiptNumber = reportingItem.meta?.receiptNumber;
      const notificationId = reportingItem._id || reportingItem.id;
      const isDebit = isDebitNotification(reportingItem);

      const res = await transferAPI.reportTransfer({
        notificationId,
        receiptNumber,
        isDebit,
        reason: reportReason.trim() || (isDebit ? 'Unauthorized / suspicious debit' : 'Transaction inquiry'),
      });

      // Update notification in local state
      setNotifications((prev) =>
        prev.map((n) =>
          (n._id === notificationId || n.id === notificationId)
            ? {
                ...n,
                meta: { ...(n.meta || {}), reported: true, reportedAt: new Date(), isDebitReport: isDebit },
              }
            : n
        )
      );

      if (isDebit) {
        setReportSuccess(
          res.data?.message ||
          'Debit reported successfully. Outgoing money transactions have been blocked for your protection.'
        );
        // Dispatch global events so user profile & account reflect "suspended"
        window.dispatchEvent(new CustomEvent('flowly:account-suspended'));
        window.dispatchEvent(new CustomEvent('flowly:account-update'));
      } else {
        setReportSuccess(
          res.data?.message ||
          'Transaction inquiry submitted. Our support team is investigating the issue.'
        );
      }

      setTimeout(() => {
        setReportModalOpen(false);
        setReportingItem(null);
        setReportSuccess('');
      }, 2200);
    } catch (err) {
      setReportError(err.response?.data?.message || err.message || 'Failed to report transaction');
    } finally {
      setReportingLoading(false);
    }
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !isRead(n)).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !isRead(n));
    }
    return notifications;
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ justifyContent: 'flex-end', padding: 0, zIndex: 100 }}>
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          height: '100vh',
          backgroundColor: '#FFFFFF',
          boxShadow: '-8px 0 30px rgba(32, 21, 48, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E7E4DC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAF9F5',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                backgroundColor: '#EEE7F4',
                color: '#5C187B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bell size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '17px', margin: 0, fontWeight: 700, color: '#201530' }}>
                Notifications
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#6E677B' }}>
                Real-time updates & activity alerts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6E677B',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab & Filter Bar */}
        <div
          style={{
            padding: '10px 24px',
            backgroundColor: '#F6F5F1',
            borderBottom: '1px solid #E7E4DC',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setActiveTab('all')}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'all' ? '#5C187B' : 'transparent',
                color: activeTab === 'all' ? '#FFFFFF' : '#6E677B',
                transition: 'all 0.15s ease',
              }}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              style={{
                padding: '5px 12px',
                borderRadius: '20px',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'unread' ? '#5C187B' : 'transparent',
                color: activeTab === 'unread' ? '#FFFFFF' : '#6E677B',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              Unread
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: activeTab === 'unread' ? '#FFFFFF' : '#B23A2E',
                    color: activeTab === 'unread' ? '#5C187B' : '#FFFFFF',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              style={{
                background: 'none',
                border: 'none',
                color: '#5C187B',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
        </div>

        {drawerError && (
          <div style={{
            padding: '10px 16px',
            backgroundColor: '#FADADA',
            color: '#B23A2E',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} /> <span>{drawerError}</span>
            </div>
            <button
              onClick={() => setDrawerError('')}
              style={{ background: 'none', border: 'none', color: '#B23A2E', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        )}

        {/* Notifications Scroll List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6E677B', fontSize: '13px' }}>
              Loading your notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#A19AA8' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '16px',
                  backgroundColor: '#F6F5F1',
                  margin: '0 auto 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A19AA8',
                }}
              >
                <Bell size={28} />
              </div>
              <p style={{ fontWeight: 700, color: '#201530', fontSize: '15px', marginBottom: '4px' }}>
                {activeTab === 'unread' ? 'All caught up!' : 'No notifications yet'}
              </p>
              <p style={{ fontSize: '12px', maxWidth: '260px', margin: '0 auto', lineHeight: 1.5 }}>
                {activeTab === 'unread'
                  ? 'You have read all your notifications.'
                  : 'Real-time alerts for KYC, loans, transfers, and wallet balance updates will appear here.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredNotifications.map((item) => {
                const unread = !isRead(item);
                const config = getTypeConfig(item.type);

                return (
                  <div
                    key={item._id || item.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '12px',
                      backgroundColor: unread ? '#FAF5FF' : '#FFFFFF',
                      border: unread ? '1.5px solid #C4B5FD' : '1px solid #E7E4DC',
                      boxShadow: unread
                        ? '0 2px 10px rgba(139, 92, 246, 0.08)'
                        : '0 1px 3px rgba(32, 21, 48, 0.02)',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Unread indicator dot */}
                    {unread && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '14px',
                          right: '14px',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: '#8B5CF6',
                        }}
                      />
                    )}

                    {/* Top Row: Type Pill & Time */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        paddingRight: unread ? '16px' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: config.badgeBg,
                            color: config.badgeColor,
                          }}
                        >
                          {config.icon}
                          {config.label}
                        </span>
                      </div>
                      <span
                        style={{ fontSize: '11px', color: '#8A8196', fontWeight: 500 }}
                        title={new Date(item.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    {/* Title */}
                    <h4
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#201530',
                        margin: '0 0 4px 0',
                        lineHeight: 1.3,
                      }}
                    >
                      {item.title}
                    </h4>

                    {/* Message */}
                    <p
                      style={{
                        fontSize: '12.5px',
                        color: '#4A4453',
                        margin: 0,
                        lineHeight: 1.45,
                      }}
                    >
                      {item.message}
                    </p>

                    {/* Footer Controls */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px solid rgba(231, 228, 220, 0.6)',
                      }}
                    >
                      {/* Left controls: Optional Action Button & Report Option */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {config.actionRoute && (
                          <button
                            onClick={() => handleActionClick(config.actionRoute, item._id || item.id, unread)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#5C187B',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: 0,
                            }}
                          >
                            {config.actionLabel} <ChevronRight size={13} />
                          </button>
                        )}

                        {/* Report button ONLY for money credited, debited, or other transaction notifications */}
                        {isTransactionNotification(item) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReport(item);
                            }}
                            style={{
                              background: isDebitNotification(item) ? '#FEF2F2' : '#EFF6FF',
                              border: `1px solid ${isDebitNotification(item) ? '#FECACA' : '#BFDBFE'}`,
                              color: isDebitNotification(item) ? '#DC2626' : '#2563EB',
                              borderRadius: '5px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDebitNotification(item) ? '#FEE2E2' : '#DBEAFE';
                              e.currentTarget.style.color = isDebitNotification(item) ? '#B91C1C' : '#1D4ED8';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isDebitNotification(item) ? '#FEF2F2' : '#EFF6FF';
                              e.currentTarget.style.color = isDebitNotification(item) ? '#DC2626' : '#2563EB';
                            }}
                            title={isDebitNotification(item) ? "Report debit & block transactions for protection" : "Report transaction issue"}
                          >
                            <AlertTriangle size={11} /> {isDebitNotification(item) ? 'Report Debit' : 'Report Issue'}
                          </button>
                        )}

                        {(item.meta?.reported || item.status === 'reported') && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 7px',
                              borderRadius: '5px',
                              fontSize: '10.5px',
                              fontWeight: 700,
                              backgroundColor: '#FEE2E2',
                              color: '#B91C1C',
                              border: '1px solid #FECACA',
                            }}
                          >
                            <ShieldAlert size={11} /> Reported
                          </span>
                        )}
                      </div>

                      {/* Right buttons: mark read / delete */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {unread && (
                          <button
                            onClick={() => handleMarkRead(item._id || item.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#5C187B',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item._id || item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#A19AA8',
                            cursor: 'pointer',
                            padding: '3px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'color 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#B23A2E')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#A19AA8')}
                          title="Delete notification"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* REPORT TRANSACTION CONFIRMATION MODAL                   */}
      {/* ======================================================== */}
      {reportModalOpen && reportingItem && (() => {
        const isDebit = isDebitNotification(reportingItem);
        return (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(32, 21, 48, 0.6)',
              backdropFilter: 'blur(3px)',
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '460px',
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 20px 40px rgba(32, 21, 48, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                animation: 'scaleUp 0.15s ease-out',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: isDebit ? '#FEE2E2' : '#EFF6FF',
                    color: isDebit ? '#DC2626' : '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1F2937' }}>
                    {isDebit ? 'Report Debit & Freeze Transactions' : 'Report Credited Transaction'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>
                    {isDebit ? 'Security action: Outgoing money transactions will be blocked' : 'Financial inquiry & support investigation'}
                  </p>
                </div>
              </div>

              {/* Warning or Info Banner */}
              {isDebit ? (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#FEF2F2',
                    border: '1.5px solid #FCA5A5',
                    color: '#991B1B',
                    fontSize: '12.5px',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldAlert size={14} /> Outgoing Transactions Will Be Blocked
                  </div>
                  Reporting this debit will immediately block further money transactions on your account with <strong>"Account temporarily suspended"</strong> to protect your funds against unauthorized loss. An authorized bank worker will review this transaction report and enable transactions back from the worker desk once verified.
                </div>
              ) : (
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#EFF6FF',
                    border: '1.5px solid #BFDBFE',
                    color: '#1E40AF',
                    fontSize: '12.5px',
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} /> Transaction Inquiry
                  </div>
                  Report an issue regarding this credited transaction (e.g. unknown sender, wrong deposit amount, duplicate credit). A priority support ticket will be opened for investigation. Your outgoing money transactions will remain active.
                </div>
              )}

              {/* Transaction Details Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  fontSize: '12.5px',
                  color: '#374151',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6B7280' }}>Notification</span>
                  <span style={{ fontWeight: 600 }}>{reportingItem.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6B7280' }}>Transaction Type</span>
                  <span className={`badge ${isDebit ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                    {isDebit ? 'Money Debited' : 'Money Credited'}
                  </span>
                </div>
                {reportingItem.meta?.receiptNumber && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B7280' }}>Reference</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#5C187B' }}>
                      {reportingItem.meta.receiptNumber}
                    </span>
                  </div>
                )}
                {reportingItem.meta?.amount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6B7280' }}>Amount</span>
                    <span style={{ fontWeight: 700, color: isDebit ? '#DC2626' : '#059669' }}>
                      {isDebit ? '-' : '+'}₹{Number(reportingItem.meta.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Reason input */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    color: '#374151',
                    marginBottom: '6px',
                  }}
                >
                  Reason for reporting <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {isDebit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setReportReason('Unauthorized / suspicious debit transaction')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Unauthorized Debit
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportReason('I did not authorize or make this debit')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Did Not Authorize
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportReason('Debited more than expected / wrong amount')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Incorrect Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportReason('Duplicate deduction / charged twice')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Duplicate Deduction
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setReportReason('Unrecognized sender / unexpected funds credited')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Unknown Sender
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportReason('Deposit amount mismatch')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Amount Mismatch
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportReason('Duplicate credit received')}
                        style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #D1D5DB', background: '#F3F4F6', cursor: 'pointer' }}
                      >
                        Duplicate Credit
                      </button>
                    </>
                  )}
                </div>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Unauthorized transaction, suspected fraud..."
                  disabled={reportingLoading}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #D1D5DB',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Feedback messages */}
              {reportError && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FEE2E2',
                    color: '#B91C1C',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertCircle size={14} /> {reportError}
                </div>
              )}

              {reportSuccess && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#DEF7EC',
                    color: '#03543F',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle2 size={14} /> {reportSuccess}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseReport();
                    handleReportProblem(reportingItem);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#5C187B',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  Detailed Ticket in Help Center ↗
                </button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleCloseReport}
                    disabled={reportingLoading}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      border: '1px solid #D1D5DB',
                      backgroundColor: '#FFFFFF',
                      color: '#374151',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: reportingLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReport}
                    disabled={reportingLoading || !!reportSuccess}
                    style={{
                      padding: '9px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: isDebit ? '#DC2626' : '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: reportingLoading || !!reportSuccess ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: isDebit ? '0 2px 8px rgba(220, 38, 38, 0.3)' : '0 2px 8px rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    {reportingLoading ? (
                      'Submitting...'
                    ) : isDebit ? (
                      <>
                        <ShieldAlert size={14} /> Report & Block Transactions
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Submit Inquiry
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default NotificationsDrawer;
