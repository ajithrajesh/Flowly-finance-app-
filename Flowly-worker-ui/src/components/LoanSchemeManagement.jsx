import React, { useEffect, useState } from 'react';
import * as api from '../api';

const LOAN_TYPES = [
  { id: 'Personal', label: 'Personal Loan' },
  { id: 'Business', label: 'Business Loan' },
  { id: 'Education', label: 'Education Loan' },
  { id: 'Vehicle', label: 'Vehicle Loan' },
  { id: 'Emergency', label: 'Emergency Loan' },
];

const PRESET_DOCUMENTS = {
  Personal: [
    { name: 'Aadhaar Card', description: 'Front and back clear copy for KYC identity and address proof', isMandatory: true },
    { name: 'PAN Card', description: 'Mandatory tax verification and credit score check', isMandatory: true },
    { name: 'Last 3 Months Salary Slips', description: 'Official salary slips from current employer', isMandatory: true },
    { name: 'Last 6 Months Bank Statement', description: 'Salary account statement showing monthly credit deposits', isMandatory: true },
    { name: 'Company ID Card', description: 'Employee badge or active employment confirmation letter', isMandatory: false },
  ],
  Business: [
    { name: 'Business Registration / GST Certificate', description: 'Proof of business existence and active operations (min 1 year)', isMandatory: true },
    { name: 'Last 2 Years ITR & Balance Sheet', description: 'Audited financial statements and tax return receipts', isMandatory: true },
    { name: 'Last 12 Months Current Bank Account Statement', description: 'Primary business operating account statement', isMandatory: true },
    { name: 'PAN & Aadhaar of Proprietor / Partners', description: 'KYC identity proof of business owners/signatories', isMandatory: true },
    { name: 'Office / Shop Rent Agreement or Ownership Deed', description: 'Proof of commercial operating premises address', isMandatory: false },
  ],
  Education: [
    { name: 'Admission Offer Letter & Fee Schedule', description: 'Official letter from university/college specifying total course fees', isMandatory: true },
    { name: 'Academic Marksheets & Degree Certificates', description: '10th, 12th, and graduation degree transcripts', isMandatory: true },
    { name: 'Co-borrower / Parent Income Proof & ITR', description: 'Last 2 years ITR or 3 months salary slips of guarantor parent', isMandatory: true },
    { name: 'Co-borrower KYC (PAN & Aadhaar)', description: 'Government issued KYC cards of parent or guardian', isMandatory: true },
    { name: 'Entrance Exam Score Card', description: 'GRE, GMAT, CAT, IELTS, or entrance exam ranking sheet', isMandatory: false },
  ],
  Vehicle: [
    { name: 'Proforma Invoice / Dealer Quotation', description: 'Authorized dealership quotation detailing on-road price', isMandatory: true },
    { name: 'Driving License', description: 'Valid driver license copy of applicant', isMandatory: true },
    { name: 'PAN & Aadhaar Card', description: 'KYC identification and address verification', isMandatory: true },
    { name: 'Income Proof (3 Months Pay Slip / ITR)', description: 'Proof of steady monthly cashflow to service auto loan EMI', isMandatory: true },
    { name: 'Bank Statement (Last 6 Months)', description: 'Primary savings bank account statement', isMandatory: false },
  ],
  Emergency: [
    { name: 'Aadhaar Card & PAN Card', description: 'Instant KYC verification for rapid loan sanction', isMandatory: true },
    { name: 'Last 3 Months Bank Statement', description: 'Proof of active bank account and regular inflows', isMandatory: true },
    { name: 'Emergency Reason / Medical Memo', description: 'Brief hospital bill, repair invoice, or note explaining urgent need', isMandatory: false },
  ],
};

const formatCurrency = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  return '₹' + Number(val).toLocaleString('en-IN');
};

