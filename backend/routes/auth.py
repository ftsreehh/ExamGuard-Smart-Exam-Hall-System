from flask import Blueprint, request, jsonify, g
from flask_login import (
    login_user,
    logout_user,
    login_required,
    current_user
)

from models.admin import Admin
from models.user import User
from invigilator_auth import (
    create_invigilator_token,
    invigilator_required
)


# =====================================================
# AUTHENTICATION BLUEPRINT
# =====================================================

auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth"
)


# =====================================================
# ADMIN LOGIN
# POST /api/auth/login
# =====================================================

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({
            "success": False,
            "message": "Invalid login details."
        }), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({
            "success": False,
            "message": "Email and password are required."
        }), 400

    admin = Admin.query.filter_by(email=email).first()

    if not admin or not admin.check_password(password):
        return jsonify({
            "success": False,
            "message": "Invalid email or password."
        }), 401

    if not admin.is_active:
        return jsonify({
            "success": False,
            "message": "This admin account is inactive."
        }), 403

    # Preserve the existing Admin session.
    login_user(admin)

    return jsonify({
        "success": True,
        "message": "Admin login successful.",
        "admin": {
            "id": admin.id,
            "username": admin.username,
            "email": admin.email
        }
    }), 200


# =====================================================
# INVIGILATOR LOGIN
# POST /api/auth/invigilator-login
# =====================================================

@auth_bp.route("/invigilator-login", methods=["POST"])
def invigilator_login():
    data = request.get_json(silent=True) or {}

    email = data.get("email", "")
    password = data.get("password", "")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({
            "success": False,
            "message": "Invalid login details."
        }), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({
            "success": False,
            "message": "Email and password are required."
        }), 400

    invigilator = User.query.filter_by(
        email=email,
        role="INVIGILATOR"
    ).first()

    if not invigilator or not invigilator.check_password(password):
        return jsonify({
            "success": False,
            "message": "Invalid email or password."
        }), 401

    if not invigilator.is_active:
        return jsonify({
            "success": False,
            "message": "This invigilator account is inactive."
        }), 403

    # Issue a separate token; do not call login_user().
    token = create_invigilator_token(invigilator)

    return jsonify({
        "success": True,
        "message": "Invigilator login successful.",
        "token": token,
        "invigilator": {
            "id": invigilator.id,
            "full_name": invigilator.full_name,
            "email": invigilator.email,
            "role": invigilator.role
        }
    }), 200


# =====================================================
# GET CURRENT ADMIN
# GET /api/auth/me
# =====================================================

@auth_bp.route("/me", methods=["GET"])
@login_required
def current_admin():
    if not isinstance(current_user, Admin):
        return jsonify({
            "success": False,
            "message": "Admin access required."
        }), 403

    return jsonify({
        "success": True,
        "admin": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email
        }
    }), 200


# =====================================================
# GET CURRENT INVIGILATOR
# GET /api/auth/invigilator/me
# =====================================================

@auth_bp.route("/invigilator/me", methods=["GET"])
@invigilator_required
def current_invigilator():
    invigilator = g.current_invigilator

    return jsonify({
        "success": True,
        "invigilator": {
            "id": invigilator.id,
            "full_name": invigilator.full_name,
            "email": invigilator.email,
            "role": invigilator.role
        }
    }), 200


# =====================================================
# ADMIN LOGOUT
# POST /api/auth/logout
# =====================================================

@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    # Ends only the Admin's Flask-Login session.
    logout_user()

    return jsonify({
        "success": True,
        "message": "Admin logged out successfully."
    }), 200


# =====================================================
# INVIGILATOR LOGOUT
# POST /api/auth/invigilator-logout
# =====================================================

@auth_bp.route("/invigilator-logout", methods=["POST"])
@invigilator_required
def invigilator_logout():
    # Signed tokens are stateless. The frontend must delete
    # its token. This endpoint does not touch the Admin session.
    return jsonify({
        "success": True,
        "message": "Invigilator logout successful. Clear your local token."
    }), 200