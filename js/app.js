import { loadOpenCv } from "./cv-loader.js";
import { createCameraPipeline } from "./camera.js";
import { createMapRenderer } from "./map.js";
import { makeK, matMul3x3, matMul3x3Vec, matAdd3, matScale3 } from "./math.js";
import { safeDelete, readVec3 } from "./utils.js";

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnReset = document.getElementById("btnReset");
const statusEl = document.getElementById("status");
const video = document.getElementById("video");
const viewC = document.getElementById("view");
const viewG = viewC.getContext("2d", { willReadFrequently: true });
const mapC = document.getElementById("map");
const btnMapMode = document.getElementById("btnMapMode");

window.__voAppLoaded = true;

if (!mapC) {
  statusEl.textContent = "Map canvas not found (#map).";
  throw new Error("Map canvas not found (#map).");
}

const traj = [];
const mapPts = [];
const mapView = createMapRenderer(mapC);
let mapDrawCount = 0;

function drawMapSafe() {
  mapView.drawMap(traj, mapPts);
  mapDrawCount += 1;
}

let running = false;
let rafId = null;
let cvReady = false;

let orb = null;
let bf = null;
let prevKp = null;
let prevDesc = null;
let emptyMask = null;

let Rw = null;
let pw = null;
let capabilityLogged = false;