export default function LoanSchemeManagement({ onToast }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [formError, setFormError] = useState('');

  // Form Fields
  const [formData, setFormData] = useState({
    productName: '',
    loanType: 'Personal',
    interestRate: 10.5,
    interestType: 'diminishing',
    minAmount: 10000,
    maxAmount: 500000,
    minTenure: 6,
    maxTenure: 36,
    tenure: 12,
    description: '',
    badge: '',
    isActive: true,
    requiredDocuments: [],
  });

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchLoanProductsAll();
      setProducts(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch loan products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const handleOpenCreateModal = (presetType = 'Personal') => {
    setEditingProduct(null);
    setFormError('');
    setFormData({
      productName: '',
      loanType: presetType,
      interestRate: presetType === 'Emergency' ? 12.0 : presetType === 'Education' ? 8.5 : 10.5,
      interestType: 'diminishing',
      minAmount: presetType === 'Emergency' ? 5000 : 25000,
      maxAmount: presetType === 'Business' ? 2500000 : 500000,
      minTenure: 6,
      maxTenure: presetType === 'Education' ? 84 : 48,
      tenure: 12,
      description: '',
      badge: 'Flexible EMI',
      isActive: true,
      requiredDocuments: PRESET_DOCUMENTS[presetType] ? [...PRESET_DOCUMENTS[presetType]] : [],
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setFormError('');
    setFormData({
      productName: product.productName || '',
      loanType: product.loanType || 'Personal',
      interestRate: product.interestRate ?? 10.5,
      interestType: product.interestType || 'diminishing',
      minAmount: product.minAmount ?? 10000,
      maxAmount: product.maxAmount ?? 500000,
      minTenure: product.minTenure ?? 6,
      maxTenure: product.maxTenure ?? 36,
      tenure: product.tenure ?? 12,
      description: product.description || '',
      badge: product.badge || '',
      isActive: product.isActive !== false,
      requiredDocuments: Array.isArray(product.requiredDocuments) && product.requiredDocuments.length > 0
        ? product.requiredDocuments.map(d => ({
            name: d.name || '',
            description: d.description || '',
            isMandatory: d.isMandatory !== false,
          }))
        : PRESET_DOCUMENTS[product.loanType] || [],
    });
    setIsModalOpen(true);
  };

  const handleToggleActive = async (product) => {
    try {
      const res = await api.toggleLoanProductActive(product._id);
      onToast && onToast(res.message || `Loan product ${product.isActive ? 'deactivated' : 'activated'}`);
      await loadProducts();
    } catch (err) {
      onToast && onToast(err.message || 'Failed to toggle loan product status');
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Are you sure you want to delete the loan product "${product.productName}"?`)) {
      return;
    }
    try {
      const res = await api.deleteLoanProduct(product._id);
      onToast && onToast(res.message || 'Loan product deleted successfully');
      await loadProducts();
    } catch (err) {
      onToast && onToast(err.message || 'Failed to delete loan product');
    }
  };

  const handleSeedPresets = async () => {
    if (!window.confirm('Reset catalog to standard recommended loan schemes with custom document requirements? Existing custom products will be preserved.')) {
      return;
    }
    setSeeding(true);
    try {
      const res = await api.seedLoanProducts();
      onToast && onToast(res.message || 'Default loan schemes seeded successfully');
      await loadProducts();
    } catch (err) {
      onToast && onToast(err.message || 'Failed to seed loan products');
    } finally {
      setSeeding(false);
    }
  };

  // Document requirement manipulations
  const handleApplyPresetDocs = (typeKey) => {
    const preset = PRESET_DOCUMENTS[typeKey] || [];
    setFormData(prev => ({
      ...prev,
      requiredDocuments: [...preset],
    }));
    onToast && onToast(`Applied ${typeKey} document requirements preset (${preset.length} docs)`);
  };

  const handleAddDoc = () => {
    setFormData(prev => ({
      ...prev,
      requiredDocuments: [
        ...prev.requiredDocuments,
        { name: '', description: '', isMandatory: true }
      ],
    }));
  };

  const handleRemoveDoc = (index) => {
    setFormData(prev => ({
      ...prev,
      requiredDocuments: prev.requiredDocuments.filter((_, idx) => idx !== index),
    }));
  };

  const handleDocChange = (index, field, value) => {
    setFormData(prev => {
      const docs = [...prev.requiredDocuments];
      docs[index] = { ...docs[index], [field]: value };
      return { ...prev, requiredDocuments: docs };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.productName.trim()) {
      setFormError('Please enter a product name');
      return;
    }
    if (Number(formData.interestRate) <= 0) {
      setFormError('Interest rate must be greater than 0%');
      return;
    }
    if (Number(formData.minAmount) <= 0 || Number(formData.maxAmount) < Number(formData.minAmount)) {
      setFormError('Max loan amount must be greater than or equal to min loan amount');
      return;
    }
    if (Number(formData.minTenure) <= 0 || Number(formData.maxTenure) < Number(formData.minTenure)) {
      setFormError('Max tenure must be greater than or equal to min tenure');
      return;
    }

    // Filter out blank document rows
    const cleanedDocs = (formData.requiredDocuments || [])
      .map(d => ({
        name: (d.name || '').trim(),
        description: (d.description || '').trim(),
        isMandatory: Boolean(d.isMandatory),
      }))
      .filter(d => d.name.length > 0);

    const payload = {
      productName: formData.productName.trim(),
      loanType: formData.loanType,
      interestRate: Number(formData.interestRate),
      interestType: formData.interestType || 'diminishing',
      minAmount: Number(formData.minAmount),
      maxAmount: Number(formData.maxAmount),
      minTenure: Number(formData.minTenure),
      maxTenure: Number(formData.maxTenure),
      tenure: Number(formData.tenure || formData.minTenure),
      description: formData.description.trim(),
      badge: formData.badge.trim(),
      isActive: Boolean(formData.isActive),
      requiredDocuments: cleanedDocs,
    };

    setSubmitting(true);
    try {
      if (editingProduct) {
        await api.updateLoanProduct(editingProduct._id, payload);
        onToast && onToast('Loan scheme updated successfully');
      } else {
        await api.createLoanProduct(payload);
        onToast && onToast('New loan scheme created successfully');
      }
      setIsModalOpen(false);
      await loadProducts();
    } catch (err) {
      setFormError(err.message || 'Failed to save loan scheme');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.productName?.toLowerCase().includes(search.toLowerCase()) ||
      p.loanType?.toLowerCase().includes(search.toLowerCase()) ||
      p.badge?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || p.loanType === typeFilter;
    return matchesSearch && matchesType;
  });

  const activeCount = products.filter((p) => p.isActive).length;
  const minRate = products.length ? Math.min(...products.map((p) => p.interestRate || 999)) : 0;

  return (
    <div style={{ padding: '4px 0 24px 0' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', margin: '0 0 4px 0', color: '#111827', fontWeight: 700 }}>
            Loan Schemes & Document Requirements
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6B7280' }}>
            Configure loan catalog schemes, tenure, interest rates, and specific required documents for each loan type.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSeedPresets}
            disabled={seeding}
            className="btn-secondary"
            style={{ padding: '8px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Populate recommended default loan products with full document requirements"
          >
            {seeding ? 'Seeding...' : '⚡ Restore Scheme Presets'}
          </button>
          <button
            onClick={() => handleOpenCreateModal('Personal')}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            + Create New Loan Scheme
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid-4" style={{ marginBottom: '20px', gap: '14px' }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>Total Loan Schemes</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>{products.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Active Catalog Offerings</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#059669', marginTop: '2px' }}>{activeCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>Retired / Hidden</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>{products.length - activeCount}</div>
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>Starting Interest Rate</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#7C3AED', marginTop: '2px' }}>
            {minRate > 0 && minRate < 999 ? `${minRate}% p.a.` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search loan products by name or badge..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '7px 12px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: '7px 12px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px', backgroundColor: '#FFF' }}
        >
          <option value="all">All Loan Types</option>
          {LOAN_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="loading-panel">Loading Loan Schemes...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
          <p style={{ margin: '0 0 12px 0' }}>No loan schemes found matching criteria.</p>
          <button onClick={() => handleOpenCreateModal('Personal')} className="btn-primary" style={{ fontSize: '13px', padding: '6px 14px' }}>
            + Create First Loan Scheme
          </button>
        </div>
      ) : (
        <div className="grid-2" style={{ gap: '18px' }}>
          {filteredProducts.map((product) => {
            const docCount = product.requiredDocuments?.length || 0;
            const mandatoryCount = (product.requiredDocuments || []).filter(d => d.isMandatory).length;

            return (
              <div
                key={product._id}
                className="card"
                style={{
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderLeft: product.isActive ? '4px solid #10B981' : '4px solid #9CA3AF',
                  opacity: product.isActive ? 1 : 0.8,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#EEF2FF', color: '#4338CA' }}>
                        {product.loanType}
                      </span>
                      <span className={`badge ${product.isActive ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '11px' }}>
                        {product.isActive ? 'Active' : 'Retired'}
                      </span>
                      <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                        {product.interestType === 'flat' ? 'Flat EMI' : 'Diminishing'}
                      </span>
                      {product.badge && (
                        <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                          ★ {product.badge}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#059669' }}>
                      {product.interestRate}% <span style={{ fontSize: '11px', fontWeight: 500 }}>p.a.</span>
                    </span>
                  </div>

                  <h3 style={{ margin: '4px 0 6px 0', fontSize: '16px', color: '#111827', fontWeight: 600 }}>
                    {product.productName}
                  </h3>

                  {product.description && (
                    <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#4B5563', lineHeight: '1.4' }}>
                      {product.description}
                    </p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#F9FAFB', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', marginBottom: '14px' }}>
                    <div>
                      <span style={{ color: '#6B7280' }}>Loan Amount:</span>{' '}
                      <strong style={{ color: '#111827' }}>
                        {formatCurrency(product.minAmount)} – {formatCurrency(product.maxAmount)}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#6B7280' }}>Tenure Range:</span>{' '}
                      <strong style={{ color: '#111827' }}>
                        {product.minTenure || 6} – {product.maxTenure || 60} mos
                      </strong>
                    </div>
                  </div>

                  {/* Required Documents Section */}
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#374151' }}>
                        Required Documents ({docCount}):
                      </span>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>
                        {mandatoryCount} mandatory
                      </span>
                    </div>

                    {docCount === 0 ? (
                      <div style={{ fontSize: '11.5px', color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>
                        Standard KYC only (No custom documents configured)
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {product.requiredDocuments.slice(0, 3).map((doc, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11.5px',
                              padding: '3px 8px',
                              backgroundColor: '#F3F4F6',
                              borderRadius: '4px',
                            }}
                          >
                            <span style={{ color: '#1F2937', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              📄 {doc.name}
                            </span>
                            <span style={{ fontSize: '10px', color: doc.isMandatory ? '#DC2626' : '#6B7280', fontWeight: doc.isMandatory ? 600 : 400 }}>
                              {doc.isMandatory ? 'Required' : 'Optional'}
                            </span>
                          </div>
                        ))}
                        {docCount > 3 && (
                          <span style={{ fontSize: '11px', color: '#6366F1', fontWeight: 500 }}>
                            +{docCount - 3} more document requirements...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E5E7EB', paddingTop: '12px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenEditModal(product)}
                      className="btn-secondary"
                      style={{ padding: '5px 12px', fontSize: '12px' }}
                    >
                      Edit Scheme & Docs
                    </button>
                    <button
                      onClick={() => handleToggleActive(product)}
                      className="btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px', color: product.isActive ? '#D97706' : '#059669' }}
                    >
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteProduct(product)}
                    style={{ background: 'none', border: 'none', color: '#DC2626', fontSize: '12px', cursor: 'pointer', padding: '4px 6px' }}
                    title="Delete product"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                  {editingProduct ? `Edit Scheme: ${editingProduct.productName}` : 'Create New Loan Scheme'}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
                  Set interest rate, tenure, and configure specific document upload requirements.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9CA3AF' }}
              >
                ✕
              </button>
            </div>

            {formError && <div className="error-banner" style={{ marginBottom: '14px' }}>{formError}</div>}

            <form onSubmit={handleSubmit}>
              {/* Product Basic Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Scheme / Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salaried Instant Personal Loan"
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Loan Category *
                  </label>
                  <select
                    value={formData.loanType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setFormData(prev => ({ ...prev, loanType: newType }));
                    }}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px', backgroundColor: '#FFF' }}
                  >
                    {LOAN_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Interest Calculation Type *
                  </label>
                  <select
                    value={formData.interestType || 'diminishing'}
                    onChange={(e) => setFormData({ ...formData, interestType: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px', backgroundColor: '#FFF' }}
                  >
                    <option value="diminishing">Diminishing Balance</option>
                    <option value="flat">Flat Rate EMI</option>
                  </select>
                </div>
              </div>

              {/* Rates and Amounts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Interest Rate (% p.a.) *
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={formData.interestRate}
                    onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Min Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="5000"
                    required
                    value={formData.minAmount}
                    onChange={(e) => setFormData({ ...formData, minAmount: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Max Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="10000"
                    required
                    value={formData.maxAmount}
                    onChange={(e) => setFormData({ ...formData, maxAmount: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
              </div>

              {/* Tenures & Badges */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Min Tenure (mos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.minTenure}
                    onChange={(e) => setFormData({ ...formData, minTenure: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Max Tenure (mos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxTenure}
                    onChange={(e) => setFormData({ ...formData, maxTenure: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Default Tenure
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.tenure}
                    onChange={(e) => setFormData({ ...formData, tenure: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Badge Tag (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Instant Approval"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Product Overview / Benefits
                </label>
                <textarea
                  rows="2"
                  placeholder="Short description shown to customers on the loan portal..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '13px', border: '1px solid #D1D5DB', borderRadius: '6px' }}
                />
              </div>

              {/* Active Toggle */}
              <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#4F46E5', cursor: 'pointer' }}
                />
                <label htmlFor="isActive" style={{ fontSize: '13px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                  Enable Scheme in Active Customer Catalog
                </label>
              </div>

              {/* REQUIRED DOCUMENTS BUILDER */}
              <div style={{ borderTop: '2px solid #F3F4F6', paddingTop: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                      📋 Specific Document Requirements for this Loan
                    </h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#6B7280' }}>
                      Customers applying for this scheme will be requested to upload these exact documents.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDoc}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    + Add Document
                  </button>
                </div>

                {/* Preset quick buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>Apply Presets:</span>
                  {LOAN_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleApplyPresetDocs(t.id)}
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#F9FAFB',
                        cursor: 'pointer',
                        color: '#374151',
                      }}
                    >
                      {t.id} Docs
                    </button>
                  ))}
                </div>

                {/* Documents Table / Rows */}
                {(!formData.requiredDocuments || formData.requiredDocuments.length === 0) ? (
                  <div style={{ padding: '16px', textAlign: 'center', backgroundColor: '#F9FAFB', borderRadius: '6px', color: '#9CA3AF', fontSize: '12px' }}>
                    No specific documents configured. Customers will only be asked for standard KYC documents.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {formData.requiredDocuments.map((doc, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 3fr 100px 32px',
                          gap: '8px',
                          alignItems: 'center',
                          backgroundColor: '#F9FAFB',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E5E7EB',
                        }}
                      >
                        <div>
                          <input
                            type="text"
                            required
                            placeholder="Document Name (e.g. Salary Slips)"
                            value={doc.name}
                            onChange={(e) => handleDocChange(idx, 'name', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Instructions / Format notes (e.g. Last 3 months PDF)"
                            value={doc.description}
                            onChange={(e) => handleDocChange(idx, 'description', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', fontSize: '12px', border: '1px solid #D1D5DB', borderRadius: '4px' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="checkbox"
                            id={`mand-${idx}`}
                            checked={doc.isMandatory}
                            onChange={(e) => handleDocChange(idx, 'isMandatory', e.target.checked)}
                            style={{ width: '14px', height: '14px', accentColor: '#DC2626', cursor: 'pointer' }}
                          />
                          <label htmlFor={`mand-${idx}`} style={{ fontSize: '11px', color: doc.isMandatory ? '#DC2626' : '#6B7280', fontWeight: 600, cursor: 'pointer' }}>
                            Mandatory
                          </label>
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDoc(idx)}
                            style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: '16px', cursor: 'pointer', padding: '2px' }}
                            title="Remove document"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #E5E7EB', paddingTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px' }}
                >
                  {submitting ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Loan Scheme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
