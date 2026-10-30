import axios from 'axios';

// Dynamic API base: points to local server when running on localhost, or live deployed backend when deployed
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000/api'
    : '/api');
export const SOCKET_BASE =
  import.meta.env.VITE_SOCKET_BASE ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://16.178.31.55.sslip.io');

/**
 * Safely resolves document URLs (relative /uploads, absolute, blob) and automatically
 * appends customer authentication token for previewing and downloading secure documents.
 */
export const resolveDocUrl = (rawUrl) => {
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
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('flowly_token') : null;
  if (token && (url.includes('/uploads/') || url.includes('/api/documents/') || url.startsWith(base))) {
    if (!url.includes('token=')) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}token=${encodeURIComponent(token)}`;
    }
  }
  return url;
};

const API = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor to attach Authorization Token and handle FormData boundaries
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('flowly_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data instanceof FormData) {
    // Crucial: remove application/json header so the browser/Axios computes
    // 'multipart/form-data; boundary=----WebKitFormBoundary...' with the correct boundary
    if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }
  return config;
}, (error) => Promise.reject(error));

// Response Interceptor for Centralized User-Friendly Error Handling
API.interceptors.response.use(
  (response) => response,
  (error) => {
    let friendlyMessage = 'An unexpected error occurred. Please try again.';
    if (!error.response) {
      // Network error, CORS issue, or server offline
      friendlyMessage = 'Unable to reach the server. Please check your internet connection and verify the backend is running.';
    } else {
      const status = error.response.status;
      const data = error.response.data;
      if (data && typeof data === 'object') {
        if (data.message && typeof data.message === 'string') {
          friendlyMessage = data.message;
        } else if (data.error && typeof data.error === 'string') {
          friendlyMessage = data.error;
        }
      }

      if (friendlyMessage === 'An unexpected error occurred. Please try again.') {
        if (status === 400) {
          friendlyMessage = 'Invalid request. Please check the entered information and try again.';
        } else if (status === 401) {
          friendlyMessage = 'Your session has expired or you are unauthorized. Please sign in again.';
        } else if (status === 403) {
          friendlyMessage = 'Access denied. You do not have permission to perform this action.';
        } else if (status === 404) {
          friendlyMessage = 'The requested resource was not found.';
        } else if (status === 409) {
          friendlyMessage = 'A conflict occurred. The record may already exist or has been modified.';
        } else if (status === 422) {
          friendlyMessage = 'Validation failed. Please verify your submitted information.';
        } else if (status === 429) {
          friendlyMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (status >= 500) {
          friendlyMessage = 'Internal server error. Our engineering team has been notified. Please try again shortly.';
        } else {
          friendlyMessage = `Request failed with status ${status}. Please try again.`;
        }
      }
    }

    error.userFriendlyMessage = friendlyMessage;
    if (error.response && error.response.data && typeof error.response.data === 'object' && !error.response.data.message) {
      error.response.data.message = friendlyMessage;
    }

    return Promise.reject(error);
  }
);

/**
 * Universal Error Formatter Helper
 * Extracts the most user-friendly message from any error object.
 */
export const getErrorMessage = (err, fallback = 'An unexpected error occurred. Please try again.') => {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (err.response?.data?.message) return err.response.data.message;
  if (typeof err.response?.data?.error === 'string') return err.response.data.error;
  if (err.userFriendlyMessage) return err.userFriendlyMessage;
  if (err.message && err.message !== 'Network Error' && !err.message.includes('status code')) return err.message;
  if (!err.response && (err.message === 'Network Error' || err.code === 'ERR_NETWORK')) {
    return 'Unable to reach the server. Please check your internet connection.';
  }
  return fallback;
};

// Auth Endpoints
export const authAPI = {
  sendOTP: (data) => API.post('/auth/otp/send', data),
  verifyOTP: (data) => API.post('/auth/otp/verify', data),
  register: (data) => API.post('/auth/user/register', data),
  generateMPIN: (data) => API.post('/auth/mpin/generate', data),
  login: (data) => API.post('/auth/user/login', data),
  resetMPIN: (data) => API.post('/auth/mpin/reset', data),
  resetPassword: (data) => API.post('/auth/password/reset', data),
  googleAuth: (data) => API.post('/auth/google', data),
  getGoogleClientId: () => API.get('/auth/google/client-id'),
  getMe: () => API.get('/auth/me'),
  updateProfile: (data) => API.put('/auth/profile', data),
  uploadAvatar: (formData) => {
    const headers = formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {};
    return API.post('/auth/profile/avatar', formData, { headers });
  },
  removeAvatar: () => API.delete('/auth/profile/avatar'),
};

// KYC Verification Endpoints
export const kycAPI = {
  submitKYC: (formData) => {
    // Check if formData is FormData instance for multipart uploads
    const headers = formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {};
    return API.post('/kyc/submit', formData, { headers });
  },
  getStatus: () => API.get('/kyc/status'),
};

// Video KYC Endpoints (customer side)
export const videoKycAPI = {
  // Most recent session booked for this customer (or null if none yet)
  getMySession: () => API.get('/video-kyc/my-session'),
  getSession: (id) => API.get(`/video-kyc/sessions/${id}`),
  // Call before opening the Socket.IO room — returns ICE servers + join permission
  joinSession: (id) => API.post(`/video-kyc/sessions/${id}/join`),
  giveConsent: (id, given = true) => API.post(`/video-kyc/sessions/${id}/consent`, { given }),
};

// Deposits & Savings Endpoints
export const depositsAPI = {
  depositFunds: (data) => API.post('/deposits/account/deposit', data),
  withdrawFunds: (data) => API.post('/deposits/account/withdraw', data),
  createFD: (data) => API.post('/deposits/fd/create', data),
  getMyDeposits: () => API.get('/deposits/my-deposits'),
  getFDById: (id) => API.get(`/deposits/fd/${id}`),
  closeFDEarly: (id) => API.post(`/deposits/fd/${id}/close`),
  getFDSchemes: () => API.get('/deposits/fd/schemes'),
  getFDSchemeById: (id) => API.get(`/deposits/fd/schemes/${id}`),
  calculateFD: (data) => API.post('/deposits/fd/calculate', data),
  initiateTopUp: (data) => API.post('/deposits/account/topup/initiate', data),
  confirmTopUp: (data) => API.post('/deposits/account/topup/confirm', data),
  submitAdditionalInfo: (id, formData) => {
    const headers = formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {};
    return API.post(`/deposits/fd/${id}/submit-info`, formData, { headers });
  },
};

// Add Money & Wallet Endpoints
export const walletAPI = {
  getConfig: () => API.get('/wallet/config'),
  getAccounts: () => API.get('/wallet/accounts'),
  createTopUpIntent: (data) => API.post('/wallet/topup/intent', data),
  withdrawFunds: (data) => API.post('/wallet/withdraw', data),
  getTopUpStatus: (paymentIntentId) => API.get(`/wallet/topups/${paymentIntentId}/status`),
  getTopUps: (page = 1, limit = 10) => API.get(`/wallet/topups?page=${page}&limit=${limit}`),
  getTransaction: (receiptNumber) => API.get(`/wallet/transactions/${receiptNumber}`),
};

// Loan Catalog & Application Endpoints
export const loansAPI = {
  getProducts: () => API.get('/loans/products'),
  applyLoan: (data) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': undefined } } : {};
    return API.post('/loans/apply', data, config);
  },
  getMyApplications: () => API.get('/loans/my-applications'),
  resubmitDocuments: (id, data) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': undefined } } : {};
    return API.post(`/loans/applications/${id}/resubmit-documents`, data, config);
  },
  updateDocuments: (id, data) => {
    const config = data instanceof FormData ? { headers: { 'Content-Type': undefined } } : {};
    return API.put(`/loans/applications/${id}/documents`, data, config);
  },
  acceptSanction: (id) => API.post(`/loans/applications/${id}/accept-sanction`),
  esignAgreement: (id, data) => API.post(`/loans/applications/${id}/esign`, data),
};

// EMI Repayment Endpoints
export const repaymentsAPI = {
  getSchedule: (loanId) => API.get(`/repayments/schedule/${loanId}`),
  initiateRepayment: (loanId, installmentNo) => API.post(`/repayments/initiate/${loanId}/${installmentNo}`),
  confirmRepayment: (loanId, installmentNo, data) =>
    API.post(`/repayments/confirm/${loanId}/${installmentNo}`, data),
  payAutoDebit: (loanId, installmentNo) => API.post(`/repayments/pay-auto-debit/${loanId}/${installmentNo}`),
  payAutoDebitAll: (loanId) => API.post(`/repayments/pay-auto-debit-all/${loanId}`),
  initiateRepaymentAll: (loanId) => API.post(`/repayments/initiate-all/${loanId}`),
  confirmCardRepaymentAll: (loanId, data) => API.post(`/repayments/confirm-all-card/${loanId}`, data),
  getHistory: (loanId) => API.get(`/repayments/history/${loanId}`),
  getPaymentHistory: (loanId) => API.get(`/repayments/payments?loanId=${loanId}`),
  getNoc: (loanId) => API.get(`/repayments/noc/${loanId}`),
  applyNoc: (loanId, data) => API.post(`/repayments/noc/${loanId}/apply`, data),
  getNocDownloadUrl: (loanId) => {
    const token = localStorage.getItem('flowly_token') || localStorage.getItem('token');
    return `${API_BASE}/repayments/noc/${loanId}?format=pdf${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },
};

