from datetime import datetime
from extensions import db


class Student(db.Model):
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)

    enrollment_number = db.Column(
        db.String(50),
        unique=True,
        nullable=False
    )

    full_name = db.Column(
        db.String(120),
        nullable=False
    )

    department = db.Column(
        db.String(100),
        nullable=True
    )

    class_name = db.Column(
        db.String(100),
        nullable=True
    )

    batch_year = db.Column(
        db.String(20),
        nullable=True
    )

    email = db.Column(
        db.String(150),
        unique=True,
        nullable=True
    )

    is_active = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.now,
        nullable=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "enrollment_number": self.enrollment_number,
            "full_name": self.full_name,
            "department": self.department,
            "class_name": self.class_name,
            "batch_year": self.batch_year,
            "email": self.email,
            "is_active": self.is_active
        }