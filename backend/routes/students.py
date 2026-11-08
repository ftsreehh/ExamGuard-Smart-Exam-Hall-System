
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy.exc import IntegrityError

from extensions import db
from models.admin import Admin
from models.student import Student

from invigilator_auth import invigilator_required


# =========================================================
# BLUEPRINT
# =========================================================

students_bp = Blueprint(
    "students",
    __name__,
    url_prefix="/api/students"
)


# =========================================================
# ENROLLMENT NUMBER NORMALIZATION
# =========================================================

def normalize_enrollment_number(value):
    """
    Remove surrounding spaces and convert enrollment
    numbers to uppercase for consistent matching.
    """
    return str(value or "").strip().upper()


# =========================================================
# ADMIN ACCESS CHECK
# =========================================================

def admin_access_required():

    if not current_user.is_authenticated:
        return jsonify({
            "success": False,
            "message": "Please log in."
        }), 401

    if (
        not isinstance(current_user, Admin)
        or not current_user.is_active_admin
    ):
        return jsonify({
            "success": False,
            "message": "Administrator access required."
        }), 403

    return None


# =========================================================
# SHARED STUDENT LOOKUP
# =========================================================

def find_student_by_enrollment():

    enrollment_number = normalize_enrollment_number(
        request.args.get("enrollment_number", "")
    )

    if not enrollment_number:
        return jsonify({
            "success": False,
            "message": "Enrollment number is required."
        }), 400

    student = Student.query.filter_by(
        enrollment_number=enrollment_number
    ).first()

    if student is None or not student.is_active:
        return jsonify({
            "success": False,
            "message": "Student not found or inactive."
        }), 404

    return jsonify({
        "success": True,
        "message": "Student found.",
        "student": student.to_dict()
    }), 200


# =========================================================
# LOOK UP STUDENT — ADMIN
# GET /api/students/lookup
# =========================================================

@students_bp.route(
    "/lookup",
    methods=["GET"]
)
@login_required
def lookup_student_admin():

    access_error = admin_access_required()

    if access_error:
        return access_error

    return find_student_by_enrollment()


# =========================================================
# LOOK UP STUDENT — INVIGILATOR
# GET /api/students/lookup-invigilator
# =========================================================

@students_bp.route(
    "/lookup-invigilator",
    methods=["GET"]
)
@invigilator_required
def lookup_student_invigilator():

    return find_student_by_enrollment()


# =========================================================
# REGISTER STUDENT
# Administrator only
# POST /api/students
# =========================================================

@students_bp.route(
    "",
    methods=["POST"]
)
@login_required
def create_student():

    access_error = admin_access_required()

    if access_error:
        return access_error

    data = request.get_json(silent=True) or {}

    enrollment_number = normalize_enrollment_number(
        data.get("enrollment_number", "")
    )

    full_name = str(
        data.get("full_name", "") or ""
    ).strip()

    department = str(
        data.get("department", "") or ""
    ).strip()

    class_name = str(
        data.get("class_name", "") or ""
    ).strip()

    batch_year = str(
        data.get("batch_year", "") or ""
    ).strip()

    email = str(
        data.get("email", "") or ""
    ).strip() or None

    # Validate required fields.
    required_fields = {
        "Enrollment number": enrollment_number,
        "Student name": full_name,
        "Department": department,
        "Class": class_name,
        "Batch year": batch_year
    }

    for label, value in required_fields.items():

        if not value:
            return jsonify({
                "success": False,
                "message": f"{label} is required."
            }), 400

    # Check duplicate enrollment number.
    existing_student = Student.query.filter_by(
        enrollment_number=enrollment_number
    ).first()

    if existing_student:
        return jsonify({
            "success": False,
            "message": "This enrollment number already exists."
        }), 409

    # Check duplicate email.
    if email:

        existing_email = Student.query.filter_by(
            email=email
        ).first()

        if existing_email:
            return jsonify({
                "success": False,
                "message": "This email is already registered."
            }), 409

    # Create the student.
    student = Student(
        enrollment_number=enrollment_number,
        full_name=full_name,
        department=department,
        class_name=class_name,
        batch_year=batch_year,
        email=email,
        is_active=True
    )

    try:
        db.session.add(student)
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "success": False,
            "message": "Duplicate student registration."
        }), 409

    except Exception:
        db.session.rollback()
        raise

    return jsonify({
        "success": True,
        "message": "Student registered successfully.",
        "student": student.to_dict()
    }), 201


