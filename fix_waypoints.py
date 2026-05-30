"""
Recompute waypoints for curved letters by sampling actual bezier curves.
Normalized coord = SVG coord / 200 (both axes).
"""
import json, re, os

PATH = os.path.join(os.path.dirname(__file__), "alpha_trace", "letters", "paths.json")

# ── Bezier samplers ──────────────────────────────────────────────────────────

def cubic(P0, P1, P2, P3, t):
    u = 1 - t
    return [
        u**3*P0[0] + 3*u**2*t*P1[0] + 3*u*t**2*P2[0] + t**3*P3[0],
        u**3*P0[1] + 3*u**2*t*P1[1] + 3*u*t**2*P2[1] + t**3*P3[1],
    ]

def sample_cubic(P0, P1, P2, P3, steps):
    """Return `steps+1` points at t=0,1/steps,...,1."""
    return [cubic(P0, P1, P2, P3, i / steps) for i in range(steps + 1)]

def lerp(A, B, t):
    return [A[0] + (B[0]-A[0])*t, A[1] + (B[1]-A[1])*t]

def sample_line(A, B, steps):
    return [lerp(A, B, i / steps) for i in range(steps + 1)]

def n(pt):
    """Normalise SVG point to 0-1, clamped to [0.01, 0.99]."""
    return {
        "x": round(min(max(pt[0] / 200, 0.01), 0.99), 3),
        "y": round(min(max(pt[1] / 200, 0.01), 0.99), 3),
    }

# ── Build waypoints per letter ───────────────────────────────────────────────
# Each letter is described as a list of strokes.
# Each stroke is a list of (x,y) waypoints in SVG space,
# produced by sampling the relevant curve/line segments.
# The first point of stroke 2+ is the 'jump-back' anchor already in paths.json
# (we keep it so the order structure stays the same).

def wp_B():
    # Stroke 1: vertical line (50,20)→(50,180), 7 pts
    s1 = sample_line([50,20],[50,180], 6)
    # Stroke 2: back to top, top bump C(50,20)→(130,20)→(130,98)→(50,100)
    top = sample_cubic([50,20],[130,20],[130,98],[50,100], 5)   # 6 pts incl endpoints
    # Stroke 3 (continuing): bottom bump C(50,100)→(135,102)→(135,180)→(50,180)
    bot = sample_cubic([50,100],[135,102],[135,180],[50,180], 5)
    # Order: s1[0..6], top[0..5] (starting from top[0]=s1[0]), bot[1..5]
    pts = s1 + top + bot[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_C():
    # svg_path: M150,50 C120,10 50,10 35,100 C35,180 115,195 155,155
    # Two cubic beziers chained.
    seg1 = sample_cubic([150,50],[120,10],[50,10],[35,100], 6)   # 7 pts
    seg2 = sample_cubic([35,100],[35,180],[115,195],[155,155], 5) # 6 pts
    pts = seg1 + seg2[1:]   # drop duplicate junction
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_D():
    # svg_path: M50,20 L50,180  M50,20 C165,20 165,180 50,180
    s1 = sample_line([50,20],[50,180], 6)           # 7 pts
    curve = sample_cubic([50,20],[165,20],[165,180],[50,180], 7)  # 8 pts
    pts = s1 + curve
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_G():
    # svg_path: M150,50 C120,10 50,10 35,100 C35,185 115,200 155,155 L155,100 L100,100
    seg1 = sample_cubic([150,50],[120,10],[50,10],[35,100], 5)
    seg2 = sample_cubic([35,100],[35,185],[115,200],[155,155], 5)
    shelf = sample_line([155,155],[155,100], 2) + sample_line([155,100],[100,100], 2)
    pts = seg1 + seg2[1:] + shelf[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_J():
    # svg_path: M80,20 L130,20  M110,20 L110,155 C110,195 45,195 40,155
    top_bar = sample_line([80,20],[130,20], 2)         # 3 pts
    stem    = sample_line([110,20],[110,155], 5)        # 6 pts
    hook    = sample_cubic([110,155],[110,195],[45,195],[40,155], 4)  # 5 pts
    pts = top_bar + stem[1:] + hook[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_O():
    # svg_path: M100,20 C160,20 175,180 100,180 C25,180 25,20 100,20
    seg1 = sample_cubic([100,20],[160,20],[175,180],[100,180], 8)
    seg2 = sample_cubic([100,180],[25,180],[25,20],[100,20], 8)
    pts = seg1 + seg2[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_P():
    # svg_path: M50,180 L50,20  M50,20 C145,20 145,100 50,100
    s1    = sample_line([50,180],[50,20], 4)             # 5 pts (bottom to top)
    bump  = sample_cubic([50,20],[145,20],[145,100],[50,100], 6)  # 7 pts
    pts   = s1 + bump
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_Q():
    # svg_path: M100,20 C160,20 175,180 100,180 C25,180 25,20 100,20  M120,150 L158,185
    seg1 = sample_cubic([100,20],[160,20],[175,180],[100,180], 8)
    seg2 = sample_cubic([100,180],[25,180],[25,20],[100,20], 8)
    tail = sample_line([120,150],[158,185], 3)
    pts  = seg1 + seg2[1:] + tail
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_R():
    # svg_path: M50,180 L50,20  M50,20 C145,20 145,100 50,100  M50,100 L155,180
    s1   = sample_line([50,180],[50,20], 4)
    bump = sample_cubic([50,20],[145,20],[145,100],[50,100], 6)
    leg  = sample_line([50,100],[155,180], 4)
    pts  = s1 + bump + leg[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_S():
    # svg_path: M148,45 C115,5 42,30 50,90 C58,145 148,150 148,190 C148,220 75,210 42,178
    # The last bezier's control points exceed y=200, so sample it at t=0.7 and 1.0 only
    # to keep all waypoints inside the visible area.
    seg1 = sample_cubic([148,45],[115,5],[42,30],[50,90],  5)
    seg2 = sample_cubic([50,90],[58,145],[148,150],[148,190], 5)
    seg3 = [
        cubic([148,190],[148,220],[75,210],[42,178], 0.7),
        [42, 178],  # endpoint
    ]
    pts  = seg1 + seg2[1:] + seg3
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

def wp_U():
    # svg_path: M50,20 L50,145 C50,195 150,195 150,145 L150,20
    left  = sample_line([50,20],[50,145], 4)
    curve = sample_cubic([50,145],[50,195],[150,195],[150,145], 5)
    right = sample_line([150,145],[150,20], 4)
    pts   = left + curve[1:] + right[1:]
    return [{"x": n(p)["x"], "y": n(p)["y"], "order": i} for i, p in enumerate(pts)]

# ── Patch paths.json ──────────────────────────────────────────────────────────

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

patches = {
    "B": wp_B(),
    "C": wp_C(),
    "D": wp_D(),
    "G": wp_G(),
    "J": wp_J(),
    "O": wp_O(),
    "P": wp_P(),
    "Q": wp_Q(),
    "R": wp_R(),
    "S": wp_S(),
    "U": wp_U(),
}

for ch, wps in patches.items():
    data[ch]["waypoints"] = wps

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print("Done. Waypoints updated for:", ", ".join(sorted(patches)))
for ch, wps in patches.items():
    print(f"  {ch}: {len(wps)} waypoints")
