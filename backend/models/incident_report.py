from datetime import datetime

from extensions import db


class IncidentReport(db.Model):
    __tablename__ = "incident_reports"

    id = db.Column(db.Integer, primary_key=True)

    exam_id = db.Column(
        db.Integer,
        db.ForeignKey("exams.id"),
        nullable=False
    )

    invigilator_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False
    )

    incident_type = db.Column(
        db.String(100),
        nullable=False
    )

    severity = db.Column(
        db.Enum("LOW", "MEDIUM", "HIGH"),
        nullable=False,
        default="MEDIUM"
    )

    message = db.Column(
        db.Text,
        nullable=False
    )

    location = db.Column(
        db.String(150),
        nullable=True
    )

    status = db.Column(
        db.Enum(
            "OPEN",
            "ACKNOWLEDGED",
            "REVIEWED",
            "RESOLVED"
        ),
        nullable=False,
        default="OPEN"
    )

    reported_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow
    )