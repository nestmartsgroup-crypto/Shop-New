const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

// Prefer project-local JSON file, but fall back to system temp directory
// when the project filesystem is read-only (e.g. Vercel serverless).
let JSON_FILE_PATH = path.join(__dirname, 'store_data.json');
const TMP_JSON_PATH = path.join(os.tmpdir(), 'store_data.json');

// Supabase (Vercel Marketplace) sets various env names. Accept common variants
// and also build a connection string from individual POSTGRES_* vars when provided.
let connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  null;

// If we don't have a full URL but have host/user/password/db parts, construct it
if (!connectionString && process.env.POSTGRES_HOST && process.env.POSTGRES_PASSWORD) {
  const host = process.env.POSTGRES_HOST;
  const user = process.env.POSTGRES_USER || process.env.POSTGRES_USERNAME || 'postgres';
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DATABASE || process.env.POSTGRES_DB || 'postgres';
  const port = process.env.POSTGRES_PORT || 5432;
  connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

// Initialize Pool if a Postgres connection string is available
let pool = null;
if (connectionString) {
  console.log('Database configuration: Cloud PostgreSQL detected.');
  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  // Initialize table
  const initTableQuery = `
    CREATE TABLE IF NOT EXISTS daily_reports (
      date VARCHAR(10) PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  pool.query(initTableQuery)
    .then(() => console.log('PostgreSQL daily_reports table initialized.'))
    .catch(err => console.error('Error initializing PostgreSQL table:', err));
} else {
  console.log('Database configuration: Local JSON file database detected.');
  // Initialize JSON file if it doesn't exist. If writing to the project
  // directory fails (read-only FS on serverless), fall back to os.tmpdir().
  try {
    if (!fs.existsSync(JSON_FILE_PATH)) {
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify({}, null, 2));
    }
  } catch (err) {
    console.warn('Project dir not writable, falling back to temp dir for JSON DB:', err && err.code);
    JSON_FILE_PATH = TMP_JSON_PATH;
    try {
      if (!fs.existsSync(JSON_FILE_PATH)) {
        fs.writeFileSync(JSON_FILE_PATH, JSON.stringify({}, null, 2));
      }
    } catch (err2) {
      console.error('Failed to initialize JSON DB in temp dir:', err2);
      // Let subsequent operations handle the error and fail gracefully
    }
  }
}

// Read all reports
async function getAllReports() {
  if (pool) {
    try {
      const res = await pool.query('SELECT data FROM daily_reports ORDER BY date DESC');
      return res.rows.map(row => row.data);
    } catch (err) {
      console.error('Error fetching from PostgreSQL:', err);
      throw err;
    }
  } else {
    try {
      const fileData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
      const reports = JSON.parse(fileData);
      // Return as sorted array by date descending
      return Object.values(reports).sort((a, b) => b.date.localeCompare(a.date));
    } catch (err) {
      console.error('Error reading JSON file database:', err);
      return [];
    }
  }
}

// Get single report
async function getReport(date) {
  if (pool) {
    try {
      const res = await pool.query('SELECT data FROM daily_reports WHERE date = $1', [date]);
      if (res.rows.length > 0) {
        return res.rows[0].data;
      }
      return null;
    } catch (err) {
      console.error('Error fetching single report from PostgreSQL:', err);
      throw err;
    }
  } else {
    try {
      const fileData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
      const reports = JSON.parse(fileData);
      return reports[date] || null;
    } catch (err) {
      console.error('Error reading JSON file database:', err);
      return null;
    }
  }
}

// Save or update report
async function saveReport(date, data) {
  // Ensure the date is clean
  data.date = date;
  
  if (pool) {
    try {
      const query = `
        INSERT INTO daily_reports (date, data)
        VALUES ($1, $2)
        ON CONFLICT (date)
        DO UPDATE SET data = $2
      `;
      await pool.query(query, [date, data]);
      return { success: true, date };
    } catch (err) {
      console.error('Error writing to PostgreSQL:', err);
      throw err;
    }
  } else {
    try {
      const fileData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
      const reports = JSON.parse(fileData);
      reports[date] = data;
      
      // Atomic write (write to temp file then rename to avoid corruption)
      const tempPath = JSON_FILE_PATH + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(reports, null, 2));
      fs.renameSync(tempPath, JSON_FILE_PATH);
      
      return { success: true, date };
    } catch (err) {
      console.error('Error writing to JSON file database:', err);
      throw err;
    }
  }
}

// Get the most recent report strictly before a given date
async function getLatestReportBefore(date) {
  if (pool) {
    try {
      const res = await pool.query(
        'SELECT data FROM daily_reports WHERE date < $1 ORDER BY date DESC LIMIT 1',
        [date]
      );
      return res.rows.length > 0 ? res.rows[0].data : null;
    } catch (err) {
      console.error('Error fetching carry-forward report from PostgreSQL:', err);
      throw err;
    }
  }

  try {
    const fileData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    const reports = JSON.parse(fileData);
    const previous = Object.values(reports)
      .filter(r => r.date && r.date < date)
      .sort((a, b) => b.date.localeCompare(a.date));
    return previous.length > 0 ? previous[0] : null;
  } catch (err) {
    console.error('Error reading carry-forward from JSON file database:', err);
    return null;
  }
}

module.exports = {
  getAllReports,
  getReport,
  saveReport,
  getLatestReportBefore
};
