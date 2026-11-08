from datetime import datetime, timezone

from extensions import db


class HallDevice(db.Model):
    __tablename__ = "hall_devices"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    hall_id = db.Column(
        db.Integer,
        db.ForeignKey("halls.id"),
        nullable=False
    )

    device_uid = db.Column(
        db.String(100),
        unique=True,
        nullable=False
    )

    device_type = db.Column(
        db.String(50),
        nullable=False
    )

    firmware_version = db.Column(
        db.String(50),
        nullable=True
    )

    ip_address = db.Column(
        db.String(45),
        nullable=True
    )

    is_online = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    last_seen_at = db.Column(
        db.DateTime,
        nullable=True
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

    hall = db.relationship(
        "Hall",
        backref=db.backref("devices", lazy=True)
    )