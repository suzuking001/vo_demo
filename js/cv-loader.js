const DEFAULT_LOCAL_JS = "vendor/opencv.js";
const DEFAULT_REMOTE_JS = "https://docs.opencv.org/4.x/opencv.js";

function appendScript(src, { onLoad, onError }) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  script.dataset.opencvJs = "1";
  script.onload = () => onLoad && onLoad();
  script.onerror = () => onError && onError();
  document.head.appendChild(script);
}

export function loadOpenCv({ onReady, onError, localPath, remoteUrl, wasmDir } = {}) {
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
    window.__opencvJsSource = "already-loaded";
    window.Module.onRuntimeInitialized();
    return;
  }

  if (document.querySelector("script[data-opencv-js='1']")) {
    return;
  }

  const preferredUrl = window.OPENCV_JS_URL;
  const preferredWasm = window.OPENCV_WASM_DIR;
  const localJs = localPath || DEFAULT_LOCAL_JS;
  const remoteJs = remoteUrl || DEFAULT_REMOTE_JS;
  const wasmBase = wasmDir || preferredWasm;

  if (wasmBase) {
    window.Module = window.Module || {};
    if (typeof window.Module.locateFile !== "function") {
      const wasmRoot = wasmBase.replace(/\/+$/, "");
      window.Module.locateFile = (path) => (wasmRoot ? `${wasmRoot}/${path}` : path);
    }
  }

  const fail = () => {
    if (typeof onError === "function") {
      onError();
    }
  };

  const loadRemote = () => {
    window.__opencvJsSource = remoteJs;
    appendScript(remoteJs, { onLoad: onReady, onError: fail });
  };

  if (preferredUrl) {
    window.__opencvJsSource = preferredUrl;
    appendScript(preferredUrl, { onLoad: onReady, onError: fail });
    return;
  }

  window.__opencvJsSource = localJs;
  appendScript(localJs, {
    onLoad: onReady,
    onError: () => loadRemote()
  });
}
