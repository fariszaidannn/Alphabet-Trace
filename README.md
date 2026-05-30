# AlphaTrace ✏️

**AI-powered handwriting tracing for learning the English alphabet.**

AlphaTrace lets you practice writing letters A–Z (uppercase and lowercase) by tracing them in the air with your index finger. Your webcam tracks your hand in real time, validates your trace against the correct path, and celebrates when you get it right.

---

## Demo

> Point your index finger at the camera and trace the letter shown on screen. Hit enough waypoints and the letter lights up with confetti and sound.

---

## Features

- **Real-time finger tracking** — MediaPipe hand landmark detection at 16 FPS
- **52 letters** — full uppercase A–Z and lowercase a–z with individual reference paths
- **Waypoint validation** — each letter has 8–20 checkpoints; hit 80% to complete it
- **Shape analysis** — after each letter, OpenCV scores how well your strokes matched the expected lines and curves
- **Celebration feedback** — confetti, sound, and animations for each completed letter
- **Procedural audio** — all sounds synthesized via Web Audio API, no audio files
- **Image filters** — switch between Normal, Sobel edge detection, and Harris corner detection views
- **Progress tracking** — completion state persisted per session, star counter for each case
- **Zero frontend dependencies** — plain ES6, HTML5 Canvas, no framework or build step

---

## Tech Stack

| | |
|---|---|
| **Backend** | Python, Flask, MediaPipe, OpenCV, NumPy |
| **Frontend** | Vanilla JavaScript (ES6), HTML5 Canvas, Web Audio API |
| **ML Model** | MediaPipe Hand Landmarker |

---

## Getting Started

**Requirements:** Python 3.10+, a webcam, a modern browser.

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/AlphaTrace.git
cd AlphaTrace/alpha_trace

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Start the server
python app.py
```

Open **http://localhost:5000** in your browser and allow camera access when prompted.

---

## Usage

1. Click a letter in the alphabet grid on the right, or use the Prev / Next buttons.
2. Turn your camera on with the **Camera** toggle.
3. Hold your hand up so your index finger is visible.
4. Trace the dashed blue guide path shown on screen.
5. Waypoints glow as you hit them. Reach 80% and the letter is complete!
6. Toggle to **abc** mode in the sidebar to practice lowercase letters.

### URL Parameters

| Parameter | Default | Effect |
|---|---|---|
| `?tol=0.06` | `0.06` | Waypoint hit tolerance (lower = stricter) |
| `?fps=16` | `16` | Camera capture rate |

---

## Project Structure

```
alpha_trace/
├── app.py                  # Flask server & REST API
├── finger_tracker.py       # MediaPipe hand detection
├── letter_validator.py     # Waypoint validation
├── stroke_analyzer.py      # OpenCV line/curve analysis
├── frame_filter.py         # Sobel & Harris filters
├── letter_library.py       # Letter data loader
├── letters/paths.json      # 52 letter SVG paths & waypoints
├── templates/index.html    # Single-page HTML shell
└── static/
    ├── css/style.css
    └── js/
        ├── main.js         # App state & event wiring
        ├── camera.js       # Webcam stream
        ├── canvas.js       # Canvas rendering
        ├── validator.js    # Client-side validation
        ├── celebrate.js    # Confetti animation
        ├── filter.js       # Filter pipeline
        └── sounds.js       # Audio synthesis
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Main page |
| `POST` | `/track` | Send a frame, receive finger `{x, y, confidence}` |
| `POST` | `/validate` | Validate a completed trace |
| `POST` | `/analyze-shape` | Get shape quality score and hint |
| `POST` | `/filter` | Apply a filter to a frame |
| `GET` | `/letter/<char>` | Get letter SVG path, waypoints, and metadata |

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## License

MIT
