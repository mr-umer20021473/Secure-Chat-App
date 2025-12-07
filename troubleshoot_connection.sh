#!/bin/bash
# Troubleshooting script for connection issues

echo "=========================================="
echo "Connection Troubleshooting"
echo "=========================================="
echo ""

# 1. Check if gunicorn is running
echo "1. Checking if gunicorn is running..."
if pgrep -f gunicorn > /dev/null; then
    echo "   ✓ Gunicorn is running"
    echo "   PIDs: $(pgrep -f gunicorn | tr '\n' ' ')"
else
    echo "   ❌ Gunicorn is NOT running!"
    echo "   Start it with: nohup gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 wsgi:app > /tmp/gunicorn.log 2>&1 &"
    exit 1
fi

echo ""
echo "2. Checking what port gunicorn is listening on..."
if sudo netstat -tlnp 2>/dev/null | grep :5000; then
    echo "   ✓ Port 5000 is listening"
elif sudo ss -tlnp 2>/dev/null | grep :5000; then
    echo "   ✓ Port 5000 is listening"
else
    echo "   ❌ Port 5000 is NOT listening!"
    echo "   Check gunicorn logs: tail -50 /tmp/gunicorn.log"
fi

echo ""
echo "3. Checking if gunicorn is bound to 0.0.0.0 (not just 127.0.0.1)..."
LISTENING=$(sudo netstat -tlnp 2>/dev/null | grep :5000 || sudo ss -tlnp 2>/dev/null | grep :5000)
if echo "$LISTENING" | grep -q "0.0.0.0:5000\|:::5000"; then
    echo "   ✓ Bound to 0.0.0.0 (accessible from outside)"
else
    echo "   ❌ NOT bound to 0.0.0.0!"
    echo "   Current binding: $LISTENING"
    echo "   Restart with: --bind 0.0.0.0:5000"
fi

echo ""
echo "4. Checking EC2 instance firewall (ufw)..."
if command -v ufw > /dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | head -1)
    echo "   UFW Status: $UFW_STATUS"
    if echo "$UFW_STATUS" | grep -q "active"; then
        echo "   ⚠️  UFW is active - checking port 5000..."
        if sudo ufw status | grep -q "5000"; then
            echo "   ✓ Port 5000 rule found in UFW"
        else
            echo "   ❌ Port 5000 might be blocked by UFW!"
            echo "   Allow it with: sudo ufw allow 5000/tcp"
        fi
    else
        echo "   ✓ UFW is not active (or not installed)"
    fi
else
    echo "   ✓ UFW not installed (no local firewall)"
fi

echo ""
echo "5. Testing local connection..."
if curl -s http://localhost:5000 > /dev/null 2>&1; then
    echo "   ✓ Can connect to localhost:5000"
else
    echo "   ❌ Cannot connect to localhost:5000"
    echo "   App might not be running properly"
fi

echo ""
echo "6. Getting public IP address..."
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null)
if [ -n "$PUBLIC_IP" ]; then
    echo "   ✓ Public IP: $PUBLIC_IP"
    echo "   Try accessing: http://$PUBLIC_IP:5000"
else
    echo "   ⚠️  Could not get public IP from metadata service"
    echo "   Check AWS Console for your instance's public IP"
fi

echo ""
echo "7. Recent gunicorn logs (last 20 lines):"
echo "   ----------------------------------------"
tail -20 /tmp/gunicorn.log 2>/dev/null | sed 's/^/   /' || echo "   No log file found"
echo "   ----------------------------------------"

echo ""
echo "=========================================="
echo "Troubleshooting complete!"
echo "=========================================="

