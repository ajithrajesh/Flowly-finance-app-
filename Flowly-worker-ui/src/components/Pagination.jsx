import React from 'react';

/**
 * Reusable backend-driven Pagination Component
 * Displays record counts, page selector, next/previous buttons, and page size dropdown.
 * Explicit page navigation prevents infinite scrolling.
 */
export default function Pagination({
  pagination,
  page = 1,
  limit = 10,
  onPageChange,
  onLimitChange,
  limitOptions = [5, 10, 20, 50],
  itemLabel = 'records',
  compact = false,
  className = '',
}) {
  if (!pagination) return null;

  const total = Number(pagination.total || 0);
  const totalPages = Math.max(Number(pagination.totalPages || Math.ceil(total / limit) || 1), 1);
  const currentPage = Math.min(Math.max(Number(page || pagination.page || 1), 1), totalPages);
  const currentLimit = Number(limit || pagination.limit || 10);

  const startRecord = total === 0 ? 0 : (currentPage - 1) * currentLimit + 1;
  const endRecord = Math.min(currentPage * currentLimit, total);

  const hasPrev = pagination.hasPrevPage !== undefined ? pagination.hasPrevPage : currentPage > 1;
  const hasNext = pagination.hasNextPage !== undefined ? pagination.hasNextPage : currentPage < totalPages;

  // Calculate sliding page numbers with ellipses
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = [];
    pages.push(1);

    if (currentPage > 3) {
      pages.push('ellipsis-start');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let p = start; p <= end; p++) {
      pages.push(p);
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis-end');
    }

    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={`pagination-container ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: compact ? '8px 4px' : '12px 16px',
        marginTop: '12px',
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E5E7EB',
        fontSize: '12.5px',
      }}
    >
      {/* LEFT: Count & Records info + Page size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <span style={{ color: '#6B7280' }}>
          Showing <strong style={{ color: '#111827' }}>{startRecord}</strong> to{' '}
          <strong style={{ color: '#111827' }}>{endRecord}</strong> of{' '}
          <strong style={{ color: '#111827' }}>{total}</strong> {itemLabel}
        </span>

        {onLimitChange && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B7280' }}>
            <span>Per page:</span>
            <select
              value={currentLimit}
              onChange={(e) => {
                onLimitChange(Number(e.target.value));
                if (onPageChange) onPageChange(1);
              }}
              style={{
                height: '28px',
                padding: '0 8px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                backgroundColor: '#F9FAFB',
                color: '#374151',
                cursor: 'pointer',
              }}
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* RIGHT: Page Navigation Controls */}
      {totalPages > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Previous Button */}
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={!hasPrev}
            onClick={() => onPageChange(currentPage - 1)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              opacity: hasPrev ? 1 : 0.45,
              cursor: hasPrev ? 'pointer' : 'not-allowed',
            }}
            title="Previous Page"
          >
            ← Previous
          </button>

          {/* Page Numbers */}
          {!compact &&
            pageNumbers.map((p, idx) => {
              if (p === 'ellipsis-start' || p === 'ellipsis-end') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    style={{ padding: '0 4px', color: '#9CA3AF', fontSize: '13px' }}
                  >
                    …
                  </span>
                );
              }

              const isCurrent = p === currentPage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  style={{
                    minWidth: '28px',
                    height: '28px',
                    padding: '0 6px',
                    fontSize: '12px',
                    fontWeight: isCurrent ? 700 : 500,
                    borderRadius: '6px',
                    border: isCurrent ? '1px solid #4F46E5' : '1px solid #E5E7EB',
                    backgroundColor: isCurrent ? '#4F46E5' : '#FFFFFF',
                    color: isCurrent ? '#FFFFFF' : '#374151',
                    cursor: isCurrent ? 'default' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  title={`Page ${p}`}
                >
                  {p}
                </button>
              );
            })}

          {compact && (
            <span style={{ fontSize: '12px', color: '#4B5563', padding: '0 4px' }}>
              {currentPage} / {totalPages}
            </span>
          )}

          {/* Next Button */}
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={!hasNext}
            onClick={() => onPageChange(currentPage + 1)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              opacity: hasNext ? 1 : 0.45,
              cursor: hasNext ? 'pointer' : 'not-allowed',
            }}
            title="Next Page"
          >
            Next →
          </button>
        </div>
      ) : (
        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Page 1 of 1</span>
      )}
    </div>
  );
}
