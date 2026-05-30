import cv2
import numpy as np


def render_path_to_image(path_points, img_size=200):
    img = np.zeros((img_size, img_size), dtype=np.uint8)
    if len(path_points) < 2:
        return img
    pts = [(int(p['x'] * (img_size - 1)), int(p['y'] * (img_size - 1))) for p in path_points]
    for i in range(len(pts) - 1):
        cv2.line(img, pts[i], pts[i + 1], 255, thickness=3)
    return img


def detect_lines(img):
    edges = cv2.Canny(img, 50, 150)
    lines = cv2.HoughLinesP(edges, rho=1, theta=np.pi / 180, threshold=20,
                             minLineLength=25, maxLineGap=10)
    if lines is None:
        return [], 0
    segments = [(int(l[0][0]), int(l[0][1]), int(l[0][2]), int(l[0][3])) for l in lines]
    return segments, len(segments)


def detect_circles(img):
    blurred = cv2.GaussianBlur(img, (9, 9), 2)
    circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, dp=1.2, minDist=30,
                                param1=50, param2=25, minRadius=15, maxRadius=80)
    if circles is None:
        return [], 0
    result = [(int(c[0]), int(c[1]), int(c[2])) for c in circles[0]]
    return result, len(result)


def analyze_stroke(path_points, expected_shapes):
    img = render_path_to_image(path_points)
    line_segs, lines_count = detect_lines(img)
    circle_list, circles_count = detect_circles(img)

    exp_lines = expected_shapes.get('lines', False)
    exp_circles = expected_shapes.get('circles', False)

    lines_match = exp_lines and lines_count > 0
    circles_match = exp_circles and circles_count > 0

    if exp_lines and exp_circles:
        score = (0.5 if lines_match else 0.0) + (0.5 if circles_match else 0.0)
        if lines_match and circles_match:
            feedback = "Perfect mix of lines and curves! \U0001f4d0⭕"
        elif lines_match:
            feedback = "Good lines! Try to make your curves rounder. ⭕"
        elif circles_match:
            feedback = "Nice curves! Try to keep your strokes straighter. \U0001f4cf"
        else:
            feedback = "Keep practicing — trace the letter carefully!"
    elif exp_lines:
        score = 1.0 if lines_match else 0.0
        feedback = "Great straight lines! \U0001f4cf" if lines_match else "Try to keep your strokes straighter! \U0001f4cf"
    elif exp_circles:
        score = 1.0 if circles_match else 0.0
        feedback = "Nice round curves! ⭕" if circles_match else "Try to make your curves rounder! ⭕"
    else:
        score = 0.0
        feedback = "Keep practicing!"

    details = [{"type": "line", "x1": s[0], "y1": s[1], "x2": s[2], "y2": s[3]} for s in line_segs]
    details += [{"type": "circle", "cx": c[0], "cy": c[1], "r": c[2]} for c in circle_list]

    return {
        "lines_detected": lines_count,
        "circles_detected": circles_count,
        "expected_lines": exp_lines,
        "expected_circles": exp_circles,
        "shape_score": round(score, 2),
        "feedback": feedback,
        "details": details,
    }