# =========================================================
# LIST STUDENTS
# Administrator only
# GET /api/students
# =========================================================

@students_bp.route(
    "",
    methods=["GET"]
)
@login_required
def get_students():

    access_error = admin_access_required()

    if access_error:
        return access_error

    students = Student.query.order_by(
        Student.full_name.asc()
    ).all()

    return jsonify({
        "success": True,
        "total_students": len(students),
        "students": [
            student.to_dict()
            for student in students
        ]
    }), 200


# =========================================================
# EDIT STUDENT
# Administrator only
# PUT /api/students/<student_id>
# =========================================================

@students_bp.route(
    "/<int:student_id>",
    methods=["PUT"]
)
@login_required
def update_student(student_id):

    access_error = admin_access_required()

    if access_error:
        return access_error

    student = db.session.get(
        Student,
        student_id
    )

    if student is None:
        return jsonify({
            "success": False,
            "message": "Student not found."
        }), 404

    data = request.get_json(silent=True) or {}

    enrollment_number = normalize_enrollment_number(
        data.get(
            "enrollment_number",
            student.enrollment_number
        )
    )

    full_name = str(
        data.get(
            "full_name",
            student.full_name
        ) or ""
    ).strip()

    department = str(
        data.get(
            "department",
            student.department or ""
        ) or ""
    ).strip()

    class_name = str(
        data.get(
            "class_name",
            student.class_name or ""
        ) or ""
    ).strip()

    batch_year = str(
        data.get(
            "batch_year",
            student.batch_year or ""
        ) or ""
    ).strip()

    email = str(
        data.get(
            "email",
            student.email or ""
        ) or ""
    ).strip() or None

    # Validate required fields.
    if not all([
        enrollment_number,
        full_name,
        department,
        class_name,
        batch_year
    ]):
        return jsonify({
            "success": False,
            "message": (
                "Enrollment number, name, department, "
                "class, and batch year are required."
            )
        }), 400

    # Check duplicate enrollment number.
    duplicate_enrollment = Student.query.filter(
        Student.enrollment_number == enrollment_number,
        Student.id != student.id
    ).first()

    if duplicate_enrollment:
        return jsonify({
            "success": False,
            "message": (
                "This enrollment number is already registered."
            )
        }), 409

    # Check duplicate email.
    if email:

        duplicate_email = Student.query.filter(
            Student.email == email,
            Student.id != student.id
        ).first()

        if duplicate_email:
            return jsonify({
                "success": False,
                "message": "This email is already registered."
            }), 409

    # Update student fields.
    student.enrollment_number = enrollment_number
    student.full_name = full_name
    student.department = department
    student.class_name = class_name
    student.batch_year = batch_year
    student.email = email

    try:
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "success": False,
            "message": (
                "Could not update student because "
                "of duplicate data."
            )
        }), 409

    except Exception:
        db.session.rollback()
        raise

    return jsonify({
        "success": True,
        "message": "Student updated successfully.",
        "student": student.to_dict()
    }), 200


# =========================================================
# DELETE STUDENT
# Administrator only
# DELETE /api/students/<student_id>
# =========================================================

@students_bp.route(
    "/<int:student_id>",
    methods=["DELETE"]
)
@login_required
def delete_student(student_id):

    access_error = admin_access_required()

    if access_error:
        return access_error

    student = db.session.get(
        Student,
        student_id
    )

    if student is None:
        return jsonify({
            "success": False,
            "message": "Student not found."
        }), 404

    try:
        db.session.delete(student)
        db.session.commit()

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "success": False,
            "message": (
                "This student may be linked to attendance records. "
                "Deletion was blocked by the database. "
                "Keep the student record and deactivate the student "
                "instead to preserve attendance history."
            )
        }), 409

    except Exception:
        db.session.rollback()
        raise

    return jsonify({
        "success": True,
        "message": "Student deleted successfully."
    }), 200
