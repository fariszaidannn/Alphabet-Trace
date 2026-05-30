"""
Regenerate all 26 lowercase letter waypoints.
Every waypoint is sampled from the same bezier/line segments that appear
in the SVG path — so dots lie exactly on the drawn stroke.
"""
import json, os

PATH = os.path.join(os.path.dirname(__file__), "alpha_trace", "letters", "paths.json")

# ── Geometry helpers ────────────────────────────────────────────────────────
def lerp(A, B, t):
    return [A[0] + (B[0]-A[0])*t, A[1] + (B[1]-A[1])*t]

def cubic(P0, P1, P2, P3, t):
    u = 1-t
    return [u**3*P0[0] + 3*u**2*t*P1[0] + 3*u*t**2*P2[0] + t**3*P3[0],
            u**3*P0[1] + 3*u**2*t*P1[1] + 3*u*t**2*P2[1] + t**3*P3[1]]

def sl(A, B, n):
    """n+1 evenly-spaced points on segment A→B."""
    return [lerp(A, B, i/n) for i in range(n+1)]

def sc(P0, P1, P2, P3, n):
    """n+1 evenly-spaced points on cubic bezier P0..P3."""
    return [cubic(P0, P1, P2, P3, i/n) for i in range(n+1)]

def chain(*segs):
    """Concatenate segments, dropping duplicate junction points."""
    out = list(segs[0])
    for s in segs[1:]:
        out += list(s)[1:]
    return out

def norm(pts):
    return [{"x": round(min(max(p[0]/200, 0.01), 0.99), 3),
             "y": round(min(max(p[1]/200, 0.01), 0.99), 3),
             "order": i} for i, p in enumerate(pts)]

# ── Zone constants (SVG 0-200 space) ────────────────────────────────────────
T  = 68   # x-height top
B  = 158  # baseline
A  = 22   # ascender top
D  = 192  # descender bottom
L  = 58   # body left
R  = 142  # body right
CX = 100  # center-x
MY = 113  # (T+B)//2  mid-y

# ── Per-letter waypoint builders ─────────────────────────────────────────────
# Every sc/sl call matches the bezier/line data in the SVG path string below it.

# a ── M142,113 C142,68 58,68 58,113 C58,158 142,158 142,113 L142,158
def lc_a():
    top  = sc([R,MY],  [R,T],   [L,T],   [L,MY],  5)   # upper arc right→left
    bot  = sc([L,MY],  [L,B],   [R,B],   [R,MY],  5)   # lower arc left→right
    stem = sl([R,MY],  [R,B],   3)                       # stem down
    return norm(chain(top, bot, stem))

# b ── M62,22 L62,158  M62,76 C62,56 146,56 146,113 C146,170 62,170 62,158
def lc_b():
    stem = sl([L+4,A],     [L+4,B],        5)
    bTop = sc([L+4,T+8],   [L+4,T-12], [R+4,T-12], [R+4,MY], 4)
    bBot = sc([R+4,MY],    [R+4,B+12], [L+4,B+12], [L+4,B],  4)
    return norm(chain(stem, bTop, bBot))

# c ── M142,84 C142,68 58,68 58,113 C58,158 142,158 142,144
def lc_c():
    top = sc([R,T+16], [R,T],   [L,T],   [L,MY],    5)
    bot = sc([L,MY],   [L,B],   [R,B],   [R,B-14],  5)
    return norm(chain(top, bot))

# d ── M138,113 C138,68 58,68 58,113 C58,158 138,158 138,113 L138,22
def lc_d():
    top  = sc([R-4,MY], [R-4,T],  [L,T],    [L,MY],    5)
    bot  = sc([L,MY],   [L,B],    [R-4,B],  [R-4,MY],  5)
    stem = sl([R-4,MY], [R-4,A],  5)
    return norm(chain(top, bot, stem))

# e ── M58,113 L142,113 C142,68 58,68 58,113 C58,158 132,158 144,140
def lc_e():
    mid = sl([L,MY],    [R,MY],     3)
    top = sc([R,MY],    [R,T],   [L,T],       [L,MY],    4)
    bot = sc([L,MY],    [L,B],   [R-10,B],    [R+2,B-18],4)
    return norm(chain(mid, top, bot))

# f ── M132,38 C137,14 68,14 68,68 L68,158  M54,94 L128,94
def lc_f():
    hook = sc([R-10,T-30], [R-5,A-8], [L+10,A-8], [L+10,T], 4)
    stem = sl([L+10,T],    [L+10,B],  5)
    bar  = sl([L-4,T+26],  [R-14,T+26], 3)          # separate subpath
    return norm(chain(hook, stem) + bar)

