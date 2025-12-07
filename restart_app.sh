#!/bin/bash
# Script to stop and restart the Secure Chat App

echo "Stopping existing gunicorn processes..."
pkill -f gunicorn

# Wait a moment for processes to stop
sleep 2

# Check if any are still running
if pgrep -f gunicorn > /dev/null; then
    echo "Force killing remaining processes..."
    pkill -9 -f gunicorn
    sleep 1
fi

# Verify port 5000 is free
if sudo lsof -i :5000 > /dev/null 2>&1; then
    echo "⚠️  Warning: Port 5000 is still in use"
    sudo lsof -i :5000
else
    echo "✓ Port 5000 is free"
fi

echo ""
echo "Starting gunicorn..."
source venv/bin/activate
nohup gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 wsgi:app > /tmp/gunicorn.log 2>&1 &

sleep 2

# Check if it started successfully
if pgrep -f gunicorn > /dev/null; then
    echo "✓ Gunicorn started successfully"
    echo "PID: $(pgrep -f gunicorn | head -1)"
    echo ""
    echo "Check logs with: tail -f /tmp/gunicorn.log"
    echo "Test with: curl http://localhost:5000"
else
    echo "❌ Failed to start gunicorn. Check /tmp/gunicorn.log for errors"
    tail -20 /tmp/gunicorn.log
fi

