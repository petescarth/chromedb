# PostGIS Manager

A minimal, browser-based database manager designed specifically for PostgreSQL and PostGIS databases. Inspired by modern native tools like TablePlus, this application runs directly in your browser, allowing you to seamlessly explore schemas, edit data inline, query via natural language using Gemini AI, and instantly visualize geographic data on interactive maps.

## 🚀 Features & Abilities

### Database Exploration
*   **Schema Browser:** Easily navigate through schemas and tables via the sidebar.
*   **Tabbed Interface:** Open multiple tables and custom query results simultaneously in a modern tabbed layout.
*   **Table Structure View:** View detailed table schemas, including column definitions, data types, nullability, default values, primary keys, and index algorithms.
*   **Pagination & Virtualization:** Fetching is optimized with 50-row `LIMIT`/`OFFSET` pagination, and rendering is handled via `@tanstack/react-virtual` to ensure a smooth UI even with thousands of columns.

### Data Manipulation
*   **Inline Editing:** Double-click any cell in the data grid to edit it. Modified cells are highlighted, and a "Commit Changes" button allows you to safely persist changes to the database (Requires the table to have a Primary Key).
*   **Custom SQL Execution:** A full-featured SQL editor (powered by CodeMirror) with syntax highlighting.
*   **Query History:** Successfully executed queries are automatically saved. You can export your history to a JSON file and import it across different devices.

### Geographic Data & PostGIS
*   **Instant Map Visualization:** Run any query returning `WKB` (Well-Known Binary) or PostGIS geometries and instantly toggle to the **Map View** to see the results rendered on a Leaflet map.
*   **Interactive Map Popups:** Clicking on a rendered geographic feature (point, polygon, etc.) will open a popup displaying all other row attributes attached to that geometry.
*   **WKB Unpacking:** Hexadecimal binary geometries in the data table are automatically parsed and displayed as human-readable WKT (Well-Known Text).

### 🤖 Gemini AI Integration
*   **Natural Language to SQL:** Provide a Gemini API key to ask plain-language questions (e.g., *"Show me all parcels larger than 1000m²"*), and Gemini will write the SQL for you.
*   **Token-Optimized Schema Context:** The system dynamically feeds Gemini only the schema definitions for the tables you currently have open in your tabs.
*   **`@table` Context:** Type `@tableName` in your prompt to have the app automatically fetch a live 3-row data sample from that table and feed it to the AI. This teaches Gemini exactly how your specific dates, strings, or geometries are formatted.

---

## 🏗️ Architecture

Because modern web browsers do not support raw TCP socket connections, this application is split into two lightweight parts:
1.  **Frontend (React + Vite):** The browser UI, running locally.
2.  **Backend Proxy (Node.js + Express):** A tiny local proxy server that accepts HTTP requests from the frontend and translates them into raw TCP Postgres connections using the `pg` library.

---

## 🛠️ Setup & Running

### Prerequisites
*   Node.js (v18+)
*   A running PostgreSQL instance (local or remote)

### 1. Start the Backend Proxy
Open a terminal and navigate to the backend folder:
```bash
cd backend
npm install
npm run dev
```
*The proxy server will start on `http://localhost:3001`.*

### 2. Start the Frontend
Open a second terminal and navigate to the frontend folder:
```bash
cd frontend
npm install
npm run dev
```
*The Vite development server will start. Open `http://localhost:5173` in your browser.*

### 3. Connect to your Database
When you open the web app, you will be prompted for a PostgreSQL connection string. 
Format: `postgresql://username:password@host:port/database_name`

---

## ⚠️ Limitations & Known Constraints
*   **Proxy Requirement:** As mentioned, you cannot run this *purely* as a static website or a standard Chrome Extension without native messaging. The local Node.js proxy is required to bridge the browser's HTTP requests to Postgres' TCP sockets.
*   **Inline Editing PK Constraint:** You cannot use the inline cell-editing feature on custom arbitrary queries, or on tables that do not have a defined Primary Key.
*   **AI Context Limitations:** Gemini requires an active internet connection. If you have a massive database schema and open dozens of tabs simultaneously, you may hit token limits depending on your Google AI studio tier. 
