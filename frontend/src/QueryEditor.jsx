import React, { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { keymap, tooltips } from '@codemirror/view';
import { acceptCompletion, autocompletion, completionStatus } from '@codemirror/autocomplete';
import { indentMore } from '@codemirror/commands';
import { Prec } from '@codemirror/state';

export default function QueryEditor({ value, onChange, onRun, isRunning, schema }) {
  const runKeymap = useMemo(() => {
    return keymap.of([
      {
        key: 'Tab',
        run: (editor) => {
          if (completionStatus(editor.state)) {
            return acceptCompletion(editor);
          }
          return indentMore(editor);
        }
      },
      {
        key: 'Ctrl-Enter',
        run: () => {
          onRun();
          return true;
        }
      },
      {
        key: 'Mod-Enter',
        run: () => {
          onRun();
          return true;
        }
      }
    ]);
  }, [onRun]);

  // Transform schema array database metadata to CodeMirror autocomplete schema structure
  const cmSchema = useMemo(() => {
    if (!schema) return {};
    const result = {};
    for (const [schName, tables] of Object.entries(schema)) {
      result[schName] = {};
      for (const [tblName, cols] of Object.entries(tables)) {
        if (Array.isArray(cols)) {
          const colNames = cols.map(c => c.column_name);
          result[schName][tblName] = colNames;
          // Also expose table directly at the top level for flat autocompletion (e.g. SELECT * FROM table)
          result[tblName] = colNames;
        }
      }
    }
    return result;
  }, [schema]);

  // Memoize extension array to prevent CodeMirror from re-initializing extension tree on every keystroke
  const editorExtensions = useMemo(() => {
    return [
      Prec.highest(runKeymap), // Elevate precedence of Tab and Ctrl-Enter keymap to intercept events first
      sql({ 
        dialect: PostgreSQL, 
        schema: cmSchema,
        defaultSchema: 'public'
      }), 
      tooltips({
        parent: document.body
      }),
      autocompletion({
        activateOnTyping: true
      })
    ];
  }, [cmSchema, runKeymap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.5rem' }}>
      <div style={{ flex: 1, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
        <CodeMirror
          value={value}
          height="100%"
          extensions={editorExtensions}
          onChange={onChange}
          theme="dark"
          style={{ height: '100%' }}
          indentWithTab={false}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', alignSelf: 'center' }}>Ctrl+Enter to Run</span>
        <button 
          className="btn btn-primary" 
          onClick={onRun}
          disabled={isRunning}
        >
          {isRunning ? 'Running...' : 'Run Query'}
        </button>
      </div>
    </div>
  );
}
