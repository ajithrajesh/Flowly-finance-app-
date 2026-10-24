import React, { useEffect, useState } from 'react';
import * as api from '../api';

const CATEGORIES = [
  { id: 'regular', label: 'Regular FD' },
  { id: 'senior_citizen', label: 'Senior Citizen' },
  { id: 'tax_saver', label: 'Tax Saver' },
  { id: 'special', label: 'Special FD' },
  { id: 'flexi', label: 'Flexi Savings' },
];

const PAYOUT_OPTIONS = [
  { id: 'cumulative', label: 'Cumulative' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annually', label: 'Annually' },
];

export default function FdSchemeManagement({ onToast }) {
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    category: 'regular',
    minTenureMonths: 12,
    maxTenureMonths: 60,
    interestRate: 7.5,
    minDeposit: 5000,
    maxDeposit: '',
    allowedPayoutOptions: ['cumulative'],
    seniorCitizenOnly: false,
    seniorCitizenBonusRate: 0.5,
    badge: '',
    tags: '',
    isActive: true,
    sortOrder: 0,
    rateSlabs: [],
  });

  const loadSchemes = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchFdSchemesAll();
      setSchemes(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch FD schemes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemes();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingScheme(null);
    setFormError('');
    setFormData({
      name: '',
      code: '',
      description: '',
      category: 'regular',
      minTenureMonths: 12,
      maxTenureMonths: 60,
      interestRate: 7.5,
      minDeposit: 5000,
      maxDeposit: '',
      allowedPayoutOptions: ['cumulative'],
      seniorCitizenOnly: false,
      seniorCitizenBonusRate: 0.5,
      badge: '',
      tags: '',
      isActive: true,
      sortOrder: 0,
      rateSlabs: [{ minMonths: 12, maxMonths: 60, rate: 7.5 }],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (scheme) => {
    setEditingScheme(scheme);
    setFormError('');
    setFormData({
      name: scheme.name || '',
      code: scheme.code || '',
      description: scheme.description || '',
      category: scheme.category || 'regular',
      minTenureMonths: scheme.minTenureMonths || 1,
      maxTenureMonths: scheme.maxTenureMonths || 120,
      interestRate: scheme.interestRate || 0,
      minDeposit: scheme.minDeposit || 0,
      maxDeposit: scheme.maxDeposit !== null && scheme.maxDeposit !== undefined ? String(scheme.maxDeposit) : '',
      allowedPayoutOptions: scheme.allowedPayoutOptions || ['cumulative'],
      seniorCitizenOnly: scheme.seniorCitizenOnly || false,
      seniorCitizenBonusRate: scheme.seniorCitizenBonusRate || 0,
      badge: scheme.badge || '',
      tags: Array.isArray(scheme.tags) ? scheme.tags.join(', ') : '',
      isActive: scheme.isActive !== false,
      sortOrder: scheme.sortOrder || 0,
      rateSlabs: Array.isArray(scheme.rateSlabs) && scheme.rateSlabs.length > 0 ? scheme.rateSlabs : [],
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (scheme) => {
    try {
      const res = await api.toggleFdSchemeActive(scheme._id);
      onToast && onToast(res.message || `Scheme ${scheme.isActive ? 'deactivated' : 'activated'}`);
      await loadSchemes();
    } catch (err) {
      onToast && onToast(err.message || 'Failed to toggle scheme status');
    }
  };

  const handleAddSlab = () => {
    setFormData((prev) => ({
      ...prev,
      rateSlabs: [...prev.rateSlabs, { minMonths: 12, maxMonths: 24, rate: 7.0 }],
    }));
  };

  const handleRemoveSlab = (index) => {
    setFormData((prev) => ({
      ...prev,
      rateSlabs: prev.rateSlabs.filter((_, idx) => idx !== index),
    }));
  };

  const handleSlabChange = (index, field, value) => {
    setFormData((prev) => {
      const slabs = [...prev.rateSlabs];
      slabs[index] = { ...slabs[index], [field]: Number(value) };
      return { ...prev, rateSlabs: slabs };
    });
  };

  const handleTogglePayoutOption = (opt) => {
    setFormData((prev) => {
      const current = prev.allowedPayoutOptions || [];
      if (current.includes(opt)) {
        if (current.length === 1) return prev; // Keep at least one option
        return { ...prev, allowedPayoutOptions: current.filter((o) => o !== opt) };
      } else {
        return { ...prev, allowedPayoutOptions: [...current, opt] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        code: formData.code,
        description: formData.description,
        category: formData.category,
        minTenureMonths: Number(formData.minTenureMonths),
        maxTenureMonths: Number(formData.maxTenureMonths),
        interestRate: Number(formData.interestRate),
        minDeposit: Number(formData.minDeposit) || 0,
        maxDeposit: formData.maxDeposit ? Number(formData.maxDeposit) : null,
        allowedPayoutOptions: formData.allowedPayoutOptions,
        seniorCitizenOnly: formData.seniorCitizenOnly,
        seniorCitizenBonusRate: Number(formData.seniorCitizenBonusRate) || 0,
        badge: formData.badge,
        tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        isActive: formData.isActive,
        sortOrder: Number(formData.sortOrder) || 0,
        rateSlabs: formData.rateSlabs,
      };

      if (editingScheme) {
        await api.updateFdScheme(editingScheme._id, payload);
        onToast && onToast('FD Scheme updated successfully');
      } else {
        await api.createFdScheme(payload);
        onToast && onToast('FD Scheme created successfully');
      }

      setIsModalOpen(false);
      await loadSchemes();
    } catch (err) {
      setFormError(err.message || 'Failed to save scheme');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSchemes = schemes.filter((s) => {
    const matchesSearch =
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.code?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const activeCount = schemes.filter((s) => s.isActive).length;
  const maxRate = schemes.length ? Math.max(...schemes.map((s) => s.interestRate || 0)) : 0;

  return (
    <div style={{ padding: '4px 0 24px 0' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', margin: '0 0 4px 0', color: '#111827' }}>FD Scheme Management</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6B7280' }}>
            Configure active and retired Fixed Deposit catalog products, rate slabs, and limits.
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          + Create New FD Scheme
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid-4" style={{ marginBottom: '20px', gap: '14px' }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>Total Schemes</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>{schemes.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Active Product Catalog</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669', marginTop: '2px' }}>{activeCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>Retired / Inactive</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>{schemes.length - activeCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>Peak Base Interest Rate</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#7C3AED', marginTop: '2px' }}>{maxRate}% p.a.</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by scheme name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '7px 12px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{ padding: '7px 12px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px', backgroundColor: '#FFF' }}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="loading-panel">Loading FD Schemes...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : filteredSchemes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
          No FD schemes found matching criteria.
        </div>
      ) : (
        <div className="grid-2" style={{ gap: '18px' }}>
          {filteredSchemes.map((scheme) => (
            <div
              key={scheme._id}
              className="card"
              style={{
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                borderLeft: scheme.isActive ? '4px solid #10B981' : '4px solid #9CA3AF',
                opacity: scheme.isActive ? 1 : 0.75,
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#F3F4F6', color: '#374151' }}>
                      {scheme.code}
                    </span>
                    <span className={`badge ${scheme.isActive ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '11px' }}>
                      {scheme.isActive ? 'Active' : 'Retired'}
                    </span>
                    {scheme.badge && (
                      <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                        ★ {scheme.badge}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>
                    {scheme.interestRate}% <span style={{ fontSize: '11px', fontWeight: 500 }}>p.a.</span>
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', margin: '0 0 4px 0', color: '#111827' }}>{scheme.name}</h3>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 14px 0', lineHeight: '1.4' }}>
                  {scheme.description || 'No description provided.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px', marginBottom: '14px' }}>
                  <div>
                    <span style={{ color: '#6B7280' }}>Category:</span>{' '}
                    <strong style={{ textTransform: 'capitalize' }}>{scheme.category.replace('_', ' ')}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Tenure Range:</span>{' '}
                    <strong>{scheme.minTenureMonths} - {scheme.maxTenureMonths} Mo</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Min Deposit:</span>{' '}
                    <strong>₹{scheme.minDeposit?.toLocaleString('en-IN')}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Senior Bonus:</span>{' '}
                    <strong>+{scheme.seniorCitizenBonusRate}%</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6B7280' }}>Payouts:</span>{' '}
                    <strong style={{ textTransform: 'capitalize' }}>{scheme.allowedPayoutOptions?.join(', ')}</strong>
                  </div>
                </div>

                {scheme.rateSlabs && scheme.rateSlabs.length > 0 && (
                  <div style={{ backgroundColor: '#F9FAFB', padding: '8px 12px', borderRadius: '6px', marginBottom: '14px', fontSize: '11px' }}>
                    <div style={{ fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Rate Slabs:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {scheme.rateSlabs.map((s, idx) => (
                        <span key={idx} style={{ backgroundColor: '#FFF', padding: '2px 6px', border: '1px solid #E5E7EB', borderRadius: '4px' }}>
                          {s.minMonths}-{s.maxMonths}m: <strong>{s.rate}%</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F3F4F6' }}>
                <button
                  onClick={() => handleOpenEditModal(scheme)}
                  className="btn-secondary"
                  style={{ flex: 1, fontSize: '12px', padding: '6px 12px' }}
                >
                  Edit Terms
                </button>
                <button
                  onClick={() => handleToggleActive(scheme)}
                  className="btn-outline-dark"
                  style={{
                    fontSize: '12px',
                    padding: '6px 12px',
                    color: scheme.isActive ? '#DC2626' : '#059669',
                    borderColor: scheme.isActive ? '#FCA5A5' : '#6EE7B7',
                  }}
                >
                  {scheme.isActive ? 'Retire / Deactivate' : 'Activate Scheme'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay open">
          <div className="modal-container" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>
                {editingScheme ? `Edit Scheme: ${editingScheme.name}` : 'Create New FD Scheme'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>
                ✕
              </button>
            </div>

            {formError && <div className="error-banner" style={{ marginBottom: '14px' }}>{formError}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }} className="form-group">
                <div>
                  <label className="form-label">Scheme Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Scheme Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="e.g. FD-REG-01"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }} className="form-group">
                <div>
                  <label className="form-label">Category</label>
                  <select
                    className="form-select"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Base Interest Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    className="form-input"
                    value={formData.interestRate}
                    onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Senior Bonus Rate (%)</label>
                  <input
                    type="number"
                    step="0.05"
                    className="form-input"
                    value={formData.seniorCitizenBonusRate}
                    onChange={(e) => setFormData({ ...formData, seniorCitizenBonusRate: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }} className="form-group">
                <div>
                  <label className="form-label">Min Tenure (Mo)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.minTenureMonths}
                    onChange={(e) => setFormData({ ...formData, minTenureMonths: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Max Tenure (Mo)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.maxTenureMonths}
                    onChange={(e) => setFormData({ ...formData, maxTenureMonths: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Min Deposit (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={formData.minDeposit}
                    onChange={(e) => setFormData({ ...formData, minDeposit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Max Deposit (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Unlimited"
                    value={formData.maxDeposit}
                    onChange={(e) => setFormData({ ...formData, maxDeposit: e.target.value })}
                  />
                </div>
              </div>

              {/* Payout Options Checkboxes */}
              <div className="form-group">
                <label className="form-label">Allowed Interest Payout Options</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  {PAYOUT_OPTIONS.map((opt) => (
                    <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData.allowedPayoutOptions.includes(opt.id)}
                        onChange={() => handleTogglePayoutOption(opt.id)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Rate Slabs Sub-form */}
              <div className="form-group" style={{ backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Tenure-based Rate Slabs</label>
                  <button type="button" onClick={handleAddSlab} className="btn-secondary" style={{ fontSize: '11px', padding: '3px 8px' }}>
                    + Add Slab
                  </button>
                </div>
                {formData.rateSlabs.map((slab, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Min Mo"
                      value={slab.minMonths}
                      onChange={(e) => handleSlabChange(idx, 'minMonths', e.target.value)}
                      style={{ width: '90px', padding: '4px 8px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '12px' }}>to</span>
                    <input
                      type="number"
                      placeholder="Max Mo"
                      value={slab.maxMonths}
                      onChange={(e) => handleSlabChange(idx, 'maxMonths', e.target.value)}
                      style={{ width: '90px', padding: '4px 8px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '12px' }}>Rate %:</span>
                    <input
                      type="number"
                      step="0.05"
                      placeholder="Rate"
                      value={slab.rate}
                      onChange={(e) => handleSlabChange(idx, 'rate', e.target.value)}
                      style={{ width: '90px', padding: '4px 8px', fontSize: '12px' }}
                    />
                    <button type="button" onClick={() => handleRemoveSlab(idx)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }} className="form-group">
                <div>
                  <label className="form-label">Badge Text</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Popular"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Tags (comma separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. High Yield, 80C Tax Saver"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '24px', margin: '16px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.seniorCitizenOnly}
                    onChange={(e) => setFormData({ ...formData, seniorCitizenOnly: e.target.checked })}
                  />
                  Senior Citizen Only Product
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  Is Active (Visible to Customers)
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={submitting}>
                  {submitting ? 'Saving...' : editingScheme ? 'Update Scheme' : 'Create Scheme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
