from datetime import datetime

from flask import (
    Blueprint,
    jsonify,
    request,
    current_app
)

from extensions import db

from models.exam import Exam
from models.user import User
from models.hall import Hall
from models.exam_invigilator import ExamInvigilator


# ==========================================
# EXAM BLUEPRINT
# ==========================================

exams_bp = Blueprint(
    "exams",
    __name__,
    url_prefix="/api/exams"
)


# ==========================================
# GET ALL EXAMS
# GET /api/exams
# ==========================================

@exams_bp.get("")
def get_exams():

    try:
        exams = Exam.query.order_by(
            Exam.exam_date.asc(),
            Exam.start_at.asc()
        ).all()

        results = []

        for exam in exams:

            results.append({
                "id": exam.id,
                "title": exam.title,
                "subject": exam.subject,
                "exam_date": exam.exam_date.isoformat(),
                "start_at": exam.start_at.isoformat(),
                "end_at": exam.end_at.isoformat(),
                "status": exam.status,
                "hall_id": exam.hall_id,
                "created_by": exam.created_by
            })

        return jsonify(results), 200

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Could not load examinations"
        )

        return jsonify({
            "status": "error",
            "message": "Could not load examinations."
        }), 500


# ==========================================
# GET ACTIVE INVIGILATORS
# GET /api/exams/invigilators
# ==========================================

@exams_bp.get("/invigilators")
def get_invigilators():

    try:
        invigilators = User.query.filter(
            User.role == "INVIGILATOR",
            User.is_active.is_(True)
        ).order_by(
            User.full_name.asc()
        ).all()

        return jsonify({
            "status": "success",
            "invigilators": [
                {
                    "id": invigilator.id,
                    "full_name": invigilator.full_name,
                    "email": invigilator.email
                }
                for invigilator in invigilators
            ]
        }), 200

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Could not load Invigilators"
        )

        return jsonify({
            "status": "error",
            "message": "Could not load Invigilators."
        }), 500


# ==========================================
# CREATE EXAM AND ASSIGN INVIGILATOR
# POST /api/exams
# ==========================================

@exams_bp.post("")
def create_exam():

    data = request.get_json(silent=True) or {}

    required_fields = [
        "title",
        "subject",
        "exam_date",
        "start_at",
        "end_at",
        "hall_id",
        "invigilator_id"
    ]

    for field in required_fields:

        if field not in data:
            return jsonify({
                "status": "error",
                "message": f"Missing field: {field}"
            }), 400

    try:
        title = str(data["title"]).strip()
        subject = str(data["subject"]).strip()

        if not title or not subject:
            return jsonify({
                "status": "error",
                "message": "Title and subject are required."
            }), 400

        exam_date = datetime.strptime(
            data["exam_date"],
            "%Y-%m-%d"
        ).date()

        start_at = datetime.fromisoformat(
            data["start_at"]
        )

        end_at = datetime.fromisoformat(
            data["end_at"]
        )

        hall_id = int(data["hall_id"])
        invigilator_id = int(data["invigilator_id"])

        if hall_id <= 0 or invigilator_id <= 0:
            return jsonify({
                "status": "error",
                "message": "Invalid hall or Invigilator ID."
            }), 400

        if end_at <= start_at:
            return jsonify({
                "status": "error",
                "message": "End time must be after start time."
            }), 400

        if (
            start_at.date() != exam_date
            or end_at.date() != exam_date
        ):
            return jsonify({
                "status": "error",
                "message": "Exam times must match the exam date."
            }), 400

        # Validate hall
        hall = db.session.get(Hall, hall_id)

        if hall is None:
            return jsonify({
                "status": "error",
                "message": "Selected hall was not found."
            }), 400

        # Validate Invigilator
        invigilator = db.session.get(
            User,
            invigilator_id
        )

        if (
            invigilator is None
            or invigilator.role != "INVIGILATOR"
            or not invigilator.is_active
        ):
            return jsonify({
                "status": "error",
                "message": "Selected Invigilator is unavailable."
            }), 400

        # Create examination
        exam = Exam(
            title=title,
            subject=subject,
            exam_date=exam_date,
            start_at=start_at,
            end_at=end_at,
            status="SCHEDULED",
            hall_id=hall_id,
            created_by=data.get("created_by")
        )

        db.session.add(exam)
        db.session.flush()

        # Assign Invigilator
        assignment = ExamInvigilator(
            exam_id=exam.id,
            invigilator_id=invigilator.id
        )

        db.session.add(assignment)

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Exam created and Invigilator assigned.",
            "exam_id": exam.id,
            "invigilator_id": invigilator.id,
            "invigilator_name": invigilator.full_name
        }), 201

    except (ValueError, TypeError):
        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Invalid date, time, hall ID, or Invigilator ID."
        }), 400

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Exam creation failed"
        )

        return jsonify({
            "status": "error",
            "message": "Could not create exam or assign Invigilator."
        }), 500


# ==========================================
# UPDATE OR RESCHEDULE EXAM
# PUT /api/exams/<exam_id>
# ==========================================

