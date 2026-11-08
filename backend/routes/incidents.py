from flask import Blueprint, request, jsonify, g
from flask_login import login_required, current_user

from extensions import db
from models.admin import Admin
from models.exam import Exam
from models.user import User
from models.incident_report import IncidentReport
from models.exam_invigilator import ExamInvigilator
from invigilator_auth import invigilator_required


incidents_bp = Blueprint(
    "incidents",
    __name__,
    url_prefix="/api/incidents"
)


# =====================================================
# HELPERS
# =====================================================

ALLOWED_INCIDENT_TYPES = {
    "NOISE DISTURBANCE",
    "STUDENT MISCONDUCT",
    "SUSPICIOUS ACTIVITY",
    "MEDICAL EMERGENCY",
    "TECHNICAL ISSUE",
    "OTHER"
}

ALLOWED_SEVERITIES = {"LOW", "MEDIUM", "HIGH"}

ALLOWED_STATUSES = {
    "OPEN",
    "ACKNOWLEDGED",
    "REVIEWED",
    "RESOLVED"
}


def incident_to_dict(incident):
    return {
        "id": incident.id,
        "exam_id": incident.exam_id,
        "invigilator_id": incident.invigilator_id,
        "incident_type": incident.incident_type,
        "type": incident.incident_type,
        "severity": incident.severity,
        "message": incident.message,
        "location": incident.location,
        "status": incident.status,
        "reported_at": (
            incident.reported_at.isoformat()
            if incident.reported_at else None
        )
    }


def invigilator_is_assigned(invigilator_id, exam_id):
    return ExamInvigilator.query.filter_by(
        invigilator_id=invigilator_id,
        exam_id=exam_id
    ).first() is not None


def admin_required():
    """
    Verify that the current Flask-Login session belongs to an Admin.
    """
    if not current_user.is_authenticated:
        return jsonify({
            "success": False,
            "message": "Admin login required."
        }), 401

    if not isinstance(current_user, Admin):
        return jsonify({
            "success": False,
            "message": "Administrator access required."
        }), 403

    return None


# =====================================================
# INVIGILATOR: GET ASSIGNED EXAMS
# GET /api/incidents/my-exams
# =====================================================

@incidents_bp.route("/my-exams", methods=["GET"])
@invigilator_required
def my_exams():
    invigilator = g.current_invigilator

    assignments = ExamInvigilator.query.filter_by(
        invigilator_id=invigilator.id
    ).all()

    exams = []

    for assignment in assignments:
        exam = db.session.get(Exam, assignment.exam_id)

        if exam:
            exams.append({
                "id": exam.id,
                "title": exam.title,
                "subject": exam.subject,
                "exam_date": (
                    exam.exam_date.isoformat()
                    if exam.exam_date else None
                ),
                "start_at": (
                    exam.start_at.strftime("%H:%M:%S")
                    if exam.start_at else None
                ),
                "end_at": (
                    exam.end_at.strftime("%H:%M:%S")
                    if exam.end_at else None
                )
            })

    return jsonify({
        "success": True,
        "exams": exams
    }), 200


# =====================================================
# INVIGILATOR: SUBMIT INCIDENT REPORT
# POST /api/incidents
# =====================================================

@incidents_bp.route("", methods=["POST"])
@invigilator_required
def create_incident():
    invigilator = g.current_invigilator
    data = request.get_json(silent=True) or {}

    exam_id = data.get("exam_id")
    incident_type = data.get("incident_type", "")
    severity = data.get("severity", "MEDIUM")
    message = data.get("message", "")
    location = data.get("location", "")

    try:
        exam_id = int(exam_id)
    except (TypeError, ValueError):
        return jsonify({
            "success": False,
            "message": "A valid examination is required."
        }), 400

    if not isinstance(incident_type, str):
        return jsonify({
            "success": False,
            "message": "Invalid incident type."
        }), 400

    incident_type = incident_type.strip().upper()

    if incident_type not in ALLOWED_INCIDENT_TYPES:
        return jsonify({
            "success": False,
            "message": "Please select a valid incident type."
        }), 400

    if not isinstance(severity, str):
        return jsonify({
            "success": False,
            "message": "Invalid severity."
        }), 400

    severity = severity.strip().upper()

    if severity not in ALLOWED_SEVERITIES:
        return jsonify({
            "success": False,
            "message": "Please select a valid severity."
        }), 400

    if not isinstance(message, str) or not message.strip():
        return jsonify({
            "success": False,
            "message": "Incident description is required."
        }), 400

    if location is not None and not isinstance(location, str):
        return jsonify({
            "success": False,
            "message": "Invalid location."
        }), 400

    if not invigilator_is_assigned(invigilator.id, exam_id):
        return jsonify({
            "success": False,
            "message": (
                "You are not assigned to this examination."
            )
        }), 403

    exam = db.session.get(Exam, exam_id)

    if not exam:
        return jsonify({
            "success": False,
            "message": "Examination not found."
        }), 404

    incident = IncidentReport(
        exam_id=exam_id,
        invigilator_id=invigilator.id,
        incident_type=incident_type,
        severity=severity,
        message=message.strip(),
        location=(location or "").strip() or None,
        status="OPEN"
    )

    try:
        db.session.add(incident)
        db.session.commit()

    except Exception:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": "Unable to save the incident report."
        }), 500

    return jsonify({
        "success": True,
        "message": "Incident report submitted successfully.",
        "incident": incident_to_dict(incident)
    }), 201


# =====================================================
# INVIGILATOR: VIEW OWN REPORTS
# GET /api/incidents/my-reports
# =====================================================

@incidents_bp.route("/my-reports", methods=["GET"])
@invigilator_required
def my_reports():
    invigilator = g.current_invigilator

    reports = (
        IncidentReport.query
        .filter_by(invigilator_id=invigilator.id)
        .order_by(IncidentReport.reported_at.desc())
        .all()
    )

    return jsonify({
        "success": True,
        "incidents": [
            incident_to_dict(report)
            for report in reports
        ]
    }), 200


# =====================================================
# ADMIN: VIEW ALL INCIDENT REPORTS
# GET /api/incidents
# =====================================================

@incidents_bp.route("", methods=["GET"])
@login_required
def all_incidents():
    access_error = admin_required()

    if access_error:
        return access_error

    reports = (
        IncidentReport.query
        .order_by(IncidentReport.reported_at.desc())
        .all()
    )

    return jsonify({
        "success": True,
        "incidents": [
            incident_to_dict(report)
            for report in reports
        ]
    }), 200


# =====================================================
# ADMIN: UPDATE INCIDENT STATUS
# PATCH /api/incidents/<id>/status
# =====================================================

@incidents_bp.route(
    "/<int:incident_id>/status",
    methods=["PATCH"]
)
@login_required
def update_incident_status(incident_id):
    access_error = admin_required()

    if access_error:
        return access_error

    incident = db.session.get(
        IncidentReport,
        incident_id
    )

    if not incident:
        return jsonify({
            "success": False,
            "message": "Incident report not found."
        }), 404

    data = request.get_json(silent=True) or {}
    status = data.get("status", "")

    if not isinstance(status, str):
        return jsonify({
            "success": False,
            "message": "Invalid incident status."
        }), 400

    status = status.strip().upper()

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "success": False,
            "message": "Invalid incident status."
        }), 400

    incident.status = status

    try:
        db.session.commit()

    except Exception:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": "Unable to update incident status."
        }), 500

    return jsonify({
        "success": True,
        "message": "Incident status updated successfully.",
        "incident": incident_to_dict(incident)
    }), 200