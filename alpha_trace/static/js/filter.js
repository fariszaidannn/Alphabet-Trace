'use strict';

/**
 * FilterEngine — Pure Canvas 2D implementation of Sobel and Harris filters.
 *
 * Uses the same 3×3 kernels from the module catalog (§1.1 Sobel, §2.1 Harris).
 * No external dependencies — zero CDN downloads, instant startup.
 *
 * Key design:  Output is drawn as **transparent** pixels where there are no edges/corners,
 *              so the live video underneath shows through naturally with no color overlay.
 */
const FilterEngine = (() => {
  let _mode   = 'normal';
  let _rafId  = null;
  let _canvas = null;
  let _ctx    = null;

  // Sobel 3×3 kernels (module catalog §1.1)
  const SOBEL_X = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const SOBEL_Y = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  // Harris sensitivity parameter (module catalog §2.1)
  const HARRIS_K = 0.04;

  // Separable 5×5 Gaussian kernel weights (σ≈1) for Canny pre-blur
  const GAUSS5 = [1 / 17, 4 / 17, 7 / 17, 4 / 17, 1 / 17];

  // Performance: process at half resolution then scale up
  const PROC_SCALE = 0.5;

  // Offscreen canvas for downscaled processing
  let _offCanvas = null;
  let _offCtx    = null;

  function _init(filterCanvasEl) {
    _canvas = filterCanvasEl;
    _ctx    = filterCanvasEl.getContext('2d', { willReadFrequently: true });

    _offCanvas = document.createElement('canvas');
    _offCtx    = _offCanvas.getContext('2d', { willReadFrequently: true });
  }

  // ── Pixel helpers ──────────────────────────────────────────

  /** Convert RGBA pixel data → grayscale Float32Array */
  function _toGray(data, w, h) {
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Standard luminance formula (same as module catalog Canny §1.4)
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    return gray;
  }

  /** Apply a 3×3 kernel convolution on a grayscale buffer */
  function _convolve3x3(gray, w, h, kernel) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += gray[(y + ky) * w + (x + kx)] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        out[y * w + x] = sum;
      }
    }
    return out;
  }

  /** Simple 3×3 box blur for smoothing (used before Harris) */
  function _boxBlur3x3(buf, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += buf[(y + ky) * w + (x + kx)];
          }
        }
        out[y * w + x] = sum / 9;
      }
    }
    return out;
  }

  /** Separable 5×5 Gaussian blur for noise reduction before gradient computation */
  function _gaussBlur5x5(gray, w, h) {
    const temp = new Float32Array(w * h);
    const out  = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 2; x < w - 2; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += gray[y * w + (x + k)] * GAUSS5[k + 2];
        temp[y * w + x] = s;
      }
    }
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += temp[(y + k) * w + x] * GAUSS5[k + 2];
        out[y * w + x] = s;
      }
    }
    return out;
  }

  /**
   * Canny non-maximum suppression — thins edges to 1-pixel width by suppressing
   * pixels that are not local maxima along the gradient direction.
   */
  function _cannyNMS(mag, gx, gy, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const m = mag[i];
        if (m === 0) continue;

        const a = (Math.atan2(gy[i], gx[i]) * 180 / Math.PI + 180) % 180;
        let p, q;
        if (a < 22.5 || a >= 157.5) {
          p = mag[i - 1];                        q = mag[i + 1];
        } else if (a < 67.5) {
          p = mag[(y - 1) * w + (x + 1)];        q = mag[(y + 1) * w + (x - 1)];
        } else if (a < 112.5) {
          p = mag[(y - 1) * w + x];              q = mag[(y + 1) * w + x];
        } else {
          p = mag[(y - 1) * w + (x - 1)];        q = mag[(y + 1) * w + (x + 1)];
        }

        out[i] = (m >= p && m >= q) ? m : 0;
      }
    }
    return out;
  }

  /** Hysteresis thresholding — keeps weak edges only if connected to a strong edge */
  function _hysteresis(nms, w, h, highT, lowT) {
    const STRONG = 2, WEAK = 1;
    const edge = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (nms[i] >= highT)      edge[i] = STRONG;
      else if (nms[i] >= lowT)  edge[i] = WEAK;
    }
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (edge[y * w + x] !== WEAK) continue;
        const row0 = (y - 1) * w, row1 = y * w, row2 = (y + 1) * w;
        if (
          edge[row0 + x - 1] === STRONG || edge[row0 + x] === STRONG || edge[row0 + x + 1] === STRONG ||
          edge[row1 + x - 1] === STRONG ||                               edge[row1 + x + 1] === STRONG ||
          edge[row2 + x - 1] === STRONG || edge[row2 + x] === STRONG || edge[row2 + x + 1] === STRONG
        ) {
          edge[y * w + x] = STRONG;
        }
      }
    }
    return edge;
  }

  // ── Filter implementations ─────────────────────────────────

  /**
   * Sobel edge detection (module catalog §1.1)
   * Output: white edge pixels on transparent background
   */
  function _applySobel(imageData, w, h) {
    const gray = _toGray(imageData.data, w, h);
    const gx   = _convolve3x3(gray, w, h, SOBEL_X);
    const gy   = _convolve3x3(gray, w, h, SOBEL_Y);

    const out = new Uint8ClampedArray(w * h * 4);

    // Find max magnitude for normalization
    let maxMag = 0;
    const mag = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      mag[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
      if (mag[i] > maxMag) maxMag = mag[i];
    }

    const norm = maxMag > 0 ? 255 / maxMag : 1;
    const threshold = 30; // skip very faint edges

    for (let i = 0; i < w * h; i++) {
      const val = (mag[i] * norm) | 0;
      if (val > threshold) {
        // Cyan-white edge coloring for visual pop
        out[i * 4]     = Math.min(255, val + 60);   // R
        out[i * 4 + 1] = 255;                        // G
        out[i * 4 + 2] = Math.min(255, val + 120);  // B
        out[i * 4 + 3] = Math.min(255, val + 40);   // A — stronger edges are more opaque
      }
      // else: stays RGBA(0,0,0,0) — fully transparent → video shows through
    }
    return new ImageData(out, w, h);
  }

  /**
   * Harris corner detection (module catalog §2.1)
   * Output: magenta dots on transparent background
   */
  function _applyHarris(imageData, w, h) {
    const gray = _toGray(imageData.data, w, h);

    // Gradient via Sobel
    const ix = _convolve3x3(gray, w, h, SOBEL_X);
    const iy = _convolve3x3(gray, w, h, SOBEL_Y);

    // Structure tensor components: Ixx, Iyy, Ixy
    const ixx = new Float32Array(w * h);
    const iyy = new Float32Array(w * h);
    const ixy = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      ixx[i] = ix[i] * ix[i];
      iyy[i] = iy[i] * iy[i];
      ixy[i] = ix[i] * iy[i];
    }

    // 5×5 Gaussian smoothing of structure tensor (better angular precision than box blur)
    const sxx = _gaussBlur5x5(ixx, w, h);
    const syy = _gaussBlur5x5(iyy, w, h);
    const sxy = _gaussBlur5x5(ixy, w, h);

    // Harris response: R = det(M) - k * trace(M)²
    const response = new Float32Array(w * h);
    let maxR = 0;
    for (let i = 0; i < w * h; i++) {
      const det   = sxx[i] * syy[i] - sxy[i] * sxy[i];
      const trace = sxx[i] + syy[i];
      response[i] = det - HARRIS_K * trace * trace;
      if (response[i] > maxR) maxR = response[i];
    }

    // Threshold at 0.8% of max response (slightly more sensitive for detail)
    const threshold = 0.008 * maxR;

    const out = new Uint8ClampedArray(w * h * 4);

    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) {
        const r = response[y * w + x];
        if (r <= threshold) continue;
        // Non-maximum suppression: 5×5 neighborhood — eliminates duplicate detections
        let isMax = true;
        for (let dy = -2; dy <= 2 && isMax; dy++) {
          for (let dx = -2; dx <= 2 && isMax; dx++) {
            if (dy === 0 && dx === 0) continue;
            if (response[(y + dy) * w + (x + dx)] > r) isMax = false;
          }
        }
        if (!isMax) continue;
        // Single-pixel marker — precise corner point, smaller than before
        const idx = (y * w + x) * 4;
        out[idx]     = 255;  // R
        out[idx + 1] = 0;    // G
        out[idx + 2] = 200;  // B (magenta)
        out[idx + 3] = 255;  // A
      }
    }

    return new ImageData(out, w, h);
  }

  /**
   * Canny edge detection (module catalog §1.4)
   * Pipeline: Gaussian blur → Sobel → gradient-direction NMS → hysteresis
   * Output: golden-yellow 1-pixel edges on transparent background
   */
  function _applyCanny(imageData, w, h) {
    const gray    = _toGray(imageData.data, w, h);
    const blurred = _gaussBlur5x5(gray, w, h);

    const gx = _convolve3x3(blurred, w, h, SOBEL_X);
    const gy = _convolve3x3(blurred, w, h, SOBEL_Y);

    const mag = new Float32Array(w * h);
    let maxMag = 0;
    for (let i = 0; i < w * h; i++) {
      mag[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
      if (mag[i] > maxMag) maxMag = mag[i];
    }

    const nms   = _cannyNMS(mag, gx, gy, w, h);
    const edges = _hysteresis(nms, w, h, 0.15 * maxMag, 0.05 * maxMag);

    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      if (edges[i] === 2) {
        out[i * 4]     = 255;  // R — golden yellow
        out[i * 4 + 1] = 215;  // G
        out[i * 4 + 2] = 50;   // B
        out[i * 4 + 3] = 230;  // A
      }
    }
    return new ImageData(out, w, h);
  }

  /**
   * Hough Line Detection (module catalog §3.1)
   * Pipeline: Canny edge map → (ρ,θ) accumulator voting → peak detection → draw lines
   * Output: bright cyan lines on transparent background
   */
  function _applyHoughLines(imageData, w, h) {
    // Step 1: Get Canny edge map
    const gray    = _toGray(imageData.data, w, h);
    const blurred = _gaussBlur5x5(gray, w, h);
    const gx = _convolve3x3(blurred, w, h, SOBEL_X);
    const gy = _convolve3x3(blurred, w, h, SOBEL_Y);

    const mag = new Float32Array(w * h);
    let maxMag = 0;
    for (let i = 0; i < w * h; i++) {
      mag[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
      if (mag[i] > maxMag) maxMag = mag[i];
    }
    const nms   = _cannyNMS(mag, gx, gy, w, h);
    const edges = _hysteresis(nms, w, h, 0.15 * maxMag, 0.05 * maxMag);

    // Step 2: Hough accumulator in (ρ, θ) space
    const thetaSteps = 180;
    const dTheta     = Math.PI / thetaSteps;
    const diagonal   = Math.sqrt(w * w + h * h) | 0;
    const rhoMax     = diagonal;
    const rhoSize    = 2 * rhoMax + 1;  // ρ ranges from -diagonal to +diagonal

    // Pre-compute cos/sin table
    const cosT = new Float32Array(thetaSteps);
    const sinT = new Float32Array(thetaSteps);
    for (let t = 0; t < thetaSteps; t++) {
      cosT[t] = Math.cos(t * dTheta);
      sinT[t] = Math.sin(t * dTheta);
    }

    // Accumulator
    const accum = new Uint16Array(rhoSize * thetaSteps);

    // Vote: for each edge pixel, vote for every (ρ, θ)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (edges[y * w + x] !== 2) continue;  // only strong edges
        for (let t = 0; t < thetaSteps; t++) {
          const rho = Math.round(x * cosT[t] + y * sinT[t]) + rhoMax;
          accum[rho * thetaSteps + t]++;
        }
      }
    }

    // Step 3: Find peaks — threshold relative to max votes
    let maxVotes = 0;
    for (let i = 0; i < accum.length; i++) {
      if (accum[i] > maxVotes) maxVotes = accum[i];
    }
    const voteThreshold = Math.max(30, maxVotes * 0.35);

    // Collect line parameters from peaks
    const lines = [];
    for (let r = 0; r < rhoSize; r++) {
      for (let t = 0; t < thetaSteps; t++) {
        if (accum[r * thetaSteps + t] < voteThreshold) continue;
        // Local max check in 5×5 neighborhood
        const val = accum[r * thetaSteps + t];
        let isMax = true;
        for (let dr = -2; dr <= 2 && isMax; dr++) {
          for (let dt = -2; dt <= 2 && isMax; dt++) {
            if (dr === 0 && dt === 0) continue;
            const nr = r + dr, nt = t + dt;
            if (nr >= 0 && nr < rhoSize && nt >= 0 && nt < thetaSteps) {
              if (accum[nr * thetaSteps + nt] > val) isMax = false;
            }
          }
        }
        if (isMax) {
          lines.push({ rho: r - rhoMax, theta: t * dTheta });
        }
      }
    }

    // Step 4: Draw lines on output (limit to top 20 to avoid clutter)
    lines.sort((a, b) => {
      const aIdx = (a.rho + rhoMax) * thetaSteps + Math.round(a.theta / dTheta);
      const bIdx = (b.rho + rhoMax) * thetaSteps + Math.round(b.theta / dTheta);
      return (accum[bIdx] || 0) - (accum[aIdx] || 0);
    });
    const topLines = lines.slice(0, 20);

    const out = new Uint8ClampedArray(w * h * 4);

    // First draw faint Canny edges as context
    for (let i = 0; i < w * h; i++) {
      if (edges[i] === 2) {
        out[i * 4]     = 100;
        out[i * 4 + 1] = 100;
        out[i * 4 + 2] = 120;
        out[i * 4 + 3] = 80;
      }
    }

    // Draw each detected line using Bresenham-style plotting
    for (const line of topLines) {
      const cosA = Math.cos(line.theta);
      const sinA = Math.sin(line.theta);

      // Compute two endpoints of the line clipped to the image
      let x1, y1, x2, y2;
      if (Math.abs(sinA) > 0.001) {
        // Line is not vertical — compute y at x=0 and x=w-1
        x1 = 0;
        y1 = Math.round((line.rho - x1 * cosA) / sinA);
        x2 = w - 1;
        y2 = Math.round((line.rho - x2 * cosA) / sinA);
      } else {
        // Nearly vertical line
        x1 = Math.round(line.rho / cosA);
        y1 = 0;
        x2 = x1;
        y2 = h - 1;
      }

      // Bresenham line rasterization
      _drawLineOnBuffer(out, w, h, x1, y1, x2, y2, [0, 255, 255, 220]);
    }

    return new ImageData(out, w, h);
  }

  /** Bresenham line drawing into a pixel buffer */
  function _drawLineOnBuffer(buf, w, h, x0, y0, x1, y1, rgba) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0;
    const maxSteps = (w + h) * 3;  // safety limit
    let steps = 0;
    while (steps++ < maxSteps) {
      // Draw a 2px thick point for visibility
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const px = x + ox, py = y + oy;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const idx = (py * w + px) * 4;
            buf[idx]     = rgba[0];
            buf[idx + 1] = rgba[1];
            buf[idx + 2] = rgba[2];
            buf[idx + 3] = rgba[3];
          }
        }
      }
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /**
   * Hough Circle Detection (module catalog §3.2)
   * Pipeline: Canny edge map → gradient-directed voting in (cx,cy,r) space → peak detection → draw circles
   * Output: magenta/pink circles on transparent background
   */
  function _applyHoughCircles(imageData, w, h) {
    // Step 1: Get Canny edge map + gradients
    const gray    = _toGray(imageData.data, w, h);
    const blurred = _gaussBlur5x5(gray, w, h);
    const gx = _convolve3x3(blurred, w, h, SOBEL_X);
    const gy = _convolve3x3(blurred, w, h, SOBEL_Y);

    const mag = new Float32Array(w * h);
    let maxMag = 0;
    for (let i = 0; i < w * h; i++) {
      mag[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
      if (mag[i] > maxMag) maxMag = mag[i];
    }
    const nms   = _cannyNMS(mag, gx, gy, w, h);
    const edges = _hysteresis(nms, w, h, 0.15 * maxMag, 0.05 * maxMag);

    // Step 2: Hough circle accumulator
    // Radius range: 8 to min(w,h)/3 pixels — reasonable for half-res
    const minR = 8;
    const maxR = Math.min(w, h) / 3 | 0;
    const rSteps = maxR - minR + 1;
    if (rSteps <= 0) return _applyCanny(imageData, w, h); // fallback

    // 3D accumulator: (cx, cy, r) — flattened
    // To save memory, use a 2D accumulator for centers and track best radius separately
    const accum = new Uint16Array(w * h);
    const bestR = new Uint8Array(w * h);  // best radius at each center

    // Gradient-directed voting: only vote along gradient direction
    // This massively reduces computation vs brute-force
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (edges[y * w + x] !== 2) continue;
        const i = y * w + x;
        const m = mag[i];
        if (m < 5) continue;

        const gdx = gx[i] / m;  // normalized gradient direction
        const gdy = gy[i] / m;

        // Vote along gradient direction for each candidate radius
        for (let r = minR; r <= maxR; r += 2) {  // step by 2 for speed
          // Two candidate centers: along +gradient and -gradient
          for (const sign of [1, -1]) {
            const cx = Math.round(x + sign * gdx * r);
            const cy = Math.round(y + sign * gdy * r);
            if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
              const ci = cy * w + cx;
              accum[ci]++;
              if (accum[ci] > accum[bestR[ci]] || bestR[ci] === 0) {
                bestR[ci] = r;
              }
            }
          }
        }
      }
    }

    // Step 3: Find circle peaks
    let maxVotes = 0;
    for (let i = 0; i < accum.length; i++) {
      if (accum[i] > maxVotes) maxVotes = accum[i];
    }
    const circleThreshold = Math.max(15, maxVotes * 0.4);

    const circles = [];
    for (let cy = 5; cy < h - 5; cy++) {
      for (let cx = 5; cx < w - 5; cx++) {
        const ci = cy * w + cx;
        if (accum[ci] < circleThreshold) continue;

        // Non-maximum suppression in 7×7 neighborhood
        let isMax = true;
        for (let dy = -3; dy <= 3 && isMax; dy++) {
          for (let dx = -3; dx <= 3 && isMax; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ni = (cy + dy) * w + (cx + dx);
            if (ni >= 0 && ni < w * h && accum[ni] > accum[ci]) isMax = false;
          }
        }
        if (isMax) {
          circles.push({ cx, cy, r: bestR[ci], votes: accum[ci] });
        }
      }
    }

    // Sort by votes and limit to top 15
    circles.sort((a, b) => b.votes - a.votes);
    const topCircles = circles.slice(0, 15);

    // Step 4: Draw results
    const out = new Uint8ClampedArray(w * h * 4);

    // Faint Canny edges as context
    for (let i = 0; i < w * h; i++) {
      if (edges[i] === 2) {
        out[i * 4]     = 100;
        out[i * 4 + 1] = 100;
        out[i * 4 + 2] = 120;
        out[i * 4 + 3] = 80;
      }
    }

    // Draw detected circles (circumference + center dot)
    for (const c of topCircles) {
      // Draw circumference using midpoint circle algorithm
      _drawCircleOnBuffer(out, w, h, c.cx, c.cy, c.r, [255, 0, 200, 220]);
      // Draw center point (3×3 bright dot)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = c.cx + dx, py = c.cy + dy;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const idx = (py * w + px) * 4;
            out[idx]     = 0;
            out[idx + 1] = 255;
            out[idx + 2] = 180;
            out[idx + 3] = 255;
          }
        }
      }
    }

    return new ImageData(out, w, h);
  }

  /** Midpoint circle algorithm — draws a circle outline into a pixel buffer */
  function _drawCircleOnBuffer(buf, w, h, cx, cy, r, rgba) {
    let x = r, y = 0, d = 1 - r;
    while (x >= y) {
      // Plot 8 symmetric points with 2px thickness
      const pts = [
        [cx + x, cy + y], [cx - x, cy + y],
        [cx + x, cy - y], [cx - x, cy - y],
        [cx + y, cy + x], [cx - y, cy + x],
        [cx + y, cy - x], [cx - y, cy - x]
      ];
      for (const [px, py] of pts) {
        for (let oy = -1; oy <= 0; oy++) {
          for (let ox = -1; ox <= 0; ox++) {
            const fx = px + ox, fy = py + oy;
            if (fx >= 0 && fx < w && fy >= 0 && fy < h) {
              const idx = (fy * w + fx) * 4;
              buf[idx]     = rgba[0];
              buf[idx + 1] = rgba[1];
              buf[idx + 2] = rgba[2];
              buf[idx + 3] = rgba[3];
            }
          }
        }
      }
      y++;
      if (d < 0) {
        d += 2 * y + 1;
      } else {
        x--;
        d += 2 * (y - x) + 1;
      }
    }
  }

  // ── Render loop ────────────────────────────────────────────

  function _runLoop() {
    if (_rafId) cancelAnimationFrame(_rafId);

    function loop() {
      if (_mode === 'normal') {
        _rafId = null;
        return;
      }

      _rafId = requestAnimationFrame(loop);

      const video = Camera.getVideoElement();
      if (!video || video.readyState < 2) return;

      try {
        // Size the processing canvas at half resolution
        const fullW = _canvas.width;
        const fullH = _canvas.height;
        const procW = Math.round(fullW * PROC_SCALE);
        const procH = Math.round(fullH * PROC_SCALE);

        if (procW < 4 || procH < 4) return;

        _offCanvas.width  = procW;
        _offCanvas.height = procH;

        // Draw video into the small offscreen canvas
        _offCtx.drawImage(video, 0, 0, procW, procH);
        const imgData = _offCtx.getImageData(0, 0, procW, procH);

        // Apply filter
        let result;
        if (_mode === 'sobel') {
          result = _applySobel(imgData, procW, procH);
        } else if (_mode === 'harris') {
          result = _applyHarris(imgData, procW, procH);
        } else if (_mode === 'canny') {
          result = _applyCanny(imgData, procW, procH);
        } else if (_mode === 'hough-lines') {
          result = _applyHoughLines(imgData, procW, procH);
        } else if (_mode === 'hough-circles') {
          result = _applyHoughCircles(imgData, procW, procH);
        }

        if (result) {
          // Write result to offscreen, then scale up to full canvas
          _offCtx.putImageData(result, 0, 0);

          // Clear filter canvas — fully transparent
          _ctx.clearRect(0, 0, fullW, fullH);

          // Draw scaled-up result — only non-transparent edge/corner pixels appear
          _ctx.imageSmoothingEnabled = true;
          _ctx.drawImage(_offCanvas, 0, 0, fullW, fullH);
        }
      } catch (err) {
        console.warn('[Filter] Loop error:', err);
      }
    }
    _rafId = requestAnimationFrame(loop);
  }

  // ── Public API (same interface as before) ──────────────────

  function setMode(mode) {
    _mode = mode;

    if (mode === 'normal') {
      stop();
      clearOverlay();
    } else {
      // No loading needed — pure JS, instant start
      if (!_rafId) _runLoop();
    }
  }

  function getMode() { return _mode; }

  function clearOverlay() {
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function start(filterCanvasEl) {
    _init(filterCanvasEl);
    if (_mode !== 'normal') _runLoop();
  }

  function stop() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    clearOverlay();
  }

  function isReady() { return true; } // Always ready — no WASM to load

  return { start, stop, setMode, getMode, clearOverlay, isReady };
})();
