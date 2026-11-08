from datetime import datetime, timezone

from extensions import db


class SensorReading(db.Model):
    __tablename__ = "sensor_readings"

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

    reading_type = db.Column(
        db.String(50),
        nullable=False
    )

    value = db.Column(
        db.Float,
        nullable=False
    )

    unit = db.Column(
        db.String(30),
        nullable=True
    )

    raw_value = db.Column(
        db.Float,
        nullable=True
    )

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    hall = db.relationship(
        "Hall",
        backref=db.backref("sensor_readings", lazy=True)
    )

    device = db.relationship(
        "HallDevice",
        backref=db.backref("sensor_readings", lazy=True)
    )