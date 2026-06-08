import React, { useState } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

export default function GeminiPrompt({ schema, dbSchema, onSqlGenerated, connectionString }) {
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [loading, setLoading] = useState(false);

  const handleAskAI = async () => {
    if (!apiKey) return alert('Please provide a Gemini API Key');
    if (!prompt) return;

    localStorage.setItem('gemini_api_key', apiKey);
    setLoading(true);

    try {
      // Background extraction of @table sample data for all matched tables
      let contextData = '';
      const tableMatches = [...prompt.matchAll(/@([a-zA-Z0-9_]+)/g)].map(m => m[1]);
      
      if (tableMatches.length > 0 && connectionString) {
        const uniqueTables = [...new Set(tableMatches)];
        const targetSchema = dbSchema || schema;
        
        for (const tbl of uniqueTables) {
          let schemaPrefix = '';
          if (targetSchema) {
            for (const [schName, tables] of Object.entries(targetSchema)) {
              if (tables[tbl]) {
                schemaPrefix = `"${schName.replace(/"/g, '""')}".`;
                break;
              }
            }
          }
          try {
            const res = await fetch('http://localhost:3001/api/query', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                connectionString, 
                query: `SELECT * FROM ${schemaPrefix}"${tbl.replace(/"/g, '""')}" LIMIT 3;` 
              })
            });
            const data = await res.json();
            if (data.success && data.rows && data.rows.length > 0) {
              contextData += `\n\nSAMPLE DATA FOR @${tbl}:\n${JSON.stringify(data.rows, null, 2)}`;
            }
          } catch (e) {}
        }
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-pro-preview",
        systemInstruction: `You are a PostGIS and SQL expert. 
Your task is to convert the user's natural language request into a valid SQL query for their database.

CRITICAL INSTRUCTIONS:
1. Always include inline SQL comments (using -- ) before complex statements, joins, or WHERE clauses to explain your logic and reasoning so the user understands what the query is doing.
2. The user will provide their database schema below. 
3. Only output valid SQL. Do not wrap the SQL in markdown (\`\`\`sql) unless necessary, just output the raw SQL text.
4. If they use the @tableName syntax in their prompt, a data sample will be provided to help you understand the format of their data.

SCHEMA:
The user has provided the following JSON object representing the database schema (tables and columns):
${JSON.stringify(schema || {})}

You MUST ONLY use the tables and columns exactly as they appear in the schema. Do not invent columns.
If a requested table is not in the schema, assume it might exist in the 'public' schema or return a best-effort query.
Return ONLY the raw SQL query. Do not wrap the SQL in markdown \`\`\` blocks, and do not provide any explanations.`
      });

      const result = await model.generateContent(prompt + contextData);
      const sql = result.response.text().replace(/```sql\n?|```/g, '').trim();
      onSqlGenerated(sql);
      
    } catch (err) {
      alert("Gemini AI Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-surface-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
      <input 
        className="input"
        type="password"
        placeholder="Gemini API Key"
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        style={{ width: '150px' }}
      />
      <input 
        className="input"
        placeholder="Ask Gemini to write a query (e.g. 'Show me features in @parcels larger than 1000m²')"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleAskAI()}
        style={{ flex: 1 }}
      />
      <button className="btn btn-primary" onClick={handleAskAI} disabled={loading}>
        {loading ? 'Thinking...' : 'Ask AI ✨'}
      </button>
    </div>
  );
}
