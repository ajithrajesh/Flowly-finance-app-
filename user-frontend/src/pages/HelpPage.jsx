import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supportAPI, getErrorMessage } from '../services/api';
import {
  LifeBuoy,
  MessageSquare,
  Send,
  PlusCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ChevronRight,
  User,
  Shield,
  PhoneCall,
  Mail,
  RefreshCw,
  Tag,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check
} from 'lucide-react';

const CATEGORIES = [
  { value: 'kyc', label: 'KYC Verification', desc: 'ID proofs, selfie, or status checks' },
  { value: 'loan', label: 'Loans & EMI', desc: 'Application, approval, or repayment issues' },
  { value: 'account', label: 'Account & Profile', desc: 'Personal details, MPIN, or security' },
  { value: 'fd', label: 'Fixed Deposits', desc: 'FD booking, scheme rules, or maturity' },
  { value: 'payment', label: 'Payments & Add Money', desc: 'Card top-up, wallet debit, or failed transfers' },
  { value: 'technical', label: 'Technical Issue', desc: 'App bug, display glitch, or loading error' },
  { value: 'other', label: 'Other Inquiries', desc: 'General questions or assistance' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#6E677B', bg: '#F6F5F1' },
  { value: 'medium', label: 'Medium', color: '#1B69B2', bg: '#EBF4FC' },
  { value: 'high', label: 'High', color: '#9A6A0C', bg: '#FBEFD9' },
  { value: 'urgent', label: 'Urgent', color: '#B23A2E', bg: '#FADADA' },
];

const STATUS_CONFIG = {
  open: { label: 'Open', color: '#9A6A0C', bg: '#FBEFD9' },
  in_progress: { label: 'In Progress', color: '#5C187B', bg: '#EEE7F4' },
  resolved: { label: 'Resolved', color: '#2E7A22', bg: '#E4F4DC' },
  closed: { label: 'Closed', color: '#6E677B', bg: '#EFECE6' },
};

export default function HelpPage() {
  const { user } = useAuth();

  // Navigation tab: 'tickets' | 'create'
  const [activeTab, setActiveTab] = useState('tickets');

  // Tickets list state
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // Active ticket thread view
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyError, setReplyError] = useState('');

  // Create form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const messagesEndRef = useRef(null);

  // Load customer tickets
  const fetchTickets = async (status = statusFilter, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const params = {};
      if (status && status !== 'all') params.status = status;
      const res = await supportAPI.getMyTickets(params);
      if (res.data?.tickets) {
        setTickets(res.data.tickets);
      } else {
        setTickets([]);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
      setFormError(getErrorMessage(err, 'Failed to fetch support tickets. Please refresh the page.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTickets(statusFilter);
  }, [statusFilter]);

  // Load ticket details when selected
  const openTicketDetail = async (id) => {
    setSelectedTicketId(id);
    setDetailLoading(true);
    setReplyError('');
    try {
      const res = await supportAPI.getMyTicket(id);
      if (res.data?.ticket) {
        setTicketDetail(res.data.ticket);
      } else {
        setReplyError(res.data?.message || 'Failed to load ticket details.');
      }
    } catch (err) {
      setReplyError(getErrorMessage(err, 'Failed to load ticket details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeTicketDetail = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setReplyMessage('');
    setReplyError('');
    // Refresh tickets list
    fetchTickets(statusFilter);
  };

  // Scroll to bottom of message thread
  useEffect(() => {
    if (ticketDetail && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticketDetail]);

  // Handle customer reply
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !ticketDetail) return;
    setReplying(true);
    setReplyError('');
    try {
      const res = await supportAPI.reply(ticketDetail._id, { message: replyMessage.trim() });
      if (res.data?.ticket) {
        setTicketDetail(res.data.ticket);
        setReplyMessage('');
      } else {
        setReplyError(res.data?.message || 'Failed to submit reply. Please try again.');
      }
    } catch (err) {
      setReplyError(getErrorMessage(err, 'Failed to submit reply. Please try again.'));
    } finally {
      setReplying(false);
    }
  };

  // Handle ticket creation
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (subject.trim().length < 5 || subject.trim().length > 120) {
      setFormError('Subject must be between 5 and 120 characters.');
      return;
    }
    if (description.trim().length < 10 || description.trim().length > 2000) {
      setFormError('Description must be between 10 and 2000 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await supportAPI.create({
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
      });

      const createdTicket = res.data.ticket;
      setFormSuccess(`Ticket ${createdTicket.ticketNumber} created successfully! Our team will assist you shortly.`);
      setSubject('');
      setCategory('other');
      setPriority('medium');
      setDescription('');

      // Refresh tickets list and switch to tickets view after a short moment
      setTimeout(() => {
        fetchTickets('all');
        setActiveTab('tickets');
        setFormSuccess('');
        if (createdTicket?._id) {
          openTicketDetail(createdTicket._id);
        }
      }, 1200);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to submit ticket. Please check your input.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '32px 20px 60px' }}>
      {/* Top Page Header */}
      <div style={{
        background: 'linear-gradient(135deg, #241531 0%, #3B1250 50%, #5C187B 100%)',
        borderRadius: '20px',
        padding: '36px 32px',
        color: '#FFFFFF',
        boxShadow: '0 8px 32px rgba(36, 21, 49, 0.25)',
        marginBottom: '28px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, rgba(255,255,255,0) 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#D8B4FE',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <LifeBuoy size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
              Help & Support Center
            </h1>
            <p style={{ fontSize: '14px', color: '#D8B4FE', margin: '4px 0 0' }}>
              Report a problem, resolve account issues, or get direct assistance from Flowly specialists.
            </p>
          </div>
        </div>

        {/* Quick Contact Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.12)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PhoneCall size={18} style={{ color: '#D8B4FE' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#C4BFCF', textTransform: 'uppercase', fontWeight: 600 }}>Toll-Free Helpline</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>1800-420-FLOW (24/7)</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Mail size={18} style={{ color: '#D8B4FE' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#C4BFCF', textTransform: 'uppercase', fontWeight: 600 }}>Email Support</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>support@flowlyfinance.com</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Clock size={18} style={{ color: '#D8B4FE' }} />
            <div>
              <div style={{ fontSize: '11px', color: '#C4BFCF', textTransform: 'uppercase', fontWeight: 600 }}>Average Resolution</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>Within 2-4 Hours</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #E7E4DC',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => { setActiveTab('tickets'); setSelectedTicketId(null); }}
            style={{
              padding: '12px 20px',
              fontSize: '15px',
              fontWeight: 700,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tickets' ? '3px solid #5C187B' : '3px solid transparent',
              color: activeTab === 'tickets' ? '#5C187B' : '#6E677B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '-2px',
              transition: 'all 0.15s ease'
            }}
          >
            <MessageSquare size={18} />
            My Tickets
            {tickets.length > 0 && (
              <span style={{
                backgroundColor: activeTab === 'tickets' ? '#EEE7F4' : '#EFECE6',
                color: activeTab === 'tickets' ? '#5C187B' : '#6E677B',
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {tickets.length}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('create'); setSelectedTicketId(null); }}
            style={{
              padding: '12px 20px',
              fontSize: '15px',
              fontWeight: 700,
              backgroundColor: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'create' ? '3px solid #5C187B' : '3px solid transparent',
              color: activeTab === 'create' ? '#5C187B' : '#6E677B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '-2px',
              transition: 'all 0.15s ease'
            }}
          >
            <PlusCircle size={18} />
            Report a Problem / New Ticket
          </button>
        </div>

        {activeTab === 'tickets' && !selectedTicketId && (
          <button
            onClick={() => fetchTickets(statusFilter, true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px solid #E7E4DC',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#6E677B',
              cursor: 'pointer'
            }}
            title="Refresh tickets"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Updating...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* ======================================================== */}
      {/* TAB 1: MY TICKETS                                       */}
      {/* ======================================================== */}
      {activeTab === 'tickets' && !selectedTicketId && (
        <div>
          {/* Status Filter Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#6E677B', marginRight: '4px' }}>
              Filter by Status:
            </span>
            {['all', 'open', 'in_progress', 'resolved', 'closed'].map((st) => {
              const active = statusFilter === st;
              const label = st === 'all' ? 'All Tickets' : STATUS_CONFIG[st]?.label || st;
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: active ? '#5C187B' : '#E7E4DC',
                    backgroundColor: active ? '#5C187B' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#6E677B',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tickets List */}
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E7E4DC',
              color: '#6E677B'
            }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#8B5CF6' }} />
              <div style={{ fontWeight: 600 }}>Loading support tickets...</div>
            </div>
          ) : tickets.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E7E4DC',
              color: '#6E677B'
            }}>
              <LifeBuoy size={42} style={{ margin: '0 auto 12px', color: '#C4BFCF' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#201530', marginBottom: '6px' }}>
                No support tickets found
              </h3>
              <p style={{ fontSize: '14px', color: '#6E677B', maxWidth: '420px', margin: '0 auto 20px' }}>
                {statusFilter === 'all'
                  ? "You haven't reported any problems or raised support tickets yet."
                  : `You don't have any tickets with status "${statusFilter}".`}
              </p>
              <button
                onClick={() => setActiveTab('create')}
                className="btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <PlusCircle size={16} /> Raise a Support Ticket
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tickets.map((t) => {
                const st = STATUS_CONFIG[t.status] || { label: t.status, color: '#6E677B', bg: '#EEE' };
                const prio = PRIORITIES.find((p) => p.value === t.priority) || PRIORITIES[1];
                const catObj = CATEGORIES.find((c) => c.value === t.category);
                const messageCount = t.messages?.length || 1;

                return (
                  <div
                    key={t._id}
                    onClick={() => openTicketDetail(t._id)}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: '14px',
                      border: '1px solid #E7E4DC',
                      padding: '18px 22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: '0 2px 8px rgba(32, 21, 48, 0.03)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8B5CF6';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(92, 24, 123, 0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#E7E4DC';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(32, 21, 48, 0.03)';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontFamily: 'monospace',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          color: '#5C187B',
                          backgroundColor: '#EEE7F4',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {t.ticketNumber}
                        </span>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: st.color,
                          backgroundColor: st.bg,
                          padding: '3px 9px',
                          borderRadius: '6px'
                        }}>
                          {st.label}
                        </span>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: prio.color,
                          backgroundColor: prio.bg,
                          padding: '3px 9px',
                          borderRadius: '6px'
                        }}>
                          {prio.label}
                        </span>

                        <span style={{
                          fontSize: '12px',
                          color: '#6E677B',
                          fontWeight: 500,
                          backgroundColor: '#F6F5F1',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {catObj?.label || t.category}
                        </span>
                      </div>

                      <h4 style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#201530',
                        margin: '0 0 6px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {t.subject}
                      </h4>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#A19AA8' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={13} />
                          {new Date(t.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MessageSquare size={13} />
                          {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                        </span>
                        {t.assignedTo && (
                          <span style={{ color: '#5C187B', fontWeight: 600 }}>
                            Assigned to {t.assignedTo.name}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#5C187B',
                      fontSize: '13px',
                      fontWeight: 600,
                      flexShrink: 0
                    }}>
                      View Thread <ChevronRight size={18} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TICKET THREAD / DETAIL VIEW                             */}
      {/* ======================================================== */}
      {activeTab === 'tickets' && selectedTicketId && (
        <div>
          <button
            onClick={closeTicketDetail}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: '#5C187B',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: '16px',
              padding: 0
            }}
          >
            <ArrowLeft size={16} /> Back to all tickets
          </button>

          {detailLoading || !ticketDetail ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E7E4DC',
              color: '#6E677B'
            }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#8B5CF6' }} />
              <div>Loading ticket conversation...</div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #E7E4DC',
              boxShadow: '0 4px 16px rgba(32, 21, 48, 0.05)',
              overflow: 'hidden'
            }}>
              {/* Ticket Top Header */}
              <div style={{
                padding: '22px 28px',
                borderBottom: '1px solid #E7E4DC',
                backgroundColor: '#FAF9F6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '14px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      fontWeight: 800,
                      color: '#5C187B',
                      backgroundColor: '#EEE7F4',
                      padding: '3px 8px',
                      borderRadius: '6px'
                    }}>
                      {ticketDetail.ticketNumber}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: (STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).color,
                      backgroundColor: (STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).bg,
                      padding: '3px 9px',
                      borderRadius: '6px'
                    }}>
                      {(STATUS_CONFIG[ticketDetail.status] || STATUS_CONFIG.open).label}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: (PRIORITIES.find(p => p.value === ticketDetail.priority) || PRIORITIES[1]).color,
                      backgroundColor: (PRIORITIES.find(p => p.value === ticketDetail.priority) || PRIORITIES[1]).bg,
                      padding: '3px 9px',
                      borderRadius: '6px'
                    }}>
                      {(PRIORITIES.find(p => p.value === ticketDetail.priority) || PRIORITIES[1]).label} Priority
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: '#6E677B',
                      backgroundColor: '#EFECE6',
                      padding: '3px 8px',
                      borderRadius: '6px'
                    }}>
                      {CATEGORIES.find(c => c.value === ticketDetail.category)?.label || ticketDetail.category}
                    </span>
                  </div>

                  <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#201530', margin: 0 }}>
                    {ticketDetail.subject}
                  </h2>
                </div>

                <div style={{ fontSize: '12px', color: '#6E677B', textAlign: 'right' }}>
                  <div>Opened on {new Date(ticketDetail.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}</div>
                  {ticketDetail.assignedTo && (
                    <div style={{ marginTop: '4px', fontWeight: 600, color: '#5C187B' }}>
                      Assigned Agent: {ticketDetail.assignedTo.name}
                    </div>
                  )}
                  {ticketDetail.resolvedAt && (
                    <div style={{ marginTop: '2px', color: '#2E7A22', fontWeight: 600 }}>
                      Resolved on {new Date(ticketDetail.resolvedAt).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Message Thread History */}
              <div style={{
                padding: '28px',
                maxHeight: '520px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px',
                backgroundColor: '#FFFFFF'
              }}>
                {ticketDetail.messages && ticketDetail.messages.length > 0 ? (
                  ticketDetail.messages.map((m, idx) => {
                    const isStaff = m.senderRole === 'worker' || m.senderRole === 'admin';
                    const senderLabel = isStaff ? (m.senderRole === 'admin' ? 'Flowly Admin' : 'Flowly Support Staff') : 'You (Customer)';

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isStaff ? 'flex-start' : 'flex-end',
                          width: '100%'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '4px',
                          fontSize: '11.5px',
                          color: '#6E677B'
                        }}>
                          {isStaff && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: '#EEE7F4',
                              color: '#5C187B',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              <Shield size={11} /> {senderLabel}
                            </span>
                          )}
                          {!isStaff && (
                            <span style={{ fontWeight: 600, color: '#201530' }}>
                              {senderLabel}
                            </span>
                          )}
                          <span>
                            {new Date(m.sentAt || ticketDetail.createdAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: 'numeric',
                              month: 'short'
                            })}
                          </span>
                        </div>

                        <div style={{
                          maxWidth: '78%',
                          padding: '14px 18px',
                          borderRadius: isStaff ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                          backgroundColor: isStaff ? '#F6F5F1' : '#5C187B',
                          color: isStaff ? '#201530' : '#FFFFFF',
                          border: isStaff ? '1px solid #E7E4DC' : 'none',
                          fontSize: '14px',
                          lineHeight: '1.55',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          boxShadow: isStaff ? 'none' : '0 4px 12px rgba(92, 24, 123, 0.18)'
                        }}>
                          {m.message}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', color: '#6E677B', padding: '20px' }}>
                    No messages recorded yet.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Section */}
              <div style={{
                padding: '20px 28px',
                borderTop: '1px solid #E7E4DC',
                backgroundColor: '#FAF9F6'
              }}>
                {ticketDetail.status === 'closed' ? (
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#EFECE6',
                    color: '#6E677B',
                    fontSize: '13.5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <AlertTriangle size={18} style={{ color: '#9A6A0C', flexShrink: 0 }} />
                    <div>
                      <strong>This ticket is closed.</strong> Replies are disabled. If you need additional assistance with this or a different issue, please{' '}
                      <button
                        onClick={() => { setActiveTab('create'); setSelectedTicketId(null); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#5C187B',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        raise a new ticket
                      </button>.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSendReply}>
                    {replyError && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#FADADA',
                        color: '#B23A2E',
                        fontSize: '13px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertCircle size={15} /> {replyError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <textarea
                          rows={3}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Type your reply here to update support staff..."
                          style={{
                            width: '100%',
                            padding: '12px 14px',
                            borderRadius: '10px',
                            border: '1.5px solid #E7E4DC',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            resize: 'none',
                            outline: 'none',
                            backgroundColor: '#FFFFFF',
                            transition: 'border-color 0.15s ease'
                          }}
                          onFocus={(e) => e.target.style.borderColor = '#8B5CF6'}
                          onBlur={(e) => e.target.style.borderColor = '#E7E4DC'}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#A19AA8', marginTop: '4px' }}>
                          <span>Replies are immediately visible to your assigned staff agent.</span>
                          <span>{replyMessage.length}/2000</span>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={replying || !replyMessage.trim()}
                        className="btn-primary"
                        style={{
                          height: '46px',
                          padding: '0 20px',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: replying || !replyMessage.trim() ? 'not-allowed' : 'pointer',
                          opacity: replying || !replyMessage.trim() ? 0.6 : 1,
                          flexShrink: 0
                        }}
                      >
                        <Send size={16} />
                        {replying ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: REPORT A PROBLEM / NEW TICKET                    */}
      {/* ======================================================== */}
      {activeTab === 'create' && (
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E7E4DC',
          padding: '32px',
          boxShadow: '0 4px 20px rgba(32, 21, 48, 0.05)',
          maxWidth: '820px',
          margin: '0 auto'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#201530', margin: '0 0 6px' }}>
              Report a Problem or Submit a Query
            </h2>
            <p style={{ fontSize: '14px', color: '#6E677B', margin: 0 }}>
              Provide clear details about the issue you're facing. Our customer support team will investigate and follow up on this thread.
            </p>
          </div>

          {formSuccess && (
            <div style={{
              padding: '14px 18px',
              borderRadius: '10px',
              backgroundColor: '#E4F4DC',
              color: '#2E7A22',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <CheckCircle2 size={20} />
              {formSuccess}
            </div>
          )}

          {formError && (
            <div style={{
              padding: '14px 18px',
              borderRadius: '10px',
              backgroundColor: '#FADADA',
              color: '#B23A2E',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={20} />
              {formError}
            </div>
          )}

          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Category & Priority Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#201530', marginBottom: '8px' }}>
                  Issue Category <span style={{ color: '#B23A2E' }}>*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #E7E4DC',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    color: '#201530',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({c.desc})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#201530', marginBottom: '8px' }}>
                  Priority Level
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: '1.5px solid #E7E4DC',
                    fontSize: '14px',
                    backgroundColor: '#FFFFFF',
                    color: '#201530',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label} Priority
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Subject */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#201530' }}>
                  Subject Summary <span style={{ color: '#B23A2E' }}>*</span>
                </label>
                <span style={{ fontSize: '12px', color: subject.length > 120 ? '#B23A2E' : '#A19AA8' }}>
                  {subject.length}/120
                </span>
              </div>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief title (e.g. Deposit amount not reflected in account balance)"
                maxLength={120}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #E7E4DC',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#201530'
                }}
                onFocus={(e) => e.target.style.borderColor = '#8B5CF6'}
                onBlur={(e) => e.target.style.borderColor = '#E7E4DC'}
              />
              <span style={{ fontSize: '11.5px', color: '#6E677B', marginTop: '4px', display: 'block' }}>
                Between 5 and 120 characters.
              </span>
            </div>

            {/* Description */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#201530' }}>
                  Detailed Problem Description <span style={{ color: '#B23A2E' }}>*</span>
                </label>
                <span style={{ fontSize: '12px', color: description.length > 2000 ? '#B23A2E' : '#A19AA8' }}>
                  {description.length}/2000
                </span>
              </div>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what happened, relevant transaction dates, amounts, loan numbers, or error messages encountered..."
                maxLength={2000}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1.5px solid #E7E4DC',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                  backgroundColor: '#FFFFFF',
                  color: '#201530'
                }}
                onFocus={(e) => e.target.style.borderColor = '#8B5CF6'}
                onBlur={(e) => e.target.style.borderColor = '#E7E4DC'}
              />
              <span style={{ fontSize: '11.5px', color: '#6E677B', marginTop: '4px', display: 'block' }}>
                Minimum 10 characters. Be as specific as possible so staff can resolve your request faster.
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('tickets')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '1px solid #E7E4DC',
                  backgroundColor: '#FFFFFF',
                  color: '#6E677B',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary"
                style={{
                  padding: '10px 28px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Submit Ticket
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