@exams_bp.put("/<int:exam_id>")
def update_exam(exam_id):

    exam = db.session.get(Exam, exam_id)

    if exam is None:
        return jsonify({
            "status": "error",
            "message": "Exam not found."
        }), 404

    data = request.get_json(silent=True) or {}

    allowed_fields = {
        "title",
        "subject",
        "exam_date",
        "start_at",
        "end_at",
        "hall_id"
    }

    if not allowed_fields.intersection(data.keys()):
        return jsonify({
            "status": "error",
            "message": "No editable exam fields supplied."
        }), 400

    try:
        if "title" in data:

            title = str(data["title"]).strip()

            if not title:
                return jsonify({
                    "status": "error",
                    "message": "Title cannot be empty."
                }), 400

            exam.title = title

        if "subject" in data:

            subject = str(data["subject"]).strip()

            if not subject:
                return jsonify({
                    "status": "error",
                    "message": "Subject cannot be empty."
                }), 400

            exam.subject = subject

        if "exam_date" in data:
            exam.exam_date = datetime.strptime(
                data["exam_date"],
                "%Y-%m-%d"
            ).date()

        if "start_at" in data:
            exam.start_at = datetime.fromisoformat(
                data["start_at"]
            )

        if "end_at" in data:
            exam.end_at = datetime.fromisoformat(
                data["end_at"]
            )

        if "hall_id" in data:

            hall_id = int(data["hall_id"])

            if db.session.get(Hall, hall_id) is None:
                return jsonify({
                    "status": "error",
                    "message": "Selected hall was not found."
                }), 400

            exam.hall_id = hall_id

        if exam.end_at <= exam.start_at:
            return jsonify({
                "status": "error",
                "message": "End time must be after start time."
            }), 400

        if (
            exam.start_at.date() != exam.exam_date
            or exam.end_at.date() != exam.exam_date
        ):
            return jsonify({
                "status": "error",
                "message": "Exam times must match the exam date."
            }), 400

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Exam updated successfully.",
            "exam_id": exam.id
        }), 200

    except (ValueError, TypeError):
        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Invalid exam details."
        }), 400

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Exam update failed"
        )

        return jsonify({
            "status": "error",
            "message": "Could not update exam."
        }), 500


# ==========================================
# DELETE EXAM
# DELETE /api/exams/<exam_id>
# ==========================================

@exams_bp.delete("/<int:exam_id>")
def delete_exam(exam_id):

    exam = db.session.get(Exam, exam_id)

    if exam is None:
        return jsonify({
            "status": "error",
            "message": "Exam not found."
        }), 404

    try:
        db.session.delete(exam)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Exam deleted successfully.",
            "exam_id": exam_id
        }), 200

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Exam deletion failed"
        )

        return jsonify({
            "status": "error",
            "message": (
                "Could not delete exam. "
                "Related records may prevent deletion."
            )
        }), 500


# ==========================================
# ESP32 EXAMINATION SCHEDULE
# GET /api/exams/device/<hall_id>
# ==========================================

@exams_bp.get("/device/<int:hall_id>")
def get_device_exam_schedule(hall_id):

    try:
        now = datetime.now()

        hall = db.session.get(Hall, hall_id)

        if hall is None:
            return jsonify({
                "success": False,
                "found": False,
                "message": "Hall not found."
            }), 404

        # Get scheduled examinations for this hall.
        exams = Exam.query.filter(
            Exam.hall_id == hall_id,
            Exam.status.in_(["SCHEDULED", "IN_PROGRESS"])
        ).order_by(
            Exam.start_at.asc()
        ).all()

        # Prefer an examination currently in progress.
        current_exam = next(
            (
                exam for exam in exams
                if exam.start_at <= now < exam.end_at
            ),
            None
        )

        # If no examination is running, find the next one.
        if current_exam is None:

            current_exam = next(
                (
                    exam for exam in exams
                    if exam.start_at > now
                ),
                None
            )

        if current_exam is None:
            return jsonify({
                "success": True,
                "found": False,
                "message": "No current or upcoming examination.",
                "hall_id": hall.id,
                "hall_code": hall.code,
                "hall_name": hall.name
            }), 200

        is_running = (
            current_exam.start_at <= now < current_exam.end_at
        )

        remaining_seconds = 0
        seconds_to_start = 0

        if is_running:

            remaining_seconds = max(
                0,
                int(
                    (
                        current_exam.end_at - now
                    ).total_seconds()
                )
            )

        else:

            seconds_to_start = max(
                0,
                int(
                    (
                        current_exam.start_at - now
                    ).total_seconds()
                )
            )

        return jsonify({
            "success": True,
            "found": True,

            "hall_id": hall.id,
            "hall_code": hall.code,
            "hall_name": hall.name,

            "exam_id": current_exam.id,
            "exam_title": current_exam.title,
            "subject": current_exam.subject,

            "exam_date": current_exam.exam_date.isoformat(),
            "start_at": current_exam.start_at.isoformat(),
            "end_at": current_exam.end_at.isoformat(),

            "exam_status": (
                "ONGOING" if is_running else "UPCOMING"
            ),

            "remaining_seconds": remaining_seconds,
            "seconds_to_start": seconds_to_start,

            "server_time": now.isoformat()
        }), 200

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "ESP32 examination schedule retrieval failed"
        )

        return jsonify({
            "success": False,
            "message": "Unable to retrieve examination schedule."
        }), 500