# g ── M138,110 C138,68 58,68 58,110 C58,158 138,158 138,110 L138,178 C138,200 66,200 66,178
def lc_g():
    top  = sc([R-4,MY-3], [R-4,T],   [L,T],    [L,MY-3],   4)
    bot  = sc([L,MY-3],   [L,B],     [R-4,B],  [R-4,MY-3], 4)
    desc = sl([R-4,MY-3], [R-4,D-14], 3)
    hook = sc([R-4,D-14], [R-4,D+8], [L+8,D+8],[L+8,D-14], 4)
    return norm(chain(top, bot, desc, hook))

# h ── M62,22 L62,158  M62,82 C62,58 142,58 142,109 L142,158
def lc_h():
    stem = sl([L+4,A],     [L+4,B],    5)
    arch = sc([L+4,T+14],  [L+4,T-10],[R,T-10],[R,MY-4],  4)
    leg  = sl([R,MY-4],    [R,B],      3)
    return norm(chain(stem, arch, leg))

# i ── M100,48 L100,56  M100,72 L100,158
def lc_i():
    dot  = sl([CX,T-20], [CX,T-12], 2)   # 3 pts
    stem = sl([CX,T+4],  [CX,B],    5)   # 6 pts (separate subpath)
    return norm(dot + stem)

# j ── M115,48 L115,56  M115,72 L115,178 C115,198 62,198 62,178
def lc_j():
    dot  = sl([115,T-20], [115,T-12],  2)
    stem = sl([115,T+4],  [115,D-14],  5)
    hook = sc([115,D-14], [115,D+6],  [L+4,D+6],[L+4,D-14], 3)
    return norm(dot + stem + hook[1:])

# k ── M62,22 L62,158  M142,68 L62,113 L142,158
def lc_k():
    stem  = sl([L+4,A],   [L+4,B],  5)
    upper = sl([R,T],     [L+4,MY], 3)
    lower = sl([L+4,MY],  [R,B],    3)
    return norm(chain(stem, upper, lower))

# l ── M100,22 L100,152 C100,162 116,164 116,158
def lc_l():
    stem = sl([CX,A],   [CX,B-6],          7)
    foot = sc([CX,B-6], [CX,B+4],[116,B+6],[116,B], 3)
    return norm(chain(stem, foot))

# m ── M58,158 L58,78 C58,58 90,58 90,78 L90,158  M90,78 C90,58 142,58 142,78 L142,158
def lc_m():
    s1  = sl([L,B],       [L,T+10],           3)
    a1  = sc([L,T+10],    [L,T-10], [CX-10,T-10],[CX-10,T+10], 3)
    s2  = sl([CX-10,T+10],[CX-10,B],           3)
    # jump back up to second-arch junction (natural: pen lifts and restarts at M)
    up  = sl([CX-10,B],   [CX-10,T+10],        2)
    a2  = sc([CX-10,T+10],[CX-10,T-10],[R,T-10],[R,T+10], 3)
    s3  = sl([R,T+10],    [R,B],               3)
    return norm(chain(s1, a1, s2, up, a2, s3))

# n ── M58,158 L58,78 C58,58 142,58 142,78 L142,158
def lc_n():
    s1   = sl([L,B],     [L,T+10],             4)
    arch = sc([L,T+10],  [L,T-12],  [R,T-12],  [R,T+10], 5)
    s2   = sl([R,T+10],  [R,B],                4)
    return norm(chain(s1, arch, s2))

# o ── M100,68 C152,68 152,158 100,158 C48,158 48,68 100,68
def lc_o():
    right = sc([CX,T],  [R+10,T], [R+10,B], [CX,B],  6)
    left  = sc([CX,B],  [L-10,B], [L-10,T], [CX,T],  6)
    return norm(chain(right, left))

# p ── M62,72 L62,192  M62,72 C62,52 146,52 146,113 C146,170 62,170 62,158
def lc_p():
    stem = sl([L+4,T+4],  [L+4,D],          6)
    bTop = sc([L+4,T+4],  [L+4,T-16],[R+4,T-16],[R+4,MY], 4)
    bBot = sc([R+4,MY],   [R+4,B+12],[L+4,B+12],[L+4,B],  4)
    return norm(chain(stem, bTop, bBot))

