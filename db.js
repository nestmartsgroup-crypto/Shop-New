const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  const connectionString = process.env.POSTGRES_URL_NON_POOLING 
    || process.env.DATABASE_URL 
    || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error('No database connection string found.');
  }

  // Add sslmode=require to connection string if not already there,
  // and use NODE_TLS_REJECT_UNAUTHORIZED to bypass cert validation
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });

  return pool;
}

async function initTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      date VARCHAR(10) PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAllReports() {
  await initTable();
  const res = await getPool().query('SELECT data FROM daily_reports ORDER BY date DESC');
  return res.rows.map(row => row.data);
}

async function getReport(date) {
  await initTable();
  const res = await getPool().query('SELECT data FROM daily_reports WHERE date = $1', [date]);
  return res.rows.length > 0 ? res.rows[0].data : null;
}

async function saveReport(date, data) {
  await initTable();
  data.date = date;
  await getPool().query(`
    INSERT INTO daily_reports (date, data)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (date)
    DO UPDATE SET data = EXCLUDED.data, created_at = CURRENT_TIMESTAMP
  `, [date, JSON.stringify(data)]);
  return { success: true, date };
}

async function getLatestReportBefore(date) {
  await initTable();
  const res = await getPool().query(
    'SELECT data FROM daily_reports WHERE date < $1 ORDER BY date DESC LIMIT 1',
    [date]
  );
  return res.rows.length > 0 ? res.rows[0].data : null;
}

module.exports = { getAllReports, getReport, saveReport, getLatestReportBefore };