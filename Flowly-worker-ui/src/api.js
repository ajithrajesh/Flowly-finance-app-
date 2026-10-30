/**
 * ---------------------------------------------------------------------
 *  REAL API LAYER — Flowly Finance backend
 * ---------------------------------------------------------------------
 *  Talks to the live backend at API_BASE. Every function is async, can
 *  throw an Error with a human-readable message (from the backend's
 *  `message` field when available), and returns already-shaped data
 *  ready for the UI components to consume.
 * ---------------------------------------------------------------------
 */

export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : '/api');
// Socket.IO connects at the server root, not under /api
export const SOCKET_BASE =
  import.meta.env.VITE_SOCKET_BASE ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://16.178.31.55.sslip.io');

const TOKEN_KEY = 'flowly_worker_token';
const WORKER_KEY = 'flowly_worker_profile';

// ---------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredWorker() {
  try {
    const raw = localStorage.getItem(WORKER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(token, worker) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(WORKER_KEY, JSON.stringify(worker));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WORKER_KEY);
}

/**
 * Resolves a document URL (relative /uploads, absolute, blob) and automatically
 * appends worker authentication token for previewing and downloading secure documents.
 */
export function resolveDocUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const base = (SOCKET_BASE || API_BASE.replace(/\/api\/?$/, '')).replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    url = `${base}${cleanPath}`;
  }
  const token = getToken();
  if (token && (url.includes('/uploads/') || url.includes('/api/documents/') || url.startsWith(base))) {
    if (!url.includes('token=')) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
}

// ---------------------------------------------------------------------
// Low-level fetch wrapper
// ---------------------------------------------------------------------

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // no JSON body (rare, e.g. some 204s)
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      // Token missing/expired/invalid — force back to login.
      clearSession();
    }
    let message = data?.message || (typeof data?.error === 'string' ? data.error : null);
    if (!message) {
      if (res.status === 400) message = 'Invalid request parameters. Please verify your entries.';
      else if (res.status === 401) message = 'Staff session expired. Please sign in again to continue.';
      else if (res.status === 403) message = 'Access denied. You do not have permissions for this action.';
      else if (res.status === 404) message = 'The requested resource could not be found.';
      else if (res.status === 409) message = 'A conflict occurred. The record may already exist or has been updated.';
      else if (res.status === 422) message = 'Validation failed. Please verify the submitted data.';
      else if (res.status === 429) message = 'Rate limit exceeded. Please wait a moment and try again.';
      else if (res.status >= 500) message = 'Internal backend server error. Please try again shortly.';
      else message = `Request failed with status ${res.status}. Please try again.`;
    }
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

export async function loginWorker({ email, password }) {
  const data = await request('/auth/worker/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  setSession(data.token, data.worker);
  return data.worker;
}

export function logoutWorker() {
  clearSession();
}

export async function fetchMe() {
  const data = await request('/auth/me');
  return data.user || data;
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

function mapKycStatus(status) {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'under_verification':
      return 'Under review';
    default:
      return 'Pending';
  }
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || '?'
  );
}

// Derives the customer's *bank account* status for display, instead of the
// unrelated User.status admin-block flag (which defaults to "active" for
// every user and is never changed by the KYC flow). A bank Account document
// is only ever created once KYC is approved, so:
//   - no Account yet              -> 'no_account'
//   - Account exists              -> the Account's own active/inactive status
//   - user is admin-blocked       -> 'blocked' (overrides the above)
function deriveAccountStatus(raw) {
  if (raw.status === 'blocked') return 'blocked';
  if (raw.status === 'suspended' || raw.account?.status === 'suspended') return 'suspended';
  if (!raw.account) return 'no_account';
  return raw.account.status || 'active';
}

