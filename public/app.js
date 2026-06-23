// Global State
let currentRole = null;
let currentView = 'view-staff-wizard';
let currentStep = 1;
let reportsLog = [];
let storeConfig = null;
let formCalculationsBound = false;
let chartTimelineInstance = null;
let chartSalesSplitInstance = null;
let chartExpensesInstance = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginPin = document.getElementById('login-pin');
const loginError = document.getElementById('login-error');

const navItems = document.querySelectorAll('.nav-item');
const viewPanels = document.querySelectorAll('.view-panel');
const adminOnlyElements = document.querySelectorAll('.admin-only');
const userRoleText = document.getElementById('user-role-text');
const userAvatarInitials = document.getElementById('user-avatar-initials');
const headerPageTitle = document.getElementById('header-page-title');
const headerPageSubtitle = document.getElementById('header-page-subtitle');
const btnLogout = document.getElementById('btn-logout');

// Form Stepper Elements
const stepIndicators = document.querySelectorAll('.step-indicator');
const stepContents = document.querySelectorAll('.wizard-step-content');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSubmit = document.getElementById('btn-submit');
const reportWizardForm = document.getElementById('report-wizard-form');

// Date elements
const reportDateInput = document.getElementById('report-date');
const currentDateDisplay = document.getElementById('current-date-display');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  // Set report date defaults to today
  const today = new Date().toISOString().split('T')[0];
  reportDateInput.value = today;
  
  // Format current date display
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  currentDateDisplay.textContent = new Date().toLocaleDateString('en-US', options);
  
  // Initialize Lucide Icons
  lucide.createIcons();
  
  // Setup Event Listeners
  setupEventListeners();

  // Load store master data and build form rows
  loadStoreConfig()
    .then(() => initializeReportForm())
    .catch(err => console.error('Failed to load store configuration:', err));
  
  // Check local session
  checkLocalSession();
});

// Setup Event Listeners
function setupEventListeners() {
  // Login
  loginForm.addEventListener('submit', handleLogin);
  
  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });
  
  // Logout
  btnLogout.addEventListener('click', handleLogout);
  
  // Wizard Stepper click (only allowed to go back or forward if validated)
  stepIndicators.forEach(indicator => {
    indicator.addEventListener('click', () => {
      const targetStep = parseInt(indicator.getAttribute('data-step'));
      if (targetStep < currentStep) {
        goToStep(targetStep);
      } else if (targetStep === currentStep + 1) {
        handleNextStep();
      }
    });
  });
  
  btnNext.addEventListener('click', handleNextStep);
  btnPrev.addEventListener('click', () => goToStep(currentStep - 1));
  
  // Form auto calculations
  setupFormCalculations();

  // Reload carry-forward when report date changes
  reportDateInput.addEventListener('change', () => {
    loadCarryForward(reportDateInput.value);
  });
  
  // Add Dynamic Rows Buttons
  document.getElementById('btn-add-other-income').addEventListener('click', addOtherIncomeRow);
  document.getElementById('btn-add-general-expense').addEventListener('click', addGeneralExpenseRow);
  document.getElementById('btn-add-vendor-purchase').addEventListener('click', addVendorPurchaseRow);
  document.getElementById('btn-add-wage-row').addEventListener('click', addWageRow);
  document.getElementById('btn-add-bill').addEventListener('click', addBillRow);
  
  // Wizard Form Submit
  reportWizardForm.addEventListener('submit', handleReportSubmission);
  
  // Admin Dashboard Date Filters
  const rangeBtns = document.querySelectorAll('.pill-filters .pill-btn:not(#btn-custom-range)');
  rangeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      rangeBtns.forEach(b => b.classList.remove('active'));
      document.getElementById('btn-custom-range').classList.remove('active');
      btn.classList.add('active');
      document.getElementById('custom-date-inputs').classList.add('hide');
      
      const days = parseInt(btn.getAttribute('data-range'));
      loadDashboardData(days);
    });
  });
  
  document.getElementById('btn-custom-range').addEventListener('click', (e) => {
    document.querySelectorAll('.pill-filters .pill-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById('custom-date-inputs').classList.remove('hide');
  });
  
  document.getElementById('btn-apply-custom-date').addEventListener('click', () => {
    const start = document.getElementById('dash-start-date').value;
    const end = document.getElementById('dash-end-date').value;
    if (start && end) {
      loadDashboardDataCustom(start, end);
    }
  });
  
  // Admin Search
  document.getElementById('report-search').addEventListener('input', filterReportsLog);
  
  // Modal close
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-print-report').addEventListener('click', () => window.print());
}

// Session Management
function checkLocalSession() {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (token && role) {
    loginUser(role, token);
  }
}

function handleLogin(e) {
  e.preventDefault();
  const pin = loginPin.value.trim();
  
  // Send only the password to the server; server will determine role securely
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pin })
  })
  .then(res => {
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  })
  .then(data => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.role);
    loginUser(data.role, data.token);
  })
  .catch(err => {
    loginError.classList.remove('hide');
    loginPin.value = '';
    loginPin.focus();
  });
}

function loginUser(role, token) {
  currentRole = role;
  loginScreen.classList.add('hide');
  appContainer.classList.remove('hide');
  
  // Configure UI based on role
  if (role === 'admin') {
    adminOnlyElements.forEach(el => el.classList.remove('hide'));
    userRoleText.textContent = 'Admin Owner';
    userAvatarInitials.textContent = 'A';
    userAvatarInitials.style.backgroundColor = '#bef264';
    userAvatarInitials.style.color = '#000';
    switchView('view-admin-dashboard');
  } else {
    adminOnlyElements.forEach(el => el.classList.add('hide'));
    userRoleText.textContent = 'Staff Member';
    userAvatarInitials.textContent = 'S';
    userAvatarInitials.style.backgroundColor = '#fb923c';
    userAvatarInitials.style.color = '#000';
    switchView('view-staff-wizard');
  }
}

function handleLogout() {
  localStorage.clear();
  currentRole = null;
  appContainer.classList.add('hide');
  loginScreen.classList.remove('hide');
  loginPin.value = '';
  loginError.classList.add('hide');
  
  // Reset Wizard
  reportWizardForm.reset();
  goToStep(1);
  initializeReportForm();
}

async function loadStoreConfig() {
  const res = await fetch('/store-config.json');
  if (!res.ok) throw new Error('Store configuration not found');
  storeConfig = await res.json();
}

async function initializeReportForm() {
  if (!storeConfig) {
    await loadStoreConfig();
  }
  buildFormFromConfig();
  bindStaffLedgerRows();
  await loadCarryForward(reportDateInput.value);
  calculateSalesTotal();
  calculateExpensesTotal();
}

