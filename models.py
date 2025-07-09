from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime, timedelta

db = SQLAlchemy()

class User(UserMixin, db.Model):
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    email     = db.Column(db.String(120), unique=True, nullable=False)  # ← new

class Conversation(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Participant(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    user_id         = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Message(db.Model):
    id              = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    sender_id       = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    body            = db.Column(db.Text, nullable=False)
    timestamp       = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

class QueuedMessage(db.Model):
    """
    Encrypted blobs destined for a user who was offline.
    We mark them delivered once we've replayed them.
    """
    __tablename__   = 'queued_messages'
    id              = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversation.id'), nullable=False)
    recipient_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    payload         = db.Column(db.Text, nullable=False)  # JSON-encoded encrypted packet
    delivered       = db.Column(db.Boolean, default=False, nullable=False)

class OTPRequest(db.Model):
    """
    A one-time passcode record.
    """
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    code       = db.Column(db.String(6), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    used       = db.Column(db.Boolean, default=False, nullable=False)

    def is_expired(self):
        # expire after 5 minutes
        return datetime.utcnow() > self.created_at + timedelta(minutes=5)