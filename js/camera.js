import { safeDelete } from "./utils.js";

export function createCameraPipeline({ video, viewCanvas, log, onResize }) {
  let stream = null;
  let cap = null;
  let matRGBA = null;
  let matGray = null;

  function getVideoSize() {
    const w = video.videoWidth | 0;
    const h = video.videoHeight | 0;
    if (w <= 0 || h <= 0) return null;
    return { w, h };
  }

  function ensureFrameBuffers(forceResize = false) {
    const size = getVideoSize();
    if (!size) return { ok: false, resized: false };

    const { w, h } = size;
    const resizeNeeded =
      forceResize ||
      !cap ||
      !matRGBA ||
      !matGray ||
      video.width !== w ||
      video.height !== h ||
      matRGBA.cols !== w ||
      matRGBA.rows !== h ||
      matGray.cols !== w ||
      matGray.rows !== h ||
      viewCanvas.width !== w ||
      viewCanvas.height !== h;

    if (!resizeNeeded) return { ok: true, resized: false };

    matRGBA = safeDelete(matRGBA);
    matGray = safeDelete(matGray);
    video.width = w;
    video.height = h;
    cap = new cv.VideoCapture(video);
    matRGBA = new cv.Mat(h, w, cv.CV_8UC4);
    matGray = new cv.Mat(h, w, cv.CV_8UC1);
    viewCanvas.width = w;
    viewCanvas.height = h;

    if (typeof onResize === "function") {
      onResize();
    }

    return { ok: true, resized: true };
  }

  async function initCamera() {
    if (!window.isSecureContext) {
      throw new Error("This page is not a secure context. Use https or http://localhost.");
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia is not available in this browser.");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();

    const ensured = ensureFrameBuffers(true);
    if (!ensured.ok) {
      throw new Error("Video stream is not ready (size unavailable).");
    }
  }

  function readFrame() {
    const ensured = ensureFrameBuffers(false);
    if (!ensured.ok) {
      log(["Waiting for video frame size..."]);
      return null;
    }

    try {
      cap.read(matRGBA);
    } catch (readErr) {
      const msg = String(readErr);
      if (!msg.includes("Bad size of input mat")) {
        throw readErr;
      }
      const forced = ensureFrameBuffers(true);
      if (!forced.ok) {
        log(["Waiting for valid camera frame...", msg]);
        return null;
      }
      cap.read(matRGBA);
    }

    cv.cvtColor(matRGBA, matGray, cv.COLOR_RGBA2GRAY);
    return { matRGBA, matGray };
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function release() {
    matRGBA = safeDelete(matRGBA);
    matGray = safeDelete(matGray);
    cap = null;
  }

  function hasStream() {
    return !!stream;
  }

  return {
    initCamera,
    readFrame,
    stopStream,
    release,
    getVideoSize,
    hasStream
  };
}
