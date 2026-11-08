
from datetime import datetime

from extensions import db


class Attendance(db.Model):

    __tablename__ = "attendance"

    # Primary key
    id = db.Column(
        db.Integer,
        primary_key=True
    )

    # Student relationship
    student_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "students.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    # Examination relationship
    exam_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "exams.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    # Invigilator relationship
    invigilator_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "users.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    # Attendance status
    status = db.Column(
        db.Enum("PRESENT", "ABSENT"),
        nullable=False,
        default="PRESENT"
    )

    # Attendance marking date and time
    attendance_time = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.now
    )

    # Prevent duplicate attendance for the same exam
    __table_args__ = (
        db.UniqueConstraint(
            "student_id",
            "exam_id",
            name="unique_student_exam"
        ),
    )
