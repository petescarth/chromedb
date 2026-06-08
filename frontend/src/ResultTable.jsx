import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import wkx from 'wkx';
import { Buffer } from 'buffer';

export default function ResultTable({ fields, rows, tableName, schemaName, primaryKeys = [], connectionString, onDataRefresh }) {
  const parentRef = useRef(null);
  
  const [editedRows, setEditedRows] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { rowIndex, colName }
  const [saving, setSaving] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null); // { index, data }
  const [copiedKey, setCopiedKey] = useState(null); // 'all' or column name

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
  });

  if (!fields || fields.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No data to display</div>;

  const formatCellValue = (val) => {
    if (typeof val === 'string' && /^[0-9A-Fa-f]+$/.test(val) && val.length > 50) {
      try {
        const geom = wkx.Geometry.parse(Buffer.from(val, 'hex'));
        return geom.toWkt();
      } catch (e) {
        // Not a valid geometry, fallback
      }
    }
    return String(val ?? '');
  };

  const handleCellDoubleClick = (rowIndex, colName) => {
    // Only allow editing if we know the primary key
    if (!tableName || primaryKeys.length === 0) {
      alert("Cannot edit: No primary key found for this table.");
      return;
    }
    setEditingCell({ rowIndex, colName });
  };

  const handleCellChange = (e, rowIndex, colName) => {
    const newVal = e.target.value;
    setEditedRows(prev => ({
      ...prev,
      [rowIndex]: {
        ...(prev[rowIndex] || {}),
        [colName]: newVal
      }
    }));
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const commitChanges = async () => {
    setSaving(true);
    try {
      // For each dirty row
      for (const [rowIndexStr, changes] of Object.entries(editedRows)) {
        const rowIndex = parseInt(rowIndexStr, 10);
        const originalRow = rows[rowIndex];
        
        // We only support single-column PK for simplicity in this demo, but can be adapted
        const pkCol = primaryKeys[0];
        const pkVal = originalRow[pkCol];

        if (pkVal === undefined) {
          throw new Error(`Primary key ${pkCol} is missing in row data`);
        }

        const res = await fetch('http://localhost:3001/api/update-row', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionString,
            schemaName,
            tableName,
            pkCol,
            pkVal,
            updates: changes
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      }
      setEditedRows({});
      if (onDataRefresh) onDataRefresh();
    } catch (e) {
      alert("Failed to save changes: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = (key, value) => {
    navigator.clipboard.writeText(value === null || value === undefined ? '' : String(value));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleCopyRowJson = (rowData) => {
    navigator.clipboard.writeText(JSON.stringify(rowData, null, 2));
    setCopiedKey('all');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const hasEdits = Object.keys(editedRows).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, gap: '0.5rem', position: 'relative' }}>
      
      {hasEdits && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-success" style={{ backgroundColor: 'var(--accent-success)', color: 'white' }} onClick={commitChanges} disabled={saving}>
            {saving ? 'Saving...' : 'Commit Changes'}
          </button>
        </div>
      )}

      <div 
        ref={parentRef} 
        style={{ 
          flex: 1,
          overflow: 'auto', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-md)' 
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: 'max-content',
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            background: 'var(--bg-surface-elevated)',
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            fontWeight: 600
          }}>
            {/* View Details Column Header */}
            <div style={{
              padding: '0.5rem',
              width: 50,
              flexShrink: 0,
              borderRight: '1px solid var(--border-subtle)',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              👁️
            </div>
            {fields.map(f => (
              <div key={f.name} style={{
                padding: '0.5rem',
                width: 150,
                flexShrink: 0,
                borderRight: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {f.name} {primaryKeys.includes(f.name) && '🔑'}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowData = rows[virtualRow.index];
            const rowEdits = editedRows[virtualRow.index] || {};

            return (
              <div
                key={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: virtualRow.index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                }}
              >
                {/* View Details Button Cell */}
                <div style={{
                  padding: '0.25rem 0.5rem',
                  width: 50,
                  flexShrink: 0,
                  borderRight: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <button 
                    onClick={() => setSelectedRow({ index: virtualRow.index, data: rowData })}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.25rem',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'all var(--transition-fast)'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = 'var(--accent-primary)';
                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'none';
                    }}
                    title="View details"
                  >
                    👁️
                  </button>
                </div>
                {fields.map(f => {
                  const isEditing = editingCell?.rowIndex === virtualRow.index && editingCell?.colName === f.name;
                  const isDirty = f.name in rowEdits;
                  const displayVal = isDirty ? rowEdits[f.name] : rowData[f.name];

                  return (
                    <div 
                      key={f.name} 
                      onDoubleClick={() => handleCellDoubleClick(virtualRow.index, f.name)}
                      style={{
                        padding: isEditing ? '0' : '0.5rem',
                        width: 150,
                        flexShrink: 0,
                        borderRight: '1px solid var(--border-subtle)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: 'var(--text-primary)',
                        background: isDirty ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        cursor: 'cell'
                      }}
                    >
                      {isEditing ? (
                        <input 
                          autoFocus
                          value={displayVal || ''}
                          onChange={(e) => handleCellChange(e, virtualRow.index, f.name)}
                          onBlur={handleCellBlur}
                          onKeyDown={e => e.key === 'Enter' && handleCellBlur()}
                          style={{
                            width: '100%', height: '100%', padding: '0.25rem 0.5rem',
                            background: 'var(--bg-surface)', color: 'white', border: '1px solid var(--accent-primary)',
                            outline: 'none'
                          }}
                        />
                      ) : (
                        formatCellValue(displayVal)
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Row Details Modal */}
      {selectedRow && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 10000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={() => setSelectedRow(null)}
        >
          <div 
            className="glass-panel" 
            style={{ 
              width: '600px', 
              maxHeight: '80vh', 
              display: 'flex', 
              flexDirection: 'column', 
              padding: '1.5rem',
              outline: 'none',
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-strong)',
              boxShadow: 'var(--shadow-glass)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Row #{selectedRow.index + 1} Details</h2>
              <button 
                onClick={() => setSelectedRow(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-muted)', 
                  cursor: 'pointer', 
                  fontSize: '1.25rem',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '0.25rem', marginBottom: '1rem' }}>
              {fields.map(f => {
                const isPk = primaryKeys.includes(f.name);
                const rawVal = selectedRow.data[f.name];
                const displayVal = formatCellValue(rawVal);
                
                return (
                  <div 
                    key={f.name} 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      background: 'rgba(255, 255, 255, 0.02)', 
                      border: '1px solid var(--border-subtle)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '0.75rem' 
                    }}
                  >
                    {/* Column Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: isPk ? 'var(--accent-warning)' : 'var(--accent-hover)' }}>
                        {f.name} {isPk && '🔑'}
                      </strong>
                      <button
                        onClick={() => handleCopy(f.name, rawVal)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === f.name ? 'var(--accent-success)' : 'var(--text-muted)',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(255,255,255,0.04)'
                        }}
                      >
                        {copiedKey === f.name ? 'Copied! ✓' : 'Copy'}
                      </button>
                    </div>

                    {/* Column Value */}
                    <div 
                      style={{ 
                        fontFamily: 'var(--font-mono)', 
                        fontSize: '0.85rem', 
                        color: rawVal === null ? 'var(--text-muted)' : 'var(--text-primary)',
                        whiteSpace: 'pre-wrap', 
                        wordBreak: 'break-all',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        padding: '0.25rem 0',
                        userSelect: 'all'
                      }}
                    >
                      {rawVal === null ? 'NULL' : displayVal}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => handleCopyRowJson(selectedRow.data)}
                style={{ gap: '0.25rem' }}
              >
                📋 {copiedKey === 'all' ? 'Row JSON Copied! ✓' : 'Copy Row JSON'}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setSelectedRow(null)}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
