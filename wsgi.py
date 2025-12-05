"""
WSGI entry point for Gunicorn deployment with Flask-SocketIO
"""
from app import app, socketio

# For Gunicorn with eventlet worker, use the Flask app directly
# Flask-SocketIO is already attached to the Flask app, and eventlet worker
# automatically handles WebSocket connections
# Usage: gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 wsgi:app
# The 'app' object is the Flask app with SocketIO middleware attached

# For direct execution (testing)
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000)