function buildFormFromConfig() {
  buildOtherIncomeRows();
  buildGeneralExpenseRows();
  buildVendorPurchaseRows();
  buildWageRows();
  buildStaffLedgerRows();
}

function buildOtherIncomeRows() {
  const tbody = document.querySelector('#table-other-income tbody');
  tbody.innerHTML = '';
  (storeConfig.otherIncomes || []).forEach(name => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(name)}" readonly></td>
      <td><input type="number" class="calc-income-trigger other-cash-income" placeholder="0" min="0" step="0.01"></td>
      <td><input type="number" class="calc-income-trigger other-bank-income" placeholder="0" min="0" step="0.01"></td>
      <td><input type="text" placeholder="Remarks"></td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

function buildGeneralExpenseRows() {
  const tbody = document.querySelector('#table-general-expenses tbody');
  tbody.innerHTML = '';
  (storeConfig.generalExpenses || []).forEach(name => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(name)}" readonly></td>
      <td><input type="number" class="calc-expense-trigger gen-cash-expense" placeholder="0" min="0" step="0.01"></td>
      <td><input type="number" class="calc-expense-trigger gen-bank-expense" placeholder="0" min="0" step="0.01"></td>
      <td><input type="text" placeholder="Remarks"></td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

function buildVendorPurchaseRows() {
  const tbody = document.querySelector('#table-vendor-purchases tbody');
  tbody.innerHTML = '';
  (storeConfig.vendorPurchases || []).forEach(name => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(name)}" readonly></td>
      <td><select><option value="purchase">Purchase</option><option value="vendor">Vendor Payment</option></select></td>
      <td><input type="number" class="calc-expense-trigger vp-cash" placeholder="0" min="0" step="0.01"></td>
      <td><input type="number" class="calc-expense-trigger vp-bank" placeholder="0" min="0" step="0.01"></td>
      <td><input type="text" placeholder="Remarks"></td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

function buildWageRows() {
  const tbody = document.querySelector('#table-wages-paid tbody');
  tbody.innerHTML = '';
  (storeConfig.wageStaff || []).forEach(name => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(name)}" readonly style="text-transform: uppercase;"></td>
      <td><input type="number" class="calc-wages-trigger wage-cash" placeholder="0" min="0" step="0.01"></td>
      <td><input type="number" class="calc-wages-trigger wage-bank" placeholder="0" min="0" step="0.01"></td>
      <td><input type="text" placeholder="Remarks"></td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

function buildStaffLedgerRows(carryForwardMap = {}) {
  const tbody = document.querySelector('#table-staff-ledger tbody');
  tbody.innerHTML = '';
  (storeConfig.staffLedger || []).forEach(staff => {
    const carry = carryForwardMap[staff.name] || {};
    const ob = carry.ob ?? 0;
    const tr = document.createElement('tr');
    tr.setAttribute('data-staff', staff.name);
    tr.innerHTML = `
      <td><strong>${escapeHtml(staff.name)}</strong></td>
      <td>${escapeHtml(staff.designation)}</td>
      <td><input type="number" class="ledger-ob" value="${ob}" step="0.01"></td>
      <td><input type="number" class="ledger-payable" value="0" step="0.01"></td>
      <td><input type="number" class="ledger-paid" value="0" step="0.01" readonly></td>
      <td><span class="ledger-balance-display">₹${ob.toFixed(2)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function bindStaffLedgerRows() {
  document.querySelectorAll('#table-staff-ledger tbody tr').forEach(row => {
    row.querySelector('.ledger-ob').addEventListener('input', () => calculateLedgerRowBalance(row));
    row.querySelector('.ledger-payable').addEventListener('input', () => calculateLedgerRowBalance(row));
  });
}

async function loadCarryForward(date) {
  if (!date) return;

  try {
    const res = await fetch(`/api/carry-forward?date=${encodeURIComponent(date)}`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('open-cash').value = data.openingBalances?.cash ?? 0;
    document.getElementById('open-franchisee').value = data.openingBalances?.franchisee ?? 0;
    document.getElementById('open-mgmt').value = data.openingBalances?.mgmt ?? 0;

    document.getElementById('meat-chick-open').value = data.meatStock?.chicken?.opening ?? 0;
    document.getElementById('meat-beef-open').value = data.meatStock?.beef?.opening ?? 0;
    calculateMeatStockBalances();

    const carryForwardMap = {};
    (data.staffLedger || []).forEach(staff => {
      carryForwardMap[staff.name] = staff;
    });
    buildStaffLedgerRows(carryForwardMap);
    bindStaffLedgerRows();
    calculateWagesTotal();
    reconcileCashBalance();
  } catch (err) {
    console.error('Error loading carry-forward data:', err);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// View switching
function switchView(viewId) {
  currentView = viewId;
  viewPanels.forEach(p => p.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Page headers adjustment
  if (viewId === 'view-staff-wizard') {
    headerPageTitle.textContent = 'Daily Entry';
    headerPageSubtitle.textContent = 'Fill in the daily reports details';
  } else if (viewId === 'view-admin-dashboard') {
    headerPageTitle.textContent = 'Monitoring';
    headerPageSubtitle.textContent = 'Store financial and inventory intelligence';
    loadDashboardData(7); // load default 7 days stats
  } else if (viewId === 'view-admin-reports') {
    headerPageTitle.textContent = 'Reports Log';
    headerPageSubtitle.textContent = 'Review historical daily ledgers';
    loadReportsList();
  }
}

// ==========================================================================
// WIZARD FORMS STEPPING & CALCULATIONS
// ==========================================================================

function goToStep(step) {
  currentStep = step;
  
  // Update Content
  stepContents.forEach(content => {
    if (parseInt(content.getAttribute('data-step')) === step) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  
  // Update Stepper Headers
  stepIndicators.forEach(indicator => {
    const s = parseInt(indicator.getAttribute('data-step'));
    indicator.classList.remove('active', 'completed');
    
    if (s === step) {
      indicator.classList.add('active');
    } else if (s < step) {
      indicator.classList.add('completed');
    }
  });
  
  // Buttons display
  if (step === 1) {
    btnPrev.classList.add('hide');
    btnNext.classList.remove('hide');
    btnSubmit.classList.add('hide');
  } else if (step === 5) {
    btnPrev.classList.remove('hide');
    btnNext.classList.add('hide');
    btnSubmit.classList.remove('hide');
  } else {
    btnPrev.classList.remove('hide');
    btnNext.classList.remove('hide');
    btnSubmit.classList.add('hide');
  }
}

function handleNextStep() {
  // Simple validation for current step before proceeding
  if (validateStep(currentStep)) {
    goToStep(currentStep + 1);
  }
}

function validateStep(step) {
  if (step === 1) {
    if (!reportDateInput.value) {
      alert('Please select a report date.');
      return false;
    }
    const cash = parseFloat(document.getElementById('open-cash').value);
    if (isNaN(cash)) {
      alert('Please enter starting opening cash.');
      return false;
    }
  }
  return true;
}

// Setup calculations (event delegation — safe to call after dynamic row rebuilds)
function setupFormCalculations() {
  if (formCalculationsBound) return;
  formCalculationsBound = true;

  reportWizardForm.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.classList.contains('calc-sale-trigger')) {
      calculateSalesTotal();
    } else if (target.classList.contains('calc-income-trigger')) {
      calculateIncomeTotal();
    } else if (target.classList.contains('calc-expense-trigger')) {
      calculateExpensesTotal();
    } else if (target.classList.contains('calc-wages-trigger')) {
      calculateWagesTotal();
    } else if (target.classList.contains('calc-meat-trigger')) {
      calculateMeatStockBalances();
    } else if (target.classList.contains('denom-input')) {
      calculateDenominations();
    } else if (target.id === 'close-cash' || target.id === 'open-cash') {
      reconcileCashBalance();
    }
  });
}

// Calculation implementations
function calculateSalesTotal() {
  const cash = parseFloat(document.getElementById('sale-cash').value) || 0;
  const card = parseFloat(document.getElementById('sale-card').value) || 0;
  const upi = parseFloat(document.getElementById('sale-upi').value) || 0;
  const zomato = parseFloat(document.getElementById('sale-zomato').value) || 0;
  const swiggy = parseFloat(document.getElementById('sale-swiggy').value) || 0;
  const credit = parseFloat(document.getElementById('sale-credit').value) || 0;
  
  const total = cash + card + upi + zomato + swiggy + credit;
  document.getElementById('label-sales-total').textContent = `₹${total.toFixed(2)}`;
  calculateIncomeTotal(); // Sales update affects expected incomes
}

function calculateIncomeTotal() {
  const salesTotal = parseFloat(document.getElementById('label-sales-total').textContent.replace('₹', '')) || 0;
  
  let otherCash = 0;
  let otherBank = 0;
  
  document.querySelectorAll('.other-cash-income').forEach(el => {
    otherCash += parseFloat(el.value) || 0;
  });
  
  document.querySelectorAll('.other-bank-income').forEach(el => {
    otherBank += parseFloat(el.value) || 0;
  });
  
  const fran = parseFloat(document.getElementById('income-franchisee').value) || 0;
  const mgmt = parseFloat(document.getElementById('income-mgmt').value) || 0;
  
  const grandTotal = salesTotal + otherCash + otherBank + fran + mgmt;
  document.getElementById('label-income-total').textContent = `₹${grandTotal.toFixed(2)}`;
  reconcileCashBalance();
}

function calculateExpensesTotal() {
  // Direct purchases
  const chickCash = parseFloat(document.getElementById('purchase-chicken-cash').value) || 0;
  const chickBank = parseFloat(document.getElementById('purchase-chicken-bank').value) || 0;
  const vegCash = parseFloat(document.getElementById('purchase-veg-cash').value) || 0;
  const vegBank = parseFloat(document.getElementById('purchase-veg-bank').value) || 0;
  const beefCash = parseFloat(document.getElementById('purchase-beef-cash').value) || 0;
  const beefBank = parseFloat(document.getElementById('purchase-beef-bank').value) || 0;
  
  let genCash = 0;
  let genBank = 0;
  
  document.querySelectorAll('.gen-cash-expense').forEach(el => {
    genCash += parseFloat(el.value) || 0;
  });
  document.querySelectorAll('.gen-bank-expense').forEach(el => {
    genBank += parseFloat(el.value) || 0;
  });
  
  let vpCash = 0;
  let vpBank = 0;
  document.querySelectorAll('.vp-cash').forEach(el => {
    vpCash += parseFloat(el.value) || 0;
  });
  document.querySelectorAll('.vp-bank').forEach(el => {
    vpBank += parseFloat(el.value) || 0;
  });
  
  // Include Wages
  const wagesCash = parseFloat(document.querySelectorAll('.wage-cash')) || 0; // calculated separately
  let wCash = 0;
  let wBank = 0;
  document.querySelectorAll('.wage-cash').forEach(el => {
    wCash += parseFloat(el.value) || 0;
  });
  document.querySelectorAll('.wage-bank').forEach(el => {
    wBank += parseFloat(el.value) || 0;
  });
  
  const totalCash = chickCash + vegCash + beefCash + genCash + vpCash + wCash;
  const totalBank = chickBank + vegBank + beefBank + genBank + vpBank + wBank;
  
  const grandTotal = totalCash + totalBank;
  document.getElementById('label-expenses-total').textContent = `₹${grandTotal.toFixed(2)}`;
  reconcileCashBalance();
}

function calculateWagesTotal() {
  let cashTotal = 0;
  let bankTotal = 0;
  
  document.querySelectorAll('#table-wages-paid tbody tr').forEach(row => {
    const nameInput = row.querySelector('td:first-child input');
    const cashInput = row.querySelector('.wage-cash');
    const bankInput = row.querySelector('.wage-bank');
    
    if (!nameInput || !cashInput || !bankInput) return;
    
    const staffName = nameInput.value.toUpperCase();
    const cashPaid = parseFloat(cashInput.value) || 0;
    const bankPaid = parseFloat(bankInput.value) || 0;
    const totalPaid = cashPaid + bankPaid;
    
    cashTotal += cashPaid;
    bankTotal += bankPaid;
    
    // Automatically update the Wage Paid column in the Staff Ledger matching this name
    const ledgerRow = document.querySelector(`#table-staff-ledger tr[data-staff="${staffName}"]`);
    if (ledgerRow) {
      const paidField = ledgerRow.querySelector('.ledger-paid');
      paidField.value = totalPaid.toFixed(2);
      
      // Update balance
      calculateLedgerRowBalance(ledgerRow);
    }
  });
  
  calculateExpensesTotal(); // wages update triggers expenses recalculation
}

function calculateLedgerRowBalance(row) {
  const ob = parseFloat(row.querySelector('.ledger-ob').value) || 0;
  const payable = parseFloat(row.querySelector('.ledger-payable').value) || 0;
  const paid = parseFloat(row.querySelector('.ledger-paid').value) || 0;
  
  const balance = ob + payable - paid;
  row.querySelector('.ledger-balance-display').textContent = `₹${balance.toFixed(2)}`;
}

function calculateMeatStockBalances() {
  // Chicken
  const chickOpen = parseFloat(document.getElementById('meat-chick-open').value) || 0;
  const chickPurch = parseFloat(document.getElementById('meat-chick-purch').value) || 0;
  const chickUsed = parseFloat(document.getElementById('meat-chick-used').value) || 0;
  const chickWast = parseFloat(document.getElementById('meat-chick-wast').value) || 0;
  const chickBal = chickOpen + chickPurch - chickUsed - chickWast;
  document.getElementById('label-meat-chick-bal').textContent = chickBal.toFixed(2);
  
  // Beef
  const beefOpen = parseFloat(document.getElementById('meat-beef-open').value) || 0;
  const beefPurch = parseFloat(document.getElementById('meat-beef-purch').value) || 0;
  const beefUsed = parseFloat(document.getElementById('meat-beef-used').value) || 0;
  const beefWast = parseFloat(document.getElementById('meat-beef-wast').value) || 0;
  const beefBal = beefOpen + beefPurch - beefUsed - beefWast;
  document.getElementById('label-meat-beef-bal').textContent = beefBal.toFixed(2);
}

function calculateDenominations() {
  let total = 0;
  document.querySelectorAll('.denom-input').forEach(input => {
    const val = parseInt(input.getAttribute('data-value'));
    const count = parseInt(input.value) || 0;
    total += val * count;
  });
  
  document.getElementById('label-denom-total').textContent = `₹${total.toFixed(2)}`;
  
  // If user hasn't filled closing cash yet, auto populate it or prompt
  const closingCashInput = document.getElementById('close-cash');
  if (!closingCashInput.value || parseFloat(closingCashInput.value) === 0) {
    closingCashInput.value = total;
    reconcileCashBalance();
  }
  
  // Verify mismatch warning
  const closeCash = parseFloat(closingCashInput.value) || 0;
  const mismatchWarning = document.getElementById('warning-denom-mismatch');
  if (Math.abs(closeCash - total) > 0.01) {
    mismatchWarning.classList.remove('hide');
  } else {
    mismatchWarning.classList.add('hide');
  }
}

function reconcileCashBalance() {
  const openingCash = parseFloat(document.getElementById('open-cash').value) || 0;
  const salesCash = parseFloat(document.getElementById('sale-cash').value) || 0;
  
  // Sum other incomes in cash
  let otherCashIn = 0;
  document.querySelectorAll('.other-cash-income').forEach(el => {
    otherCashIn += parseFloat(el.value) || 0;
  });
  
  const franIn = parseFloat(document.getElementById('income-franchisee').value) || 0;
  const mgmtIn = parseFloat(document.getElementById('income-mgmt').value) || 0;
  
  // Sum cash expenses paid
  const chickCash = parseFloat(document.getElementById('purchase-chicken-cash').value) || 0;
  const vegCash = parseFloat(document.getElementById('purchase-veg-cash').value) || 0;
  const beefCash = parseFloat(document.getElementById('purchase-beef-cash').value) || 0;
  
  let genCashOut = 0;
  document.querySelectorAll('.gen-cash-expense').forEach(el => {
    genCashOut += parseFloat(el.value) || 0;
  });
  
  let vpCashOut = 0;
  document.querySelectorAll('.vp-cash').forEach(el => {
    vpCashOut += parseFloat(el.value) || 0;
  });
  
  let wagesCashOut = 0;
  document.querySelectorAll('.wage-cash').forEach(el => {
    wagesCashOut += parseFloat(el.value) || 0;
  });
  
  // Compute totals
  const totalCashIn = openingCash + salesCash + otherCashIn + franIn + mgmtIn;
  const totalCashOut = chickCash + vegCash + beefCash + genCashOut + vpCashOut + wagesCashOut;
  
  const expectedClosingCash = totalCashIn - totalCashOut;
  const actualClosingCash = parseFloat(document.getElementById('close-cash').value) || 0;
  
  const excessShort = actualClosingCash - expectedClosingCash;
  
  // Update Labels
  document.getElementById('label-expected-cash').textContent = `₹${expectedClosingCash.toFixed(2)}`;
  document.getElementById('label-actual-cash').textContent = `₹${actualClosingCash.toFixed(2)}`;
  
  const labelDiff = document.getElementById('label-excess-short');
  labelDiff.textContent = `₹${excessShort.toFixed(2)}`;
  
  labelDiff.className = ''; // clear class
  if (excessShort > 0.01) {
    labelDiff.classList.add('positive');
  } else if (excessShort < -0.01) {
    labelDiff.classList.add('negative');
  } else {
    labelDiff.classList.add('neutral');
  }
}

// Dynamic Row Adding Helpers
function addOtherIncomeRow() {
  const tbody = document.querySelector('#table-other-income tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Custom Income Source" required></td>
    <td><input type="number" class="calc-income-trigger other-cash-income" value="0" min="0" step="0.01"></td>
    <td><input type="number" class="calc-income-trigger other-bank-income" value="0" min="0" step="0.01"></td>
    <td><input type="text" placeholder="Remarks"></td>
    <td><button type="button" class="btn-icon-only text-danger btn-delete-row"><i data-lucide="trash-2"></i></button></td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    calculateIncomeTotal();
  });
}

function addGeneralExpenseRow() {
  const tbody = document.querySelector('#table-general-expenses tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Custom Expense Head" required></td>
    <td><input type="number" class="calc-expense-trigger gen-cash-expense" value="0" min="0" step="0.01"></td>
    <td><input type="number" class="calc-expense-trigger gen-bank-expense" value="0" min="0" step="0.01"></td>
    <td><input type="text" placeholder="Remarks"></td>
    <td><button type="button" class="btn-icon-only text-danger btn-delete-row"><i data-lucide="trash-2"></i></button></td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    calculateExpensesTotal();
  });
}

function addVendorPurchaseRow() {
  const tbody = document.querySelector('#table-vendor-purchases tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Vendor/Item" required></td>
    <td><select><option value="purchase">Purchase</option><option value="vendor">Vendor Payment</option></select></td>
    <td><input type="number" class="calc-expense-trigger vp-cash" value="0" min="0" step="0.01"></td>
    <td><input type="number" class="calc-expense-trigger vp-bank" value="0" min="0" step="0.01"></td>
    <td><input type="text" placeholder="Remarks"></td>
    <td><button type="button" class="btn-icon-only text-danger btn-delete-row"><i data-lucide="trash-2"></i></button></td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    calculateExpensesTotal();
  });
}

function addWageRow() {
  const tbody = document.querySelector('#table-wages-paid tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" placeholder="Staff Name" required style="text-transform: uppercase;"></td>
    <td><input type="number" class="calc-wages-trigger wage-cash" value="0" min="0" step="0.01"></td>
    <td><input type="number" class="calc-wages-trigger wage-bank" value="0" min="0" step="0.01"></td>
    <td><input type="text" placeholder="Remarks"></td>
    <td><button type="button" class="btn-icon-only text-danger btn-delete-row"><i data-lucide="trash-2"></i></button></td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => {
    tr.remove();
    calculateWagesTotal();
  });
}

function addBillRow() {
  const tbody = document.querySelector('#table-bills tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select><option value="payable">Payable</option><option value="receivable">Receivable</option></select></td>
    <td><input type="text" placeholder="Bill Description" required></td>
    <td><input type="number" placeholder="0" min="0" step="0.01" required></td>
    <td><input type="text" placeholder="Remarks"></td>
    <td><button type="button" class="btn-icon-only text-danger btn-delete-row"><i data-lucide="trash-2"></i></button></td>
  `;
  tbody.appendChild(tr);
  lucide.createIcons();
  
  tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
}


// ==========================================================================
// SUBMIT REPORT DATA
// ==========================================================================

function handleReportSubmission(e) {
  e.preventDefault();
  
  // Verify final validation: denominations count matches closing cash entered
  const closingCash = parseFloat(document.getElementById('close-cash').value) || 0;
  let denomTotal = 0;
  document.querySelectorAll('.denom-input').forEach(input => {
    const val = parseInt(input.getAttribute('data-value'));
    const count = parseInt(input.value) || 0;
    denomTotal += val * count;
  });
  
  if (Math.abs(closingCash - denomTotal) > 0.01) {
    if (!confirm('Warning: Cash Denominations count does not match the actual Closing Cash. Do you still want to submit this report?')) {
      return;
    }
  }
  
  // Compile all data fields into one JSON payload
  const reportData = compileReportJSON();
  
  fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: reportData.date, data: reportData })
  })
  .then(res => {
    if (!res.ok) throw new Error('Failed to save');
    return res.json();
  })
  .then(data => {
    alert('Daily Report submitted successfully for date: ' + data.date);
    goToStep(1);
    initializeReportForm();
    
    // Redirect admin to dashboard, staff remains at entry page
    if (currentRole === 'admin') {
      switchView('view-admin-dashboard');
    }
  })
  .catch(err => {
    alert('Error submitting report. Please try again.');
  });
}

function compileReportJSON() {
  const dateVal = reportDateInput.value;
  
  // Opening balances
  const openingBalances = {
    cash: parseFloat(document.getElementById('open-cash').value) || 0,
    franchisee: parseFloat(document.getElementById('open-franchisee').value) || 0,
    mgmt: parseFloat(document.getElementById('open-mgmt').value) || 0
  };
  
  // Sales
  const sales = {
    cash: parseFloat(document.getElementById('sale-cash').value) || 0,
    card: parseFloat(document.getElementById('sale-card').value) || 0,
    upi: parseFloat(document.getElementById('sale-upi').value) || 0,
    zomato: parseFloat(document.getElementById('sale-zomato').value) || 0,
    swiggy: parseFloat(document.getElementById('sale-swiggy').value) || 0,
    credit: parseFloat(document.getElementById('sale-credit').value) || 0,
    total: parseFloat(document.getElementById('label-sales-total').textContent.replace('₹', '')) || 0
  };
  
  // Other incomes
  const otherIncomes = [];
  document.querySelectorAll('#table-other-income tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input');
    if (inputs.length >= 3) {
      otherIncomes.push({
        name: inputs[0].value,
        cash: parseFloat(inputs[1].value) || 0,
        bank: parseFloat(inputs[2].value) || 0,
        remarks: inputs[3]?.value || ''
      });
    }
  });
  
  // Received incomes
  const incomeFranchisee = parseFloat(document.getElementById('income-franchisee').value) || 0;
  const incomeMgmt = parseFloat(document.getElementById('income-mgmt').value) || 0;
  const incomeTotal = parseFloat(document.getElementById('label-income-total').textContent.replace('₹', '')) || 0;
  
  // Direct purchases
  const directPurchases = {
    chicken: {
      cash: parseFloat(document.getElementById('purchase-chicken-cash').value) || 0,
      bank: parseFloat(document.getElementById('purchase-chicken-bank').value) || 0,
      remarks: document.getElementById('purchase-chicken-remarks').value || ''
    },
    vegetables: {
      cash: parseFloat(document.getElementById('purchase-veg-cash').value) || 0,
      bank: parseFloat(document.getElementById('purchase-veg-bank').value) || 0,
      remarks: document.getElementById('purchase-veg-remarks').value || ''
    },
    beef: {
      cash: parseFloat(document.getElementById('purchase-beef-cash').value) || 0,
      bank: parseFloat(document.getElementById('purchase-beef-bank').value) || 0,
      remarks: document.getElementById('purchase-beef-remarks').value || ''
    }
  };
  
  // General expenses
  const expenses = [];
  document.querySelectorAll('#table-general-expenses tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input');
    if (inputs.length >= 3) {
      expenses.push({
        category: inputs[0].value,
        cash: parseFloat(inputs[1].value) || 0,
        bank: parseFloat(inputs[2].value) || 0,
        remarks: inputs[3]?.value || ''
      });
    }
  });
  
  // Vendor payments and grocery purchases
  const purchases = [];
  document.querySelectorAll('#table-vendor-purchases tbody tr').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const select = row.querySelector('select');
    if (inputs.length >= 2) {
      purchases.push({
        item: inputs[0].value,
        type: select ? select.value : 'purchase',
        cash: parseFloat(inputs[1].value) || 0,
        bank: parseFloat(inputs[2].value) || 0,
        remarks: inputs[3]?.value || ''
      });
    }
  });
  
  // Wages Paid
  const wages = [];
  document.querySelectorAll('#table-wages-paid tbody tr').forEach(row => {
    const nameInput = row.querySelector('td:first-child input');
    const cashInput = row.querySelector('.wage-cash');
    const bankInput = row.querySelector('.wage-bank');
    const remInput = row.querySelector('td:nth-child(4) input');
    
    if (nameInput) {
      wages.push({
        name: nameInput.value,
        cash: parseFloat(cashInput.value) || 0,
        bank: parseFloat(bankInput.value) || 0,
        remarks: remInput?.value || ''
      });
    }
  });
  
  // Calculate expenses total fields
  const expensesTotalVal = parseFloat(document.getElementById('label-expenses-total').textContent.replace('₹', '')) || 0;
  
  // Closing balances
  const closingBalances = {
    cash: parseFloat(document.getElementById('close-cash').value) || 0,
    franchisee: parseFloat(document.getElementById('close-franchisee').value) || 0,
    mgmt: parseFloat(document.getElementById('close-mgmt').value) || 0
  };
  
  // Expected closing cash check
  const expectedCash = parseFloat(document.getElementById('label-expected-cash').textContent.replace('₹', '')) || 0;
  const excessShort = {
    cash: closingBalances.cash - expectedCash,
    franchisee: 0, // if franchisee tracks expected
    mgmt: 0
  };
  
  // Meat stock
  const meatStock = {
    chicken: {
      opening: parseFloat(document.getElementById('meat-chick-open').value) || 0,
      purchase: parseFloat(document.getElementById('meat-chick-purch').value) || 0,
      used: parseFloat(document.getElementById('meat-chick-used').value) || 0,
      wastage: parseFloat(document.getElementById('meat-chick-wast').value) || 0,
      balance: parseFloat(document.getElementById('label-meat-chick-bal').textContent) || 0
    },
    beef: {
      opening: parseFloat(document.getElementById('meat-beef-open').value) || 0,
      purchase: parseFloat(document.getElementById('meat-beef-purch').value) || 0,
      used: parseFloat(document.getElementById('meat-beef-used').value) || 0,
      wastage: parseFloat(document.getElementById('meat-beef-wast').value) || 0,
      balance: parseFloat(document.getElementById('label-meat-beef-bal').textContent) || 0
    }
  };
  
  // Bills
  const bills = [];
  document.querySelectorAll('#table-bills tbody tr').forEach(row => {
    const select = row.querySelector('select');
    const inputs = row.querySelectorAll('input');
    if (inputs.length >= 2) {
      bills.push({
        type: select ? select.value : 'payable',
        name: inputs[0].value,
        amount: parseFloat(inputs[1].value) || 0,
        remarks: inputs[2]?.value || ''
      });
    }
  });
  
  // Denominations count
  const denominations = {};
  document.querySelectorAll('.denom-input').forEach(input => {
    const val = input.getAttribute('data-value');
    denominations[val] = parseInt(input.value) || 0;
  });
  denominations.total = parseFloat(document.getElementById('label-denom-total').textContent.replace('₹', '')) || 0;
  
  // Staff ledger account balances
  const staffLedger = [];
  document.querySelectorAll('#table-staff-ledger tbody tr').forEach(row => {
    const staffName = row.getAttribute('data-staff');
    const desig = row.querySelector('td:nth-child(2)').textContent;
    const ob = parseFloat(row.querySelector('.ledger-ob').value) || 0;
    const payable = parseFloat(row.querySelector('.ledger-payable').value) || 0;
    const paid = parseFloat(row.querySelector('.ledger-paid').value) || 0;
    const balance = ob + payable - paid;
    
    staffLedger.push({
      name: staffName,
      designation: desig,
      ob,
      wagePayable: payable,
      wagePaid: paid,
      balance
    });
  });
  
  return {
    date: dateVal,
    openingBalances,
    sales,
    otherIncomes,
    incomeFranchisee,
    incomeMgmt,
    incomeTotal,
    directPurchases,
    expenses,
    purchases,
    wages,
    expensesTotal: {
      cash: 0, // computed inside server helper if needed, but we save grand totals
      bank: 0,
      total: expensesTotalVal
    },
    closingBalances,
    excessShort,
    meatStock,
    bills,
    denominations,
    staffLedger,
    createdBy: currentRole === 'admin' ? 'Admin' : 'Staff'
  };
}


// ==========================================================================
// ADMIN DASHBOARD & CHARTS (CHART.JS)
// ==========================================================================

function loadDashboardData(daysRange) {
  const end = new Date().toISOString().split('T')[0];
  const start = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  loadDashboardDataCustom(start, end);
}

function loadDashboardDataCustom(start, end) {
  fetch(`/api/dashboard-summary?startDate=${start}&endDate=${end}`)
    .then(res => res.json())
    .then(data => {
      // 1. Render KPI summaries
      document.getElementById('kpi-total-sales').textContent = `₹${data.summary.totalSales.toLocaleString('en-IN')}`;
      document.getElementById('kpi-avg-daily').textContent = `₹${data.summary.avgDailySales.toLocaleString('en-IN')} / day`;
      document.getElementById('kpi-total-expenses').textContent = `₹${data.summary.totalExpenses.toLocaleString('en-IN')}`;
      
      const netProfit = data.summary.netProfit;
      const profitEl = document.getElementById('kpi-net-profit');
      profitEl.textContent = `₹${netProfit.toLocaleString('en-IN')}`;
      
      const marginTrend = document.getElementById('kpi-net-trend-color');
      const marginLabel = document.getElementById('kpi-net-percent');
      
      marginTrend.className = 'kpi-trend';
      if (netProfit > 0) {
        marginTrend.classList.add('green');
        const marginPct = data.summary.totalSales > 0 ? (netProfit / data.summary.totalSales * 100).toFixed(1) : 0;
        marginLabel.textContent = `${marginPct}% Net Profit Margin`;
      } else {
        marginTrend.classList.add('orange');
        marginLabel.textContent = `Negative Margins`;
      }
      
      // 2. Render Charts
      renderTimelineChart(data.trendData);
      renderSalesSplitChart(data.salesSplit);
      renderExpensesChart(data.expenseBreakdown);
    })
    .catch(err => {
      console.error('Error loading dashboard stats:', err);
    });
}

function renderTimelineChart(trendData) {
  const ctx = document.getElementById('chart-timeline').getContext('2d');
  
  if (chartTimelineInstance) {
    chartTimelineInstance.destroy();
  }
  
  const labels = trendData.map(t => {
    // Format date string from YYYY-MM-DD to DD-MM
    const parts = t.date.split('-');
    return parts.length === 3 ? `${parts[2]}-${parts[1]}` : t.date;
  });
  
  const sales = trendData.map(t => t.sales);
  const expenses = trendData.map(t => t.expenses);
  const profits = trendData.map(t => t.profit);
  
  chartTimelineInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Sales Revenue',
          data: sales,
          borderColor: '#bef264',
          backgroundColor: 'rgba(190, 242, 100, 0.05)',
          borderWidth: 3,
          tension: 0.35,
          fill: true
        },
        {
          label: 'Total Expenses',
          data: expenses,
          borderColor: '#fb923c',
          backgroundColor: 'rgba(251, 146, 60, 0.05)',
          borderWidth: 2,
          tension: 0.35,
          borderDash: [5, 5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#9CA3AF', font: { family: 'Inter', weight: 600 } }
        }
      },
      scales: {
        x: {
          grid: { color: '#232529' },
          ticks: { color: '#9CA3AF' }
        },
        y: {
          grid: { color: '#232529' },
          ticks: { color: '#9CA3AF' }
        }
      }
    }
  });
}

function renderSalesSplitChart(salesSplit) {
  const ctx = document.getElementById('chart-sales-split').getContext('2d');
  if (chartSalesSplitInstance) {
    chartSalesSplitInstance.destroy();
  }
  
  // Custom horizontal bars representing revenue streams
  chartSalesSplitInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Cash', 'UPI', 'Card', 'Zomato', 'Swiggy', 'Credit'],
      datasets: [{
        data: [
          salesSplit.cash,
          salesSplit.upi,
          salesSplit.card,
          salesSplit.zomato,
          salesSplit.swiggy,
          salesSplit.credit
        ],
        backgroundColor: [
          '#bef264', // Cash (Green)
          '#38bdf8', // UPI (Blue)
          '#a78bfa', // Card (Purple)
          '#fb923c', // Zomato (Orange)
          '#f472b6', // Swiggy (Pink)
          '#94a3b8'  // Credit (Slate)
        ],
        borderRadius: 50,
        barThickness: 12
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9CA3AF' } },
        y: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { weight: 600 } } }
      }
    }
  });
}

function renderExpensesChart(expenseBreakdown) {
  const ctx = document.getElementById('chart-expense-categories').getContext('2d');
  if (chartExpensesInstance) {
    chartExpensesInstance.destroy();
  }
  
  const labels = Object.keys(expenseBreakdown);
  const data = Object.values(expenseBreakdown);
  
  chartExpensesInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: '#fb923c',
        borderRadius: 50,
        barThickness: 12
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9CA3AF' } },
        y: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { weight: 600 } } }
      }
    }
  });
}

// ==========================================================================
// REPORTS LEDGER LISTING & PDF DETAILS MODAL
// ==========================================================================

function loadReportsList() {
  fetch('/api/reports')
    .then(res => res.json())
    .then(data => {
      reportsLog = data;
      renderReportsTable(data);
    })
    .catch(err => console.error('Error loading reports ledger:', err));
}

function renderReportsTable(data) {
  const tbody = document.getElementById('reports-list-tbody');
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No reports logged yet.</td></tr>`;
    return;
  }
  
  data.forEach(r => {
    const profitClass = r.netProfit > 0 ? 'positive' : r.netProfit < 0 ? 'negative' : '';
    const diffClass = r.excessShort > 0.01 ? 'positive' : r.excessShort < -0.01 ? 'negative' : 'neutral';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.date}</strong></td>
      <td>₹${r.totalSales.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td>₹${r.totalExpenses.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td class="${profitClass}"><strong>₹${r.netProfit.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
      <td>₹${r.closingCash.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td class="${diffClass}">₹${r.excessShort.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
      <td>
        <button class="btn btn-secondary btn-sm btn-view-detail" data-date="${r.date}">
          <i data-lucide="eye" style="width: 14px; height: 14px;"></i> View Details
        </button>
      </td>
    `;
    tbody.appendChild(tr);
    
    tr.querySelector('.btn-view-detail').addEventListener('click', () => showReportDetail(r.date));
  });
  lucide.createIcons();
}

function filterReportsLog() {
  const query = document.getElementById('report-search').value.toLowerCase();
  const filtered = reportsLog.filter(r => r.date.toLowerCase().includes(query));
  renderReportsTable(filtered);
}

// Show Detailed PDF A4 Modal
function showReportDetail(date) {
  fetch(`/api/reports/details/${date}`)
    .then(res => res.json())
    .then(r => {
      // 1. Basic properties
      document.getElementById('pdf-report-date').textContent = r.date;
      document.getElementById('pdf-open-cash').textContent = r.openingBalances.cash.toFixed(2);
      document.getElementById('pdf-open-fran').textContent = (r.openingBalances.franchisee || 0).toFixed(2);
      document.getElementById('pdf-open-mgmt').textContent = (r.openingBalances.mgmt || 0).toFixed(2);
      
      // Sales
      document.getElementById('pdf-sale-cash').textContent = r.sales.cash.toFixed(2);
      document.getElementById('pdf-sale-card').textContent = r.sales.card.toFixed(2);
      document.getElementById('pdf-sale-upi').textContent = r.sales.upi.toFixed(2);
      document.getElementById('pdf-sale-zomato').textContent = r.sales.zomato.toFixed(2);
      document.getElementById('pdf-sale-swiggy').textContent = (r.sales.swiggy || 0).toFixed(2);
      document.getElementById('pdf-sale-credit').textContent = (r.sales.credit || 0).toFixed(2);
      document.getElementById('pdf-sales-total').textContent = r.sales.total.toFixed(2);
      
      // Other incomes
      const oiTbody = document.getElementById('pdf-other-income-rows');
      oiTbody.innerHTML = '';
      let oiCashTotal = 0;
      let oiBankTotal = 0;
      
      if (r.otherIncomes) {
        r.otherIncomes.forEach(oi => {
          const rowTotal = (oi.cash || 0) + (oi.bank || 0);
          oiCashTotal += oi.cash || 0;
          oiBankTotal += oi.bank || 0;
          
          oiTbody.innerHTML += `
            <tr>
              <td>${oi.name}</td>
              <td class="text-right">${(oi.cash || 0).toFixed(2)}</td>
              <td class="text-right">${(oi.bank || 0).toFixed(2)}</td>
              <td class="text-right">${rowTotal.toFixed(2)}</td>
              <td>${oi.remarks || '-'}</td>
              <td>-</td>
            </tr>
          `;
        });
      }
      
      document.getElementById('pdf-oi-cash-total').textContent = oiCashTotal.toFixed(2);
      document.getElementById('pdf-oi-bank-total').textContent = oiBankTotal.toFixed(2);
      document.getElementById('pdf-oi-total').textContent = (oiCashTotal + oiBankTotal).toFixed(2);
      
      document.getElementById('pdf-oi-fran').textContent = (r.incomeFranchisee || 0).toFixed(2);
      document.getElementById('pdf-oi-mgmt').textContent = (r.incomeMgmt || 0).toFixed(2);
      
      // Grand total income
      document.getElementById('pdf-income-grand-total').textContent = r.incomeTotal.toFixed(2);
      
      // 2. Expenses rendering
      const expTbody = document.getElementById('pdf-expense-rows');
      expTbody.innerHTML = '';
      
      let expCashTotal = 0;
      let expBankTotal = 0;
      
      // Direct Purchases
      if (r.directPurchases) {
        const dp = r.directPurchases;
        ['chicken', 'vegetables', 'beef'].forEach(cat => {
          if (dp[cat]) {
            const cash = dp[cat].cash || 0;
            const bank = dp[cat].bank || 0;
            const total = cash + bank;
            expCashTotal += cash;
            expBankTotal += bank;
            
            expTbody.innerHTML += `
              <tr>
                <td><strong>Direct: ${cat.toUpperCase()}</strong></td>
                <td class="text-right">${cash.toFixed(2)}</td>
                <td class="text-right">${bank.toFixed(2)}</td>
                <td class="text-right">${total.toFixed(2)}</td>
                <td>${dp[cat].remarks || '-'}</td>
                <td>-</td>
              </tr>
            `;
          }
        });
      }
      
      // General expenses
      if (r.expenses) {
        r.expenses.forEach(e => {
          const cash = e.cash || 0;
          const bank = e.bank || 0;
          const total = cash + bank;
          expCashTotal += cash;
          expBankTotal += bank;
          
          expTbody.innerHTML += `
            <tr>
              <td>${e.category}</td>
              <td class="text-right">${cash.toFixed(2)}</td>
              <td class="text-right">${bank.toFixed(2)}</td>
              <td class="text-right">${total.toFixed(2)}</td>
              <td>${e.remarks || '-'}</td>
              <td>-</td>
            </tr>
          `;
        });
      }
      
      // Vendor and Grocery Purchases
      if (r.purchases) {
        r.purchases.forEach(p => {
          const cash = p.cash || 0;
          const bank = p.bank || 0;
          const total = cash + bank;
          expCashTotal += cash;
          expBankTotal += bank;
          
          expTbody.innerHTML += `
            <tr>
              <td>${p.item} (${p.type})</td>
              <td class="text-right">${cash.toFixed(2)}</td>
              <td class="text-right">${bank.toFixed(2)}</td>
              <td class="text-right">${total.toFixed(2)}</td>
              <td>${p.remarks || '-'}</td>
              <td>-</td>
            </tr>
          `;
        });
      }
      
      // Wages
      if (r.wages) {
        r.wages.forEach(w => {
          const cash = w.cash || 0;
          const bank = w.bank || 0;
          const total = cash + bank;
          expCashTotal += cash;
          expBankTotal += bank;
          
          expTbody.innerHTML += `
            <tr>
              <td>Wage: ${w.name.toUpperCase()}</td>
              <td class="text-right">${cash.toFixed(2)}</td>
              <td class="text-right">${bank.toFixed(2)}</td>
              <td class="text-right">${total.toFixed(2)}</td>
              <td>${w.remarks || '-'}</td>
              <td>-</td>
            </tr>
          `;
        });
      }
      
      document.getElementById('pdf-exp-cash-total').textContent = expCashTotal.toFixed(2);
      document.getElementById('pdf-exp-bank-total').textContent = expBankTotal.toFixed(2);
      document.getElementById('pdf-exp-grand-total').textContent = r.expensesTotal.total.toFixed(2);
      
      // Closing Balances & Excess / Short
      document.getElementById('pdf-close-cash').textContent = r.closingBalances.cash.toFixed(2);
      document.getElementById('pdf-close-fran').textContent = (r.closingBalances.franchisee || 0).toFixed(2);
      document.getElementById('pdf-close-mgmt').textContent = (r.closingBalances.mgmt || 0).toFixed(2);
      
      document.getElementById('pdf-excess-cash').textContent = (r.excessShort?.cash || 0).toFixed(2);
      document.getElementById('pdf-excess-fran').textContent = (r.excessShort?.franchisee || 0).toFixed(2);
      document.getElementById('pdf-excess-mgmt').textContent = (r.excessShort?.mgmt || 0).toFixed(2);
      
      // Meat stock
      if (r.meatStock) {
        const mc = r.meatStock.chicken || { opening: 0, purchase: 0, used: 0, wastage: 0, balance: 0 };
        document.getElementById('pdf-meat-chick-open').textContent = mc.opening;
        document.getElementById('pdf-meat-chick-purch').textContent = mc.purchase;
        document.getElementById('pdf-meat-chick-used').textContent = mc.used;
        document.getElementById('pdf-meat-chick-wast').textContent = mc.wastage;
        document.getElementById('pdf-meat-chick-bal').textContent = mc.balance;
        
        const mb = r.meatStock.beef || { opening: 0, purchase: 0, used: 0, wastage: 0, balance: 0 };
        document.getElementById('pdf-meat-beef-open').textContent = mb.opening;
        document.getElementById('pdf-meat-beef-purch').textContent = mb.purchase;
        document.getElementById('pdf-meat-beef-used').textContent = mb.used;
        document.getElementById('pdf-meat-beef-wast').textContent = mb.wastage;
        document.getElementById('pdf-meat-beef-bal').textContent = mb.balance;
      }
      
      // Bills
      const billsTbody = document.getElementById('pdf-bills-rows');
      billsTbody.innerHTML = '';
      if (r.bills && r.bills.length > 0) {
        r.bills.forEach(b => {
          billsTbody.innerHTML += `
            <tr>
              <td><strong>${b.type.toUpperCase()}:</strong> ${b.name}</td>
              <td class="text-right">${b.amount.toFixed(2)}</td>
              <td>${b.remarks || '-'}</td>
            </tr>
          `;
        });
      } else {
        billsTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#64748b;">No bills recorded</td></tr>`;
      }
      
      // Staff ledger
      const ledgerTbody = document.getElementById('pdf-ledger-rows');
      ledgerTbody.innerHTML = '';
      if (r.staffLedger) {
        r.staffLedger.forEach(sl => {
          ledgerTbody.innerHTML += `
            <tr>
              <td><strong>${sl.name}</strong></td>
              <td>${sl.designation}</td>
              <td class="text-right">${sl.ob.toFixed(2)}</td>
              <td class="text-right">${sl.wagePayable.toFixed(2)}</td>
              <td class="text-right">${sl.wagePaid.toFixed(2)}</td>
              <td class="text-right"><strong>${sl.balance.toFixed(2)}</strong></td>
            </tr>
          `;
        });
      }
      
      // Denominations rendering
      const denomTbody = document.getElementById('pdf-denom-rows');
      denomTbody.innerHTML = '';
      const notes = ['2000', '500', '200', '100', '50', '20', '10', '5', '2', '1'];
      if (r.denominations) {
        notes.forEach(note => {
          const count = r.denominations[note] || 0;
          const total = parseInt(note) * count;
          denomTbody.innerHTML += `
            <tr>
              <td><strong>${note}</strong></td>
              <td class="text-right">${count}</td>
              <td class="text-right">${total.toFixed(2)}</td>
            </tr>
          `;
        });
        document.getElementById('pdf-denom-total').textContent = `₹${(r.denominations.total || 0).toFixed(2)}`;
      }
      
      // Open Modal
      document.getElementById('report-detail-modal').classList.remove('hide');
    })
    .catch(err => {
      alert('Error fetching report details.');
      console.error(err);
    });
}

function closeModal() {
  document.getElementById('report-detail-modal').classList.add('hide');
}
