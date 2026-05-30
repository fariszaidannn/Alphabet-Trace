import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify, render_template
from finger_tracker import track_finger
from letter_validator import validate_trace
from letter_library import get_letter, get_all_chars
from stroke_analyzer import analyze_stroke
from frame_filter import apply_filter

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/track", methods=["POST"])
def track():
    data = request.get_json(silent=True)
    if not data or "frame" not in data:
        return jsonify({"error": "Missing frame data."}), 400
    try:
        result = track_finger(data["frame"])
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(result)


@app.route("/validate", methods=["POST"])
def validate():
    data = request.get_json(silent=True)
    if not data or "letter" not in data or "path" not in data:
        return jsonify({"error": "Missing letter or path."}), 400

    letter_data = get_letter(data["letter"])
    if not letter_data:
        return jsonify({"error": "Unknown letter."}), 404

    result = validate_trace(
        letter=data["letter"],
        path=data["path"],
        waypoints=letter_data["waypoints"],
    )
    return jsonify(result)


@app.route("/analyze-shape", methods=["POST"])
def analyze_shape():
    data = request.get_json(silent=True)
    if not data or "letter" not in data or "path" not in data:
        return jsonify({"error": "Missing letter or path."}), 400

    letter_data = get_letter(data["letter"])
    if not letter_data:
        return jsonify({"error": "Unknown letter."}), 404

    expected = letter_data.get("expected_shapes", {"lines": True, "circles": False})
    result = analyze_stroke(data["path"], expected)
    return jsonify(result)


@app.route("/filter", methods=["POST"])
def filter_frame():
    data = request.get_json(silent=True)
    if not data or "frame" not in data or "mode" not in data:
        return jsonify({"error": "Missing frame or mode."}), 400
    if data["mode"] == "normal":
        return jsonify({"filtered": None})
    try:
        _, encoded = data["frame"].split(",", 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        result = apply_filter(img_bgr, data["mode"])
        _, buf = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 60])
        b64 = base64.b64encode(buf).decode()
        return jsonify({"filtered": f"data:image/jpeg;base64,{b64}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/letter/<char>")
def letter(char: str):
    data = get_letter(char)
    if not data:
        return jsonify({"error": "Unknown letter."}), 404
    return jsonify({"char": char, **data})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
