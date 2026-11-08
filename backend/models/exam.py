from datetime import datetime, timezone

from extensions import db


class Exam(db.Model):
    __tablename__ = "exams"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    title = db.Column(
        db.String(200),
        nullable=False
    )

    subject = db.Column(
        db.String(150),
        nullable=False
    )

    exam_date = db.Column(
        db.Date,
        nullable=False
    )

    start_at = db.Column(
        db.DateTime,
        nullable=False
    )

    end_at = db.Column(
        db.DateTime,
        nullable=False
    )

    status = db.Column(
        db.String(30),
        nullable=False,
        default="SCHEDULED"
    )

    hall_id = db.Column(
        db.Integer,
        db.ForeignKey("halls.id"),
        nullable=False
    )

    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
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
        backref=db.backref("exams", lazy=True)
    )

    creator = db.relationship(
        "User",
        foreign_keys=[created_by],
        backref=db.backref("created_exams", lazy=True)
    )