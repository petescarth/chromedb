#!/bin/bash

echo "Starting PostGIS Manager..."

# Start Backend
echo "Installing backend dependencies and starting proxy..."
(cd backend && npm install && npm run dev) &
BACKEND_PID=$!

# Start Frontend
echo "Installing frontend dependencies and starting Vite server..."
(cd frontend && npm install && npm run dev) &
FRONTEND_PID=$!

echo "PostGIS Manager is starting up!"
echo "The frontend will be available at http://localhost:5173"
echo "The backend proxy will run on http://localhost:3001"
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both background processes
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

# Wait indefinitely until interrupted
wait