function mapCustomer(raw) {
  return {
    id: raw._id,
    avatar: initials(raw.name),
    name: raw.name,
    email: raw.email,
    phone: raw.phone,
    account: raw.account?.accountNumber ? `AC-${raw.account.accountNumber}` : 'Not created',
    balance: raw.account ? formatCurrency(raw.account.balance) : '—',
    kyc: mapKycStatus(raw.kycStatus),
    status: deriveAccountStatus(raw),
    userStatus: raw.status,
    address: raw.address || '',
    since: raw.createdAt
      ? new Date(raw.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
      : '',
    branch: raw.account?.branch || '—',
    ifscCode: raw.account?.ifscCode || '',
    accountType: raw.account?.accountType || '',
  };
}

export async function fetchCustomers({ page = 1, limit = 20, search = '', kycStatus, status, sortBy, order } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  if (kycStatus) params.set('kycStatus', kycStatus);
  if (status) params.set('status', status);
  if (sortBy) params.set('sortBy', sortBy);
  if (order) params.set('order', order);

  const data = await request(`/customers?${params.toString()}`);
  return {
    customers: (data.customers || []).map(mapCustomer),
    pagination: data.pagination,
  };
}

export async function fetchCustomerById(id) {
  const data = await request(`/customers/${id}`);
  return mapCustomer(data.customer);
}

export async function reenableCustomerTransactions(customerId, { resolutionNotes } = {}) {
  return request(`/customers/${customerId}/re-enable-transactions`, {
    method: 'PATCH',
    body: { resolutionNotes },
  });
}

export async function resolveTransferReport({ receiptNumber, ticketId, customerId, resolutionNotes } = {}) {
  return request('/transfers/resolve-report', {
    method: 'POST',
    body: { receiptNumber, ticketId, customerId, resolutionNotes },
  });
}

// ---------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------

function mapKycRecord(record) {
  const submittedDate = record.createdAt ? new Date(record.createdAt) : null;
  const daysAgo = submittedDate
    ? Math.max(0, Math.floor((Date.now() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const session = record.videoKycSession;
  const isVideoVerified =
    record.videoKycVerified !== undefined
      ? Boolean(record.videoKycVerified)
      : Boolean(
          session &&
            typeof session === 'object' &&
            session.status === 'completed' &&
            session.checklist?.faceVerified &&
            session.checklist?.documentVerified &&
            session.checklist?.livenessPassed &&
            session.recordingConsent?.given &&
            Boolean(session.recording?.url || session.recording?.uploadedAt)
        );

  return {
    id: record._id,
    userId: record.user?._id,
    name: record.user?.name || 'Unknown customer',
    email: record.user?.email,
    phone: record.user?.phone,
    status: record.verificationStatus,
    submitted:
      daysAgo === null ? '' : daysAgo === 0 ? 'Submitted today' : `Submitted ${daysAgo} day(s) ago`,
    dob: record.dob,
    gender: record.gender,
    address: record.address,
    idType: record.idType,
    idNumber: record.idNumber,
    documentUrl: record.document?.fileUrl || record.documentUrl || '',
    panUrl:
      record.panDocument?.fileUrl ||
      record.panUrl ||
      (record.idType === 'pan' ? (record.document?.fileUrl || record.documentUrl) : '') ||
      '',
    aadhaarUrl:
      record.aadhaarDocument?.fileUrl ||
      record.aadhaarUrl ||
      (record.idType === 'aadhaar' ? (record.document?.fileUrl || record.documentUrl) : '') ||
      '',
    selfieUrl: record.selfieDocument?.fileUrl || record.selfieUrl || '',
    rejectionReason: record.rejectionReason || '',
    // OCR check of the uploaded ID image — advisory only, from services/ocrService.js
    ocr: {
      status: record.ocr?.status || 'not_run',
      extractedIdNumber: record.ocr?.extractedIdNumber || '',
      idNumberValid: record.ocr?.idNumberValid,
      extractedDob: record.ocr?.extractedDob || '',
      dobMatched: record.ocr?.dobMatched,
      confidence: record.ocr?.confidence,
      reason: record.ocr?.reason || '',
    },
    // Video KYC (face / document / liveness / recording)
    videoKycStatus: record.videoKycStatus || session?.status || 'not_scheduled',
    videoKycSessionId: session?._id || session || null,
    videoKycSession: session,
    videoKycVerified: isVideoVerified,
    videoKycEvaluation: record.videoKycEvaluation || null,
    videoKycChecklist: {
      faceVerified: session?.checklist?.faceVerified === true,
      documentVerified: session?.checklist?.documentVerified === true,
      livenessPassed: session?.checklist?.livenessPassed === true,
      remarks: session?.checklist?.remarks || '',
    },
    videoKycRecordingConsent: session?.recordingConsent?.given === true,
    videoKycRecordingUrl: session?.recording?.url || '',
  };
}

export async function fetchKycQueue({ status } = {}) {
  const params = status ? `?status=${status}` : '';
  const data = await request(`/kyc/queue${params}`);
  return (data.data || []).map(mapKycRecord);
}

export async function fetchKycDetail(id) {
  const data = await request(`/kyc/${id}`);
  return mapKycRecord(data.data.record);
}

export async function startKycReview(id) {
  const data = await request(`/kyc/${id}/start-review`, { method: 'PUT' });
  return mapKycRecord(data.data);
}

export async function approveKyc(id) {
  const data = await request(`/kyc/${id}/approve`, { method: 'PUT' });
  return { record: mapKycRecord(data.data), message: data.message };
}

export async function rejectKyc(id, reason) {
  const data = await request(`/kyc/${id}/reject`, {
    method: 'PUT',
    body: { reason },
  });
  return { record: mapKycRecord(data.data), message: data.message };
}

// Re-runs OCR on the customer's already-uploaded ID image (e.g. after "unreadable"/"failed").
// Starts async on the backend — data.ocr.status flips to "processing"; poll fetchKycDetail() after a few seconds.
export async function retryKycOcr(id) {
  return request(`/kyc/${id}/ocr/retry`, { method: 'POST' });
}

// There is no dedicated "request new document" endpoint on the backend yet.
// We reuse the notifications channel so the action still reaches the customer.
export async function requestKycDocument(userId, customerName) {
  await request('/notifications/send', {
    method: 'POST',
    body: {
      userId,
      type: 'kyc',
      title: 'New document requested',
      message: `Please re-upload your KYC document, ${customerName}. A staff member has requested a clearer copy.`,
    },
  });
  return { userId };
}

// ---------------------------------------------------------------------
// Dashboard summary (built from existing list endpoints — there's no
// single dashboard endpoint on the backend for workers yet)
// ---------------------------------------------------------------------

export async function fetchDashboardSummary() {
  const [customersRes, kycQueue, loanApps, overdueLoans] = await Promise.all([
    fetchCustomers({ page: 1, limit: 1 }),
    fetchKycQueue(),
    request('/loans/applications').catch(() => ({ applications: [] })),
    request('/repayments/overdue').catch(() => ({ overdue: [] })),
  ]);

  const loanList = loanApps.applications || loanApps.data || [];
  const overdueList = overdueLoans.overdue || overdueLoans.data || [];

  return {
    totalCustomers: customersRes.pagination?.total ?? 0,
    pendingKyc: kycQueue.length,
    pendingLoans: Array.isArray(loanList)
      ? loanList.filter((l) => (l.status || l.applicationStatus) === 'pending').length
      : 0,
    overdueLoans: Array.isArray(overdueList) ? overdueList.length : 0,
    recentKyc: kycQueue.slice(0, 4),
  };
}

// ---------------------------------------------------------------------
// Video KYC — scheduling, sessions, and the live call
// (backend: routes/videoKycRoutes.js + sockets/videoKycSocket.js)
// ---------------------------------------------------------------------

function mapVideoKycSession(s) {
  return {
    id: s._id,
    kycId: s.kyc?._id || s.kyc,
    customerName: s.customer?.name || 'Customer',
    customerPhone: s.customer?.phone || '',
    officerName: s.officer?.name || '',
    status: s.status, // scheduled | in_progress | completed | cancelled | missed
    scheduledAt: s.scheduledAt,
    durationMinutes: s.durationMinutes || 30,
    notes: s.notes || '',
    cancelReason: s.cancelReason || '',
    rescheduledCount: s.rescheduledCount || 0,
    recordingConsentGiven: s.recordingConsent?.given === true,
    checklist: {
      faceVerified: s.checklist?.faceVerified === true,
      documentVerified: s.checklist?.documentVerified === true,
      livenessPassed: s.checklist?.livenessPassed === true,
      remarks: s.checklist?.remarks || '',
    },
    recordingUrl: s.recording?.url || '',
    kycIdType: s.kyc?.idType,
  };
}

// POST /video-kyc/schedule  body: { kycId, scheduledAt (ISO), durationMinutes?, notes? }
export async function scheduleVideoKyc({ kycId, scheduledAt, durationMinutes, notes }) {
  const data = await request('/video-kyc/schedule', {
    method: 'POST',
    body: { kycId, scheduledAt, durationMinutes, notes },
  });
  return mapVideoKycSession(data.data);
}

// GET /video-kyc/sessions?status=&page=&limit=  — this officer's sessions (admins see everyone's)
export async function fetchVideoKycSessions({ status } = {}) {
  const params = status ? `?status=${status}` : '';
  const data = await request(`/video-kyc/sessions${params}`);
  return (data.data || []).map(mapVideoKycSession);
}

export async function fetchVideoKycSession(id) {
  const data = await request(`/video-kyc/sessions/${id}`);
  return { session: mapVideoKycSession(data.data), readyForDecision: data.readyForDecision, missing: data.missing };
}

export async function rescheduleVideoKyc(id, { scheduledAt, durationMinutes }) {
  const data = await request(`/video-kyc/sessions/${id}/reschedule`, {
    method: 'PUT',
    body: { scheduledAt, durationMinutes },
  });
  return mapVideoKycSession(data.data);
}

export async function cancelVideoKyc(id, reason) {
  const data = await request(`/video-kyc/sessions/${id}/cancel`, {
    method: 'PUT',
    body: { reason },
  });
  return mapVideoKycSession(data.data);
}

// POST /video-kyc/sessions/:id/join — call before connecting the Socket.IO room.
// Returns the ICE servers for WebRTC and (for officers) the liveness prompt list.
export async function joinVideoKycSession(id) {
  return request(`/video-kyc/sessions/${id}/join`, { method: 'POST' });
}

export async function updateVideoKycChecklist(id, payload) {
  const data = await request(`/video-kyc/sessions/${id}/checklist`, {
    method: 'PUT',
    body: payload,
  });
  return data;
}

export async function updateKycVideoChecklist(kycId, payload) {
  const data = await request(`/kyc/${kycId}/video-checklist`, {
    method: 'PUT',
    body: payload,
  });
  return data.data;
}

// Uploads the recorded call (multipart/form-data, field "recording"). Requires the
// customer to have given recordingConsent, and the call to be in_progress/completed.
export async function uploadVideoKycRecording(id, blob, filename = 'video-kyc.webm') {
  const form = new FormData();
  form.append('recording', blob, filename);

  const token = getToken();
  const res = await fetch(`${API_BASE}/video-kyc/sessions/${id}/recording`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Recording upload failed (${res.status})`);
  return data.data;
}

// PUT /video-kyc/sessions/:id/end — officer ends the call. Returns whether the
// KYC is now ready for a final approve/reject decision (evaluateVideoKyc()).
export async function endVideoKycSession(id) {
  const data = await request(`/video-kyc/sessions/${id}/end`, { method: 'PUT' });
  return { session: mapVideoKycSession(data.data), readyForDecision: data.readyForDecision, missing: data.missing };
}

// ---------------------------------------------------------------------
// Worker Loan Processing Endpoints
// ---------------------------------------------------------------------

export async function fetchLoanApplications({ status, search, page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (status) params.set('status', status);
  if (search) params.set('search', search);

  const data = await request(`/loans/applications?${params.toString()}`);
  return data;
}

export async function fetchLoanDetail(id) {
  const data = await request(`/loans/applications/${id}`);
  return data.application;
}

export async function assignLoanWorker(id) {
  const data = await request(`/loans/applications/${id}/assign`, { method: 'PUT' });
  return data.application;
}

export async function updateWorkerReview(id, reviewPayload) {
  const data = await request(`/loans/applications/${id}/worker-review`, {
    method: 'PUT',
    body: reviewPayload,
  });
  return data.application;
}

export async function sanctionLoan(id, sanctionPayload) {
  const data = await request(`/loans/applications/${id}/sanction`, {
    method: 'POST',
    body: sanctionPayload,
  });
  return data.application;
}

export async function rejectLoan(id, rejectionReason) {
  const data = await request(`/loans/applications/${id}/reject`, {
    method: 'POST',
    body: { rejectionReason },
  });
  return data.application;
}

export async function disburseLoan(id) {
  const data = await request(`/loans/applications/${id}/disburse`, { method: 'POST' });
  return data;
}

// ---------------------------------------------------------------------
// Worker Repayment & EMI Endpoints
// ---------------------------------------------------------------------

export async function fetchCollectionsOverview({ status, search, page = 1, limit = 10, sortBy = 'nextDue' } = {}) {
  const params = new URLSearchParams();
  if (page) params.set('page', page);
  if (limit) params.set('limit', limit);
  if (sortBy) params.set('sortBy', sortBy);
  if (status && status !== 'all') params.append('status', status);
  if (search) params.append('search', search);
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await request(`/repayments/collections${query}`);
  return data;
}

export async function fetchLoanSchedule(loanId) {
  const data = await request(`/repayments/schedule/${loanId}`);
  return data.loan;
}

export async function fetchOverdueLoans({ page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({ page, limit });
  const data = await request(`/repayments/overdue?${params.toString()}`);
  return data;
}

export async function markEmiPaidManually(loanId, installmentNo, { amountPaid, note, paymentMethod, receiptNumber } = {}) {
  const data = await request(`/repayments/mark-paid/${loanId}/${installmentNo}`, {
    method: 'POST',
    body: { amountPaid, note, paymentMethod, receiptNumber },
  });
  return data;
}

export async function recordRecoveryFollowup(loanId, { followupType, notes, promisedPaymentDate }) {
  const data = await request(`/repayments/recovery-followup/${loanId}`, {
    method: 'PUT',
    body: { followupType, notes, promisedPaymentDate },
  });
  return data;
}

export async function fetchLoanNoc(loanId) {
  const data = await request(`/repayments/noc/${loanId}`);
  return data;
}

// ---------------------------------------------------------------------
// FD Scheme Catalog Management (Worker/Admin)
// ---------------------------------------------------------------------

export async function fetchFdSchemesAll() {
  const data = await request('/deposits/fd/schemes/all');
  return data.schemes || [];
}

export async function createFdScheme(payload) {
  const data = await request('/deposits/fd/schemes', {
    method: 'POST',
    body: payload,
  });
  return data;
}

export async function updateFdScheme(id, payload) {
  const data = await request(`/deposits/fd/schemes/${id}`, {
    method: 'PUT',
    body: payload,
  });
  return data;
}

export async function toggleFdSchemeActive(id) {
  const data = await request(`/deposits/fd/schemes/${id}/toggle`, {
    method: 'PATCH',
  });
  return data;
}

// ---------------------------------------------------------------------
// FD Review Queue & Decision Desk (Worker/Admin)
// ---------------------------------------------------------------------

export async function fetchFdQueue({ page = 1, limit = 10, status = 'pending', search = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const data = await request(`/deposits/fd/queue?${params.toString()}`);
  return data;
}

export async function fetchFdReviewDetails(id) {
  const data = await request(`/deposits/fd/${id}/review`);
  return data;
}

export async function approveFd(id) {
  const data = await request(`/deposits/fd/${id}/approve`, {
    method: 'POST',
  });
  return data;
}

export async function rejectFd(id, reason) {
  const data = await request(`/deposits/fd/${id}/reject`, {
    method: 'POST',
    body: { reason },
  });
  return data;
}

export async function requestFdMoreInfo(id, message) {
  const data = await request(`/deposits/fd/${id}/request-info`, {
    method: 'POST',
    body: { message },
  });
  return data;
}

export async function triggerFdMaturityCheck() {
  const data = await request('/deposits/fd/process-maturity', {
    method: 'POST',
  });
  return data;
}

// ---------------------------------------------------------------------
// Offline Cash Deposit Endpoints (Worker/Admin)
// ---------------------------------------------------------------------

export async function fetchCashDepositConfig() {
  return request('/cash-deposits/config');
}

export async function searchCashDepositAccounts(query) {
  const data = await request(`/cash-deposits/accounts/search?q=${encodeURIComponent(query)}`);
  return data.accounts || [];
}

export async function createCashDeposit({ accountId, amount, confirmCashReceived, remarks, branch, idempotencyKey }) {
  return request('/cash-deposits', {
    method: 'POST',
    body: { accountId, amount, confirmCashReceived, remarks, branch, idempotencyKey },
  });
}

export async function fetchCashDeposits({ page = 1, limit = 20 } = {}) {
  return request(`/cash-deposits?page=${page}&limit=${limit}`);
}

export async function fetchCashDepositReceipt(receiptNumber) {
  const data = await request(`/cash-deposits/${receiptNumber}`);
  return data.receipt;
}

// ---------------------------------------------------------------------
// Offline Cash Withdrawal Endpoints (Worker/Admin)
// ---------------------------------------------------------------------

export async function fetchCashWithdrawalConfig() {
  return request('/cash-withdrawals/config');
}

export async function searchCashWithdrawalAccounts(query) {
  const data = await request(`/cash-withdrawals/accounts/search?q=${encodeURIComponent(query)}`);
  return data.accounts || [];
}

export async function createCashWithdrawal({ accountId, amount, confirmCashHandedOver, remarks, branch, idempotencyKey }) {
  return request('/cash-withdrawals', {
    method: 'POST',
    body: { accountId, amount, confirmCashHandedOver, remarks, branch, idempotencyKey },
  });
}

export async function fetchCashWithdrawals({ page = 1, limit = 20 } = {}) {
  return request(`/cash-withdrawals?page=${page}&limit=${limit}`);
}

export async function fetchCashWithdrawalReceipt(receiptNumber) {
  const data = await request(`/cash-withdrawals/${receiptNumber}`);
  return data.receipt;
}

export async function downloadCashWithdrawalReceiptPDF(receiptNumber) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/cash-withdrawals/${receiptNumber}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = 'Failed to download PDF receipt';
    try {
      const err = await res.json();
      if (err.message) msg = err.message;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Withdrawal_Receipt_${receiptNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Support Ticket Endpoints (Worker / Staff Console)
// ---------------------------------------------------------------------

export async function fetchTickets({ page = 1, limit = 20, status, category, priority, search, assignedTo } = {}) {
  const params = new URLSearchParams();
  if (page) params.append('page', page);
  if (limit) params.append('limit', limit);
  if (status && status !== 'all') params.append('status', status);
  if (category && category !== 'all') params.append('category', category);
  if (priority && priority !== 'all') params.append('priority', priority);
  if (search) params.append('search', search);
  if (assignedTo) params.append('assignedTo', assignedTo);

  const query = params.toString();
  return request(`/support-tickets${query ? `?${query}` : ''}`);
}

export async function fetchTicketStats() {
  return request('/support-tickets/stats');
}

export async function fetchRotationStatus() {
  return request('/support-tickets/rotation-status');
}

export async function autoAssignTicket(id) {
  return request(`/support-tickets/${id}/auto-assign`, {
    method: 'POST',
  });
}

export async function fetchTicketById(id) {
  return request(`/support-tickets/${id}`);
}

export async function assignTicket(id, workerId) {
  return request(`/support-tickets/${id}/assign`, {
    method: 'PUT',
    body: { workerId },
  });
}

export async function updateTicketStatus(id, status) {
  return request(`/support-tickets/${id}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export async function replyTicket(id, message) {
  return request(`/support-tickets/${id}/reply`, {
    method: 'POST',
    body: { message },
  });
}

// ---------------------------------------------------------------------
// Loan Scheme / Product Catalog Management (Worker/Admin)
// ---------------------------------------------------------------------

export async function fetchLoanProductsAll() {
  const data = await request('/loans/products/all');
  return data.products || [];
}

export async function createLoanProduct(payload) {
  const data = await request('/loans/products', {
    method: 'POST',
    body: payload,
  });
  return data;
}

export async function updateLoanProduct(id, payload) {
  const data = await request(`/loans/products/${id}`, {
    method: 'PUT',
    body: payload,
  });
  return data;
}

export async function toggleLoanProductActive(id) {
  const data = await request(`/loans/products/${id}/toggle`, {
    method: 'PATCH',
  });
  return data;
}

export async function deleteLoanProduct(id) {
  const data = await request(`/loans/products/${id}`, {
    method: 'DELETE',
  });
  return data;
}

export async function seedLoanProducts() {
  const data = await request('/loans/seed-products', {
    method: 'POST',
  });
  return data;
}

// ---------------------------------------------------------------------
// Staff Notifications Endpoints
// ---------------------------------------------------------------------

export async function fetchWorkerNotifications({ page = 1, limit = 30, unreadOnly = false, type } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (unreadOnly) params.append('unreadOnly', 'true');
  if (type) params.append('type', type);
  const data = await request(`/notifications/my?${params.toString()}`);
  return {
    notifications: data?.data?.notifications || data?.notifications || [],
    unreadCount: data?.data?.unreadCount ?? data?.unreadCount ?? 0,
    total: data?.total || 0,
    page: data?.page || page,
    limit: data?.limit || limit,
    hasMore: !!data?.hasMore,
  };
}

export async function markWorkerNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PUT' });
}

export async function markAllWorkerNotificationsRead() {
  return request('/notifications/mark-all-read', { method: 'PUT' });
}

export async function deleteWorkerNotification(id) {
  return request(`/notifications/${id}`, { method: 'DELETE' });
}
