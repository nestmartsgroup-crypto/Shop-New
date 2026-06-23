const { Pool } = require('pg');

// Initialize Pool - requires DATABASE_URL in environment
let pool = null;

function getPool() {
  if (pool) return pool;
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set. Please add it in Vercel → Settings → Environment Variables.');
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  return pool;
}

// Initialize table (called once on first use)
async function initTable() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      date VARCHAR(10) PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Read all reports
async function getAllReports() {
  await initTable();
  const res = await getPool().query('SELECT data FROM daily_reports ORDER BY date DESC');
  return res.rows.map(row => row.data);
}

// Get single report by date
async function getReport(date) {
  await initTable();
  const res = await getPool().query('SELECT data FROM daily_reports WHERE date = $1', [date]);
  return res.rows.length > 0 ? res.rows[0].data : null;
}

// Save or update report
async function saveReport(date, data) {
  await initTable();
  data.date = date;
  await getPool().query(`
    INSERT INTO daily_reports (date, data)
    VALUES ($1, $2)
    ON CONFLICT (date)
    DO UPDATE SET data = EXCLUDED.data
  `, [date, JSON.stringify(data)]);
  return { success: true, date };
}

// Get the most recent report before a given date (for carry-forward)
async function getLatestReportBefore(date) {
  await initTable();
  const res = await getPool().query(
    'SELECT data FROM daily_reports WHERE date < $1 ORDER BY date DESC LIMIT 1',
    [date]
  );
  return res.rows.length > 0 ? res.rows[0].data : null;
}

module.exports = { getAllReports, getReport, saveReport, getLatestReportBefore };