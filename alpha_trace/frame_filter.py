import cv2
import numpy as np


def apply_sobel(frame_bgr):
    small = cv2.resize(frame_bgr, (320, 240))
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0)
    sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1)
    merged = cv2.bitwise_or(
        np.uint8(np.absolute(sx)),
        np.uint8(np.absolute(sy)),
    )
    colored = cv2.applyColorMap(merged, cv2.COLORMAP_HSV)
    return cv2.resize(colored, (640, 480), interpolation=cv2.INTER_LINEAR)


def apply_harris(frame_bgr):
    small = cv2.resize(frame_bgr, (320, 240))
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray_f32 = np.float32(gray)
    harris = cv2.cornerHarris(gray_f32, blockSize=2, ksize=3, k=0.04)
    harris = cv2.dilate(harris, None)
    threshold = 0.01 * harris.max()
    output = small.copy()
    output[harris > threshold] = [255, 0, 200]  # magenta corner markers
    return cv2.resize(output, (640, 480), interpolation=cv2.INTER_NEAREST)


def apply_filter(frame_bgr, mode: str):
    if mode == 'sobel':
        return apply_sobel(frame_bgr)
    if mode == 'harris':
        return apply_harris(frame_bgr)
    return None
