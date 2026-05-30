import base64
import os
import urllib.request

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# Model is downloaded on first run (≈ 3 MB)
_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "hand_landmarker.task")


def _ensure_model():
    if not os.path.exists(_MODEL_PATH):
        print("[AlphaTrace] Downloading hand landmarker model (~3 MB)...")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL_PATH)
        print("[AlphaTrace] Model ready.")


_detector = None


def _get_detector():
    global _detector
    if _detector is None:
        _ensure_model()
        # Use model_asset_buffer to avoid path encoding issues on non-ASCII paths
        with open(_MODEL_PATH, "rb") as f:
            model_bytes = f.read()
        base_options = mp_python.BaseOptions(model_asset_buffer=model_bytes)
        options = mp_vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=1,
            min_hand_detection_confidence=0.7,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        _detector = mp_vision.HandLandmarker.create_from_options(options)
    return _detector


def decode_frame(data_url: str) -> np.ndarray:
    _, encoded = data_url.split(",", 1)
    jpg_bytes = base64.b64decode(encoded)
    arr = np.frombuffer(jpg_bytes, np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Failed to decode frame.")
    return cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)


def track_finger(data_url: str) -> dict:
    try:
        img_rgb = decode_frame(data_url)
    except Exception as e:
        return {"error": str(e)}

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)
    result = _get_detector().detect(mp_image)

    if not result.hand_landmarks:
        return {"detected": False}

    lm = result.hand_landmarks[0]
    tip = lm[8]  # INDEX_FINGER_TIP

    confidence = 1.0
    if result.handedness:
        confidence = result.handedness[0][0].score

    return {
        "detected": True,
        "x": float(tip.x),
        "y": float(tip.y),
        "confidence": float(confidence),
    }
