export function createMapRenderer(mapCanvas) {
  const mapG = mapCanvas.getContext("2d");

  return function drawMap(traj, mapPts) {
    mapG.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapG.fillStyle = "#0b0b0b";
    mapG.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

    mapG.strokeStyle = "rgba(255,255,255,0.08)";
    mapG.beginPath();
    mapG.moveTo(mapCanvas.width / 2, 0);
    mapG.lineTo(mapCanvas.width / 2, mapCanvas.height);
    mapG.moveTo(0, mapCanvas.height / 2);
    mapG.lineTo(mapCanvas.width, mapCanvas.height / 2);
    mapG.stroke();

    let minX = 0;
    let maxX = 0;
    let minZ = 0;
    let maxZ = 0;
    for (const p of traj) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const span = Math.max(1e-6, maxX - minX, maxZ - minZ);
    const scale = (mapCanvas.width * 0.7) / span;
    const cx = mapCanvas.width / 2;
    const cz = mapCanvas.height / 2;

    mapG.fillStyle = "rgba(200,200,200,0.45)";
    const pointStride = Math.max(1, Math.floor(mapPts.length / 1200));
    for (let i = 0; i < mapPts.length; i += pointStride) {
      const p = mapPts[i];
      mapG.fillRect(cx + p.x * scale, cz + p.z * scale, 1, 1);
    }

    mapG.strokeStyle = "rgba(120,170,255,0.95)";
    mapG.lineWidth = 2;
    mapG.beginPath();
    traj.forEach((p, i) => {
      const x = cx + p.x * scale;
      const y = cz + p.z * scale;
      if (i === 0) {
        mapG.moveTo(x, y);
      } else {
        mapG.lineTo(x, y);
      }
    });
    mapG.stroke();

    if (traj.length > 0) {
      const start = traj[0];
      const sx = cx + start.x * scale;
      const sy = cz + start.z * scale;
      mapG.fillStyle = "rgba(255, 210, 120, 0.95)";
      mapG.beginPath();
      mapG.arc(sx, sy, 4, 0, Math.PI * 2);
      mapG.fill();

      const cur = traj[traj.length - 1];
      const px = cx + cur.x * scale;
      const py = cz + cur.z * scale;
      mapG.fillStyle = "rgba(255, 120, 120, 0.95)";
      mapG.beginPath();
      mapG.arc(px, py, 4, 0, Math.PI * 2);
      mapG.fill();
    }
  };
}
