import React, { useState, useEffect, useRef } from 'react';
import './index.css';
import QueryEditor from './QueryEditor';
import ResultTable from './ResultTable';
import MapView from './MapView';
import GeminiPrompt from './GeminiPrompt';
import TableExplorer from './TableExplorer';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

function App() {
  const [connectionString, setConnectionString] = useState('');
  const [connected, setConnected] = useState(false);
  const [schema, setSchema] = useState(null);

  const [query, setQuery] = useState('SELECT 1 as "Test", 2 as "Hello";');
  
  // Tab Management
  const [tabs, setTabs] = useState([{ id: 'query', type: 'query', title: 'Query Results' }]);
  const [activeTabId, setActiveTabId] = useState('query');

  // Query Results State
  const [queryResults, setQueryResults] = useState(null);
  const [queryError, setQueryError] = useState(null);
  const [queryResultTab, setQueryResultTab] = useState('data');

  // Query Timer & Abort Controller
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryDuration, setQueryDuration] = useState(0);
  const abortControllerRef = useRef(null);

  // History State
  const [history, setHistory] = useState([]);

  // Connection History State
  const [connectionHistory, setConnectionHistory] = useState([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('sql_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) setHistory(parsed);
      } catch (e) {}
    }
    const savedConnections = localStorage.getItem('db_connections');
    if (savedConnections) {
      try {
        const parsed = JSON.parse(savedConnections);
        if (Array.isArray(parsed)) setConnectionHistory(parsed);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    let interval;
    if (queryRunning) {
      setQueryDuration(0);
      interval = setInterval(() => {
        setQueryDuration(prev => prev + 0.1);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [queryRunning]);

  const saveToHistory = (q) => {
    const newHistory = [q, ...history.filter(x => x !== q)].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem('sql_history', JSON.stringify(newHistory));
  };

  const saveConnectionToHistory = (connStr) => {
    if (!connStr) return;
    const historyList = Array.isArray(connectionHistory) ? connectionHistory : [];
    const newHistory = [connStr, ...historyList.filter(x => x !== connStr)].slice(0, 5);
    setConnectionHistory(newHistory);
    localStorage.setItem('db_connections', JSON.stringify(newHistory));
  };

  const handleDeleteHistory = (e, connToDelete) => {
    e.stopPropagation();
    const historyList = Array.isArray(connectionHistory) ? connectionHistory : [];
    const newHistory = historyList.filter(x => x !== connToDelete);
    setConnectionHistory(newHistory);
    localStorage.setItem('db_connections', JSON.stringify(newHistory));
  };

  const maskConnectionString = (connStr) => {
    if (!connStr) return '';
    return connStr.replace(/(:\/\/.*?):([^@/]+)@/, '$1:****@').replace(/password=[^ ]+/g, 'password=****');
  };

  const getDisplayLabel = (connStr) => {
    if (!connStr) return '';
    try {
      if (connStr.startsWith('postgresql://') || connStr.startsWith('postgres://')) {
        const url = new URL(connStr);
        const host = url.port ? `${url.hostname}:${url.port}` : url.hostname;
        const db = url.pathname.substring(1) || 'default';
        const user = url.username || '';
        return `${db} @ ${host}${user ? ` (${user})` : ''}`;
      }
    } catch (e) {}
    
    if (connStr.includes('host=') || connStr.includes('dbname=')) {
      const hostMatch = connStr.match(/host=([^ ]+)/);
      const dbMatch = connStr.match(/dbname=([^ ]+)/);
      const userMatch = connStr.match(/user=([^ ]+)/);
      const host = hostMatch ? hostMatch[1] : '';
      const db = dbMatch ? dbMatch[1] : '';
      const user = userMatch ? userMatch[1] : '';
      if (db || host) {
        return `${db || 'default'} @ ${host || 'localhost'}${user ? ` (${user})` : ''}`;
      }
    }
    
    return maskConnectionString(connStr);
  };

  const fetchSchema = async (connStr) => {
    const actualConnStr = (typeof connStr === 'string') ? connStr : connectionString;
    const res = await fetch('http://localhost:3001/api/schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionString: actualConnStr })
    });
    const data = await res.json();
    if (data.success) setSchema(data.schemas);
  };

  const connectToDb = async (connStr) => {
    const actualConnStr = (typeof connStr === 'string') ? connStr : connectionString;
    if (!actualConnStr) {
      alert("Please enter a connection string.");
      return;
    }
    try {
      const res = await fetch('http://localhost:3001/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: actualConnStr })
      });
      const data = await res.json();
      if (data.success) {
        setConnected(true);
        saveConnectionToHistory(actualConnStr);
        fetchSchema(actualConnStr);
      } else {
        alert(data.error);
      }
    } catch (e) {
      alert("Failed to connect to backend proxy.");
    }
  };

  const handleHistoryClick = (conn) => {
    setConnectionString(conn);
    connectToDb(conn);
  };

  const cancelQuery = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setQueryRunning(false);
      setQueryError("Query cancelled by user.");
    }
  };

  const runQuery = async () => {
    setQueryError(null);
    setQueryResults(null);
    setQueryRunning(true);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const res = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString, query }),
        signal: abortControllerRef.current.signal
      });
      const data = await res.json();
      if (data.success) {
        setQueryResults({ fields: data.fields, rows: data.rows });
        saveToHistory(query);
      } else {
        setQueryError(data.error);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setQueryError(e.message);
      }
    } finally {
      if (abortControllerRef.current?.signal?.aborted !== true) {
        setQueryRunning(false);
      }
      setActiveTabId('query');
    }
  };

  const openTableTab = (schemaName, tableName) => {
    const tabId = `table-${schemaName}-${tableName}`;
    if (!tabs.find(t => t.id === tabId)) {
      setTabs([...tabs, { id: tabId, type: 'table', title: `${schemaName}.${tableName}`, schemaName, tableName }]);
    }
    setActiveTabId(tabId);
  };

  const closeTab = (e, id) => {
    e.stopPropagation();
    if (id === 'query') return;
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[newTabs.length - 1].id);
  };

  const exportHistory = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'postgis_history.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importHistory = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (Array.isArray(imported)) {
          setHistory(imported);
          localStorage.setItem('sql_history', JSON.stringify(imported));
          alert("History imported successfully");
        }
      } catch (err) {
        alert("Invalid history file");
      }
    };
    reader.readAsText(file);
  };

  if (!connected) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ padding: '2rem', width: '460px' }}>
          <h2 style={{ marginBottom: '1rem', textAlign: 'center' }}>PostGIS Manager</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>PostgreSQL Connection String</label>
              <input 
                className="input" 
                placeholder="postgresql://user:pass@localhost:5432/dbname"
                value={connectionString}
                onChange={e => setConnectionString(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connectToDb(connectionString)}
                style={{ marginTop: '0.5rem' }}
              />
            </div>
            <button className="btn btn-primary" onClick={() => connectToDb(connectionString)}>Connect</button>

            {connectionHistory.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Recent Connections</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {connectionHistory.map((conn, index) => (
                    <div 
                      key={index} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        background: 'var(--bg-surface-elevated)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast)',
                        border: '1px solid transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-glass-hover)';
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-surface-elevated)';
                        e.currentTarget.style.borderColor = 'transparent';
                      }}
                      onClick={() => handleHistoryClick(conn)}
                      title={maskConnectionString(conn)}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, paddingRight: '0.5rem' }}>
                        🔌 {getDisplayLabel(conn)}
                      </div>
                      <button 
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: 'var(--text-muted)', 
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem'
                        }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.color = 'var(--accent-danger)';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.stopPropagation();
                          e.currentTarget.style.color = 'var(--text-muted)';
                          e.currentTarget.style.background = 'none';
                        }}
                        onClick={(e) => handleDeleteHistory(e, conn)}
                        title="Remove from history"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const openSchemas = schema ? Object.keys(schema).reduce((acc, sch) => {
    const openTablesInSchema = tabs.filter(t => t.type === 'table' && t.schemaName === sch).map(t => t.tableName);
    if (openTablesInSchema.length > 0) {
      acc[sch] = {};
      openTablesInSchema.forEach(tbl => {
        if (schema[sch][tbl]) acc[sch][tbl] = schema[sch][tbl];
      });
    }
    return acc;
  }, {}) : null;

  return (
    <div className="app-container">
      <PanelGroup orientation="horizontal">
        
        {/* SIDEBAR PANEL */}
        <Panel defaultSize="25%" minSize="15%" maxSize="50%" style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', zIndex: 10 }}>
          <PanelGroup orientation="vertical">
            <Panel defaultSize="70%" minSize="30%">
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0 }}>Schemas</h3>
                  <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={fetchSchema}>Refresh</button>
                </div>
                <div style={{ padding: '1rem', overflowY: 'auto', flexGrow: 1 }}>
                  {schema ? (
                    Object.keys(schema).map(schemaName => (
                      <div key={schemaName} style={{ marginBottom: '1rem' }}>
                        <strong style={{ color: 'var(--accent-hover)' }}>{schemaName}</strong>
                        {Object.keys(schema[schemaName]).map(tableName => (
                          <div key={tableName} style={{ paddingLeft: '0.5rem', marginTop: '0.25rem' }}>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => openTableTab(schemaName, tableName)}>
                              📄 {tableName}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>Loading schema...</div>
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="ResizeHandle ResizeHandleVertical" />

            <Panel defaultSize="30%" minSize="10%">
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0 }}>History</h3>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button className="btn btn-secondary" style={{ padding: '0.25rem', fontSize: '0.75rem' }} onClick={exportHistory} title="Export History">⬇️</button>
                    <label className="btn btn-secondary" style={{ padding: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', margin: 0 }} title="Import History">
                      ⬆️
                      <input type="file" style={{ display: 'none' }} accept=".json" onChange={importHistory} />
                    </label>
                  </div>
                </div>
                <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {history.map((h, i) => (
                    <div 
                      key={i} 
                      style={{ fontSize: '0.75rem', padding: '0.5rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      onClick={() => setQuery(h)}
                      title={h}
                    >
                      {h}
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <PanelResizeHandle className="ResizeHandle ResizeHandleHorizontal" />

        {/* MAIN CONTENT PANEL */}
        <Panel defaultSize="75%" style={{ minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <PanelGroup orientation="vertical">
            
            <Panel defaultSize="35%" minSize="15%">
              <div style={{ height: '100%', padding: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Query Editor & AI</h3>
                <GeminiPrompt schema={openSchemas} dbSchema={schema} onSqlGenerated={setQuery} connectionString={connectionString} />
                <div style={{ flex: 1, minHeight: 0 }}>
                  <QueryEditor value={query} onChange={setQuery} onRun={runQuery} isRunning={queryRunning} schema={schema} />
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="ResizeHandle ResizeHandleVertical" />

            <Panel defaultSize="65%" minSize="20%" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
              {/* Tab Bar */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                {tabs.map(t => (
                  <div 
                    key={t.id}
                    onClick={() => setActiveTabId(t.id)}
                    style={{ 
                      padding: '0.5rem 1rem', cursor: 'pointer', 
                      borderBottom: activeTabId === t.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                      background: activeTabId === t.id ? 'var(--bg-surface-elevated)' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem'
                    }}
                  >
                    {t.title}
                    {t.id !== 'query' && (
                      <span onClick={(e) => closeTab(e, t.id)} style={{ color: 'var(--text-muted)', '&:hover': { color: 'white' } }}>✕</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, padding: '0', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
                {activeTabId === 'query' && (
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1rem', margin: 0 }}>Results</h3>
                      
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {queryRunning && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--accent-warning)' }}>
                              ⏳ Running: {queryDuration.toFixed(1)}s
                            </span>
                            <button className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--accent-danger)', color: 'var(--accent-danger)' }} onClick={cancelQuery}>
                              Cancel Query
                            </button>
                          </div>
                        )}

                        {queryResults && !queryRunning && (
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button 
                              className={`btn ${queryResultTab === 'data' ? 'btn-primary' : 'btn-secondary'}`} 
                              onClick={() => setQueryResultTab('data')}
                              style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              Data
                            </button>
                            <button 
                              className={`btn ${queryResultTab === 'map' ? 'btn-primary' : 'btn-secondary'}`} 
                              onClick={() => setQueryResultTab('map')}
                              style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                            >
                              Map View
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {queryError && (
                      <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-danger)', color: '#fca5a5', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
                        <strong>Error: </strong> {queryError}
                      </div>
                    )}
                    {queryResults && queryResultTab === 'data' && !queryRunning && (
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <ResultTable fields={queryResults.fields} rows={queryResults.rows} connectionString={connectionString} />
                      </div>
                    )}
                    {queryResults && queryResultTab === 'map' && !queryRunning && (
                      <div style={{ flex: 1, minHeight: 0 }}>
                        <MapView rows={queryResults.rows} />
                      </div>
                    )}
                  </div>
                )}

                {tabs.filter(t => t.id !== 'query').map(t => (
                  <div key={t.id} style={{ display: activeTabId === t.id ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
                     <TableExplorer 
                       schema={t.schemaName} 
                       table={t.tableName} 
                       connectionString={connectionString} 
                     />
                  </div>
                ))}
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

      </PanelGroup>
    </div>
  );
}

export default App;
