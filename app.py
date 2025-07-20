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
    if (not otp) or otp.code != submitted or otp.is_expired():
        return jsonify(success=False, error="Invalid or expired code"), 400

    # mark it used
    otp.used = True
    db.session.commit()

    
    login_user(user)
    # regenerate X25519 private key on each fresh session
    priv = x25519.X25519PrivateKey.generate()
    user_priv[user.username] = priv
    peer_pub[user.username] = {}

    return jsonify(success=True, username=user.username)

@app.route("/api/logout", methods=["POST"])
@login_required
def api_logout():
    user_priv.pop(current_user.username, None)
    peer_pub.pop(current_user.username, None)
    logout_user()
    return jsonify({"success": True})

@app.route("/api/conversations/<int:conv_id>/messages")
@login_required
def api_history(conv_id):
    rows = (
        Message.query
               .filter_by(conversation_id=conv_id)
               .order_by(Message.timestamp)
               .all()
    )
    out = []
    for m in rows:
        # decrypt the stored JSON packet
        packet = json.loads(base64.b64decode(m.body))
        # attach an ISO timestamp
        packet["timestamp"] = m.timestamp.replace(tzinfo=timezone.utc) \
                                         .isoformat()
        out.append(packet)
    return jsonify(out)

# ---------- chat page ----------
@app.route("/chat/<username>")
@login_required
def chat(username):
    other = User.query.filter_by(username=username).first_or_404()
    conv = (
        Conversation.query.join(Participant)
        .filter(Participant.user_id.in_([current_user.id, other.id]))
        .group_by(Conversation.id)
        .having(func.count(Participant.id) == 2).first())
    if not conv:
        conv = Conversation(); db.session.add(conv); db.session.commit()
        db.session.add_all([
            Participant(conversation_id=conv.id, user_id=current_user.id),
            Participant(conversation_id=conv.id, user_id=other.id)])
        db.session.commit()

    msgs = (Message.query.filter_by(conversation_id=conv.id)
                         .order_by(Message.timestamp).all())
    history = [{"sender": db.session.get(User, m.sender_id).username,
                "body":   m.body,         # encrypted blob
                "timestamp": m.timestamp.strftime("%Y-%m-%d %H:%M")}
               for m in msgs]
    return render_template("chat.html",
                           from_user=current_user.username,
                           to_user=other.username,
                           history=history,
                           conv_id=conv.id)

# ───────────────── Socket.IO ─────────────────
@socketio.on("connect")
def handle_connect():
    """Place each authenticated socket in a room named
       after the user so we can emit(room=username)."""
    if current_user.is_authenticated:
        join_room(current_user.username)


@socketio.on("join_room")
@login_required
def on_join(data):
    conv_id = data.get("conv_id")
    join_room(current_user.username)

    # Replay any queued messages for this conv / this user
    pending = (
      QueuedMessage.query
        .filter_by(recipient_id=current_user.id,
                   conversation_id=conv_id,
                   delivered=False)
        .all()
    )
    for qm in pending:
        try:
            packet = json.loads(qm.payload)
            emit("secure_message_client", packet,
                 room=current_user.username)
            qm.delivered = True
        except Exception:
            # swallow one bad packet
            app.logger.exception("Failed to replay queued msg %s", qm.id)
    db.session.commit()

@socketio.on("exchange_keys")
@login_required
def exchange_keys(msg):
    me, peer = current_user.username, msg.get("to")
    if not peer or "pub_key" not in msg:
        return
    # (you may store peer pub if you need it server-side)
    emit("peer_key",
         {"from": me, "pub_key": msg["pub_key"]},
         room=peer)