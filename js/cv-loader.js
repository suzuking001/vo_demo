export function loadOpenCv({ onReady, onError } = {}) {
  const existingModule = window.Module || {};
  const prevOnReady = existingModule.onRuntimeInitialized;

  window.Module = existingModule;
  window.Module.onRuntimeInitialized = () => {
    if (typeof prevOnReady === "function") {
      try {
        prevOnReady();
      } catch (_) {
        // Ignore callbacks outside this page's control.
      }
    }
    if (typeof onReady === "function") {
      onReady();
    }
  };

  if (window.cv && typeof window.cv.Mat === "function") {
    window.Module.onRuntimeInitialized();
    return;
  }

  if (document.querySelector("script[data-opencv-js='1']")) {
    return;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://docs.opencv.org/4.x/opencv.js";
  script.dataset.opencvJs = "1";
  script.onerror = () => {
    if (typeof onError === "function") {
      onError();
    }
  };
  document.head.appendChild(script);
}
