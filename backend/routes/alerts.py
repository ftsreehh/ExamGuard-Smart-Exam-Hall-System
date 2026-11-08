from datetime import datetime, timezone

from flask import Blueprint, jsonify, g
from flask_login import login_required, current_user

from extensions import db
from models.event import Alert
from models.admin import Admin
from models.exam import Exam
from models.exam_invigilator import ExamInvigilator

from invigilator_auth import invigilator_required


# =====================================================
# ALERTS BLUEPRINT
# =====================================================

alerts_bp = Blueprint(
    "alerts",
    __name__,
    url_prefix="/api/alerts"
)


# =====================================================
# TIMESTAMP HELPERS
# =====================================================

def utc_now_naive():
    """Generate UTC time for timezone-naive database columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def format_utc_timestamp(value):
    """
    Serialize database timestamps as ISO 8601 UTC.

    The Z suffix tells JavaScript that the timestamp is UTC,
    allowing correct conversion to Indian Standard Time.
    """

    if value is None:
        return None

    if value.tzinfo is None:
        # Existing timezone-naive timestamps are assumed to be UTC.
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    return value.isoformat().replace("+00:00", "Z")


# =====================================================
# HELPER: CHECK ADMIN
# =====================================================

def is_admin():
    return (
        current_user.is_authenticated
        and isinstance(current_user, Admin)
    )


# =====================================================
# HELPER: GET INVIGILATOR'S ASSIGNED EXAM IDS
# =====================================================

def get_assigned_exam_ids(invigilator_id):

    assignments = ExamInvigilator.query.filter_by(
        invigilator_id=invigilator_id
    ).all()

    return [
        assignment.exam_id
        for assignment in assignments
    ]


# =====================================================
# HELPER: GET INVIGILATOR'S ASSIGNED HALL IDS
# =====================================================

def get_assigned_hall_ids(invigilator_id):

    exam_ids = get_assigned_exam_ids(invigilator_id)

    if not exam_ids:
        return []

    exams = Exam.query.filter(
        Exam.id.in_(exam_ids)
    ).all()

    return list({
        exam.hall_id
        for exam in exams
        if exam.hall_id is not None
    })


# =====================================================
# HELPER: SERIALIZE ALERT
# =====================================================

def serialize_alert(alert, invigilator_id=None):

    hall = alert.hall

    hall_name = (
        getattr(hall, "hall_name", None)
        or getattr(hall, "name", None)
        or f"Hall {alert.hall_id}"
    )

    exam_query = Exam.query.filter_by(
        hall_id=alert.hall_id
    )

    # Invigilators see only their assigned examination details.
    if invigilator_id is not None:

        assigned_exam_ids = get_assigned_exam_ids(
            invigilator_id
        )

        if not assigned_exam_ids:
            exam_query = exam_query.filter(db.false())
        else:
            exam_query = exam_query.filter(
                Exam.id.in_(assigned_exam_ids)
            )

    exams = exam_query.order_by(
        Exam.start_at.desc()
    ).all()

    exam_details = [
        {
            "id": exam.id,
            "title": exam.title,
            "subject": exam.subject,
            "exam_date": (
                exam.exam_date.isoformat()
                if exam.exam_date else None
            )
        }
        for exam in exams
    ]

    return {
        "id": alert.id,
        "hall_id": alert.hall_id,
        "hall_name": hall_name,
        "device_id": alert.device_id,
        "type": alert.alert_type,
        "severity": alert.severity,
        "message": alert.message,
        "value": alert.value,
        "status": alert.status,
        "examinations": exam_details,

        # Explicit UTC timestamps.
        "created_at": format_utc_timestamp(
            alert.created_at
        ),

        "acknowledged_at": format_utc_timestamp(
            alert.acknowledged_at
        )
    }


# =====================================================
# GET ALERTS — ADMIN
# GET /api/alerts/
# =====================================================

@alerts_bp.route("/", methods=["GET"])
@login_required
def get_admin_alerts():

    if not is_admin():
        return jsonify({
            "success": False,
            "message": "Admin access required."
        }), 403

    try:

        alerts = Alert.query.order_by(
            Alert.created_at.desc()
        ).all()

        results = [
            serialize_alert(alert)
            for alert in alerts
        ]

        return jsonify({
            "success": True,
            "alerts": results
        }), 200

    except Exception as error:

        db.session.rollback()

        print("ADMIN ALERT ERROR:", str(error))

        return jsonify({
            "success": False,
            "message": "Unable to retrieve alerts."
        }), 500


# =====================================================
# GET ALERTS — INVIGILATOR
# GET /api/alerts/invigilator
# =====================================================

@alerts_bp.route(
    "/invigilator",
    methods=["GET"]
)
@invigilator_required
def get_invigilator_alerts():

    invigilator = g.current_invigilator

    try:

        hall_ids = get_assigned_hall_ids(
            invigilator.id
        )

        if not hall_ids:
            return jsonify({
                "success": True,
                "alerts": []
            }), 200

        alerts = Alert.query.filter(
            Alert.hall_id.in_(hall_ids)
        ).order_by(
            Alert.created_at.desc()
        ).all()

        results = [
            serialize_alert(
                alert,
                invigilator_id=invigilator.id
            )
            for alert in alerts
        ]

        return jsonify({
            "success": True,
            "alerts": results
        }), 200

    except Exception as error:

        db.session.rollback()

        print("INVIGILATOR ALERT ERROR:", str(error))

        return jsonify({
            "success": False,
            "message": "Unable to retrieve alerts."
        }), 500


# =====================================================
# ACKNOWLEDGE ALERT — ADMIN
# PATCH /api/alerts/<alert_id>/acknowledge
# =====================================================

@alerts_bp.route(
    "/<int:alert_id>/acknowledge",
    methods=["PATCH"]
)
@login_required
def acknowledge_admin_alert(alert_id):

    if not is_admin():
        return jsonify({
            "success": False,
            "message": "Admin access required."
        }), 403

    return acknowledge_alert_record(
        alert_id,
        invigilator_id=None
    )


# =====================================================
# ACKNOWLEDGE ALERT — INVIGILATOR
# PATCH /api/alerts/invigilator/<alert_id>/acknowledge
# =====================================================

@alerts_bp.route(
    "/invigilator/<int:alert_id>/acknowledge",
    methods=["PATCH"]
)
@invigilator_required
def acknowledge_invigilator_alert(alert_id):

    invigilator = g.current_invigilator

    return acknowledge_alert_record(
        alert_id,
        invigilator_id=invigilator.id
    )


# =====================================================
# SHARED ACKNOWLEDGEMENT LOGIC
# =====================================================

def acknowledge_alert_record(
    alert_id,
    invigilator_id=None
):

    try:

        alert = db.session.get(
            Alert,
            alert_id
        )

        if alert is None:
            return jsonify({
                "success": False,
                "message": "Alert not found."
            }), 404

        # Verify invigilator's hall assignment.
        if invigilator_id is not None:

            hall_ids = get_assigned_hall_ids(
                invigilator_id
            )

            if alert.hall_id not in hall_ids:
                return jsonify({
                    "success": False,
                    "message": (
                        "You cannot acknowledge alerts "
                        "outside your assigned examination halls."
                    )
                }), 403

        if alert.status == "ACKNOWLEDGED":
            return jsonify({
                "success": True,
                "message": "Alert is already acknowledged.",
                "alert_id": alert.id,
                "status": alert.status,
                "acknowledged_at": format_utc_timestamp(
                    alert.acknowledged_at
                )
            }), 200

        alert.status = "ACKNOWLEDGED"

        # Store acknowledgement time in UTC.
        alert.acknowledged_at = utc_now_naive()

        if invigilator_id is not None:
            alert.acknowledged_by = invigilator_id

        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Alert acknowledged successfully.",
            "alert_id": alert.id,
            "status": alert.status,
            "acknowledged_at": format_utc_timestamp(
                alert.acknowledged_at
            )
        }), 200

    except Exception as error:

        db.session.rollback()

        print("ACKNOWLEDGE ALERT ERROR:", str(error))

        return jsonify({
            "success": False,
            "message": "Unable to acknowledge alert."
        }), 500