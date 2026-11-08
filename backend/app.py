
import os

from flask import Flask
from flask_cors import CORS
from flask_login import LoginManager

from config import DATABASE_URL
from extensions import db


# ==========================================
# DATABASE MODELS
# ==========================================

from models.admin import Admin
from models.user import User
from models.hall import Hall
from models.device import HallDevice
from models.exam import Exam
from models.sensor_reading import SensorReading
from models.event import DeviceEvent, Alert

from models.attendance import Attendance
from models.student import Student
from models.exam_invigilator import ExamInvigilator


# ==========================================
# ROUTE IMPORTS
# ==========================================

from routes.halls import halls_bp
from routes.exams import exams_bp
from routes.alerts import alerts_bp
from routes.noise import noise_bp
from routes.auth import auth_bp
from routes.incidents import incidents_bp
from routes.attendance import attendance_bp
from routes.students import students_bp


# ==========================================
# CREATE FLASK APPLICATION
# ==========================================

app = Flask(__name__)


# ==========================================
# APPLICATION CONFIGURATION
# ==========================================

app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")

if not app.config["SECRET_KEY"]:
    raise RuntimeError(
        "SECRET_KEY is missing from environment variables. "
        "Please configure it in your .env file."
    )

app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False


# ==========================================
# INITIALIZE DATABASE
# ==========================================

db.init_app(app)


# ==========================================
# FLASK-LOGIN CONFIGURATION
# ==========================================

login_manager = LoginManager()
login_manager.init_app(app)


@login_manager.user_loader
def load_user(user_id):

    if not user_id:
        return None

    try:
        account_type, account_id = user_id.split(":", 1)
        account_id = int(account_id)

    except (ValueError, AttributeError):
        return None

    if account_type == "admin":
        return db.session.get(Admin, account_id)

    if account_type == "invigilator":
        return db.session.get(User, account_id)

    return None


# ==========================================
# CORS CONFIGURATION
# ==========================================

CORS(
    app,
    supports_credentials=True,
    origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
)


# ==========================================
# REGISTER BLUEPRINTS
# ==========================================

app.register_blueprint(halls_bp)
app.register_blueprint(exams_bp)
app.register_blueprint(alerts_bp)
app.register_blueprint(noise_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(students_bp)
app.register_blueprint(incidents_bp)


# ==========================================
# HOME ENDPOINT
# ==========================================

@app.get("/")
def home():

    return {
        "success": True,
        "message": "ExamGuard Smart Exam Hall System API is running",
        "status": "success"
    }, 200


# ==========================================
# DATABASE HEALTH CHECK
# ==========================================

@app.get("/api/health")
def health():

    try:

        with db.engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")

        return {
            "success": True,
            "status": "healthy",
            "database": "connected"
        }, 200

    except Exception:

        app.logger.exception(
            "Database health check failed"
        )

        return {
            "success": False,
            "status": "error",
            "database": "disconnected",
            "message": "Unable to connect to the database."
        }, 500


# ==========================================
# RUN APPLICATION
# ==========================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
