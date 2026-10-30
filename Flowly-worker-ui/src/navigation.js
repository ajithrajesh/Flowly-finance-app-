import { useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IMPLEMENTED_ROUTES } from './data.js';

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  'customer-detail': 'Customer',
  'cash-deposit': 'Offline Cash Deposit Counter',
  'cash-withdrawal': 'Offline Cash Withdrawal Counter',
  kyc: 'KYC verification',
  'video-kyc': 'Video KYC',
  'loan-schemes': 'Loan Schemes & Document Requirements',
  loan: 'Loan Processing',
  emi: 'EMI Schedules, Collections & Recovery Desk',
  'fd-schemes': 'FD Schemes Catalog Management',
  fd: 'Fixed Deposit Review & Approvals',
  tickets: 'Customer Support Tickets & Problem Resolution Desk',
};

/**
 * Resolves the canonical internal route key from a pathname.
 * e.g., '/customers/RS' -> 'customer-detail'
 *       '/customers' -> 'customers'
 *       '/loan' -> 'loan'
 *       '/' or '/dashboard' -> 'dashboard'
 */
export function getRouteKey(pathname = '') {
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean || clean === 'dashboard') return 'dashboard';
  if (clean === 'customers') return 'customers';
  if (clean.startsWith('customers/') || clean.startsWith('customer-detail')) return 'customer-detail';
  if (clean === 'customer-detail') return 'customer-detail';
  if (IMPLEMENTED_ROUTES.includes(clean)) return clean;
  const first = clean.split('/')[0];
  return IMPLEMENTED_ROUTES.includes(first) ? first : 'dashboard';
}

/**
 * Flag to ensure history sentinel setup runs only once per session entry.
 */
let historyInitialized = false;

/**
 * Initializes browser history sentinel and seeds the history stack if a user
 * lands directly on a sub-route. This guarantees that clicking the browser back
 * button navigates back to previous views or the dashboard instead of exiting
 * the application to the browser homepage.
 */
export function setupHistorySentinel(defaultRoute = '/dashboard') {
  if (typeof window === 'undefined') return () => {};

  if (!historyInitialized) {
    historyInitialized = true;

    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    const currentKey = getRouteKey(window.location.pathname);
    const state = window.history.state;

    // Direct entry check: brand new tab or fresh page load without prior React Router history
    const isDirectEntry = !state || state.idx == null || state.idx === 0;

    if (isDirectEntry) {
      if (currentKey !== 'dashboard' && window.location.pathname !== defaultRoute) {
        // User arrived directly at a sub-page (e.g. /kyc, /loan, /customers/123).
        // Seed the history stack:
        // Entry 0: Sentinel at defaultRoute (prevents exit when back is pressed on dashboard)
        // Entry 1: Root at defaultRoute (dashboard)
        // Entry 2 (or 3): the current target page
        window.history.replaceState({ idx: 0, isSentinel: true }, '', defaultRoute);
        window.history.pushState({ idx: 1, isRoot: true }, '', defaultRoute);

        if (currentKey === 'customer-detail' && currentPath !== '/customers') {
          window.history.pushState({ idx: 2 }, '', '/customers');
          window.history.pushState({ idx: 3 }, '', currentPath);
        } else {
          window.history.pushState({ idx: 2 }, '', currentPath);
        }
      } else {
        // User arrived directly at dashboard or default route
        window.history.replaceState({ idx: 0, isSentinel: true }, '', defaultRoute);
        window.history.pushState({ idx: 1, isRoot: true }, '', defaultRoute);
      }
    }
  }

  // Intercept back-button popstate hitting the sentinel entry (index 0)
  const handlePopState = (e) => {
    if (e.state && e.state.isSentinel) {
      // User pressed back at the root of the app.
      // Instead of letting the browser exit to the external homepage,
      // push forward back to the root view (defaultRoute).
      window.history.pushState({ idx: 1, isRoot: true }, '', defaultRoute);
    }
  };

  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}

/**
 * Custom hook providing route awareness, navigation, and fallback handling.
 */
export function useWorkerNavigation(defaultRoute = '/dashboard') {
  const navigate = useNavigate();
  const location = useLocation();

  const currentRoute = getRouteKey(location.pathname);

  useEffect(() => {
    const cleanup = setupHistorySentinel(defaultRoute);
    return cleanup;
  }, [defaultRoute]);

  const goBack = useCallback(
    (fallback = defaultRoute) => {
      const currentIdx = window.history.state?.idx;
      // If there is preceding history within the app (idx > 1 because 0 is sentinel, 1 is root)
      if (typeof currentIdx === 'number' && currentIdx > 1) {
        navigate(-1);
      } else {
        navigate(fallback);
      }
    },
    [navigate, defaultRoute]
  );

  const navigateTo = useCallback(
    (keyOrPath, options) => {
      if (typeof keyOrPath !== 'string') return;
      if (keyOrPath.startsWith('/')) {
        navigate(keyOrPath, options);
        return;
      }
      if (keyOrPath === 'dashboard') {
        navigate('/dashboard', options);
      } else if (keyOrPath === 'customers') {
        navigate('/customers', options);
      } else if (keyOrPath === 'customer-detail') {
        navigate('/customers', options);
      } else {
        navigate(`/${keyOrPath}`, options);
      }
    },
    [navigate]
  );

  return {
    currentRoute,
    pathname: location.pathname,
    navigate: navigateTo,
    goBack,
  };
}
