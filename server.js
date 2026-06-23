const express = require('express');
const bodyParser = require('body-parser');

// Load local .env if present
try { require('dotenv').config(); } catch (e) {}

const STAFF_PIN   = process.env.STAFF_PIN   || '1234';
const ADMIN_PIN   = process.env.ADMIN_PIN   || '6282';
const STAFF_TOKEN = process.env.STAFF_TOKEN || 'staff-session-token';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-session-token';

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ── LOGIN ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { role, password } = req.body || {};

  if (role) {
    if (role === 'staff' && password === STAFF_PIN)
      return res.json({ success: true, role: 'staff', token: STAFF_TOKEN });
    if (role === 'admin' && password === ADMIN_PIN)
      return res.json({ success: true, role: 'admin', token: ADMIN_TOKEN });
    return res.status(401).json({ success: false, message: 'Invalid password. Please try again.' });
  }

  if (password === ADMIN_PIN)
    return res.json({ success: true, role: 'admin', token: ADMIN_TOKEN });
  if (password === STAFF_PIN)
    return res.json({ success: true, role: 'staff', token: STAFF_TOKEN });

  return res.status(401).json({ success: false, message: 'Invalid password. Please try again.' });
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
const getDb = () => require('../db');

app.post('/api/reports', async (req, res) => {
  const { date, data } = req.body;
  if (!date || !data)
    return res.status(400).json({ success: false, message: 'Missing date or report data.' });
  try {
    const result = await getDb().saveReport(date, data);
    res.json({ success: true, message: 'Report saved successfully!', date: result.date });
  } catch (err) {
    console.error('saveReport error:', err);
    res.status(500).json({ success: false, message: 'Failed to save report.', error: err.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const reports = await getDb().getAllReports();
    const summaries = reports.map(r => ({
      date: r.date,
      totalSales: r.sales?.total || 0,
      totalExpenses: r.expensesTotal?.total || 0,
      netProfit: (r.sales?.total || 0) - (r.expensesTotal?.total || 0),
      closingCash: r.closingBalances?.cash || 0,
      excessShort: r.excessShort?.cash || 0,
      createdBy: r.createdBy || 'Staff'
    }));
    res.json(summaries);
  } catch (err) {
    console.error('getAllReports error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve reports.', error: err.message });
  }
});

app.get('/api/reports/details/:date', async (req, res) => {
  try {
    const report = await getDb().getReport(req.params.date);
    if (!report)
      return res.status(404).json({ success: false, message: 'Report not found for this date.' });
    res.json(report);
  } catch (err) {
    console.error('getReport error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve report details.', error: err.message });
  }
});

app.get('/api/carry-forward', async (req, res) => {
  const { date } = req.query;
  if (!date)
    return res.status(400).json({ success: false, message: 'Missing date parameter.' });
  try {
    const previous = await getDb().getLatestReportBefore(date);
    if (!previous)
      return res.json({
        openingBalances: { cash: 0, franchisee: 0, mgmt: 0 },
        meatStock: { chicken: { opening: 0 }, beef: { opening: 0 } },
        staffLedger: []
      });

    const staffLedger = (previous.staffLedger || []).map(s => ({
      name: s.name,
      designation: s.designation,
      ob: s.balance ?? 0,
      wagePayable: 0,
      wagePaid: 0,
      balance: s.balance ?? 0
    }));

    res.json({
      openingBalances: {
        cash: previous.closingBalances?.cash || 0,
        franchisee: previous.closingBalances?.franchisee || 0,
        mgmt: previous.closingBalances?.mgmt || 0
      },
      meatStock: {
        chicken: { opening: previous.meatStock?.chicken?.balance || 0 },
        beef: { opening: previous.meatStock?.beef?.balance || 0 }
      },
      staffLedger
    });
  } catch (err) {
    console.error('carry-forward error:', err);
    res.status(500).json({ success: false, message: 'Failed to load carry-forward data.', error: err.message });
  }
});

app.get('/api/dashboard-summary', async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const reports = await getDb().getAllReports();
    let filtered = reports;
    if (startDate && endDate)
      filtered = reports.filter(r => r.date >= startDate && r.date <= endDate);

    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    let totalSales = 0, totalExpenses = 0, totalWages = 0, totalPurchases = 0;
    const salesSplit = { cash: 0, card: 0, upi: 0, zomato: 0, swiggy: 0, credit: 0 };
    const expenseBreakdown = {};

    const trendData = sorted.map(r => {
      const sales = r.sales?.total || 0;
      const expenses = r.expensesTotal?.total || 0;
      totalSales += sales; totalExpenses += expenses;
      salesSplit.cash    += r.sales?.cash    || 0;
      salesSplit.card    += r.sales?.card    || 0;
      salesSplit.upi     += r.sales?.upi     || 0;
      salesSplit.zomato  += r.sales?.zomato  || 0;
      salesSplit.swiggy  += r.sales?.swiggy  || 0;
      salesSplit.credit  += r.sales?.credit  || 0;
      (r.expenses  || []).forEach(e => { const c = e.category || 'Other'; expenseBreakdown[c] = (expenseBreakdown[c] || 0) + (e.total || (Number(e.cash||0)+Number(e.bank||0))); });
      (r.purchases || []).forEach(p => { const i = p.item || 'Grocery Purchases'; const cost = p.total||(Number(p.cash||0)+Number(p.bank||0)); expenseBreakdown[i]=(expenseBreakdown[i]||0)+cost; totalPurchases+=cost; });
      (r.wages     || []).forEach(w => { const cost = Number(w.cash||0)+Number(w.bank||0); expenseBreakdown['Wages']=(expenseBreakdown['Wages']||0)+cost; totalWages+=cost; });
      return { date: r.date, sales, expenses, profit: sales - expenses };
    });

    const n = filtered.length || 1;
    res.json({
      summary: { totalSales, totalExpenses, netProfit: totalSales-totalExpenses, avgDailySales: Math.round(totalSales/n), totalWages, totalPurchases },
      salesSplit, expenseBreakdown, trendData
    });
  } catch (err) {
    console.error('dashboard-summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to compile dashboard summary.', error: err.message });
  }
});

module.exports = app;