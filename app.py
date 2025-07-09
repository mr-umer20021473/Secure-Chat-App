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

