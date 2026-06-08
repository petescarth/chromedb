import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// We don't maintain a global connection pool because users might connect to different databases.
// Instead, we create a new client/pool per request or maintain a pool cache per connection string.
// For simplicity in this local tool, we will just use a temporary client for each query request, 
// or hold a pool if we want to optimize. Let's start with a pool cache.

const poolCache = new Map();

function escapeIdentifier(id) {
  if (typeof id !== 'string') return '';
  return id.replace(/"/g, '""');
}

function getPool(connectionString) {
  if (!poolCache.has(connectionString)) {
    const config = { connectionString };
    // Only configure SSL explicitly if REQUIRED_SSL is set, letting default parameters bubble otherwise
    if (process.env.REQUIRE_SSL === 'true') {
      config.ssl = { rejectUnauthorized: false };
    }
    const pool = new pg.Pool(config);
    poolCache.set(connectionString, pool);
  }
  return poolCache.get(connectionString);
}

// Endpoint to test connection
app.post('/api/connect', async (req, res) => {
  const { connectionString } = req.body;
  if (!connectionString) {
    return res.status(400).json({ error: 'connectionString is required' });
  }

  let client;
  try {
    const pool = getPool(connectionString);
    client = await pool.connect();
    // Test simple query
    await client.query('SELECT 1');
    res.json({ success: true, message: 'Connected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (client) client.release();
  }
});

// Endpoint to run arbitrary query
app.post('/api/query', async (req, res) => {
  const { connectionString, query } = req.body;
  
  if (!connectionString || !query) {
    return res.status(400).json({ error: 'connectionString and query are required' });
  }

  try {
    const pool = getPool(connectionString);
    const result = await pool.query(query);
    res.json({
      success: true,
      command: result.command,
      rowCount: result.rowCount,
      rows: result.rows,
      fields: result.fields
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Endpoint to get schema
app.post('/api/schema', async (req, res) => {
  const { connectionString } = req.body;
  if (!connectionString) {
    return res.status(400).json({ error: 'connectionString is required' });
  }

  const schemaQuery = `
    SELECT 
      table_schema, 
      table_name, 
      column_name, 
      data_type 
    FROM information_schema.columns 
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    ORDER BY table_schema, table_name, ordinal_position;
  `;

  try {
    const pool = getPool(connectionString);
    const result = await pool.query(schemaQuery);
    
    // Group by schema -> table -> columns
    const schemas = {};
    for (const row of result.rows) {
      const { table_schema, table_name, column_name, data_type } = row;
      if (!schemas[table_schema]) schemas[table_schema] = {};
      if (!schemas[table_schema][table_name]) schemas[table_schema][table_name] = [];
      schemas[table_schema][table_name].push({ column_name, data_type });
    }

    res.json({ success: true, schemas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get detailed table structure
app.post('/api/table-structure', async (req, res) => {
  const { connectionString, schemaName, tableName } = req.body;
  if (!connectionString || !schemaName || !tableName) {
    return res.status(400).json({ error: 'connectionString, schemaName, and tableName are required' });
  }

  try {
    const pool = getPool(connectionString);
    
    // Get Columns
    const columnsQuery = `
      SELECT ordinal_position as "#", column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position;
    `;
    const columnsResult = await pool.query(columnsQuery, [schemaName, tableName]);

    // Get Primary Key
    const pkQuery = `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary;
    `;
    let pkCols = [];
    try {
      const regclassName = `"${escapeIdentifier(schemaName)}"."${escapeIdentifier(tableName)}"`;
      const pkResult = await pool.query(pkQuery, [regclassName]);
      pkCols = pkResult.rows.map(r => r.column_name);
    } catch (e) {
      // Ignore if table not found or permissions issue
    }

    // Get Indexes
    const idxQuery = `
      SELECT 
        i.relname AS index_name,
        am.amname AS index_algorithm,
        ix.indisunique AS is_unique,
        pg_get_indexdef(ix.indexrelid) AS definition
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON i.relam = am.oid
      WHERE t.relname = $2
        AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1);
    `;
    const idxResult = await pool.query(idxQuery, [schemaName, tableName]);

    res.json({ 
      success: true, 
      columns: columnsResult.rows,
      primaryKeys: pkCols,
      indexes: idxResult.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to update a row
app.post('/api/update-row', async (req, res) => {
  const { connectionString, schemaName, tableName, pkCol, pkVal, updates } = req.body;
  if (!connectionString || !schemaName || !tableName || !pkCol || pkVal === undefined || !updates) {
    return res.status(400).json({ error: 'Missing required parameters for update' });
  }

  try {
    const pool = getPool(connectionString);
    const setClauses = [];
    const values = [];
    let paramIdx = 1;

    for (const [col, val] of Object.entries(updates)) {
      setClauses.push(`"${escapeIdentifier(col)}" = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }

    if (setClauses.length === 0) return res.json({ success: true, message: 'No updates provided' });

    values.push(pkVal);
    const updateQuery = `UPDATE "${escapeIdentifier(schemaName)}"."${escapeIdentifier(tableName)}" SET ${setClauses.join(', ')} WHERE "${escapeIdentifier(pkCol)}" = $${paramIdx}`;
    
    await pool.query(updateQuery, values);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {

  console.log(`Backend proxy listening on port ${port}`);
});