// Customer Dashboard Metrics Endpoints
export const dashboardAPI = {
  getDashboard: (params) => API.get('/customer/dashboard', { params }),
  getAccountSummary: () => API.get('/customer/dashboard/account-summary'),
  getActiveLoan: () => API.get('/customer/dashboard/active-loan'),
  getActiveFDs: () => API.get('/customer/dashboard/active-fds'),
  getRecentTransactions: (page = 1, limit = 5) => {
    const params = typeof page === 'object' && page !== null ? page : { page, limit };
    return API.get('/customer/dashboard/recent-transactions', { params });
  },
  getNotifications: (limit = 5) => API.get(`/customer/dashboard/notifications?limit=${limit}`),
  getFinancialOverview: () => API.get('/customer/dashboard/financial-overview'),
};

// Calculators Endpoints
export const calculatorAPI = {
  calculateLoanEMI: (data) => API.post('/calculator/loan', data),
  calculateFD: (data) => API.post('/calculator/fd', data),
};

// Notifications Endpoints
export const notificationsAPI = {
  getMyNotifications: (params) => API.get('/notifications/my', { params }),
  markAllRead: () => API.put('/notifications/mark-all-read'),
  markRead: (id) => API.put(`/notifications/${id}/read`),
  deleteNotification: (id) => API.delete(`/notifications/${id}`),
  reportNotification: (id, data) => API.post(`/notifications/${id}/report`, data),
};

