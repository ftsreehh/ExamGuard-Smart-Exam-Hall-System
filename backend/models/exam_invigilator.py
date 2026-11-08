from datetime import datetime

from extensions import db


class ExamInvigilator(db.Model):
    __tablename__ = "exam_invigilators"

    id = db.Column(
        db.Integer,
        primary_key=True
    )

    exam_id = db.Column(
        db.Integer,
        db.ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False
    )

    invigilator_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    assigned_at = db.Column(
        db.DateTime,
        default=datetime.now,
        nullable=True
    )

    __table_args__ = (
        db.UniqueConstraint(
            "exam_id",
            "invigilator_id",
            name="unique_exam_invigilator"
        ),
    )
    