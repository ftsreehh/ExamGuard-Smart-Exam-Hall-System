from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import current_app, g, jsonify, request
from itsdangerous import (
    BadSignature,
    SignatureExpired,
    URLSafeTimedSerializer,
)

from extensions import db
from models.user import User


TOKEN_SALT = "examguard-invigilator-auth-v1"
TOKEN_MAX_AGE = 8 * 60 * 60  # 8 hours


def _serializer():
    """Create a serializer using the application's secret key."""
    return URLSafeTimedSerializer(
        current_app.config["SECRET_KEY"],
        salt=TOKEN_SALT,
    )


def create_invigilator_token(invigilator):
    """Create a signed token for an active Invigilator."""
    if (
        not isinstance(invigilator, User)
        or invigilator.role != "INVIGILATOR"
        or not invigilator.is_active
    ):
        raise ValueError("An active Invigilator account is required.")

    return _serializer().dumps({
        "type": "invigilator",
        "id": invigilator.id,
    })


def invigilator_required(view_function):
    """
    Authenticate an API request using the Invigilator bearer token.

    This does not read or modify the Flask-Login session.
    """
    @wraps(view_function)
    def decorated(*args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        scheme, _, token = authorization.partition(" ")

        if scheme.lower() != "bearer" or not token.strip():
            return jsonify({
                "success": False,
                "message": "Invigilator authentication token required.",
            }), 401

        try:
            payload = _serializer().loads(
                token.strip(),
                max_age=TOKEN_MAX_AGE,
            )
        except SignatureExpired:
            return jsonify({
                "success": False,
                "message": "Your Invigilator session has expired. Please log in again.",
            }), 401
        except BadSignature:
            return jsonify({
                "success": False,
                "message": "Invalid Invigilator authentication token.",
            }), 401

        if payload.get("type") != "invigilator":
            return jsonify({
                "success": False,
                "message": "Invalid Invigilator authentication token.",
            }), 401

        invigilator_id = payload.get("id")

        if isinstance(invigilator_id, bool) or not isinstance(invigilator_id, int):
            return jsonify({
                "success": False,
                "message": "Invalid Invigilator authentication token.",
            }), 401

        invigilator = db.session.get(User, invigilator_id)

        if (
            invigilator is None
            or invigilator.role != "INVIGILATOR"
            or not invigilator.is_active
        ):
            return jsonify({
                "success": False,
                "message": "Invigilator account is inactive or unavailable.",
            }), 403

        g.current_invigilator = invigilator

        return view_function(*args, **kwargs)

    return decorated