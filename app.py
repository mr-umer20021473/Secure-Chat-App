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


# ──────────────────────────────────────────────────────────────
# in-memory key stores
user_priv, peer_pub, sessions = {}, {}, {}
# ──────────────────────────────────────────────────────────────
@login_manager.user_loader
def load_user(uid): return db.session.get(User, int(uid))


@app.route("/api/users")
@login_required
def api_users():
    users = User.query.filter(User.id != current_user.id).all()
    return jsonify([
        {"id": u.id, "username": u.username}
        for u in users
    ])

@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.json or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    email    = data.get("email", "").strip().lower()

    # field validation
    if not username or not password or not email:
        return jsonify({"success": False, "error": "Username, email and password are required."}), 400

    # check for existing username or email
    if User.query.filter_by(username=username).first():
        return jsonify({"success": False, "error": "Username already taken."}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"success": False, "error": "Email already registered."}), 400

    # create user
    hashed = generate_password_hash(password)
    user = User(username=username, email=email, password=hashed)
    db.session.add(user)
    db.session.commit()

    return jsonify({"success": True})

def send_otp_email(address: str, code: str):
    msg = EmailMessage()
    msg["Subject"] = "Your SecureChat login code"
    msg["From"]    = GMAIL_USER
    msg["To"]      = address
    msg.set_content(f"Your one-time login code is: {code}\nIt expires in 5 minutes.")
    with smtplib.SMTP("smtp.gmail.com", 587) as smtp:
        smtp.starttls()
        smtp.login(GMAIL_USER, GMAIL_PASS)
        smtp.send_message(msg)

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    username = data.get("username", "").strip()
    pwd      = data.get("password", "")
    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password, pwd):
        return jsonify(success=False, error="Invalid credentials."), 401

    # generate and persist OTP
    code = f"{random.randint(0,999999):06d}"
    otp = OTPRequest(user_id=user.id, code=code)
    db.session.add(otp)
    db.session.commit()

    try:
        send_otp_email(user.email, code)
    except Exception as e:
        app.logger.exception("OTP email failed")
        return jsonify(success=False, error="Failed to send email."), 500

    return jsonify(success=True, otp_sent=True)  
@app.route("/api/verify_otp", methods=["POST"])
def api_verify_otp():
    data = request.json or {}
    username = data.get("username", "").strip()
    submitted = data.get("otp", "").strip()

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify(success=False, error="Unknown user"), 404

    # find most recent unused OTP for this user
    otp = (
      OTPRequest.query
        .filter_by(user_id=user.id, used=False)
        .order_by(OTPRequest.created_at.desc())
        .first()
    )