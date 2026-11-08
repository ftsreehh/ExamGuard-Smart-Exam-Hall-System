from datetime import datetime, timezone

from extensions import db


class DeviceEvent(db.Model):
    __tablename__ = "device_events"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    hall_id = db.Column(
        db.Integer,
        db.ForeignKey("halls.id"),
        nullable=False
    )

    device_id = db.Column(
        db.Integer,
        db.ForeignKey("hall_devices.id"),
        nullable=True
    )

    event_type = db.Column(
        db.String(50),
        nullable=False
    )

    value = db.Column(
        db.Float,
        nullable=True
    )

    unit = db.Column(
        db.String(30),
        nullable=True
    )

    message = db.Column(
        db.Text,
        nullable=True
    )

    raw_payload = db.Column(
        db.JSON,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    hall = db.relationship(
        "Hall",
        backref=db.backref("device_events", lazy=True)
    )

    device = db.relationship(
        "HallDevice",
        backref=db.backref("events", lazy=True)
    )


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    hall_id = db.Column(
        db.Integer,
        db.ForeignKey("halls.id"),
        nullable=False
    )

    device_id = db.Column(
        db.Integer,
        db.ForeignKey("hall_devices.id"),
        nullable=True
    )

    alert_type = db.Column(
        db.String(50),
        nullable=False
    )

    severity = db.Column(
        db.String(20),
        nullable=False,
        default="MEDIUM"
    )

    message = db.Column(
        db.Text,
        nullable=False
    )

    value = db.Column(
        db.Float,
        nullable=True
    )

    status = db.Column(
        db.String(20),
        nullable=False,
        default="OPEN"
    )

    acknowledged_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True
    )

    acknowledged_at = db.Column(
        db.DateTime,
        nullable=True
    )

    metadata_json = db.Column(
        db.JSON,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    hall = db.relationship(
        "Hall",
        backref=db.backref("alerts", lazy=True)
    )

    device = db.relationship(
        "HallDevice",
        backref=db.backref("alerts", lazy=True)
    )

    acknowledger = db.relationship(
        "User",
        foreign_keys=[acknowledged_by],
        backref=db.backref("acknowledged_alerts", lazy=True)
    )