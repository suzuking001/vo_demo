export function createMapRenderer(mapCanvas) {
  const mapG = mapCanvas.getContext("2d", { willReadFrequently: true });
  let mode = "2d";
  let lastTraj = null;
  let lastMapPts = null;

  const view = {
    yaw: -0.7,
    pitch: 0.45,
    zoom: 1,
    panX: 0,
    panY: 0,
    persp: 0.18,
    heightScale: 1
  };

  const defaults = { ...view };

  const drag = {
    active: false,
    mode: "rotate",
    lastX: 0,
    lastY: 0
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toPoint(p) {
    return {
      x: Number.isFinite(p.x) ? p.x : 0,
      y: Number.isFinite(p.y) ? p.y : 0,
      z: Number.isFinite(p.z) ? p.z : 0
    };
  }

  function rotatePoint(p) {
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    const cx = Math.cos(view.pitch);
    const sx = Math.sin(view.pitch);

    const x1 = p.x * cy + p.z * sy;
    const z1 = -p.x * sy + p.z * cy;
    const y2 = p.y * cx - z1 * sx;
    const z2 = p.y * sx + z1 * cx;

    return { x: x1, y: y2, z: z2 };
  }

  function project3d(p, cx, cz, scale) {
    const r = rotatePoint(p);
    const denom = 1 + r.z * view.persp;
    const k = denom <= 0.2 ? 0.2 : denom;
    return {
      x: cx + (r.x * scale * view.zoom) / k + view.panX,
      y: cz + (r.y * view.heightScale * scale * view.zoom) / k + view.panY,
      z: r.z
    };
  }

  function drawGrid2d(cx, cz) {
    mapG.strokeStyle = "rgba(255,255,255,0.08)";
    mapG.beginPath();
    mapG.moveTo(mapCanvas.width / 2, 0);
    mapG.lineTo(mapCanvas.width / 2, mapCanvas.height);
    mapG.moveTo(0, mapCanvas.height / 2);
    mapG.lineTo(mapCanvas.width, mapCanvas.height / 2);
    mapG.stroke();
  }

  function drawMap2d(traj, mapPts) {
    mapG.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapG.fillStyle = "#0b0b0b";
    mapG.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    let maxZ = 0;
    for (const pt of traj) {
      const p = toPoint(pt);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const span = Math.max(1e-6, maxX - minX, maxZ - minZ);
    const scale = clamp((mapCanvas.width * 0.6) / span, 12, 220);
    const cx = mapCanvas.width / 2;
    const cz = mapCanvas.height / 2;

    drawGrid2d(cx, cz);

    mapG.fillStyle = "rgba(200,200,200,0.45)";
    const pointStride = Math.max(1, Math.floor(mapPts.length / 1200));
    for (let i = 0; i < mapPts.length; i += pointStride) {
      const p = toPoint(mapPts[i]);
      mapG.fillRect(cx + p.x * scale, cz + p.z * scale, 1, 1);
    }

    if (traj.length >= 2) {
      const step = Math.max(1, Math.floor((traj.length - 1) / 300));
      const points = [];
      for (let i = 0; i < traj.length; i += step) {
        points.push(toPoint(traj[i]));
      }
      if (points[points.length - 1] !== traj[traj.length - 1]) {
        points.push(toPoint(traj[traj.length - 1]));
      }
      for (let i = 1; i < points.length; i++) {
        const a = 0.2 + 0.8 * (i / (points.length - 1));
        mapG.strokeStyle = `rgba(120,170,255,${a})`;
        mapG.lineWidth = 2;
        mapG.beginPath();
        mapG.moveTo(cx + points[i - 1].x * scale, cz + points[i - 1].z * scale);
        mapG.lineTo(cx + points[i].x * scale, cz + points[i].z * scale);
        mapG.stroke();
      }
    }

    if (traj.length === 0) {
      mapG.fillStyle = "rgba(255,255,255,0.7)";
      mapG.font = "12px system-ui";
      mapG.fillText("Map ready", 12, 18);
    } else {
      const start = toPoint(traj[0]);
      mapG.fillStyle = "rgba(255,210,120,0.95)";
      mapG.beginPath();
      mapG.arc(cx + start.x * scale, cz + start.z * scale, 4, 0, Math.PI * 2);
      mapG.fill();

      const cur = toPoint(traj[traj.length - 1]);
      mapG.fillStyle = "rgba(255,120,120,0.95)";
      mapG.beginPath();
      mapG.arc(cx + cur.x * scale, cz + cur.z * scale, 4, 0, Math.PI * 2);
      mapG.fill();
    }

    mapG.fillStyle = "rgba(255,255,255,0.6)";
    mapG.font = "11px system-ui";
    mapG.fillText(`Scale: ${scale.toFixed(1)} px/unit`, 12, mapCanvas.height - 10);
  }

  function drawGrid3d(cx, cz, scale, span) {
    const gridCount = 8;
    const gridStep = Math.max(span / 8, 0.05);
    mapG.strokeStyle = "rgba(255,255,255,0.05)";
    mapG.lineWidth = 1;
    mapG.beginPath();
    for (let i = -gridCount; i <= gridCount; i++) {
      const z = i * gridStep;
      const a = project3d({ x: -gridCount * gridStep, y: 0, z }, cx, cz, scale);
      const b = project3d({ x: gridCount * gridStep, y: 0, z }, cx, cz, scale);
      mapG.moveTo(a.x, a.y);
      mapG.lineTo(b.x, b.y);
    }
    for (let i = -gridCount; i <= gridCount; i++) {
      const x = i * gridStep;
      const a = project3d({ x, y: 0, z: -gridCount * gridStep }, cx, cz, scale);
      const b = project3d({ x, y: 0, z: gridCount * gridStep }, cx, cz, scale);
      mapG.moveTo(a.x, a.y);
      mapG.lineTo(b.x, b.y);
    }
    mapG.stroke();

    const axisLen = gridStep * gridCount;
    const o = project3d({ x: 0, y: 0, z: 0 }, cx, cz, scale);
    const xAxis = project3d({ x: axisLen, y: 0, z: 0 }, cx, cz, scale);
    const zAxis = project3d({ x: 0, y: 0, z: axisLen }, cx, cz, scale);
    const yAxis = project3d({ x: 0, y: axisLen, z: 0 }, cx, cz, scale);

    mapG.lineWidth = 2;
    mapG.strokeStyle = "rgba(255,120,120,0.8)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(xAxis.x, xAxis.y);
    mapG.stroke();

    mapG.strokeStyle = "rgba(120,170,255,0.8)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(zAxis.x, zAxis.y);
    mapG.stroke();

    mapG.strokeStyle = "rgba(120,255,160,0.8)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(yAxis.x, yAxis.y);
    mapG.stroke();

    mapG.font = "12px system-ui";
    mapG.fillStyle = "rgba(255,120,120,0.9)";
    mapG.fillText("X", xAxis.x + 6, xAxis.y);
    mapG.fillStyle = "rgba(120,170,255,0.9)";
    mapG.fillText("Z", zAxis.x + 6, zAxis.y);
    mapG.fillStyle = "rgba(120,255,160,0.9)";
    mapG.fillText("Y", yAxis.x + 6, yAxis.y);
  }

  function drawTrajectory3d(traj, cx, cz, scale) {
    if (traj.length < 2) return;
    const step = Math.max(1, Math.floor((traj.length - 1) / 300));
    const points = [];
    for (let i = 0; i < traj.length; i += step) {
      points.push(toPoint(traj[i]));
    }
    if (points[points.length - 1] !== traj[traj.length - 1]) {
      points.push(toPoint(traj[traj.length - 1]));
    }
    for (let i = 1; i < points.length; i++) {
      const a = 0.2 + 0.8 * (i / (points.length - 1));
      mapG.strokeStyle = `rgba(120,170,255,${a})`;
      mapG.lineWidth = 2;
      const p0 = project3d(points[i - 1], cx, cz, scale);
      const p1 = project3d(points[i], cx, cz, scale);
      mapG.beginPath();
      mapG.moveTo(p0.x, p0.y);
      mapG.lineTo(p1.x, p1.y);
      mapG.stroke();
    }
  }

  function drawMap3d(traj, mapPts) {
    mapG.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapG.fillStyle = "#0b0b0b";
    mapG.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    let maxZ = 0;
    for (const pt of traj) {
      const p = toPoint(pt);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const span = Math.max(1e-6, maxX - minX, maxZ - minZ);
    const scale = clamp((mapCanvas.width * 0.45) / span, 8, 140);
    const cx = mapCanvas.width / 2;
    const cz = mapCanvas.height / 2 + 20;

    drawGrid3d(cx, cz, scale, span);

    mapG.fillStyle = "rgba(200,200,200,0.4)";
    const pointStride = Math.max(1, Math.floor(mapPts.length / 1200));
    for (let i = 0; i < mapPts.length; i += pointStride) {
      const p = toPoint(mapPts[i]);
      const s = project3d(p, cx, cz, scale);
      mapG.fillRect(s.x, s.y, 1, 1);
    }

    drawTrajectory3d(traj, cx, cz, scale);

    if (traj.length === 0) {
      mapG.fillStyle = "rgba(255,255,255,0.7)";
      mapG.font = "12px system-ui";
      mapG.fillText("Map ready", 12, 18);
    } else {
      const start = project3d(toPoint(traj[0]), cx, cz, scale);
      mapG.fillStyle = "rgba(255,210,120,0.95)";
      mapG.beginPath();
      mapG.arc(start.x, start.y, 4, 0, Math.PI * 2);
      mapG.fill();

      const cur = project3d(toPoint(traj[traj.length - 1]), cx, cz, scale);
      mapG.fillStyle = "rgba(255,120,120,0.95)";
      mapG.beginPath();
      mapG.arc(cur.x, cur.y, 4, 0, Math.PI * 2);
      mapG.fill();
    }

    mapG.fillStyle = "rgba(255,255,255,0.6)";
    mapG.font = "11px system-ui";
    mapG.fillText("Mode: 3D", 12, mapCanvas.height - 36);
    mapG.fillText(`Yaw: ${view.yaw.toFixed(2)}  Pitch: ${view.pitch.toFixed(2)}`, 12, mapCanvas.height - 22);
    mapG.fillText(`Zoom: ${view.zoom.toFixed(2)}  Height: x${view.heightScale.toFixed(1)}`, 12, mapCanvas.height - 8);

    mapG.fillStyle = "rgba(255,255,255,0.55)";
    mapG.font = "11px system-ui";
    mapG.fillText("Drag: rotate | Shift+drag: pan | Wheel: zoom", 12, 16);
  }

  function drawMap(traj, mapPts) {
    lastTraj = traj;
    lastMapPts = mapPts;
    if (mode === "3d") {
      drawMap3d(traj, mapPts);
    } else {
      drawMap2d(traj, mapPts);
    }
  }

  function setMode(nextMode) {
    mode = nextMode === "3d" ? "3d" : "2d";
    if (lastTraj && lastMapPts) {
      drawMap(lastTraj, lastMapPts);
    }
  }

  function getMode() {
    return mode;
  }

  function resetView() {
    view.yaw = defaults.yaw;
    view.pitch = defaults.pitch;
    view.zoom = defaults.zoom;
    view.panX = defaults.panX;
    view.panY = defaults.panY;
    view.persp = defaults.persp;
    view.heightScale = defaults.heightScale;
    if (lastTraj && lastMapPts) {
      drawMap(lastTraj, lastMapPts);
    }
  }

  function setHeightScale(next) {
    view.heightScale = clamp(next, 0.2, 8);
    if (lastTraj && lastMapPts) {
      drawMap(lastTraj, lastMapPts);
    }
  }

  function getHeightScale() {
    return view.heightScale;
  }

  function attachControls() {
    mapCanvas.style.touchAction = "none";
    mapCanvas.addEventListener("pointerdown", (event) => {
      if (mode !== "3d") return;
      drag.active = true;
      drag.mode = event.shiftKey ? "pan" : "rotate";
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      mapCanvas.setPointerCapture(event.pointerId);
    });

    mapCanvas.addEventListener("pointermove", (event) => {
      if (!drag.active || mode !== "3d") return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      if (drag.mode === "rotate") {
        view.yaw += dx * 0.006;
        view.pitch += dy * 0.006;
        view.pitch = clamp(view.pitch, -1.2, 1.2);
      } else {
        view.panX += dx;
        view.panY += dy;
      }
      if (lastTraj && lastMapPts) {
        drawMap(lastTraj, lastMapPts);
      }
    });

    const endDrag = (event) => {
      if (!drag.active) return;
      drag.active = false;
      try {
        mapCanvas.releasePointerCapture(event.pointerId);
      } catch (_) {
        // ignore
      }
    };
    mapCanvas.addEventListener("pointerup", endDrag);
    mapCanvas.addEventListener("pointercancel", endDrag);

    mapCanvas.addEventListener("wheel", (event) => {
      if (mode !== "3d") return;
      event.preventDefault();
      const delta = Math.sign(event.deltaY);
      view.zoom *= delta > 0 ? 0.9 : 1.1;
      view.zoom = clamp(view.zoom, 0.2, 6);
      if (lastTraj && lastMapPts) {
        drawMap(lastTraj, lastMapPts);
      }
    }, { passive: false });
  }

  return { drawMap, setMode, getMode, resetView, attachControls, setHeightScale, getHeightScale };
}