# q ── M100,68 C48,68 48,158 100,158 C152,158 152,68 100,68  M138,113 L138,192
def lc_q():
    left  = sc([CX,T],  [L-10,T], [L-10,B], [CX,B],  6)
    right = sc([CX,B],  [R+10,B], [R+10,T], [CX,T],  6)
    stem  = sl([R-4,MY],[R-4,D],  4)
    return norm(chain(left, right, stem))

# r ── M62,158 L62,90 C62,58 136,50 136,74
def lc_r():
    stem = sl([L+4,B],    [L+4,T+22], 4)
    arch = sc([L+4,T+22], [L+4,T-10],[R+6,T-18],[R+6,T+6], 4)
    return norm(chain(stem, arch))

# s ── M142,78 C142,54 58,54 58,100 C58,146 142,148 142,138
def lc_s():
    top = sc([R,T+10], [R,T-14], [L,T-14], [L,MY],    4)
    bot = sc([L,MY],   [L,B+14], [R,B+14], [R,B-6],   4)
    return norm(chain(top, bot))

# t ── M100,28 L100,152 C100,162 116,164 120,156  M64,80 L136,80
def lc_t():
    stem = sl([CX,A+6],  [CX,B-6],                6)
    foot = sc([CX,B-6],  [CX,B+4],[116,B+6],[120,B-2], 3)
    bar  = sl([L+4,T+12],[R-4,T+12], 3)           # separate subpath
    return norm(chain(stem, foot) + bar)

# u ── M58,68 L58,144 C58,174 142,174 142,144 L142,68
def lc_u():
    left  = sl([L,T],    [L,B-14],    4)
    curve = sc([L,B-14], [L,B+16],[R,B+16],[R,B-14], 4)
    right = sl([R,B-14], [R,T],       4)
    return norm(chain(left, curve, right))

# v ── M58,68 L100,158 L142,68
def lc_v():
    return norm(chain(sl([L,T],[CX,B],4), sl([CX,B],[R,T],4)))

# w ── M50,68 L72,158 L100,98 L128,158 L150,68
def lc_w():
    return norm(chain(
        sl([50,T],   [72,B],      3),
        sl([72,B],   [CX,T+30],   2),
        sl([CX,T+30],[128,B],     2),
        sl([128,B],  [150,T],     3),
    ))

# x ── M58,68 L142,158  M142,68 L58,158
def lc_x():
    d1 = sl([L,T], [R,B], 5)
    d2 = sl([R,T], [L,B], 5)
    return norm(chain(d1, d2))

# y ── M58,68 L100,126  M142,68 L100,126 L80,192
def lc_y():
    s1   = sl([L,T],       [CX,MY+13],  4)
    s2   = sl([R,T],       [CX,MY+13],  4)
    desc = sl([CX,MY+13],  [L+22,D-14], 3)
    hook = sc([L+22,D-14], [L+22,D+4],  [R-14,D+4],[R-14,D-14], 3)
    return norm(chain(s1, s2, desc, hook))

# z ── M58,68 L142,68 L58,158 L142,158
def lc_z():
    return norm(chain(
        sl([L,T],  [R,T],  3),
        sl([R,T],  [L,B],  5),
        sl([L,B],  [R,B],  3),
    ))

