from datetime import datetime, timezone

from extensions import db


class Hall(db.Model):
    __tablename__ = "halls"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    code = db.Column(
        db.String(50),
        unique=True,
        nullable=False
    )

    name = db.Column(
        db.String(120),
        nullable=False
    )

    floor = db.Column(
        db.String(50),
        nullable=True
    )

    capacity = db.Column(
        db.Integer,
        nullable=False
    )

    noise_normal_threshold = db.Column(
        db.Float,
        nullable=False,
        default=50.0
    )

    noise_warning_threshold = db.Column(
        db.Float,
        nullable=False,
        default=65.0
    )

    noise_threshold = db.Column(
        db.Float,
        nullable=False,
        default=80.0
    )

    rf_threshold = db.Column(
        db.Float,
        nullable=False,
        default=70.0
    )

    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )