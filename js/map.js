export function createMapRenderer(mapCanvas) {
  const mapG = mapCanvas.getContext("2d", { willReadFrequently: true });
  let mode = "2d";
  let lastTraj = null;
  let lastMapPts = null;

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

  function projectIso(p, cx, cz, scale) {
    const x = p.x;
    const y = p.y;
    const z = p.z;
    return {
      x: cx + (x - z) * scale,
      y: cz + (x + z) * scale * 0.5 - y * scale
    };
  }

  function drawGrid3d(cx, cz, scale, span) {
    const gridCount = 8;
    const gridStep = Math.max(span / 8, 0.05);
    mapG.strokeStyle = "rgba(255,255,255,0.05)";
    mapG.lineWidth = 1;
    mapG.beginPath();
    for (let i = -gridCount; i <= gridCount; i++) {
      const z = i * gridStep;
      const a = projectIso({ x: -gridCount * gridStep, y: 0, z }, cx, cz, scale);
      const b = projectIso({ x: gridCount * gridStep, y: 0, z }, cx, cz, scale);
      mapG.moveTo(a.x, a.y);
      mapG.lineTo(b.x, b.y);
    }
    for (let i = -gridCount; i <= gridCount; i++) {
      const x = i * gridStep;
      const a = projectIso({ x, y: 0, z: -gridCount * gridStep }, cx, cz, scale);
      const b = projectIso({ x, y: 0, z: gridCount * gridStep }, cx, cz, scale);
      mapG.moveTo(a.x, a.y);
      mapG.lineTo(b.x, b.y);
    }
    mapG.stroke();

    const axisLen = gridStep * gridCount;
    const o = projectIso({ x: 0, y: 0, z: 0 }, cx, cz, scale);
    const xAxis = projectIso({ x: axisLen, y: 0, z: 0 }, cx, cz, scale);
    const zAxis = projectIso({ x: 0, y: 0, z: axisLen }, cx, cz, scale);
    const yAxis = projectIso({ x: 0, y: axisLen, z: 0 }, cx, cz, scale);

    mapG.lineWidth = 2;
    mapG.strokeStyle = "rgba(255,120,120,0.7)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(xAxis.x, xAxis.y);
    mapG.stroke();

    mapG.strokeStyle = "rgba(120,170,255,0.7)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(zAxis.x, zAxis.y);
    mapG.stroke();

    mapG.strokeStyle = "rgba(120,255,160,0.7)";
    mapG.beginPath();
    mapG.moveTo(o.x, o.y);
    mapG.lineTo(yAxis.x, yAxis.y);
    mapG.stroke();
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
      const p0 = projectIso(points[i - 1], cx, cz, scale);
      const p1 = projectIso(points[i], cx, cz, scale);
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
    const scale = clamp((mapCanvas.width * 0.4) / span, 10, 140);
    const cx = mapCanvas.width / 2;
    const cz = mapCanvas.height / 2 + 40;

    drawGrid3d(cx, cz, scale, span);

    mapG.fillStyle = "rgba(200,200,200,0.4)";
    const pointStride = Math.max(1, Math.floor(mapPts.length / 1200));
    for (let i = 0; i < mapPts.length; i += pointStride) {
      const p = toPoint(mapPts[i]);
      const s = projectIso(p, cx, cz, scale);
      mapG.fillRect(s.x, s.y, 1, 1);
    }

    drawTrajectory3d(traj, cx, cz, scale);

    if (traj.length === 0) {
      mapG.fillStyle = "rgba(255,255,255,0.7)";
      mapG.font = "12px system-ui";
      mapG.fillText("Map ready", 12, 18);
    } else {
      const start = projectIso(toPoint(traj[0]), cx, cz, scale);
      mapG.fillStyle = "rgba(255,210,120,0.95)";
      mapG.beginPath();
      mapG.arc(start.x, start.y, 4, 0, Math.PI * 2);
      mapG.fill();

      const cur = projectIso(toPoint(traj[traj.length - 1]), cx, cz, scale);
      mapG.fillStyle = "rgba(255,120,120,0.95)";
      mapG.beginPath();
      mapG.arc(cur.x, cur.y, 4, 0, Math.PI * 2);
      mapG.fill();
    }

    mapG.fillStyle = "rgba(255,255,255,0.6)";
    mapG.font = "11px system-ui";
    mapG.fillText(`Mode: 3D (iso)`, 12, mapCanvas.height - 24);
    mapG.fillText(`Scale: ${scale.toFixed(1)} px/unit`, 12, mapCanvas.height - 10);
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

  return { drawMap, setMode, getMode };
}
