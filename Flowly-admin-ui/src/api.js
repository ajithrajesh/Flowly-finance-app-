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

const TOKEN_KEY = 'flowly_admin_token';
const ADMIN_KEY = 'flowly_admin_profile';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredAdmin() {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(token, admin) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

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
    throw new Error('Could not reach backend API server. Make sure server is running on port 5000.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Empty body handling
  }

  if (!res.ok) {
    if (res.status === 401 && auth) {
      clearSession();
    }
    let message = data?.message || (typeof data?.error === 'string' ? data.error : null);
    if (!message) {
      if (res.status === 400) message = 'Invalid request parameters. Please verify your input.';
      else if (res.status === 401) message = 'Admin session has expired or is invalid. Please log in again.';
      else if (res.status === 403) message = 'Access denied. Administrator privileges are required.';
      else if (res.status === 404) message = 'The requested administrative resource could not be found.';
      else if (res.status === 409) message = 'A conflict occurred. The record may already exist or has been modified.';
      else if (res.status === 422) message = 'Validation failed on the submitted administrative data.';
      else if (res.status === 429) message = 'Rate limit exceeded. Please wait a moment before trying again.';
      else if (res.status >= 500) message = 'Internal backend server error. Please try again shortly.';
      else message = `Administrative request failed with status code ${res.status}.`;
    }
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/**
 * Admin Login Endpoint — Enforces Admin Privileges
 */
export async function loginAdmin({ email, password }) {
  const data = await request('/auth/worker/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });

  const worker = data.worker || data.user;
  if (!worker || worker.role !== 'admin') {
    throw new Error('Access denied. Administrator privileges required to access the Admin Portal.');
  }

  setSession(data.token, worker);
  return worker;
}

export function logoutAdmin() {
  clearSession();
}

export async function fetchMe() {
  const data = await request('/auth/me');
  const user = data.user || data;
  if (user.role !== 'admin') {
    clearSession();
    throw new Error('Unauthorized role');
  }
  return user;
}

// Admin APIs
export async function fetchBusinessAnalysis() {
  return request('/admin/analysis');
}

export async function fetchWorkerMonitor() {
  return request('/admin/workers');
}

export async function createWorkerAccount(payload) {
  return request('/admin/workers', {
    method: 'POST',
    body: payload,
  });
}

export async function updateWorkerStatus(id, { status, role }) {
  return request(`/admin/workers/${id}/status`, {
    method: 'PATCH',
    body: { status, role },
  });
}

export async function fetchRotationStatus() {
  return request('/support-tickets/rotation-status');
}

export async function fetchCustomerList({ page = 1, limit = 20, search = '' } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  return request(`/customers?${params.toString()}`);
}

// ---------------------------------------------------------------------
// NOC (No Due Certificate) Management Endpoints
// ---------------------------------------------------------------------

export async function fetchNocRequests({ status, search } = {}) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.append('status', status);
  if (search) params.append('search', search);
  return request(`/repayments/noc-requests?${params.toString()}`);
}

export async function approveNoc(loanId, { adminRemarks } = {}) {
  return request(`/repayments/noc/${loanId}/approve`, {
    method: 'POST',
    body: { adminRemarks },
  });
}

export async function rejectNoc(loanId, { rejectionReason } = {}) {
  return request(`/repayments/noc/${loanId}/reject`, {
    method: 'POST',
    body: { rejectionReason },
  });
}

export async function fetchLoanNoc(loanId) {
  return request(`/repayments/noc/${loanId}`);
}

export function getNocDownloadUrl(loanId) {
  const token = getToken();
  return `${API_BASE}/repayments/noc/${loanId}?format=pdf${token ? `&token=${encodeURIComponent(token)}` : ''}`;
}

// ---------------------------------------------------------------------
// Admin Notifications Endpoints
// ---------------------------------------------------------------------

export async function fetchAdminNotifications({ page = 1, limit = 30, unreadOnly = false, type } = {}) {
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

export async function markAdminNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: 'PUT' });
}

export async function markAllAdminNotificationsRead() {
  return request('/notifications/mark-all-read', { method: 'PUT' });
}

export async function deleteAdminNotification(id) {
  return request(`/notifications/${id}`, { method: 'DELETE' });
}
