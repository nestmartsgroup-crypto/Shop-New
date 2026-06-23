const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db');

// Load local .env if present (safe no-op if `dotenv` isn't installed)
try { require('dotenv').config(); } catch (e) {}

// Login PINs and tokens — read from environment for Vercel/Supabase deployments
const STAFF_PIN = process.env.STAFF_PIN || '1234';
const ADMIN_PIN = process.env.ADMIN_PIN || '6282';
const STAFF_TOKEN = process.env.STAFF_TOKEN || 'staff-session-token';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-session-token';

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Endpoint
app.post('/api/login', (req, res) => {
  const { role, password } = req.body || {};

  // Backwards-compatible: if client provided a role, validate as before
  if (role) {
    if (role === 'staff' && password === STAFF_PIN) {
      return res.json({ success: true, role: 'staff', token: STAFF_TOKEN });
    } else if (role === 'admin' && password === ADMIN_PIN) {
      return res.json({ success: true, role: 'admin', token: ADMIN_TOKEN });
    }
    return res.status(401).json({ success: false, message: 'Invalid password. Please try again.' });
  }

  // Preferred: determine role on the server from the provided password
  if (password === ADMIN_PIN) {
    return res.json({ success: true, role: 'admin', token: ADMIN_TOKEN });
  } else if (password === STAFF_PIN) {
    return res.json({ success: true, role: 'staff', token: STAFF_TOKEN });
  }

  return res.status(401).json({ success: false, message: 'Invalid password. Please try again.' });
});

// Save or Update Daily Report
app.post('/api/reports', async (req, res) => {
  const { date, data } = req.body;
  if (!date || !data) {
    return res.status(400).json({ success: false, message: 'Missing date or report data.' });
  }
  
  try {
    const result = await db.saveReport(date, data);
    res.json({ success: true, message: 'Report saved successfully!', date: result.date });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to save report to database.' });
  }
});

// Get Summary of All Reports (Admin view)
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await db.getAllReports();
    // Map to simple summary representation
    const summaries = reports.map(r => {
      return {
        date: r.date,
        totalSales: r.sales?.total || 0,
        totalExpenses: r.expensesTotal?.total || 0,
        netProfit: (r.sales?.total || 0) - (r.expensesTotal?.total || 0),
        closingCash: r.closingBalances?.cash || 0,
        excessShort: r.excessShort?.cash || 0,
        createdBy: r.createdBy || 'Staff'
      };
    });
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve reports.' });
  }
});

// Get Full Details for a Specific Report
app.get('/api/reports/details/:date', async (req, res) => {
  const { date } = req.params;
  try {
    const report = await db.getReport(date);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found for this date.' });
    }
    res.json(report);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve report details.' });
  }
});

// Carry-forward opening balances from the previous day's report
app.get('/api/carry-forward', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, message: 'Missing date parameter.' });
  }

  try {
    const previous = await db.getLatestReportBefore(date);
    if (!previous) {
      return res.json({
        openingBalances: { cash: 0, franchisee: 0, mgmt: 0 },
        meatStock: {
          chicken: { opening: 0 },
          beef: { opening: 0 }
        },
        staffLedger: []
      });
    }

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
    res.status(500).json({ success: false, message: 'Failed to load carry-forward data.' });
  }
});

// Get Dashboard Summary & Charts Data
app.get('/api/dashboard-summary', async (req, res) => {
  const { startDate, endDate } = req.query;
  
  try {
    const reports = await db.getAllReports();
    
    // Filter reports by date range
    let filteredReports = reports;
    if (startDate && endDate) {
      filteredReports = reports.filter(r => r.date >= startDate && r.date <= endDate);
    }
    
    // Sort reports chronologically for trends
    const chronologicalReports = [...filteredReports].sort((a, b) => a.date.localeCompare(b.date));
    
    // Initialize stats
    let totalSales = 0;
    let totalExpenses = 0;
    let totalWages = 0;
    let totalPurchases = 0;
    
    const salesSplit = {
      cash: 0,
      card: 0,
      upi: 0,
      zomato: 0,
      swiggy: 0,
      credit: 0
    };
    
    const expenseBreakdown = {};
    
    const trendData = chronologicalReports.map(r => {
      const sales = r.sales?.total || 0;
      const expenses = r.expensesTotal?.total || 0;
      
      totalSales += sales;
      totalExpenses += expenses;
      
      // Add sales splits
      salesSplit.cash += r.sales?.cash || 0;
      salesSplit.card += r.sales?.card || 0;
      salesSplit.upi += r.sales?.upi || 0;
      salesSplit.zomato += r.sales?.zomato || 0;
      salesSplit.swiggy += r.sales?.swiggy || 0;
      salesSplit.credit += r.sales?.credit || 0;
      
      // Sum categories
      if (r.expenses) {
        r.expenses.forEach(e => {
          const cat = e.category || 'Other';
          const cost = e.total || (Number(e.cash || 0) + Number(e.bank || 0));
          expenseBreakdown[cat] = (expenseBreakdown[cat] || 0) + cost;
        });
      }
      if (r.purchases) {
        r.purchases.forEach(p => {
          const item = p.item || 'Grocery Purchases';
          const cost = p.total || (Number(p.cash || 0) + Number(p.bank || 0));
          expenseBreakdown[item] = (expenseBreakdown[item] || 0) + cost;
          totalPurchases += cost;
        });
      }
      if (r.wages) {
        r.wages.forEach(w => {
          const cost = Number(w.cash || 0) + Number(w.bank || 0);
          expenseBreakdown['Wages'] = (expenseBreakdown['Wages'] || 0) + cost;
          totalWages += cost;
        });
      }
      
      return {
        date: r.date,
        sales: sales,
        expenses: expenses,
        profit: sales - expenses
      };
    });
    
    const numDays = filteredReports.length || 1;
    
    res.json({
      summary: {
        totalSales,
        totalExpenses,
        netProfit: totalSales - totalExpenses,
        avgDailySales: Math.round(totalSales / numDays),
        totalWages,
        totalPurchases
      },
      salesSplit,
      expenseBreakdown,
      trendData
    });
    
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compile dashboard summary.' });
  }
});

// Fallback route: serve index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Conditionally Start Server or Export for Serverless
if (process.env.VERCEL) {
  console.log('App running in Vercel Serverless environment.');
} else {
  app.listen(PORT, () => {
    console.log(`Store Reporting app running at http://localhost:${PORT}`);
  });
}

module.exports = app;

