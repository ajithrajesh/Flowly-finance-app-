import React, { useEffect, useState, useCallback } from 'react';
import * as api from '../api';

export default function WorkerMonitorPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'worker',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [rotationData, setRotationData] = useState(null);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, rot] = await Promise.all([
        api.fetchWorkerMonitor(),
        api.fetchRotationStatus().catch(() => null),
      ]);
      if (res.success) {
        setData(res);
      } else {
        setError(res.message || 'Failed to load worker monitor');
      }
      if (rot && rot.success) {
        setRotationData(rot);
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.email || !newStaff.phone || !newStaff.password) {
      setAddError('Please fill in all required fields');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await api.createWorkerAccount(newStaff);
      if (res.success) {
        setShowAddModal(false);
        setNewStaff({ name: '', email: '', phone: '', password: '', role: 'worker' });
        await loadWorkers();
      } else {
        setAddError(res.message || 'Could not create staff account');
      }
    } catch (err) {
      setAddError(err.message || 'Failed to create worker');
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleStatus = async (worker) => {
    const newStatus = worker.status === 'blocked' ? 'active' : 'blocked';
    const confirmMsg = worker.status === 'blocked'
      ? `Are you sure you want to unblock ${worker.name}?`
      : `Are you sure you want to suspend/block ${worker.name}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await api.updateWorkerStatus(worker._id || worker.id, { status: newStatus });
      if (res && res.success) {
        await loadWorkers();
      } else {
        alert(res?.message || 'Failed to update staff member status. Please try again.');
      }
    } catch (err) {
      alert(`Unable to update staff status: ${err.message || 'Network error'}`);
    }
  };

  if (loading) {
    return (
      <div className="loading-panel">
        <div className="spinner" style={{ marginBottom: '12px' }} />
        <p style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>
          Loading live staff roster & desk performance audit...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner" style={{ margin: '24px' }}>
        <span>⚠️ {error}</span>
        <button
          onClick={loadWorkers}
          style={{
            marginLeft: '12px',
            padding: '4px 10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { stats, workers } = data;

  const filteredWorkers = workers.filter((w) => {
    const matchesSearch =
      (w.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.phone || '').includes(searchTerm);
    const matchesRole = roleFilter === 'all' || w.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Worker Monitor & Staff Governance
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Monitor officer activity, track operational throughput, and manage staff access permissions.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          style={{
            border: 'none',
            background: '#4f46e5',
            color: 'white',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
          }}
        >
          <span>➕</span> Add New Staff Member
        </button>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Total Staff Roster</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '6px 0 2px' }}>{stats.totalStaff}</div>
          <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>{stats.activeStaff} active · {stats.blockedStaff} suspended</div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>KYC Reviews Handled</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6', margin: '6px 0 2px' }}>{stats.totalKYCProcessed}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Across all desk officers</div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Loans Evaluated</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#6366f1', margin: '6px 0 2px' }}>{stats.totalLoansProcessed}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Sanctioned and reviewed</div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Desk Security Status</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#10b981', margin: '6px 0 2px' }}>Healthy</div>
          <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>Active monitoring enabled</div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Support Tickets Dispatched</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#059669', margin: '6px 0 2px' }}>{stats.totalTicketsHandled || 0}</div>
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>{stats.totalTicketsResolved || 0} resolved · 4 Support Officers</div>
        </div>
      </div>

      {/* Support Team Rotational Cycle Overview */}
      {rotationData && (
        <div
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdf4 100%)',
            borderRadius: '16px',
            border: '1px solid #bbf7d0',
            padding: '20px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🔄</span>
                <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#065f46', margin: 0 }}>
                  Support Team Rotational Assignment Engine
                </h3>
                <span
                  style={{
                    background: '#059669',
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  Live Round-Robin
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#047857', margin: '4px 0 0' }}>
                User-reported problems & tickets are assigned sequentially to 4 dedicated officers (1 → 2 → 3 → 4). Once 4 tickets are assigned (Cycle complete), rotation loops back to Officer 1.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div
                style={{
                  background: 'white',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#047857', fontWeight: '700' }}>
                  Current Cycle
                </div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#065f46' }}>
                  Cycle #{rotationData.currentCycle || rotationData.rotation?.currentCycle || 1}
                </div>
              </div>

              <div
                style={{
                  background: 'white',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#047857', fontWeight: '700' }}>
                  Total Dispatched
                </div>
                <div style={{ fontSize: '16px', fontWeight: '800', color: '#065f46' }}>
                  {rotationData.totalAssigned ?? rotationData.rotation?.totalAssigned ?? 0}
                </div>
              </div>

              <div
                style={{
                  background: '#047857',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  color: 'white',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#a7f3d0', fontWeight: '700' }}>
                  Next In Turn
                </div>
                <div style={{ fontSize: '14px', fontWeight: '800' }}>
                  {rotationData.nextWorker
                    ? `Officer #${rotationData.nextWorker.orderNumber || rotationData.nextWorker.rotationOrder || 1}`
                    : 'Officer #1'}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Dedicated Officers Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            {(rotationData.workers || []).map((officer) => {
              const isNext = officer.isNext || officer.isNextInQueue;
              const slotNum = officer.orderNumber || officer.rotationOrder || 1;
              const handled = officer.totalAssigned ?? officer.ticketsHandled ?? 0;
              return (
                <div
                  key={officer._id}
                  style={{
                    background: isNext ? '#ffffff' : '#f8fafc',
                    border: isNext ? '2px solid #059669' : '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '14px',
                    position: 'relative',
                    boxShadow: isNext ? '0 4px 12px rgba(5, 150, 105, 0.15)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {isNext && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '12px',
                        background: '#059669',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: '800',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        letterSpacing: '0.5px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}
                    >
                      ★ NEXT IN LINE
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isNext ? '#059669' : '#0f766e',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '800',
                        fontSize: '13px',
                      }}
                    >
                      #{slotNum}
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                        {officer.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {officer.email}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                      paddingTop: '8px',
                      borderTop: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ color: '#64748b' }}>Assigned Problems:</span>
                    <span style={{ fontWeight: '700', color: '#0f172a' }}>
                      {handled} tickets
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Search staff by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}>
            <option value="all">All Roles</option>
            <option value="worker">General Worker</option>
            <option value="support">Support Team (4 Officers)</option>
            <option value="admin">Administrator</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white' }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Suspended / Blocked</option>
          </select>
        </div>
      </div>

      {/* Roster Table */}
      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <th style={{ padding: '14px 18px' }}>Staff Member</th>
              <th style={{ padding: '14px 18px' }}>Role / Slot</th>
              <th style={{ padding: '14px 18px' }}>Tickets</th>
              <th style={{ padding: '14px 18px' }}>KYC Reviews</th>
              <th style={{ padding: '14px 18px' }}>Loan Reviews</th>
              <th style={{ padding: '14px 18px' }}>FD Processed</th>
              <th style={{ padding: '14px 18px' }}>Total Actions</th>
              <th style={{ padding: '14px 18px' }}>Approval Rate</th>
              <th style={{ padding: '14px 18px' }}>Status</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkers.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#888' }}>
                  No staff members match the selected filters.
                </td>
              </tr>
            ) : (
              filteredWorkers.map((w) => {
                const initials = (w.name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <tr key={w._id || w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: w.role === 'admin' ? '#3b82f6' : w.role === 'support' ? '#059669' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px' }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', color: '#0f172a' }}>{w.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{w.email} · {w.phone}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        background: w.role === 'admin' ? '#dbeafe' : w.role === 'support' ? '#d1fae5' : '#e0e7ff',
                        color: w.role === 'admin' ? '#1e40af' : w.role === 'support' ? '#065f46' : '#3730a3',
                        border: w.role === 'support' ? '1px solid #a7f3d0' : 'none',
                      }}>
                        {w.role === 'support' ? `SUPPORT #${w.rotationOrder || 1}` : w.role}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: '600' }}>
                      <div>
                        <span style={{ color: '#059669' }}>{w.metrics?.ticketsResolved || 0}</span> / <span style={{ color: '#6366f1' }}>{w.metrics?.ticketsAssigned || 0}</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>res / assigned</span>
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: '600' }}>
                      <span style={{ color: '#10b981' }}>{w.metrics.kycApproved}</span> / <span style={{ color: '#ef4444' }}>{w.metrics.kycRejected}</span>
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: '600' }}>
                      <span style={{ color: '#6366f1' }}>{w.metrics.loanSanctioned}</span> / <span style={{ color: '#ef4444' }}>{w.metrics.loanRejected}</span>
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: '600' }}>{w.metrics.fdProcessed}</td>
                    <td style={{ padding: '14px 18px', fontWeight: '700', color: '#0f172a' }}>{w.metrics.totalActions}</td>

                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '600' }}>{w.metrics.approvalRate}%</span>
                        <div style={{ width: '50px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${w.metrics.approvalRate}%`, height: '100%', background: '#10b981' }} />
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: w.status === 'blocked' ? '#fee2e2' : '#d1fae5', color: w.status === 'blocked' ? '#b91c1c' : '#047857' }}>
                        {w.status === 'blocked' ? 'Suspended' : 'Active'}
                      </span>
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setSelectedWorker(w)} style={{ border: '1px solid #cbd5e1', background: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                          Audit
                        </button>
                        <button onClick={() => handleToggleStatus(w)} style={{ border: 'none', background: w.status === 'blocked' ? '#10b981' : '#ef4444', color: 'white', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                          {w.status === 'blocked' ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Add Staff */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '700', margin: 0, color: '#0f172a' }}>Create Staff Account</h3>
              <button onClick={() => setShowAddModal(false)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {addError && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px' }}>{addError}</div>}

            <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Full Name *</label>
                <input type="text" required placeholder="e.g. Ramesh Kumar" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Email Address *</label>
                <input type="email" required placeholder="ramesh@flowly.com" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Phone Number *</label>
                <input type="text" required placeholder="+91 98470 12345" value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Temporary Password *</label>
                <input type="password" required placeholder="Minimum 6 characters" value={newStaff.password} onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Assigned Role *</label>
                <select value={newStaff.role} onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #ccc', fontSize: '13px', background: 'white' }}>
                  <option value="worker">Worker / Desk Officer (KYC & Loans)</option>
                  <option value="support">Support Team (Rotational Ticket Specialist)</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <button type="submit" disabled={addLoading} style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: '#4f46e5', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>{addLoading ? 'Creating...' : 'Create Staff Member'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Modal */}
      {selectedWorker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: '700', margin: 0, color: '#0f172a' }}>Staff Audit Card</h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Metrics for {selectedWorker.name}</span>
              </div>
              <button onClick={() => setSelectedWorker(null)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: selectedWorker.role === 'support' ? '#059669' : selectedWorker.role === 'admin' ? '#3b82f6' : '#6366f1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px' }}>
                  {selectedWorker.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '15px' }}>{selectedWorker.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedWorker.email} · {selectedWorker.phone}</div>
                </div>
              </div>

              {selectedWorker.role === 'support' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#065f46' }}>
                  🛡️ <strong>Support Team Specialist:</strong> Designated as <strong>Officer #{selectedWorker.rotationOrder || 1}</strong> in the automatic round-robin ticket rotation cycle.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', color: '#047857', textTransform: 'uppercase', fontWeight: '700' }}>Tickets Assigned</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#059669', marginTop: '4px' }}>{selectedWorker.metrics?.ticketsAssigned || 0}</div>
                </div>
                <div style={{ padding: '12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '11px', color: '#047857', textTransform: 'uppercase', fontWeight: '700' }}>Tickets Resolved</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#059669', marginTop: '4px' }}>{selectedWorker.metrics?.ticketsResolved || 0}</div>
                </div>
                <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>KYC Approved</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>{selectedWorker.metrics?.kycApproved || 0}</div>
                </div>
                <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>KYC Rejected</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#ef4444', marginTop: '4px' }}>{selectedWorker.metrics?.kycRejected || 0}</div>
                </div>
                <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Loans Sanctioned</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#6366f1', marginTop: '4px' }}>{selectedWorker.metrics?.loanSanctioned || 0}</div>
                </div>
                <div style={{ padding: '12px', background: '#f1f5f9', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>FDs Processed</div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#3b82f6', marginTop: '4px' }}>{selectedWorker.metrics?.fdProcessed || 0}</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={() => setSelectedWorker(null)} style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#0f172a', color: 'white', fontWeight: '600', cursor: 'pointer', fontSize: '12px' }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
