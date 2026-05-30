import math
from typing import List


def _dist(a: dict, b: dict) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def validate_trace(letter: str, path: List[dict], waypoints: List[dict], tolerance: float = 0.06) -> dict:
    if not waypoints or not path:
        return {"complete": False, "score": 0.0, "waypoints_hit": 0, "total": len(waypoints)}

    hit = [False] * len(waypoints)
    next_idx = 0

    for point in path:
        window_end = min(next_idx + 3, len(waypoints))
        for idx in range(next_idx, window_end):
            if not hit[idx] and _dist(point, waypoints[idx]) <= tolerance:
                hit[idx] = True
                if idx == next_idx:
                    while next_idx < len(waypoints) and hit[next_idx]:
                        next_idx += 1

    waypoints_hit = sum(hit)
    total = len(waypoints)
    score = waypoints_hit / total if total > 0 else 0.0
    complete = score >= 0.80

    return {
        "complete": complete,
        "score": round(score, 3),
        "waypoints_hit": waypoints_hit,
        "total": total,
    }
