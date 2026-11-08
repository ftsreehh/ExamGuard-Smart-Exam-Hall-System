from flask import Blueprint, jsonify

from models.hall import Hall


halls_bp = Blueprint(
    "halls",
    __name__,
    url_prefix="/api/halls"
)


@halls_bp.get("")
def get_halls():
    halls = Hall.query.order_by(Hall.id.asc()).all()

    return jsonify([
        {
            "id": hall.id,
            "code": hall.code,
            "name": hall.name,
            "floor": hall.floor,
            "capacity": hall.capacity,
            "noise_threshold": hall.noise_threshold,
            "rf_threshold": hall.rf_threshold,
            "is_active": hall.is_active
        }
        for hall in halls
    ])