export const initialCustomers = [
  { id: 'RS', name: 'Rekha Suresh', account: 'AC-1029384', phone: '+91 98470 xxxxx', email: 'rekha.s@mail.com', kyc: 'Under review', balance: '₹42,180', loans: 1, fds: 1, since: 'Feb 2025', branch: 'Kochi', dob: '14 Mar 1991', pan: 'AAAPZ1234C', address: 'Panampilly Nagar, Kochi', employment: 'Salaried · ₹68,000/mo' },
  { id: 'MJ', name: 'Manoj Jacob', account: 'AC-1027710', phone: '+91 90480 xxxxx', email: 'manoj.j@mail.com', kyc: 'Verified', balance: '₹1,18,400', loans: 1, fds: 0, since: 'Nov 2024', branch: 'Kochi', dob: '2 Jul 1988', pan: 'AABPJ5567D', address: 'Kadavanthra, Kochi', employment: 'Salaried · ₹68,000/mo' },
  { id: 'PK', name: 'Priya Krishnan', account: 'AC-1031120', phone: '+91 89020 xxxxx', email: 'priya.k@mail.com', kyc: 'Verified', balance: '₹6,240', loans: 0, fds: 1, since: 'Jan 2025', branch: 'Kochi', dob: '19 Sep 1995', pan: 'AACPK7789E', address: 'Vyttila, Kochi', employment: 'Self-employed' },
  { id: 'SV', name: 'Sunil Varma', account: 'AC-1019943', phone: '+91 96330 xxxxx', email: 'sunil.v@mail.com', kyc: 'Verified', balance: '₹28,900', loans: 1, fds: 0, since: 'Aug 2024', branch: 'Kochi', dob: '11 Jan 1985', pan: 'AADPV3345F', address: 'Edappally, Kochi', employment: 'Salaried · ₹42,000/mo' },
  { id: 'AT', name: 'Anu Thomas', account: 'AC-1024456', phone: '+91 94470 xxxxx', email: 'anu.t@mail.com', kyc: 'Rejected', balance: '₹0', loans: 0, fds: 0, since: 'Mar 2025', branch: 'Kochi', dob: '27 Dec 1993', pan: 'AAEPT9081G', address: 'Fort Kochi', employment: 'Student' },
  { id: 'DK', name: 'Deepak Kumar', account: 'AC-1033201', phone: '+91 91234 xxxxx', email: 'deepak.k@mail.com', kyc: 'Under review', balance: '₹15,600', loans: 1, fds: 0, since: 'Apr 2025', branch: 'Kochi', dob: '5 May 1990', pan: 'AAFPK2234H', address: 'Palarivattom, Kochi', employment: 'Salaried · ₹55,000/mo' },
  { id: 'NM', name: 'Nisha Menon', account: 'AC-1027551', phone: '+91 90112 xxxxx', email: 'nisha.m@mail.com', kyc: 'Re-check', balance: '₹52,010', loans: 1, fds: 0, since: 'Oct 2024', branch: 'Kochi', dob: '30 Aug 1992', pan: 'AAGPM4456I', address: 'Thrikkakara, Kochi', employment: 'Salaried · ₹60,000/mo' },
];

export const initialKycQueue = [
  { id: 'RS', submitted: 'Submitted 2 days ago', status: 'pending' },
  { id: 'DK', submitted: 'Submitted 1 day ago', status: 'pending' },
  { id: 'NM', submitted: 'Re-submitted', status: 'pending' },
  { id: 'SV', submitted: 'Submitted 3 days ago', status: 'pending' },
  { id: 'AT', submitted: 'Submitted 4 days ago', status: 'pending' },
];

export const loanQueue = [
  { id: 'MJ', type: 'Personal', amount: '₹2,50,000', badge: 'badge-purple', status: 'Review' },
  { id: 'PK', type: 'Business', amount: '₹5,00,000', badge: 'badge-purple', status: 'Review' },
];

export const sidebarItems = [
  { key: 'dashboard', label: 'Dashboard', section: null },
  { key: 'customers', label: 'Customers', section: 'Operations' },
  { key: 'cash-deposit', label: 'Cash Deposit', section: null },
  { key: 'cash-withdrawal', label: 'Cash Withdrawal', section: null },
  { key: 'kyc', label: 'KYC verification', section: null },
  { key: 'video-kyc', label: 'Video KYC', section: null },
  { key: 'loan-schemes', label: 'Loan Schemes', section: 'Loan Management' },
  { key: 'loan', label: 'Loan processing', section: null },
  { key: 'emi', label: 'EMI & collections', section: null },
  { key: 'fd-schemes', label: 'FD Schemes', section: 'FD Management' },
  { key: 'fd', label: 'Fixed deposits', section: null },
  { key: 'tickets', label: 'Tickets', section: 'Support' },
];

// Screens actually implemented in this build.
export const IMPLEMENTED_ROUTES = ['dashboard', 'customers', 'customer-detail', 'cash-deposit', 'cash-withdrawal', 'kyc', 'video-kyc', 'loan-schemes', 'loan', 'emi', 'fd-schemes', 'fd', 'tickets'];