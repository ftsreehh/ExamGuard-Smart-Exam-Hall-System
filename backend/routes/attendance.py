
from datetime import datetime
import logging

from flask import Blueprint, jsonify, request, g
from flask_login import login_required, current_user
from sqlalchemy.exc import IntegrityError

from extensions import db
from invigilator_auth import invigilator_required

from models.admin import Admin
from models.student import Student
from models.exam import Exam
from models.exam_invigilator import ExamInvigilator
from models.attendance import Attendance
from models.user import User


# =====================================================
# BLUEPRINT
# =====================================================

attendance_bp = Blueprint(
    "attendance",
    __name__,
    url_prefix="/api/attendance"
)


# =====================================================
# RESPONSE HELPERS
# =====================================================

def success_response(message=None, **kwargs):

    response = {
        "success": True,
        **kwargs
    }

    if message:
        response["message"] = message

    return jsonify(response)


def error_response(message, status_code):

    return jsonify({
        "success": False,
        "message": message
    }), status_code


# =====================================================
# ENROLLMENT NUMBER NORMALIZATION
# =====================================================

def normalize_enrollment_number(value):

    return str(value or "").strip().upper()


# =====================================================
# ADMIN AUTHENTICATION
# =====================================================

def admin_access_required():

    return (
        current_user.is_authenticated
        and isinstance(current_user, Admin)
        and current_user.is_active_admin
    )


# =====================================================
# INVIGILATOR AUTHENTICATION
# =====================================================

def get_authenticated_invigilator():

    return getattr(
        g,
        "current_invigilator",
        None
    )


# =====================================================
# CHECK EXAM ASSIGNMENT
# =====================================================

def assigned_exam(exam_id):

    invigilator = get_authenticated_invigilator()

    if invigilator is None:
        return False

    assignment = (
        db.session.query(ExamInvigilator.id)
        .filter(
            ExamInvigilator.exam_id == exam_id,
            ExamInvigilator.invigilator_id == invigilator.id
        )
        .first()
    )

    return assignment is not None


# =====================================================
# GET ASSIGNED EXAMS - INVIGILATOR
# GET /api/attendance/exams
# =====================================================

@attendance_bp.route(
    "/exams",
    methods=["GET"]
)
@invigilator_required
def get_assigned_exams():

    invigilator = get_authenticated_invigilator()

    if invigilator is None:
        return error_response(
            "Invigilator authentication required.",
            401
        )

    try:

        exams = (
            db.session.query(Exam)
            .join(
                ExamInvigilator,
                ExamInvigilator.exam_id == Exam.id
            )
            .filter(
                ExamInvigilator.invigilator_id == invigilator.id
            )
            .order_by(
                Exam.exam_date.asc(),
                Exam.start_at.asc()
            )
            .all()
        )

        results = []

        for exam in exams:

            results.append({
                "id": exam.id,
                "title": exam.title,
                "subject": exam.subject,

                "exam_date": (
                    exam.exam_date.isoformat()
                    if exam.exam_date
                    else None
                ),

                "start_at": (
                    exam.start_at.isoformat()
                    if exam.start_at
                    else None
                ),

                "end_at": (
                    exam.end_at.isoformat()
                    if exam.end_at
                    else None
                ),

                "hall_id": exam.hall_id,
                "status": exam.status
            })

        return success_response(
            exams=results,
            total=len(results)
        )

    except Exception:

        db.session.rollback()

        logging.exception(
            "Failed to load assigned exams for invigilator ID %s",
            invigilator.id
        )

        return error_response(
            "Unable to load assigned examinations.",
            500
        )


# =====================================================
# ADMIN: GET ATTENDANCE FOR AN EXAM
# GET /api/attendance/admin/<exam_id>
# =====================================================

@attendance_bp.route(
    "/admin/<int:exam_id>",
    methods=["GET"]
)
@login_required
def get_admin_exam_attendance(exam_id):

    if not admin_access_required():
        return error_response(
            "Administrator access required.",
            403
        )

    exam = db.session.get(
        Exam,
        exam_id
    )

    if exam is None:
        return error_response(
            "Examination not found.",
            404
        )

    try:

        records = (
            db.session.query(Attendance, Student)
            .join(
                Student,
                Attendance.student_id == Student.id
            )
            .filter(
                Attendance.exam_id == exam_id
            )
            .order_by(
                Student.full_name.asc()
            )
            .all()
        )

        results = []

        for attendance, student in records:

            invigilator_name = "—"

            if attendance.invigilator_id:

                invigilator = db.session.get(
                    User,
                    attendance.invigilator_id
                )

                if invigilator:
                    invigilator_name = invigilator.full_name

            results.append({

                "id": attendance.id,

                "student_id": student.id,

                "student_name": student.full_name,

                "enrollment_number": student.enrollment_number,

                "status": attendance.status,

                "attendance_time": (
                    attendance.attendance_time.isoformat()
                    if attendance.attendance_time
                    else None
                ),

                "invigilator_id": attendance.invigilator_id,

                "invigilator_name": invigilator_name
            })

        total_students = Student.query.filter_by(
            is_active=True
        ).count()

        present_count = sum(
            1
            for row in results
            if str(row["status"]).upper() == "PRESENT"
        )

        return success_response(
            exam_id=exam_id,
            total_students=total_students,
            present=present_count,
            absent=max(0, total_students - present_count),
            total_records=len(results),
            attendance=results
        )

    except Exception:

        db.session.rollback()

        logging.exception(
            "Failed to load admin attendance for exam %s",
            exam_id
        )

        return error_response(
            "Unable to load attendance records.",
            500
        )


