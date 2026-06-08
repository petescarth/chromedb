import React, { useState, useEffect } from 'react';
import ResultTable from './ResultTable';
import MapView from './MapView';

export default function TableExplorer({ schema, table, connectionString }) {
  const [activeTab, setActiveTab] = useState('data'); // 'data' or 'structure'
  
  // Data Tab State
  const [dataResults, setDataResults] = useState(null);
  const [dataError, setDataError] = useState(null);
  const [page, setPage] = useState(0);
  const rowsPerPage = 50;

  // Structure Tab State
  const [structure, setStructure] = useState(null);
  const [structureError, setStructureError] = useState(null);

  const fetchTableData = async () => {
    setDataError(null);
    setDataResults(null);
    try {
      const offset = page * rowsPerPage;
      const escapedSchema = schema.replace(/"/g, '""');
      const escapedTable = table.replace(/"/g, '""');
      const res = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          connectionString, 
          query: `SELECT * FROM "${escapedSchema}"."${escapedTable}" LIMIT ${rowsPerPage} OFFSET ${offset};` 
        })
      });
      const data = await res.json();
      if (data.success) {
        setDataResults({ fields: data.fields, rows: data.rows });
      } else {
        setDataError(data.error);
      }
    } catch (e) {
      setDataError(e.message);
    }
  };

  const fetchStructure = async () => {
    setStructureError(null);
    try {
      const res = await fetch('http://localhost:3001/api/table-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString, schemaName: schema, tableName: table })
      });
      const data = await res.json();
      if (data.success) {
        setStructure({
          columns: data.columns,
          indexes: data.indexes,
          primaryKeys: data.primaryKeys
        });
      } else {
        setStructureError(data.error);
      }
    } catch (e) {
      setStructureError(e.message);
    }
  };

  useEffect(() => {
    fetchTableData();
  }, [schema, table, connectionString, page]);

  useEffect(() => {
    fetchStructure();
  }, [schema, table, connectionString]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)', minHeight: 0, minWidth: 0 }}>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
        <div 
          style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: activeTab === 'data' ? '2px solid var(--accent-primary)' : '2px solid transparent' }}
          onClick={() => setActiveTab('data')}
        >
          Data
        </div>
        <div 
          style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: activeTab === 'map' ? '2px solid var(--accent-primary)' : '2px solid transparent' }}
          onClick={() => setActiveTab('map')}
        >
          Map View
        </div>
        <div 
          style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: activeTab === 'structure' ? '2px solid var(--accent-primary)' : '2px solid transparent' }}
          onClick={() => setActiveTab('structure')}
        >
          Structure
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '1rem', minHeight: 0, minWidth: 0 }}>
        
        {/* Data Tab */}
        {activeTab === 'data' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            {dataError && <div style={{ color: 'var(--accent-danger)', marginBottom: '1rem' }}>{dataError}</div>}
            {dataResults ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                <ResultTable 
                  fields={dataResults.fields} 
                  rows={dataResults.rows} 
                  tableName={table}
                  schemaName={schema}
                  primaryKeys={structure?.primaryKeys || []}
                  connectionString={connectionString}
                  onDataRefresh={fetchTableData}
                />
                
                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', flexShrink: 0 }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Previous 50
                  </button>
                  <span style={{ fontSize: '0.875rem' }}>Page {page + 1}</span>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setPage(p => p + 1)}
                    disabled={dataResults.rows.length < rowsPerPage} // simple heuristic
                  >
                    Next 50
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Loading data...</div>
            )}
          </div>
        )}

        {/* Map Tab */}
        {activeTab === 'map' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            {dataResults ? (
              <MapView rows={dataResults.rows} />
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Loading data...</div>
            )}
          </div>
        )}

        {/* Structure Tab */}
        {activeTab === 'structure' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {structureError && <div style={{ color: 'var(--accent-danger)' }}>{structureError}</div>}
            
            {structure ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                
                {/* Columns Table */}
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Columns</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                      <tr>
                        <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>#</th>
                        <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>column_name</th>
                        <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>data_type</th>
                        <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>is_nullable</th>
                        <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>column_default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structure.columns.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: structure.primaryKeys.includes(c.column_name) ? 'rgba(245, 158, 11, 0.1)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>{c['#']}</td>
                          <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', fontWeight: 500, color: structure.primaryKeys.includes(c.column_name) ? 'var(--accent-warning)' : 'inherit' }}>
                            {c.column_name} {structure.primaryKeys.includes(c.column_name) && '🔑'}
                          </td>
                          <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>{c.data_type}</td>
                          <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>{c.is_nullable}</td>
                          <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>{c.column_default || 'NULL'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Indexes Table */}
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Indexes</h3>
                  {structure.indexes.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No indexes found.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                      <thead style={{ backgroundColor: 'var(--bg-surface-elevated)' }}>
                        <tr>
                          <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>index_name</th>
                          <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>algorithm</th>
                          <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>is_unique</th>
                          <th style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>definition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {structure.indexes.map((idx, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>{idx.index_name}</td>
                            <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>{idx.index_algorithm}</td>
                            <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)' }}>{idx.is_unique ? 'TRUE' : 'FALSE'}</td>
                            <td style={{ padding: '0.5rem', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)' }}>{idx.definition}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>Loading structure...</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
