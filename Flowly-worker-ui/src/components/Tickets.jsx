import React, { useEffect, useState, useRef } from 'react';
import * as api from '../api';
import Icon from './Icon';

const STATUS_TABS = [
  { id: 'assigned_to_me', label: 'Assigned to Me' },
  { id: 'all', label: 'All Tickets' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'kyc', label: 'KYC Verification' },
  { value: 'loan', label: 'Loans & EMI' },
  { value: 'account', label: 'Account & Security' },
  { value: 'fd', label: 'Fixed Deposits' },
  { value: 'payment', label: 'Payments & Add Money' },
  { value: 'technical', label: 'Technical Issues' },
  { value: 'other', label: 'Other Inquiries' },
];

const PRIORITIES = [
  { value: 'all', label: 'All Priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export default function Tickets({ onToast, worker }) {
  const isSupport = worker?.role === 'support' || worker?.workerRole === 'support';

  // Tickets queue and stats
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0, urgent: 0 });
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rotational assignment state
  const [rotationData, setRotationData] = useState(null);
  const [showRotationModal, setShowRotationModal] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(isSupport ? 'assigned_to_me' : 'open');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Ticket detail / review modal
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(false);
  const [resolvingReport, setResolvingReport] = useState(false);

  const messagesEndRef = useRef(null);

  // Load ticket statistics
  const loadStats = async () => {
    try {
      const res = await api.fetchTicketStats();
      if (res?.stats) setStats(res.stats);
    } catch (err) {
      console.error('Failed to load ticket stats:', err);
    }
  };

  // Load rotational system status
  const loadRotation = async () => {
    try {
      const res = await api.fetchRotationStatus();
      if (res?.success) setRotationData(res);
    } catch (err) {
      console.error('Failed to load rotation status:', err);
    }
  };

  // Load tickets list
  const loadTickets = async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const queryParams = {
        page: p,
        limit: 15,
        category: categoryFilter,
        priority: priorityFilter,
        search: search.trim(),
      };
      if (statusFilter === 'assigned_to_me') {
        queryParams.assignedTo = 'me';
      } else {
        queryParams.status = statusFilter;
      }

      const res = await api.fetchTickets(queryParams);
      if (res && Array.isArray(res.tickets)) {
        setTickets(res.tickets);
        setPagination(res.pagination || null);
      } else {
        setTickets([]);
        setPagination(null);
        setError(res?.message || 'Failed to load tickets.');
      }
    } catch (err) {
      setError(err.message || 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadRotation();
    loadTickets(page);
  }, [page, statusFilter, categoryFilter, priorityFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    loadTickets(1);
  };

  // Open ticket detail modal
  const handleOpenTicket = async (id) => {
    setSelectedTicketId(id);
    setDetailLoading(true);
    setDetailError('');
    setReplyMessage('');
    try {
      const res = await api.fetchTicketById(id);
      if (res && res.ticket) {
        setTicketDetail(res.ticket);
      } else {
        setDetailError(res?.message || 'Ticket details not found.');
      }
    } catch (err) {
      setDetailError(err.message || 'Failed to load ticket details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedTicketId(null);
    setTicketDetail(null);
    setReplyMessage('');
    setDetailError('');
    loadStats();
    loadTickets(page);
  };

  // Scroll to bottom of message thread
  useEffect(() => {
    if (ticketDetail && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticketDetail]);

  // Assign to me
  const handleAssignToMe = async () => {
    if (!ticketDetail?._id || !worker?._id) return;
    setAssigningWorker(true);
    try {
      const res = await api.assignTicket(ticketDetail._id, worker._id);
      setTicketDetail(res.ticket);
      onToast && onToast('Ticket assigned to you.');
      loadStats();
      loadTickets(page);
    } catch (err) {
      onToast && onToast(err.message || 'Assignment failed.');
    } finally {
      setAssigningWorker(false);
    }
  };

  // Change ticket status
  const handleStatusChange = async (newStatus) => {
    if (!ticketDetail?._id || newStatus === ticketDetail.status) return;
    setUpdatingStatus(true);
    try {
      const res = await api.updateTicketStatus(ticketDetail._id, newStatus);
      setTicketDetail(res.ticket);
      onToast && onToast(`Ticket marked as ${newStatus.replace('_', ' ')}.`);
      loadStats();
      loadTickets(page);
    } catch (err) {
      onToast && onToast(err.message || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Worker resolves reported transfer & re-enables transactions
  const handleResolveReport = async () => {
    if (!ticketDetail?._id) return;
    const notes = window.prompt(
      'Enter resolution summary to re-enable customer transactions and restore active account status:',
      'Investigated and verified by bank worker. Transactions re-enabled and transfer report marked resolved.'
    );
    if (notes === null) return;

    setResolvingReport(true);
    try {
      await api.resolveTransferReport({
        ticketId: ticketDetail._id,
        resolutionNotes: notes.trim(),
      });
      const updated = await api.fetchTicketById(ticketDetail._id);
      setTicketDetail(updated.ticket || ticketDetail);
      onToast && onToast('Transfer issue resolved! Customer account restored to active and transactions re-enabled.');
      loadStats();
      loadTickets(page);
    } catch (err) {
      onToast && onToast(err.message || 'Failed to resolve report.');
    } finally {
      setResolvingReport(false);
    }
  };

  // Worker send reply
  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!ticketDetail?._id || !replyMessage.trim()) return;
    setSubmittingReply(true);
    try {
      const res = await api.replyTicket(ticketDetail._id, replyMessage.trim());
      setTicketDetail(res.ticket);
      setReplyMessage('');
      onToast && onToast('Reply sent and customer notified!');
      loadStats();
      loadTickets(page);
    } catch (err) {
      onToast && onToast(err.message || 'Failed to send reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Auto-assign ticket in rotational cycle
  const handleAutoAssign = async (ticketId, e) => {
    if (e) e.stopPropagation();
    setAutoAssigning(ticketId);
    try {
      const res = await api.autoAssignTicket(ticketId);
      onToast && onToast(res.message || 'Ticket assigned in rotational cycle.');
      await loadTickets(page);
      await loadRotation();
      await loadStats();
      if (ticketDetail && ticketDetail._id === ticketId) {
        setTicketDetail(res.ticket);
      }
    } catch (err) {
      onToast && onToast(err.message || 'Failed to auto-assign ticket.');
    } finally {
      setAutoAssigning(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Stat Cards Row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="top">
            <span className="lbl">Total Tickets</span>
            <div className="ic flex items-center justify-center">
              <Icon name="lifebuoy" size={17} className="text-brand" />
            </div>
          </div>
          <div className="num text-ink">{stats.total}</div>
          <div className="delta text-muted">All-time tickets received</div>
        </div>

        <div className="stat-card">
          <div className="top">
            <span className="lbl">Open Queue</span>
            <div className="ic flex items-center justify-center bg-[#fbefd9]">
              <Icon name="bell" size={17} className="text-[#8a5a00]" />
            </div>
          </div>
          <div className="num text-[#8a5a00]">{stats.open}</div>
          <div className="delta text-[#8a5a00]">Pending first response</div>
        </div>

        <div className="stat-card">
          <div className="top">
            <span className="lbl">In Progress</span>
            <div className="ic flex items-center justify-center bg-brand-light">
              <Icon name="users" size={17} className="text-brand" />
            </div>
          </div>
          <div className="num text-brand">{stats.in_progress}</div>
          <div className="delta text-brand">Under staff review</div>
        </div>

        <div className="stat-card">
          <div className="top">
            <span className="lbl">Urgent Priority</span>
            <div className="ic flex items-center justify-center bg-danger-light">
              <Icon name="briefcase" size={17} className="text-danger" />
            </div>
          </div>
          <div className="num text-danger">{stats.urgent}</div>
          <div className="delta text-danger">Requires immediate action</div>
        </div>
      </div>

      {/* 1.5 Support Team Rotational System Banner */}
      <div className="rounded-2xl border border-accent/20 bg-linear-to-r from-plum/10 via-brand-light/30 to-accent/10 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white shadow-xs">
              <Icon name="lifebuoy" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-heading text-sm font-bold text-ink">
                  Support Team Rotational Assignment System
                </h4>
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10.5px] font-bold text-accent font-mono">
                  Cycle #{rotationData?.currentCycle || 1} Active
                </span>
                {isSupport && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10.5px] font-bold">
                    You: Officer #{worker?.rotationOrder || 1}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                User reported problems are dispatched in a strict rotational cycle across the 4 Support Team members (Worker 1 → 2 → 3 → 4 → 1).
                {rotationData?.nextWorker && (
                  <span className="ml-1 font-semibold text-ink">
                    Next in line:{' '}
                    <span className="text-brand">
                      Officer #{rotationData.nextWorker.orderNumber} ({rotationData.nextWorker.name})
                    </span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRotationModal(true)}
              className="btn-secondary h-8 px-3 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>⚙️</span> View 4-Officer Rotation Desk
            </button>
          </div>
        </div>
      </div>

      {/* 2. Filter & Search Panel */}
      <div className="panel">
        <div className="panel-head flex-wrap">
          <div>
            <h3 className="panel-title">Customer Support Tickets</h3>
            <p className="text-xs text-muted">Manage, assign, and respond to incoming customer help requests</p>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search ticket #, subject, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-64 rounded-lg border border-line bg-surface/50 pl-8 pr-3 text-xs outline-none focus:border-accent"
              />
              <span className="absolute left-2.5 top-2.5 text-muted">
                <Icon name="search" size={14} />
              </span>
            </div>
            <button type="submit" className="btn-secondary h-9 px-3 text-xs">
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                  loadTickets(1);
                }}
                className="btn-ghost h-9 px-2 text-xs text-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? 'bg-brand text-white shadow-xs' : 'bg-surface text-muted hover:bg-surface/80 hover:text-ink'
                  }`}
                >
                  {tab.label}
                  {tab.id !== 'all' && stats[tab.id] !== undefined && (
                    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-line text-muted'}`}>
                      {stats[tab.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Category & Priority Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs text-muted outline-none focus:border-accent"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs text-muted outline-none focus:border-accent"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Tickets Table */}
      {loading ? (
        <div className="panel text-center py-12 text-sm text-muted">
          Loading support tickets queue...
        </div>
      ) : error ? (
        <div className="panel bg-danger-light text-danger p-4 text-sm font-semibold rounded-xl">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="panel text-center py-16 text-muted">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-surface text-muted">
            <Icon name="lifebuoy" size={24} />
          </div>
          <div className="font-heading text-base font-bold text-ink">No tickets found</div>
          <p className="mt-1 text-xs text-muted">There are no tickets matching your current search and filter criteria.</p>
        </div>
      ) : (
        <div className="panel overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Customer</th>
                  <th>Subject & Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Date</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  let priorityBadgeClass = 'badge-gray';
                  if (t.priority === 'urgent') priorityBadgeClass = 'badge-red';
                  else if (t.priority === 'high') priorityBadgeClass = 'badge-amber';
                  else if (t.priority === 'medium') priorityBadgeClass = 'badge-purple';

                  let statusBadgeClass = 'badge-gray';
                  if (t.status === 'open') statusBadgeClass = 'badge-amber';
                  else if (t.status === 'in_progress') statusBadgeClass = 'badge-purple';
                  else if (t.status === 'resolved') statusBadgeClass = 'badge-green';

                  const customerName = t.user?.name || 'Customer';
                  const initials = customerName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'CU';

                  return (
                    <tr key={t._id} className="clickable hover:bg-brand-light/30" onClick={() => handleOpenTicket(t._id)}>
                      <td className="font-mono text-xs font-bold text-brand">
                        {t.ticketNumber}
                      </td>

                      <td>
                        <div className="cell-user">
                          <div className="avatar">{initials}</div>
                          <div>
                            <div className="text-[13px] font-semibold text-ink">{customerName}</div>
                            <div className="cell-sub">{t.user?.phone || t.user?.email || '—'}</div>
                          </div>
                        </div>
                      </td>

                      <td className="max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/\[REPORT\]/i.test(t.subject) && (
                            <span className="badge badge-red text-[10px] py-0 px-1 font-bold">
                              REPORT
                            </span>
                          )}
                          <span className="truncate font-semibold text-ink" title={t.subject}>
                            {t.subject}
                          </span>
                        </div>
                        <div className="cell-sub capitalize">
                          {t.category || 'other'} · {t.messages?.length || 1} msg(s)
                        </div>
                      </td>

                      <td>
                        <span className={`badge ${priorityBadgeClass} uppercase`}>
                          {t.priority || 'medium'}
                        </span>
                      </td>

                      <td>
                        <span className={`badge ${statusBadgeClass} uppercase`}>
                          {t.status?.replace('_', ' ')}
                        </span>
                      </td>

                      <td>
                        {t.assignedTo?.name ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-brand text-xs">
                              {t.assignedTo.name}
                            </span>
                            {t.rotationCycle ? (
                              <span className="text-[10.5px] text-accent font-mono font-medium">
                                Cycle #{t.rotationCycle} · Officer #{t.rotationIndex || '—'}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleAutoAssign(t._id, e)}
                            disabled={autoAssigning === t._id}
                            className="rounded bg-accent/15 px-2 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-white transition-colors"
                          >
                            {autoAssigning === t._id ? 'Assigning...' : '↻ Auto-Assign'}
                          </button>
                        )}
                      </td>

                      <td className="cell-sub whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleOpenTicket(t._id)}
                          className="btn-secondary h-8 px-3 text-xs"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
              <div>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} tickets total)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!pagination.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="btn-ghost h-7 px-2.5 text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-ghost h-7 px-2.5 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Ticket Detail / Manage Modal */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line px-6 py-4 bg-surface/50 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-mono text-xs font-extrabold text-brand bg-brand-light px-2 py-0.5 rounded">
                    {ticketDetail?.ticketNumber || '...'}
                  </span>
                  {ticketDetail && (
                    <>
                      <span className={`badge ${
                        ticketDetail.status === 'open' ? 'badge-amber' :
                        ticketDetail.status === 'in_progress' ? 'badge-purple' :
                        ticketDetail.status === 'resolved' ? 'badge-green' : 'badge-gray'
                      } uppercase`}>
                        {ticketDetail.status?.replace('_', ' ')}
                      </span>
                      <span className={`badge ${
                        ticketDetail.priority === 'urgent' ? 'badge-red' :
                        ticketDetail.priority === 'high' ? 'badge-amber' :
                        ticketDetail.priority === 'medium' ? 'badge-purple' : 'badge-gray'
                      } uppercase`}>
                        {ticketDetail.priority}
                      </span>
                      <span className="rounded bg-line px-2 py-0.5 text-[11px] font-semibold text-muted capitalize">
                        {ticketDetail.category}
                      </span>
                    </>
                  )}
                </div>
                <h3 className="font-heading text-lg font-bold text-ink">
                  {ticketDetail?.subject || 'Loading ticket...'}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleCloseDetail}
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            {detailLoading || !ticketDetail ? (
              <div className="p-12 text-center text-sm text-muted">Loading ticket details and conversation...</div>
            ) : detailError ? (
              <div className="p-6 text-sm text-danger">{detailError}</div>
            ) : (
              <>
                {/* Customer Details & Worker Actions Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="font-bold text-ink">Customer:</div>
                    <div className="font-medium text-ink">{ticketDetail.user?.name}</div>
                    <div className="text-muted">{ticketDetail.user?.email || ticketDetail.user?.phone}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Assigned Worker / Assign to Me */}
                    {ticketDetail.assignedTo?._id === worker?._id ? (
                      <span className="rounded bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
                        Assigned to you
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAssignToMe}
                        disabled={assigningWorker}
                        className="btn-secondary h-7 px-2.5 text-xs"
                      >
                        {assigningWorker ? 'Assigning...' : 'Assign to Me'}
                      </button>
                    )}

                    {/* Status Changer */}
                    <div className="flex items-center gap-1.5 pl-2 border-l border-line">
                      <span className="text-muted font-medium">Status:</span>
                      <select
                        value={ticketDetail.status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updatingStatus}
                        className="h-7 rounded border border-line bg-surface px-2 text-xs font-semibold text-ink outline-none"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Reported Transfer & Account Suspension Alert */}
                {ticketDetail && (/\[REPORT\]/i.test(ticketDetail.subject) || /Account temporarily suspended/i.test(ticketDetail.description || '')) && (
                  <div className="mx-6 my-3 p-3.5 rounded-xl border border-danger/30 bg-danger/5 flex items-start gap-3">
                    <div className="text-danger mt-0.5">
                      <Icon name="alert" size={20} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h4 className="text-xs font-bold text-danger uppercase tracking-wider flex items-center gap-1.5">
                          Reported Transfer & Account Suspension
                        </h4>
                        <span className={`badge ${ticketDetail.status === 'resolved' || ticketDetail.status === 'closed' ? 'badge-green' : 'badge-red'} font-mono text-[10px]`}>
                          {ticketDetail.status === 'resolved' || ticketDetail.status === 'closed' ? 'Transactions Restored' : 'Account Suspended'}
                        </span>
                      </div>
                      <p className="text-xs text-ink/80 mt-1">
                        The customer reported this transaction. The account is currently <strong className="text-danger">"Account temporarily suspended."</strong> and all outgoing transactions are locked until resolved by bank staff.
                      </p>
                      {ticketDetail.status !== 'resolved' && ticketDetail.status !== 'closed' ? (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleResolveReport}
                            disabled={resolvingReport}
                            className="btn-primary h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 flex items-center gap-1.5 shadow-sm font-semibold rounded-lg"
                          >
                            {resolvingReport ? 'Re-enabling & Resolving...' : '✓ Resolve Issue & Re-enable Transactions'}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          ✓ Resolved by staff. Customer account active and transactions re-enabled.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Conversation Scroll View */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[420px] bg-surface/30">
                  {ticketDetail.messages && ticketDetail.messages.length > 0 ? (
                    ticketDetail.messages.map((m, idx) => {
                      const isWorker = m.senderRole === 'worker' || m.senderRole === 'admin';
                      const senderName = isWorker
                        ? m.sender?.name || (m.senderRole === 'admin' ? 'Flowly Admin' : 'Staff Support')
                        : ticketDetail.user?.name || 'Customer';

                      return (
                        <div
                          key={idx}
                          className={`flex flex-col ${isWorker ? 'items-end' : 'items-start'}`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                            <span className="font-semibold text-ink">
                              {senderName} {isWorker && <span className="text-brand font-bold">(Staff)</span>}
                            </span>
                            <span>
                              {new Date(m.sentAt || ticketDetail.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </div>

                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed shadow-xs whitespace-pre-wrap break-words ${
                              isWorker
                                ? 'rounded-tr-xs bg-brand text-white shadow-brand/10'
                                : 'rounded-tl-xs border border-line bg-white text-ink'
                            }`}
                          >
                            {m.message}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-xs text-muted py-6">No messages in this ticket.</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Worker Reply Form */}
                <div className="border-t border-line bg-white p-4 rounded-b-2xl">
                  <form onSubmit={handleSendReply} className="flex gap-2.5 items-end">
                    <div className="flex-1">
                      <textarea
                        rows={2}
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        placeholder="Write a response to the customer (they will receive a notification)..."
                        className="w-full rounded-xl border border-line p-2.5 text-xs outline-none focus:border-accent resize-none bg-surface/50 focus:bg-white"
                      />
                      <div className="flex justify-between text-[10.5px] text-muted mt-1 px-1">
                        <span>Customer will be notified in real-time.</span>
                        <span>{replyMessage.length}/2000</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReply || !replyMessage.trim()}
                      className="btn-primary h-10 px-4 text-xs shrink-0"
                    >
                      {submittingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 5. Support Team Rotational Cycle Desk Modal */}
      {showRotationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-linear-to-r from-plum/10 to-accent/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-white text-xs font-bold">
                    4
                  </span>
                  <h3 className="font-heading text-base font-bold text-ink">
                    Support Team Rotational Assignment System
                  </h3>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Automated round-robin distribution for customer reported problems and support tickets.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRotationModal(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto p-6 space-y-5">
              {/* Cycle Status Card */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-line bg-surface/50 p-3 text-center">
                  <div className="text-[10.5px] uppercase font-bold text-muted">Current Cycle</div>
                  <div className="text-xl font-extrabold text-brand mt-0.5">
                    Cycle #{rotationData?.currentCycle || 1}
                  </div>
                  <div className="text-[10.5px] text-muted">Full rotation = 4 tickets</div>
                </div>

                <div className="rounded-xl border border-line bg-surface/50 p-3 text-center">
                  <div className="text-[10.5px] uppercase font-bold text-muted">Total Assigned</div>
                  <div className="text-xl font-extrabold text-ink mt-0.5">
                    {rotationData?.totalAssigned || 0}
                  </div>
                  <div className="text-[10.5px] text-muted">Reported problems</div>
                </div>

                <div className="rounded-xl border border-line bg-surface/50 p-3 text-center">
                  <div className="text-[10.5px] uppercase font-bold text-muted">Next in Turn</div>
                  <div className="text-sm font-bold text-accent truncate mt-1">
                    {rotationData?.nextWorker ? `Officer #${rotationData.nextWorker.orderNumber}` : 'Officer #1'}
                  </div>
                  <div className="text-[10px] text-muted truncate">
                    {rotationData?.nextWorker?.name || 'Support Specialist 1'}
                  </div>
                </div>
              </div>

              {/* The 4 Support Workers Grid */}
              <div>
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-2.5">
                  Dedicated 4-Worker Support Desk Roster
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(rotationData?.workers || []).map((w, idx) => {
                    const isNext = w.isNextInQueue;
                    const isCurrentUser = worker?._id === w._id;

                    return (
                      <div
                        key={w._id || idx}
                        className={`relative rounded-xl border p-3.5 transition-all ${
                          isNext
                            ? 'border-accent bg-accent/5 ring-2 ring-accent/20'
                            : 'border-line bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white font-bold text-xs">
                              {w.orderNumber || idx + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-ink">{w.name}</span>
                                {isCurrentUser && (
                                  <span className="rounded bg-brand-light px-1.5 py-0.2 text-[9.5px] font-bold text-brand">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted">{w.email}</div>
                            </div>
                          </div>

                          {isNext && (
                            <span className="rounded-full bg-accent text-white px-2 py-0.5 text-[9.5px] font-bold shrink-0">
                              Next In Turn
                            </span>
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-[11px]">
                          <span className="text-muted">
                            Active: <strong className="text-ink">{w.activeTickets || 0}</strong>
                          </span>
                          <span className="text-muted">
                            Resolved: <strong className="text-emerald-600">{w.resolvedTickets || 0}</strong>
                          </span>
                          <span className="text-muted">
                            Total: <strong className="text-brand">{w.totalAssigned || 0}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rotational Rule Explainer */}
              <div className="rounded-xl border border-line bg-surface/30 p-3.5 text-xs text-muted space-y-1.5">
                <div className="font-bold text-ink">How the Rotational Cycle Works:</div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-mono font-bold text-accent">1.</span> Each reported problem or customer support ticket is automatically assigned to a worker in exact sequential order: <strong>Worker 1 → Worker 2 → Worker 3 → Worker 4</strong>.
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-mono font-bold text-accent">2.</span> Once 4 tickets have been assigned (one full rotation), <strong>a new cycle starts automatically</strong> with ticket #5 assigned back to <strong>Worker 1</strong>.
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-mono font-bold text-accent">3.</span> Support Team members use the standard worker login but focus primarily on ticket resolution.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-line px-6 py-3 bg-surface/50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRotationModal(false)}
                className="btn-secondary h-8 px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