// Cash Deposit & Withdrawal Endpoints (Customer receipt view)
export const cashDepositAPI = {
  getReceipt: (receiptNumber) => API.get(`/cash-deposits/${receiptNumber}`),
};

export const cashWithdrawalAPI = {
  getReceipt: (receiptNumber) => API.get(`/cash-withdrawals/${receiptNumber}`),
  downloadReceiptPDF: (receiptNumber) =>
    API.get(`/cash-withdrawals/${receiptNumber}/pdf`, { responseType: 'blob' }),
};

// Support Ticket Endpoints
export const supportAPI = {
  create: (data) => API.post('/support-tickets', data),
  getMyTickets: (params) => API.get('/support-tickets/my', { params }),
  getMyTicket: (id) => API.get(`/support-tickets/my/${id}`),
  reply: (id, data) => API.post(`/support-tickets/${id}/reply`, data),
};

// Internal Money Transfer Endpoints (Three-branch grid, MPIN <= 2000, MPIN+OTP > 2000)
export const transferAPI = {
  getConfig: () => API.get('/transfers/config'),
  validateBeneficiary: (data) => API.post('/transfers/validate-beneficiary', data),
  requestOTP: (data) => API.post('/transfers/request-otp', data),
  executeTransfer: (data) => API.post('/transfers/execute', data),
  createStripeIntent: (data) => API.post('/transfers/stripe/intent', data),
  getStripeStatus: (paymentIntentId) => API.get(`/transfers/stripe/status/${paymentIntentId}`),
  confirmStripeTransfer: (data) => API.post('/transfers/stripe/confirm', data),
  getReceipt: (receiptNumber) => API.get(`/transfers/receipt/${receiptNumber}`),
  downloadReceiptPDF: (receiptNumber) =>
    API.get(`/transfers/receipt/${receiptNumber}/pdf`, { responseType: 'blob' }),
  getHistory: (page = 1, limit = 20) => API.get(`/transfers/history?page=${page}&limit=${limit}`),
  reportTransfer: (data) => API.post('/transfers/report', data),
  resolveTransferReport: (data) => API.post('/transfers/resolve-report', data),
};

// Bank Statement Endpoints
export const statementAPI = {
  getMyStatements: () => API.get('/statements/my-statements'),
  downloadStatement: (params = {}) =>
    API.get('/statements/download', {
      params,
      responseType: 'blob',
    }),
  emailStatement: (data) => API.post('/statements/email', data),
};

export default API;