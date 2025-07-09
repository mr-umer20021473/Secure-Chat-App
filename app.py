"""
Secure Flask-SocketIO chat with true end-to-end encryption
using X25519 + XChaCha20-Poly1305.
"""
import os, json, base64
from flask import Flask, render_template, redirect, url_for, request
from flask_socketio import SocketIO, emit, join_room
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from flask_login import (
    LoginManager, login_user, logout_user,
    login_required, current_user)
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.hazmat.primitives.asymmetric import x25519

from models import db, User, Conversation, Participant, Message
from flask_cors import CORS
import random
import smtplib
from email.message import EmailMessage
from models import (
    db, User, Conversation, Participant, Message, QueuedMessage, OTPRequest
)
from datetime import timezone
from flask import jsonify

app = Flask(__name__)
CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-key")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///chat.db"
GMAIL_USER = ""
GMAIL_PASS = "bguxmclomckfmdeg"

db.init_app(app)
login_manager = LoginManager(app); login_manager.login_view = "api_login"

with app.app_context():
    db.create_all()