function log(lines) {
  statusEl.textContent = lines.join("\n");
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const camera = createCameraPipeline({
  video,
  viewCanvas: viewC,
  log,
  onResize: () => {
    prevKp = safeDelete(prevKp);
    prevDesc = safeDelete(prevDesc);
  }
});

function resetMap() {
  if (!cvReady) {
    log(["OpenCV is not ready yet."]);
    return;
  }
  traj.length = 0;
  mapPts.length = 0;
  Rw = safeDelete(Rw);
  pw = safeDelete(pw);
  Rw = cv.Mat.eye(3, 3, cv.CV_64F);
  pw = new cv.Mat(3, 1, cv.CV_64F);
  pw.data64F[0] = 0;
  pw.data64F[1] = 0;
  pw.data64F[2] = 0;
  traj.push({ x: 0, y: 0, z: 0 });
  drawMapSafe();
}

function stop() {
  running = false;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  btnStop.disabled = true;
  btnStart.disabled = !cvReady;
}

function cleanup() {
  stop();
  camera.stopStream();
  camera.release();
  emptyMask = safeDelete(emptyMask);
  orb = safeDelete(orb);
  bf = safeDelete(bf);
  prevKp = safeDelete(prevKp);
  prevDesc = safeDelete(prevDesc);
  Rw = safeDelete(Rw);
  pw = safeDelete(pw);
}

function overlayFeatures(kp) {
  viewG.fillStyle = "rgba(120,255,160,0.9)";
  const stride = Math.max(1, Math.floor(kp.size() / 800));
  for (let i = 0; i < kp.size(); i += stride) {
    const p = kp.get(i).pt;
    viewG.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  viewG.fillStyle = "rgba(255,255,255,0.92)";
  viewG.font = "14px system-ui";
  viewG.fillText(`Features: ${kp.size()}`, 12, 22);
}

function estimatePose(kp, desc, msg) {
  const matches = new cv.DMatchVector();
  bf.match(prevDesc, desc, matches);

  const arr = [];
  for (let i = 0; i < matches.size(); i++) {
    const m = matches.get(i);
    arr.push({ q: m.queryIdx, t: m.trainIdx, d: m.distance });
  }
  arr.sort((a, b) => a.d - b.d);
  const Kkeep = Math.min(200, arr.length);
  msg.push(`Matches: ${arr.length} (keep ${Kkeep})`);

  if (Kkeep < 24) {
    msg.push(`Pose: not enough matches (${Kkeep})`);
    matches.delete();
    return;
  }

  const pts1 = [];
  const pts2 = [];
  for (let i = 0; i < Kkeep; i++) {
    const m = arr[i];
    const p1 = prevKp.get(m.q).pt;
    const p2 = kp.get(m.t).pt;
    pts1.push(p1.x, p1.y);
    pts2.push(p2.x, p2.y);
  }

  const m1 = cv.matFromArray(Kkeep, 1, cv.CV_32FC2, pts1);
  const m2 = cv.matFromArray(Kkeep, 1, cv.CV_32FC2, pts2);
  const Kmat = makeK(viewC.width, viewC.height);
  const mask = new cv.Mat();

  let E = null;
  const hasEssential = typeof cv.findEssentialMat === "function";
  const hasFundamental = typeof cv.findFundamentalMat === "function";
  if (!capabilityLogged) {
    capabilityLogged = true;
    msg.push(`Calib3d: ${hasEssential ? "essential" : hasFundamental ? "fundamental" : "missing"}`);
  }
  if (hasEssential) {
    E = cv.findEssentialMat(m1, m2, Kmat, cv.RANSAC, 0.999, 1.5, mask);
  } else if (hasFundamental) {
    const F = cv.findFundamentalMat(m1, m2, cv.FM_RANSAC, 1.5, 0.999, mask);
    if (!F.empty()) {
      E = new cv.Mat();
      cv.gemm(Kmat.t(), F, 1, new cv.Mat(), 0, E);
      cv.gemm(E, Kmat, 1, new cv.Mat(), 0, E);
    }
    F.delete();
  }

  if (E && !E.empty()) {
    const R = new cv.Mat();
    const t = new cv.Mat();
    const inliers = cv.recoverPose(E, m1, m2, Kmat, R, t, mask);
    msg.push(`Inliers: ${inliers}`);

    const tRaw = readVec3(t);
    if (!tRaw || !Number.isFinite(tRaw[0]) || !Number.isFinite(tRaw[1]) || !Number.isFinite(tRaw[2])) {
      msg.push("Pose: invalid translation vector");
    } else if (inliers < 12) {
      msg.push("Pose: too few inliers");
    } else {
      const stepScale = 0.12;
      const t64 = new cv.Mat(3, 1, cv.CV_64F);
      t64.data64F[0] = tRaw[0];
      t64.data64F[1] = tRaw[1];
      t64.data64F[2] = tRaw[2];

      const scaledT = matScale3(t64, stepScale);
      const RwNew = matMul3x3(Rw, R);
      const dp = matMul3x3Vec(Rw, scaledT);
      const pwNew = matAdd3(pw, dp);
      const px = pwNew.data64F[0];
      const py = pwNew.data64F[1];
      const pz = pwNew.data64F[2];

      if (!Number.isFinite(px) || !Number.isFinite(pz)) {
        msg.push("Pose: invalid world coordinate");
        RwNew.delete();
        pwNew.delete();
      } else {
        Rw = safeDelete(Rw);
        pw = safeDelete(pw);
        Rw = RwNew;
        pw = pwNew;

        traj.push({ x: px, y: py, z: pz });
        const mapStride = Math.max(2, Math.floor(Kkeep / 120));
        for (let i = 0; i < Kkeep; i += mapStride) {
          if (mask.dataU8[i] === 0) continue;
          const x = m2.data32F[i * 2];
          const nx = (x - viewC.width / 2) / (viewC.width / 2);
          mapPts.push({ x: px + nx * 0.25, y: 0, z: pz + 0.25 });
        }
        if (mapPts.length > 3000) {
          mapPts.splice(0, mapPts.length - 3000);
        }
        drawMapSafe();
      }

      t64.delete();
      scaledT.delete();
      dp.delete();
    }
    R.delete();
    t.delete();
  } else {
    const dxs = [];
    const dys = [];
    for (let i = 0; i < Kkeep; i++) {
      const dx = pts2[i * 2] - pts1[i * 2];
      const dy = pts2[i * 2 + 1] - pts1[i * 2 + 1];
      dxs.push(dx);
      dys.push(dy);
    }
    const mdx = median(dxs);
    const mdy = median(dys);
    if (mdx === null || mdy === null || !Number.isFinite(mdx) || !Number.isFinite(mdy)) {
      msg.push("Pose: failed (E unavailable)");
    } else {
      const pixelShift = Math.abs(mdx) + Math.abs(mdy);
      if (pixelShift < 0.5) {
        msg.push("Pose: motion too small");
      } else {
        const stepScale = 0.002;
        if (!pw) {
          msg.push("Pose: no world state");
        } else {
          pw.data64F[0] += -mdx * stepScale;
          pw.data64F[2] += -mdy * stepScale;
          traj.push({ x: pw.data64F[0], y: pw.data64F[1], z: pw.data64F[2] });
          drawMapSafe();
          msg.push("Pose: 2D flow fallback");
        }
      }
    }
  }

  if (E) E.delete();
  mask.delete();
  m1.delete();
  m2.delete();
  Kmat.delete();
  matches.delete();
}

function loop() {
  if (!running) return;
  rafId = requestAnimationFrame(loop);

  let kp = null;
  let desc = null;
  try {
    if (!orb || !bf) {
      throw new Error("Vision pipeline is not initialized.");
    }

    const frame = camera.readFrame();
    if (!frame) return;
    viewG.drawImage(video, 0, 0, viewC.width, viewC.height);

    kp = new cv.KeyPointVector();
    desc = new cv.Mat();
    orb.detectAndCompute(frame.matGray, emptyMask, kp, desc);

    overlayFeatures(kp);

    const msg = [
      `Features: ${kp.size()}`,
      `Traj: ${traj.length}`,
      `Map: ${mapPts.length}`,
      `Map size: ${mapC.width}x${mapC.height} (draw ${mapDrawCount})`
    ];

    if (prevKp && prevDesc && !prevDesc.empty() && !desc.empty()) {
      estimatePose(kp, desc, msg);
    } else {
      msg.push("Pose: waiting for previous frame...");
    }

    log(msg);

    prevKp = safeDelete(prevKp);
    prevKp = kp;
    kp = null;
    prevDesc = safeDelete(prevDesc);
    prevDesc = desc;
    desc = null;
  } catch (e) {
    stop();
    log(["Runtime error:", String(e)]);
  } finally {
    kp = safeDelete(kp);
    desc = safeDelete(desc);
  }
}

async function start() {
  if (running) return;
  if (!cvReady) {
    log(["OpenCV is not ready yet."]);
    return;
  }
  try {
    if (!camera.hasStream()) {
      log(["Requesting camera permission..."]);
      await camera.initCamera();
    }
    if (!emptyMask) {
      emptyMask = new cv.Mat();
    }
    if (!orb) {
      orb = new cv.ORB(1200, 1.2, 8, 31, 0, 2, cv.ORB_HARRIS_SCORE, 31, 20);
    }
    if (!bf) {
      bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    }
    if (!Rw || !pw) {
      resetMap();
    }

    const size = camera.getVideoSize();
    log([`Camera OK: ${size ? `${size.w}x${size.h}` : "unknown size"}`, "Move the camera slowly for pose updates."]);

    running = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnReset.disabled = false;
    loop();
  } catch (e) {
    log(["Start failed:", String(e)]);
    running = false;
    btnStart.disabled = !cvReady;
    btnStop.disabled = true;
  }
}

function onCvReady() {
  if (cvReady) return;
  cvReady = true;
  btnStart.disabled = false;
  resetMap();
  const source = window.__opencvJsSource ? `OpenCV.js loaded (${window.__opencvJsSource})` : "OpenCV.js loaded";
  log([source, "Click Start to request camera."]);
}

btnStart.addEventListener("click", start);
btnStop.addEventListener("click", stop);
btnReset.addEventListener("click", resetMap);
if (btnMapMode) {
  btnMapMode.addEventListener("click", () => {
    const next = mapView.getMode() === "2d" ? "3d" : "2d";
    mapView.setMode(next);
    btnMapMode.textContent = `Map: ${next.toUpperCase()}`;
  });
}
window.addEventListener("beforeunload", cleanup);

drawMapSafe();
loadOpenCv({
  onReady: onCvReady,
  onError: () => log(["Failed to load OpenCV.js.", "Check network connectivity and reload this page."])
});
