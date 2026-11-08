
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from flask import Blueprint, jsonify, request

from extensions import db
from models.event import DeviceEvent, Alert
from models.hall import Hall
from models.exam import Exam


noise_bp = Blueprint(
    "noise",
    __name__,
    url_prefix="/api/noise"
)


# ==========================================================
# TIME HELPERS
# ==========================================================

def utc_now_naive():
    """Current UTC time for database timestamps."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def local_exam_time():
    """
    Current Indian local time for matching exam schedules.
    Exam start_at/end_at are treated as Indian local times.
    """
    return datetime.now(
        ZoneInfo("Asia/Kolkata")
    ).replace(tzinfo=None)


def format_utc_timestamp(value):
    if value is None:
        return None

    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)

    return value.isoformat().replace("+00:00", "Z")


# ==========================================================
# FIND EXAM RUNNING IN A HALL
# ==========================================================

def get_active_exam(hall_id, current_time=None):
    """
    Find the exam currently running in the specified hall.
    """

    if current_time is None:
        current_time = local_exam_time()

    return (
        Exam.query
        .filter(
            Exam.hall_id == hall_id,
            Exam.exam_date == current_time.date(),
            Exam.start_at <= current_time,
            Exam.end_at >= current_time,
            Exam.status == "SCHEDULED"
        )
        .order_by(Exam.start_at.desc())
        .first()
    )


def get_exam_details(hall_id, current_time=None):
    exam = get_active_exam(hall_id, current_time)

    if exam is None:
        return {
            "exam_id": None,
            "exam_name": "No Active Exam"
        }

    return {
        "exam_id": exam.id,
        "exam_name": exam.title
    }


# ==========================================================
# GET RECENT NOISE EVENTS
# ==========================================================

@noise_bp.route("/readings", methods=["GET"])
def get_noise_readings():

    try:
        readings = (
            DeviceEvent.query
            .filter(DeviceEvent.event_type == "NOISE")
            .order_by(DeviceEvent.created_at.desc())
            .limit(50)
            .all()
        )

        result = []

        for reading in readings:

            payload = reading.raw_payload or {}

            # Use the saved exam information so historical
            # events retain their original exam name.
            exam_id = payload.get("exam_id")
            exam_name = payload.get("exam_name")

            if not exam_name:
                exam_name = "No Active Exam"

            result.append({
                "id": reading.id,
                "hall_id": reading.hall_id,
                "device_id": reading.device_id,
                "value": reading.value,
                "unit": reading.unit,
                "message": reading.message,
                "exam_id": exam_id,
                "exam_name": exam_name,
                "created_at": format_utc_timestamp(
                    reading.created_at
                )
            })

        return jsonify(result), 200

    except Exception as error:

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Unable to retrieve noise readings.",
            "detail": str(error)
        }), 500


# ==========================================================
# CREATE NOISE READING
# ==========================================================

@noise_bp.route("/readings", methods=["POST"])
def create_noise_reading():

    data = request.get_json(silent=True) or {}

    hall_id = data.get("hall_id")
    value = data.get("value")
    device_id = data.get("device_id")

    if hall_id is None or value is None:
        return jsonify({
            "status": "error",
            "message": "hall_id and value are required."
        }), 400

    try:
        hall_id = int(hall_id)
        value = float(value)

        if not 0 <= value <= 200:
            return jsonify({
                "status": "error",
                "message": "Invalid noise reading."
            }), 400

        hall = db.session.get(Hall, hall_id)

        if hall is None:
            return jsonify({
                "status": "error",
                "message": "Hall not found."
            }), 404

        current_time = utc_now_naive()
        exam_details = get_exam_details(hall_id)

        # Preserve incoming sensor information and attach
        # the exam associated with this event.
        payload = dict(data)
        payload.update(exam_details)

        event = DeviceEvent(
            hall_id=hall_id,
            device_id=device_id,
            event_type="NOISE",
            value=value,
            unit=data.get("unit", "sensor"),
            message=data.get(
                "message",
                "Noise sensor reading received."
            ),
            raw_payload=payload,
            created_at=current_time
        )

        db.session.add(event)
        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Noise reading stored successfully.",
            "reading_id": event.id,
            "hall_id": hall_id,
            "exam_id": exam_details["exam_id"],
            "exam_name": exam_details["exam_name"],
            "created_at": format_utc_timestamp(
                event.created_at
            )
        }), 201

    except (ValueError, TypeError):

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Invalid hall ID or noise reading."
        }), 400

    except Exception:

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Unable to store noise reading."
        }), 500


# ==========================================================
# CREATE REPEATED NOISE ALERT
# ==========================================================

@noise_bp.route("/repeated-alert", methods=["POST"])
def create_repeated_noise_alert():

    data = request.get_json(silent=True) or {}

    hall_id = data.get("hall_id")
    device_id = data.get("device_id")
    detections = data.get("detections")
    window_seconds = data.get("window_seconds")

    if (
        hall_id is None
        or detections is None
        or window_seconds is None
    ):
        return jsonify({
            "status": "error",
            "message": (
                "hall_id, detections and window_seconds are required."
            )
        }), 400

    try:
        hall_id = int(hall_id)
        detections = int(detections)
        window_seconds = int(window_seconds)

        if detections < 5 or not 1 <= window_seconds <= 10:
            return jsonify({
                "status": "error",
                "message": (
                    "At least 5 detections within 10 seconds "
                    "are required."
                )
            }), 400

        hall = db.session.get(Hall, hall_id)

        if hall is None:
            return jsonify({
                "status": "error",
                "message": "Hall not found."
            }), 404

        current_time = utc_now_naive()

        # Identify the exam running in this hall.
        exam_details = get_exam_details(hall_id)

        event_message = (
            f"Repeated noise detected {detections} times "
            f"within {window_seconds} seconds."
        )

        if exam_details["exam_id"] is not None:
            event_message += (
                f" Exam: {exam_details['exam_name']}."
            )

        # Save exam information in existing JSON field.
        event_payload = dict(data)
        event_payload.update(exam_details)

        event = DeviceEvent(
            hall_id=hall_id,
            device_id=device_id,
            event_type="NOISE",
            value=detections,
            unit="events",
            message=event_message,
            raw_payload=event_payload,
            created_at=current_time
        )

        db.session.add(event)

        alert_message = (
            f"HIGH NOISE ALERT in {hall.code}: "
            f"{detections} noise detections within "
            f"{window_seconds} seconds."
        )

        if exam_details["exam_id"] is not None:
            alert_message += (
                f" Examination: {exam_details['exam_name']}."
            )
        else:
            alert_message += " No active examination was found."

        alert_message += " Please check the examination hall."

        alert = Alert(
            hall_id=hall_id,
            device_id=device_id,
            alert_type="NOISE",
            severity="HIGH",
            message=alert_message,
            value=detections,
            status="OPEN",
            metadata_json={
                **event_payload,
                "event_id": None
            },
            created_at=current_time
        )

        db.session.add(alert)
        db.session.flush()

        # Store the related event ID in alert metadata.
        alert_metadata = dict(alert.metadata_json or {})
        alert_metadata["event_id"] = event.id
        alert.metadata_json = alert_metadata

        db.session.commit()

        return jsonify({
            "status": "success",
            "message": "Repeated noise alert created successfully.",
            "event_id": event.id,
            "alert_id": alert.id,
            "hall_id": hall_id,
            "hall_code": hall.code,
            "exam_id": exam_details["exam_id"],
            "exam_name": exam_details["exam_name"],
            "detections": detections,
            "window_seconds": window_seconds,
            "severity": "HIGH",
            "created_at": format_utc_timestamp(
                alert.created_at
            )
        }), 201

    except (ValueError, TypeError):

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Invalid alert data."
        }), 400

    except Exception:

        db.session.rollback()

        return jsonify({
            "status": "error",
            "message": "Unable to create repeated noise alert."
        }), 500
