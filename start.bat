@echo off
echo Starting PostGIS Manager Backend...
start "PostGIS Manager Backend" cmd /k "cd backend && npm install && npm run dev"

echo Starting PostGIS Manager Frontend...
start "PostGIS Manager Frontend" cmd /k "cd frontend && npm install && npm run dev"

echo PostGIS Manager is starting up! 
echo The frontend will be available at http://localhost:5173
echo The backend proxy will run on http://localhost:3001