# ── Metadata (SVG paths, hints, etc.) ───────────────────────────────────────
LETTERS = {
    "a": {"fn": lc_a,
          "svg": f"M{R},{MY} C{R},{T} {L},{T} {L},{MY} C{L},{B} {R},{B} {R},{MY} L{R},{B}",
          "sc": 1, "sp": (R/200, MY/200),
          "hint": "Circle left then stroke down!",
          "sh": {"lines": False, "circles": True}},

    "b": {"fn": lc_b,
          "svg": f"M{L+4},{A} L{L+4},{B} M{L+4},{T+8} C{L+4},{T-12} {R+4},{T-12} {R+4},{MY} C{R+4},{B+12} {L+4},{B+12} {L+4},{B}",
          "sc": 2, "sp": ((L+4)/200, A/200),
          "hint": "Ascender down, bump right!",
          "sh": {"lines": True, "circles": True}},

    "c": {"fn": lc_c,
          "svg": f"M{R},{T+16} C{R},{T} {L},{T} {L},{MY} C{L},{B} {R},{B} {R},{B-14}",
          "sc": 1, "sp": (R/200, (T+16)/200),
          "hint": "Open arc — start top-right, curve left!",
          "sh": {"lines": False, "circles": True}},

    "d": {"fn": lc_d,
          "svg": f"M{R-4},{MY} C{R-4},{T} {L},{T} {L},{MY} C{L},{B} {R-4},{B} {R-4},{MY} L{R-4},{A}",
          "sc": 1, "sp": ((R-4)/200, MY/200),
          "hint": "Circle then ascender up!",
          "sh": {"lines": True, "circles": True}},

    "e": {"fn": lc_e,
          "svg": f"M{L},{MY} L{R},{MY} C{R},{T} {L},{T} {L},{MY} C{L},{B} {R-10},{B} {R+2},{B-18}",
          "sc": 1, "sp": (L/200, MY/200),
          "hint": "Draw midline then loop around!",
          "sh": {"lines": True, "circles": True}},

    "f": {"fn": lc_f,
          "svg": f"M{R-10},{T-30} C{R-5},{A-8} {L+10},{A-8} {L+10},{T} L{L+10},{B} M{L-4},{T+26} L{R-14},{T+26}",
          "sc": 2, "sp": ((R-10)/200, (T-30)/200),
          "hint": "Hook top, stem down, crossbar!",
          "sh": {"lines": True, "circles": False}},

    "g": {"fn": lc_g,
          "svg": f"M{R-4},{MY-3} C{R-4},{T} {L},{T} {L},{MY-3} C{L},{B} {R-4},{B} {R-4},{MY-3} L{R-4},{D-14} C{R-4},{D+8} {L+8},{D+8} {L+8},{D-14}",
          "sc": 1, "sp": ((R-4)/200, (MY-3)/200),
          "hint": "Circle right, then hook descender!",
          "sh": {"lines": False, "circles": True}},

    "h": {"fn": lc_h,
          "svg": f"M{L+4},{A} L{L+4},{B} M{L+4},{T+14} C{L+4},{T-10} {R},{T-10} {R},{MY-4} L{R},{B}",
          "sc": 2, "sp": ((L+4)/200, A/200),
          "hint": "Ascender down, arch right, stem down!",
          "sh": {"lines": True, "circles": False}},

    "i": {"fn": lc_i,
          "svg": f"M{CX},{T-20} L{CX},{T-12} M{CX},{T+4} L{CX},{B}",
          "sc": 2, "sp": (CX/200, (T-20)/200),
          "hint": "Dot first, then straight down!",
          "sh": {"lines": True, "circles": False}},

    "j": {"fn": lc_j,
          "svg": f"M115,{T-20} L115,{T-12} M115,{T+4} L115,{D-14} C115,{D+6} {L+4},{D+6} {L+4},{D-14}",
          "sc": 2, "sp": (115/200, (T-20)/200),
          "hint": "Dot, stem, hook left at bottom!",
          "sh": {"lines": True, "circles": False}},

    "k": {"fn": lc_k,
          "svg": f"M{L+4},{A} L{L+4},{B} M{R},{T} L{L+4},{MY} L{R},{B}",
          "sc": 2, "sp": ((L+4)/200, A/200),
          "hint": "Stem down, kick two legs!",
          "sh": {"lines": True, "circles": False}},

    "l": {"fn": lc_l,
          "svg": f"M{CX},{A} L{CX},{B-6} C{CX},{B+4} 116,{B+6} 116,{B}",
          "sc": 1, "sp": (CX/200, A/200),
          "hint": "Single stroke straight down!",
          "sh": {"lines": True, "circles": False}},

    "m": {"fn": lc_m,
          "svg": f"M{L},{B} L{L},{T+10} C{L},{T-10} {CX-10},{T-10} {CX-10},{T+10} L{CX-10},{B} M{CX-10},{T+10} C{CX-10},{T-10} {R},{T-10} {R},{T+10} L{R},{B}",
          "sc": 1, "sp": (L/200, B/200),
          "hint": "Up, over two humps, down!",
          "sh": {"lines": True, "circles": False}},

    "n": {"fn": lc_n,
          "svg": f"M{L},{B} L{L},{T+10} C{L},{T-12} {R},{T-12} {R},{T+10} L{R},{B}",
          "sc": 1, "sp": (L/200, B/200),
          "hint": "Up, arch right, stem down!",
          "sh": {"lines": True, "circles": False}},

    "o": {"fn": lc_o,
          "svg": f"M{CX},{T} C{R+10},{T} {R+10},{B} {CX},{B} C{L-10},{B} {L-10},{T} {CX},{T}",
          "sc": 1, "sp": (CX/200, T/200),
          "hint": "Full oval — start at top!",
          "sh": {"lines": False, "circles": True}},

    "p": {"fn": lc_p,
          "svg": f"M{L+4},{T+4} L{L+4},{D} M{L+4},{T+4} C{L+4},{T-16} {R+4},{T-16} {R+4},{MY} C{R+4},{B+12} {L+4},{B+12} {L+4},{B}",
          "sc": 1, "sp": ((L+4)/200, (T+4)/200),
          "hint": "Stem down past baseline, bump right!",
          "sh": {"lines": True, "circles": True}},

    "q": {"fn": lc_q,
          "svg": f"M{CX},{T} C{L-10},{T} {L-10},{B} {CX},{B} C{R+10},{B} {R+10},{T} {CX},{T} M{R-4},{MY} L{R-4},{D}",
          "sc": 1, "sp": (CX/200, T/200),
          "hint": "Circle left, then descend right!",
          "sh": {"lines": True, "circles": True}},

    "r": {"fn": lc_r,
          "svg": f"M{L+4},{B} L{L+4},{T+22} C{L+4},{T-10} {R+6},{T-18} {R+6},{T+6}",
          "sc": 1, "sp": ((L+4)/200, B/200),
          "hint": "Up then arch partway to the right!",
          "sh": {"lines": True, "circles": False}},

    "s": {"fn": lc_s,
          "svg": f"M{R},{T+10} C{R},{T-14} {L},{T-14} {L},{MY} C{L},{B+14} {R},{B+14} {R},{B-6}",
          "sc": 1, "sp": (R/200, (T+10)/200),
          "hint": "S-curve — two loops!",
          "sh": {"lines": False, "circles": True}},

    "t": {"fn": lc_t,
          "svg": f"M{CX},{A+6} L{CX},{B-6} C{CX},{B+4} 116,{B+6} 120,{B-2} M{L+4},{T+12} L{R-4},{T+12}",
          "sc": 2, "sp": (CX/200, (A+6)/200),
          "hint": "Stem down, add crossbar!",
          "sh": {"lines": True, "circles": False}},

    "u": {"fn": lc_u,
          "svg": f"M{L},{T} L{L},{B-14} C{L},{B+16} {R},{B+16} {R},{B-14} L{R},{T}",
          "sc": 1, "sp": (L/200, T/200),
          "hint": "Down, curve under, up!",
          "sh": {"lines": True, "circles": False}},

    "v": {"fn": lc_v,
          "svg": f"M{L},{T} L{CX},{B} L{R},{T}",
          "sc": 1, "sp": (L/200, T/200),
          "hint": "Diagonal down-right, then up-right!",
          "sh": {"lines": True, "circles": False}},

    "w": {"fn": lc_w,
          "svg": f"M50,{T} L72,{B} L{CX},{T+30} L128,{B} L150,{T}",
          "sc": 1, "sp": (50/200, T/200),
          "hint": "Two V shapes connected!",
          "sh": {"lines": True, "circles": False}},

    "x": {"fn": lc_x,
          "svg": f"M{L},{T} L{R},{B} M{R},{T} L{L},{B}",
          "sc": 2, "sp": (L/200, T/200),
          "hint": "Two crossing diagonals!",
          "sh": {"lines": True, "circles": False}},

    "y": {"fn": lc_y,
          "svg": f"M{L},{T} L{CX},{MY+13} M{R},{T} L{CX},{MY+13} L{L+22},{D-14} C{L+22},{D+4} {R-14},{D+4} {R-14},{D-14}",
          "sc": 2, "sp": (L/200, T/200),
          "hint": "Two diagonals to center, then hook down!",
          "sh": {"lines": True, "circles": False}},

    "z": {"fn": lc_z,
          "svg": f"M{L},{T} L{R},{T} L{L},{B} L{R},{B}",
          "sc": 1, "sp": (L/200, T/200),
          "hint": "Top line, diagonal, bottom line!",
          "sh": {"lines": True, "circles": False}},
}

# ── Patch paths.json ─────────────────────────────────────────────────────────
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

for ch, info in LETTERS.items():
    wps = info["fn"]()
    data[ch] = {
        "svg_path":    info["svg"],
        "stroke_count": info["sc"],
        "start_point": {"x": round(info["sp"][0], 3), "y": round(info["sp"][1], 3)},
        "hint":        info["hint"],
        "expected_shapes": info["sh"],
        "waypoints":   wps,
    }
    print(f"  {ch}: {len(wps)} waypoints")

with open(PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print(f"\nDone — {len(LETTERS)} lowercase letters regenerated with bezier-accurate waypoints")
