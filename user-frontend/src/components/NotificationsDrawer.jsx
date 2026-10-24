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

  // Report Transfer Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingItem, setReportingItem] = useState(null);
  const [reportReason, setReportReason] = useState('Unauthorized / suspicious transaction');
  const [reportingLoading, setReportingLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSuccess, setReportSuccess] = useState('');

  const handleOpenReport = (item) => {
    setReportingItem(item);
    setReportReason('Unauthorized / suspicious transaction');
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
      const res = await transferAPI.reportTransfer({
        notificationId,
        receiptNumber,
        reason: reportReason.trim() || 'Unauthorized / suspicious transfer',
      });

      // Update notification in local state
      setNotifications((prev) =>
        prev.map((n) =>
          (n._id === notificationId || n.id === notificationId)
            ? {
                ...n,
                meta: { ...(n.meta || {}), reported: true, reportedAt: new Date() },
              }
            : n
        )
      );

      setReportSuccess(res.data?.message || 'Transfer reported. Account temporarily suspended.');

      // Dispatch global events so user profile & account reflect "suspended"
      window.dispatchEvent(new CustomEvent('flowly:account-suspended'));
      window.dispatchEvent(new CustomEvent('flowly:account-update'));

      setTimeout(() => {
        setReportModalOpen(false);
        setReportingItem(null);
        setReportSuccess('');
      }, 1600);
    } catch (err) {
      setReportError(err.response?.data?.message || err.message || 'Failed to report transfer');
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

                        {/* Report Option for Transfer Notifications */}
                        {item.type === 'transfer' && (
                          item.meta?.reported || item.status === 'reported' ? (
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
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenReport(item);
                              }}
                              style={{
                                background: '#FEF2F2',
                                border: '1px solid #FECACA',
                                color: '#DC2626',
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
                              title="Report suspicious or unauthorized transfer"
                            >
                              <AlertTriangle size={11} /> Report
                            </button>
                          )
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
      {/* REPORT TRANSFER CONFIRMATION MODAL                      */}
      {/* ======================================================== */}
      {reportModalOpen && reportingItem && (
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
              maxWidth: '440px',
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
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
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
                  Report Transfer
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>
                  Security action & account protection
                </p>
              </div>
            </div>

            {/* Security Warning Alert */}
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
                <ShieldAlert size={14} /> Account will be temporarily suspended
              </div>
              Reporting this transfer will update the transaction status to reported and suspend your account with <strong>"Account temporarily suspended."</strong> for your security. Only an authorized bank worker can investigate and re-enable transactions.
            </div>

            {/* Transfer Details Card */}
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
                  <span style={{ fontWeight: 700, color: '#111827' }}>
                    ₹{Number(reportingItem.meta.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
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
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: reportingLoading || !!reportSuccess ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
                }}
              >
                {reportingLoading ? (
                  'Reporting...'
                ) : (
                  <>
                    <AlertTriangle size={14} /> Report & Suspend
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsDrawer;
