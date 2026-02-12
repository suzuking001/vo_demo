export function makeK(w, h) {
  const fx = 0.9 * w;
  const fy = 0.9 * h;
  const cx = w / 2;
  const cy = h / 2;
  return cv.matFromArray(3, 3, cv.CV_64F, [fx, 0, cx, 0, fy, cy, 0, 0, 1]);
}

export function matMul3x3(A, B) {
  const C = new cv.Mat(3, 3, cv.CV_64F);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) {
        s += A.data64F[r * 3 + k] * B.data64F[k * 3 + c];
      }
      C.data64F[r * 3 + c] = s;
    }
  }
  return C;
}

export function matMul3x3Vec(A, v) {
  const o = new cv.Mat(3, 1, cv.CV_64F);
  for (let r = 0; r < 3; r++) {
    o.data64F[r] = A.data64F[r * 3] * v.data64F[0] + A.data64F[r * 3 + 1] * v.data64F[1] + A.data64F[r * 3 + 2] * v.data64F[2];
  }
  return o;
}

export function matAdd3(a, b) {
  const o = new cv.Mat(3, 1, cv.CV_64F);
  o.data64F[0] = a.data64F[0] + b.data64F[0];
  o.data64F[1] = a.data64F[1] + b.data64F[1];
  o.data64F[2] = a.data64F[2] + b.data64F[2];
  return o;
}

export function matScale3(v, s) {
  const o = new cv.Mat(3, 1, cv.CV_64F);
  o.data64F[0] = v.data64F[0] * s;
  o.data64F[1] = v.data64F[1] * s;
  o.data64F[2] = v.data64F[2] * s;
  return o;
}
