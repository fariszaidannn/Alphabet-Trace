# AlphaTrace — Full Application Documentation

## Overview

AlphaTrace is an interactive, AI-powered handwriting tracing and letter recognition application for learning the English alphabet. Users trace uppercase and lowercase letters in the air using their index finger in front of a webcam. The application detects the finger in real time, validates the trace against a reference path, and rewards correct performance with animations and sound.

**Target audience:** Children and beginner language learners starting their alphabet journey.

---

## Architecture

The application is a client-server web app built with a **Flask** backend and a **vanilla JavaScript** frontend. There is no frontend build step — all JS is modular ES6 loaded directly in the browser.

```
AlphaTrace - Faris/
├── alpha_trace/                    # Main Flask package
│   ├── app.py                      # Flask server & REST API
│   ├── requirements.txt            # Python dependencies
│   ├── hand_landmarker.task        # MediaPipe ML model (binary, ~3 MB)
│   ├── finger_tracker.py           # Webcam frame → finger coordinates
│   ├── letter_validator.py         # Waypoint hit-detection logic
│   ├── letter_library.py           # Loads letter data from paths.json
│   ├── stroke_analyzer.py          # Line/curve shape detection (OpenCV)
│   ├── frame_filter.py             # Sobel & Harris image filters
│   ├── letters/
│   │   └── paths.json              # 52 letter definitions (26 upper + 26 lower)
│   ├── templates/
│   │   └── index.html              # Single-page HTML shell
│   └── static/
│       ├── css/style.css           # Dark-themed responsive stylesheet
│       └── js/
│           ├── main.js             # App state machine & event wiring
│           ├── camera.js           # Webcam stream management
│           ├── canvas.js           # Canvas rendering (guide, trail, waypoints)
│           ├── validator.js        # Client-side waypoint validation
│           ├── celebrate.js        # Confetti physics animation
│           ├── filter.js           # Image filter pipeline
│           └── sounds.js           # Web Audio API sound generation
├── add_lowercase.py                # Utility: regenerate lowercase waypoints
└── fix_waypoints.py                # Utility: fix waypoints for curved letters
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3.10+ |
| Web framework | Flask 3.0+ |
| Computer vision | OpenCV 4.8+ |
| Hand tracking ML | MediaPipe 0.10+ |
| Array math | NumPy 1.24+ |
| Frontend language | Vanilla JavaScript (ES6, no framework) |
| Rendering | HTML5 Canvas 2D |
| Audio | Web Audio API (procedural, no audio files) |
| Fonts | Google Fonts — Nunito |

---

## Features

### 1. Letter Selection & Navigation

- A grid of all 26 alphabet letters is shown in the sidebar.
- Toggle between **Uppercase (ABC)** and **Lowercase (abc)** modes independently.
- Click any letter in the grid to jump to it directly.
- Previous / Next buttons for sequential left-to-right progression.
- Each letter cell shows a star (★) once completed.

### 2. Real-Time Finger Tracking

The webcam stream is captured at **640×480, 16 FPS** (configurable via `?fps=`). Each frame is sent as a JPEG to `POST /track` on the Flask server.

**Pipeline:**
1. Frame arrives as base64 JPEG.
2. MediaPipe Hand Landmarker detects up to 2 hands.
3. Index finger tip (landmark #8) coordinates are extracted.
4. X-coordinate is mirrored to match the flipped video display.
5. Normalized (0–1) coordinates and a detection confidence score are returned to the client.

The MediaPipe model is loaded from an in-memory buffer to avoid path-encoding issues on non-ASCII Windows paths.

### 3. Letter Guide & Visual Trail

The canvas layer displays:

- **Dashed blue guide path** — the reference SVG bezier path for the current letter, scaled and centered.
- **Waypoint circles** — small rings at each validation checkpoint, turning filled when hit.
- **Traced trail** — the user's recent finger path drawn in real time (fades as waypoints are hit).
- **Progress bar** — percentage of waypoints hit so far.

### 4. Waypoint Validation

Each letter is defined by **8–20+ waypoints** sampled from its SVG path. Validation runs both on the client (for low latency) and optionally on the server.

**Algorithm:**
- Maintain a current waypoint index.
- On each frame, check a window of ±2 waypoints around the current index.
- A hit is registered if the Euclidean distance between the finger and the waypoint is within the **tolerance threshold** (default: `0.06` in normalized 0–1 space; tunable via `?tol=`).
- Waypoints must be hit in sequence.
- **Completion threshold:** 80% of waypoints hit triggers the celebration sequence.

### 5. Shape Analysis

After a letter is completed, the server performs optional shape quality feedback via `POST /analyze-shape`.

- The traced path is rendered to a **200×200 grayscale image**.
- **Hough Line Transform** detects straight segments.
- **Hough Circle Transform** detects circular arcs.
- A conformance score is computed against the letter's expected shape (line-dominant vs. curve-dominant).
- Contextual hints are shown: e.g., *"Good lines! Try to make your curves rounder."*

### 6. Image Filters

Three visual modes selectable from the sidebar:

| Filter | Effect |
|---|---|
| Normal | Standard live camera feed |
| Sobel | Edge detection with HSV color mapping |
| Harris | Corner detection with magenta dot overlays |

**Performance safety:** If any filter takes longer than **400 ms** for 5 consecutive frames, it auto-reverts to Normal with a toast notification.

### 7. Audio Feedback

All sounds are generated programmatically via Web Audio API — no audio files are used.

| Event | Sound |
|---|---|
| Waypoint hit | Bright ping, 900 → 1300 Hz |
| Letter completed | Rising arpeggio chime |
| All 26 letters done | Triumphant fanfare |

### 8. Celebration Animations

When a letter is completed:
- A **confetti burst** of 60 physics-simulated particles fires from the canvas.
- A **"⭐ Well done!"** overlay flashes on screen.
- A CSS flash animation highlights the letter guide.
- Interaction is locked during the celebration sequence via a `_celebrating` flag.

### 9. Progress Tracking

- Completion state is stored in **sessionStorage** separately for uppercase and lowercase.
- A star counter (★ X / 26 letters) is shown at the top.
- When all 26 letters in one case are completed, a modal appears offering to switch to the other case.

---

## REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Serves the main HTML page |
| POST | `/track` | Accepts a base64 JPEG frame, returns `{x, y, confidence}` |
| POST | `/validate` | Validates a traced letter against waypoints |
| POST | `/analyze-shape` | Returns shape conformance score and hint text |
| POST | `/filter` | Applies a named filter to a frame, returns filtered JPEG |
| GET | `/letter/<char>` | Returns letter SVG path, waypoints, metadata (hints, stroke count) |

---

## Letter Data Format (`paths.json`)

Each entry in `paths.json` defines one letter:

```json
{
  "A": {
    "path": "M 100 180 L 50 20 L 150 20 M 70 100 L 130 100",
    "waypoints": [[0.5, 0.1], [0.3, 0.9], [0.7, 0.9], ...],
    "strokes": 2,
    "hints": "Start at the top, draw two diagonal strokes, then add the crossbar.",
    "expected_shapes": ["line"]
  }
}
```

52 letters are defined: 26 uppercase and 26 lowercase. Lowercase waypoints were generated procedurally from hand-authored bezier control points using `add_lowercase.py`.

---

## Configuration

| Parameter | Default | How to Set |
|---|---|---|
| Waypoint tolerance | `0.06` | URL param `?tol=0.06` |
| Camera FPS | `16` | URL param `?fps=16` |
| Server host | `0.0.0.0` | `app.py` |
| Server port | `5000` | `app.py` |

---

## Running the Application

```bash
cd alpha_trace
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` in a browser. Allow camera access when prompted.

---

## Utility Scripts

### `add_lowercase.py`

Regenerates all 26 lowercase letter waypoints from hand-authored bezier curves. Run this if lowercase paths need to be re-derived from scratch. Output is written back into `letters/paths.json`.

### `fix_waypoints.py`

Fixes the 11 curved letters (B, C, D, G, J, O, P, Q, R, S, U) whose waypoints had been sampled incorrectly. It drops the old waypoints and resamples them from cubic bezier control points with precise interpolation, ensuring waypoints lie exactly on the visible drawn strokes.

---

## Notable Implementation Details

- **Non-ASCII path workaround:** MediaPipe is loaded via `model_asset_buffer` (reading the `.task` file into memory first) rather than a file path, because the project directory contains Turkish characters which MediaPipe's C++ layer cannot handle on Windows.
- **Dual validation:** Waypoint checking runs on both the client (immediate feedback) and server (ground truth). The client-side validator mirrors the server algorithm exactly.
- **Session vs. local storage:** `sessionStorage` is used intentionally — progress resets when the browser tab is closed, keeping sessions fresh for repeated practice.
- **Procedural audio only:** No audio files are bundled. Every sound is synthesized on-the-fly with oscillators and gain envelopes via Web Audio API.
- **No frontend framework:** The frontend is pure ES6 JavaScript organized as closure-based modules (Camera, Canvas, Validator, etc.). No build step, no bundler, no dependencies.
