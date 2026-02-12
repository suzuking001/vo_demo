export function safeDelete(obj) {
  if (!obj) return null;
  try {
    obj.delete();
  } catch (_) {
    // Ignore double-delete or unexpected object lifetime errors.
  }
  return null;
}

export function readVec3(mat) {
  if (!mat) return null;
  if (mat.data64F && mat.data64F.length >= 3) {
    return [mat.data64F[0], mat.data64F[1], mat.data64F[2]];
  }
  if (mat.data32F && mat.data32F.length >= 3) {
    return [mat.data32F[0], mat.data32F[1], mat.data32F[2]];
  }
  return null;
}