# =====================================================
# MARK ATTENDANCE - INVIGILATOR
# POST /api/attendance/scan
# =====================================================

@attendance_bp.route(
    "/scan",
    methods=["POST"]
)
@invigilator_required
def mark_attendance():

    invigilator = get_authenticated_invigilator()

    if invigilator is None:
        return error_response(
            "Invigilator authentication required.",
            401
        )

    data = request.get_json(silent=True) or {}

    # Normalize enrollment number.
    enrollment_number = normalize_enrollment_number(
        data.get("enrollment_number")
    )

    exam_id = data.get("exam_id")

    # Validate enrollment number.
    if not enrollment_number:

        return error_response(
            "Student enrollment number is required.",
            400
        )

    # Validate exam ID.
    try:

        if isinstance(exam_id, bool):
            raise ValueError

        exam_id = int(exam_id)

        if exam_id <= 0:
            raise ValueError

    except (TypeError, ValueError):

        return error_response(
            "A valid exam_id is required.",
            400
        )

    # Verify that the exam exists.
    exam = db.session.get(
        Exam,
        exam_id
    )

    if exam is None:

        return error_response(
            "Examination not found.",
            404
        )

    # Verify invigilator assignment.
    if not assigned_exam(exam_id):

        return error_response(
            "This exam is not assigned to your account.",
            403
        )

    # Find student.
    student = Student.query.filter_by(
        enrollment_number=enrollment_number
    ).first()

    if student is None or not student.is_active:

        return error_response(
            "Student not found or inactive.",
            404
        )

    # Check existing attendance.
    existing = Attendance.query.filter_by(
        student_id=student.id,
        exam_id=exam_id
    ).first()

    if existing:

        return jsonify({

            "success": False,

            "duplicate": True,

            "message": (
                "Attendance has already been recorded "
                "for this student."
            ),

            "student": student.full_name,

            "enrollment_number": student.enrollment_number

        }), 409

    # Create attendance record.
    attendance = Attendance(

        student_id=student.id,

        exam_id=exam_id,

        invigilator_id=invigilator.id,

        status="PRESENT",

        attendance_time=datetime.now()
    )

    try:

        db.session.add(attendance)

        db.session.commit()

    except IntegrityError:

        db.session.rollback()

        # Handles simultaneous duplicate scans.
        return jsonify({

            "success": False,

            "duplicate": True,

            "message": (
                "Attendance already exists for this "
                "student and examination."
            )

        }), 409

    except Exception:

        db.session.rollback()

        logging.exception(
            "Failed to record attendance for exam %s",
            exam_id
        )

        return error_response(
            "Unable to record attendance.",
            500
        )

    # Successful attendance response.
    return jsonify({

        "success": True,

        "message": "Attendance recorded successfully.",

        "attendance": {

            "id": attendance.id,

            "student_id": student.id,

            "student_name": student.full_name,

            "enrollment_number": student.enrollment_number,

            "exam_id": exam_id,

            "invigilator_id": invigilator.id,

            "status": attendance.status,

            "attendance_time": (
                attendance.attendance_time.isoformat()
                if attendance.attendance_time
                else None
            )
        }

    }), 201


# =====================================================
# GET ATTENDANCE FOR AN ASSIGNED EXAM
# GET /api/attendance/<exam_id>
# =====================================================

@attendance_bp.route(
    "/<int:exam_id>",
    methods=["GET"]
)
@invigilator_required
def get_exam_attendance(exam_id):

    invigilator = get_authenticated_invigilator()

    if invigilator is None:

        return error_response(
            "Invigilator authentication required.",
            401
        )

    # Verify exam exists.
    exam = db.session.get(
        Exam,
        exam_id
    )

    if exam is None:

        return error_response(
            "Examination not found.",
            404
        )

    # Verify assignment.
    if not assigned_exam(exam_id):

        return error_response(
            "This exam is not assigned to your account.",
            403
        )

    try:

        records = (
            db.session.query(Attendance, Student)
            .join(
                Student,
                Attendance.student_id == Student.id
            )
            .filter(
                Attendance.exam_id == exam_id
            )
            .order_by(
                Student.full_name.asc()
            )
            .all()
        )

        results = []

        for attendance, student in records:

            results.append({

                "id": attendance.id,

                "student_id": student.id,

                "student_name": student.full_name,

                "enrollment_number": student.enrollment_number,

                "status": attendance.status,

                "attendance_time": (
                    attendance.attendance_time.isoformat()
                    if attendance.attendance_time
                    else None
                )
            })

        return success_response(
            exam_id=exam_id,
            total_records=len(results),
            attendance=results
        )

    except Exception:

        db.session.rollback()

        logging.exception(
            "Failed to load attendance for exam %s",
            exam_id
        )

        return error_response(
            "Unable to load attendance records.",
            500
        )
