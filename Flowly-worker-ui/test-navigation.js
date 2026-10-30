import assert from 'node:assert';
import { getRouteKey, setupHistorySentinel } from './src/navigation.js';
import { UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router-dom';

console.log('--- TEST SUITE: Flowly Worker UI Navigation & Back-Button ---');

// 1. Test getRouteKey
console.log('Testing route key resolution...');
assert.strictEqual(getRouteKey('/'), 'dashboard');
assert.strictEqual(getRouteKey('/dashboard'), 'dashboard');
assert.strictEqual(getRouteKey('/customers'), 'customers');
assert.strictEqual(getRouteKey('/customers/6aafe8778c1e8d32fedefeb1'), 'customer-detail');
assert.strictEqual(getRouteKey('/customers/RS'), 'customer-detail');
assert.strictEqual(getRouteKey('/customer-detail'), 'customer-detail');
assert.strictEqual(getRouteKey('/customer-detail/RS'), 'customer-detail');
assert.strictEqual(getRouteKey('/cash-deposit'), 'cash-deposit');
assert.strictEqual(getRouteKey('/cash-withdrawal'), 'cash-withdrawal');
assert.strictEqual(getRouteKey('/kyc'), 'kyc');
assert.strictEqual(getRouteKey('/video-kyc'), 'video-kyc');
assert.strictEqual(getRouteKey('/loan-schemes'), 'loan-schemes');
assert.strictEqual(getRouteKey('/loan'), 'loan');
assert.strictEqual(getRouteKey('/emi'), 'emi');
assert.strictEqual(getRouteKey('/fd-schemes'), 'fd-schemes');
assert.strictEqual(getRouteKey('/fd'), 'fd');
assert.strictEqual(getRouteKey('/tickets'), 'tickets');
assert.strictEqual(getRouteKey('/unknown-page'), 'dashboard');
console.log('✔ All route keys resolved correctly.');

// Helper to create a mock browser window & history
function createMockEnvironment(initialUrl = '/dashboard') {
  let historyStack = [];
  let currentIndex = -1;
  const listeners = [];

  const mockHistory = {
    get state() {
      return historyStack[currentIndex]?.state || null;
    },
    get length() {
      return historyStack.length;
    },
    pushState(state, title, url) {
      currentIndex++;
      historyStack = historyStack.slice(0, currentIndex);
      historyStack.push({ state, url });
      mockWindow.location.pathname = url;
    },
    replaceState(state, title, url) {
      if (currentIndex === -1) currentIndex = 0;
      historyStack[currentIndex] = { state, url };
      mockWindow.location.pathname = url;
    },
    back() {
      if (currentIndex > 0) {
        currentIndex--;
        mockWindow.location.pathname = historyStack[currentIndex].url;
        const event = { state: mockHistory.state };
        listeners.forEach((fn) => fn(event));
      } else {
        mockWindow._exitedToBrowserHomepage = true;
      }
    },
  };

  const mockWindow = {
    history: mockHistory,
    location: {
      pathname: initialUrl,
      search: '',
      hash: '',
    },
    document: { defaultView: null },
    addEventListener(event, fn) {
      if (event === 'popstate') listeners.push(fn);
    },
    removeEventListener(event, fn) {
      if (event === 'popstate') {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    },
    _exitedToBrowserHomepage: false,
    _getHistoryStack: () => historyStack,
    _getCurrentIndex: () => currentIndex,
  };

  return mockWindow;
}

// 2. Test in-app navigation stack and browser back behavior
console.log('\nTesting sequential in-app navigation and back-button behavior...');
{
  const win = createMockEnvironment('/dashboard');
  global.window = win;

  // Initial root setup
  win.history.replaceState({ idx: 0, isSentinel: true }, '', '/dashboard');
  win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');

  const history = createBrowserHistory({ window: win });

  // Popstate sentinel handler
  win.addEventListener('popstate', (e) => {
    if (e.state && e.state.isSentinel) {
      win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');
    }
  });

  // User navigates: Dashboard -> Customers -> Customer Detail -> KYC
  history.push('/customers');
  assert.strictEqual(win.location.pathname, '/customers');
  assert.strictEqual(history.location.pathname, '/customers');

  history.push('/customers/RS');
  assert.strictEqual(win.location.pathname, '/customers/RS');
  assert.strictEqual(history.location.pathname, '/customers/RS');

  history.push('/kyc');
  assert.strictEqual(win.location.pathname, '/kyc');
  assert.strictEqual(history.location.pathname, '/kyc');

  // Now user clicks browser Back button 1: KYC -> Customer Detail
  win.history.back();
  assert.strictEqual(win.location.pathname, '/customers/RS');
  assert.strictEqual(history.location.pathname, '/customers/RS');
  assert.strictEqual(win._exitedToBrowserHomepage, false);

  // User clicks browser Back button 2: Customer Detail -> Customers
  win.history.back();
  assert.strictEqual(win.location.pathname, '/customers');
  assert.strictEqual(history.location.pathname, '/customers');
  assert.strictEqual(win._exitedToBrowserHomepage, false);

  // User clicks browser Back button 3: Customers -> Dashboard
  win.history.back();
  assert.strictEqual(win.location.pathname, '/dashboard');
  assert.strictEqual(history.location.pathname, '/dashboard');
  assert.strictEqual(win._exitedToBrowserHomepage, false);

  // User clicks browser Back button 4 while on Dashboard:
  // Hits sentinel -> sentinel handler catches it -> stays on Dashboard!
  win.history.back();
  assert.strictEqual(win.location.pathname, '/dashboard');
  assert.strictEqual(win._exitedToBrowserHomepage, false, 'User did NOT exit to browser homepage on root back');
  console.log('✔ In-app navigation stack correctly navigates to previous pages and stays on dashboard.');
}

// 3. Test direct entry to deep link (e.g. /kyc) and browser back behavior
console.log('\nTesting direct deep link entry (/kyc) fallback navigation on back button...');
{
  const win = createMockEnvironment('/kyc');
  global.window = win;

  // Direct deep link seeding:
  win.history.replaceState({ idx: 0, isSentinel: true }, '', '/dashboard');
  win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');
  win.history.pushState({ idx: 2 }, '', '/kyc');

  const history = createBrowserHistory({ window: win });

  win.addEventListener('popstate', (e) => {
    if (e.state && e.state.isSentinel) {
      win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');
    }
  });

  assert.strictEqual(win.location.pathname, '/kyc');
  assert.strictEqual(history.location.pathname, '/kyc');

  // User presses browser Back from /kyc without having visited any prior page in Flowly
  win.history.back();
  assert.strictEqual(win.location.pathname, '/dashboard', 'Direct entry back navigates to /dashboard');
  assert.strictEqual(history.location.pathname, '/dashboard');
  assert.strictEqual(win._exitedToBrowserHomepage, false, 'Did not exit to browser homepage');

  console.log('✔ Direct entry to deep link successfully navigates to /dashboard on back button instead of exiting.');
}

// 4. Test direct entry to customer detail (/customers/:id)
console.log('\nTesting direct entry to customer detail (/customers/RS)...');
{
  const win = createMockEnvironment('/customers/RS');
  global.window = win;

  // Direct customer detail seeding:
  win.history.replaceState({ idx: 0, isSentinel: true }, '', '/dashboard');
  win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');
  win.history.pushState({ idx: 2 }, '', '/customers');
  win.history.pushState({ idx: 3 }, '', '/customers/RS');

  const history = createBrowserHistory({ window: win });

  win.addEventListener('popstate', (e) => {
    if (e.state && e.state.isSentinel) {
      win.history.pushState({ idx: 1, isRoot: true }, '', '/dashboard');
    }
  });

  assert.strictEqual(win.location.pathname, '/customers/RS');
  assert.strictEqual(history.location.pathname, '/customers/RS');

  // Back 1: Customer Detail -> Customers
  win.history.back();
  assert.strictEqual(win.location.pathname, '/customers');
  assert.strictEqual(history.location.pathname, '/customers');

  // Back 2: Customers -> Dashboard
  win.history.back();
  assert.strictEqual(win.location.pathname, '/dashboard');
  assert.strictEqual(history.location.pathname, '/dashboard');

  assert.strictEqual(win._exitedToBrowserHomepage, false);
  console.log('✔ Direct entry to customer detail navigates back to /customers, then /dashboard.');
}

// 5. Test support role default route (/tickets)
console.log('\nTesting support role default route (/tickets)...');
{
  const win = createMockEnvironment('/tickets');
  global.window = win;

  const defaultRoute = '/tickets';
  win.history.replaceState({ idx: 0, isSentinel: true }, '', defaultRoute);
  win.history.pushState({ idx: 1, isRoot: true }, '', defaultRoute);

  const history = createBrowserHistory({ window: win });

  win.addEventListener('popstate', (e) => {
    if (e.state && e.state.isSentinel) {
      win.history.pushState({ idx: 1, isRoot: true }, '', defaultRoute);
    }
  });

  history.push('/customers');
  assert.strictEqual(win.location.pathname, '/customers');

  // Back -> goes back to /tickets
  win.history.back();
  assert.strictEqual(win.location.pathname, '/tickets');
  assert.strictEqual(history.location.pathname, '/tickets');

  console.log('✔ Support role fallback to /tickets works as expected.');
}

console.log('\n========================================');
console.log('ALL NAVIGATION TESTS PASSED SUCCESSFULLY!');
console.log('========================================\n');
