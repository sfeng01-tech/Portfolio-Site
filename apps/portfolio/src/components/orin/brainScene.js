// Pure 3D scene builders for the ORIN live actions brain.
//
// Everything here is plain math with no DOM or three.js dependency: the brain
// shell is a deformed sphere, neurons are placed on/inside it, and projection is
// a hand-rolled perspective transform. The renderer in OrinBrain3D.jsx only
// draws what these functions return.

export const BRAIN_SEED = 7;
export const SURFACE_SCALE = 1.045;

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deforms a point on the unit sphere into a brain-like ovoid: folded surface,
// a longitudinal fissure along the top midline, a flatter base and a cerebellum
// bump at the back-bottom.
export function shapeBrain(direction) {
  const { x, y, z } = direction;
  const lat = Math.asin(Math.max(-1, Math.min(1, y)));
  const lon = Math.atan2(z, x);
  const ripple = 1
    + 0.030 * Math.sin(5.5 * lon + 1.7 * lat) * Math.cos(4.2 * lat)
    + 0.020 * Math.sin(9.0 * lon - 2.4 * lat)
    + 0.014 * Math.cos(13 * lat + 3 * lon);
  let px = x * ripple;
  let py = y * ripple * 0.72;
  let pz = z * ripple * 1.02;
  // Frontal taper: narrower toward the front.
  px *= 1 - 0.08 * Math.max(0, pz);
  py *= 1 - 0.06 * Math.max(0, pz);
  // Temporal lobes widen the lower half.
  const lower = Math.max(0, -py);
  px *= 1 + 0.07 * lower;
  pz *= 1 + 0.03 * lower;
  // Longitudinal fissure: a narrow groove splitting the two hemispheres.
  const crease = Math.exp(-((px / 0.15) ** 2)) * Math.max(0, py);
  py -= 0.36 * crease;
  // The base is flatter than a sphere.
  py -= 0.10 * Math.max(0, -py);
  // Cerebellum tucked under the back.
  const bump = Math.exp(-(((px / 0.46) ** 2) + (((py + 0.42) / 0.28) ** 2) + (((pz + 0.72) / 0.34) ** 2)));
  px *= 1 + 0.14 * bump;
  py -= 0.08 * bump;
  pz -= 0.14 * bump;
  return { x: px, y: py, z: pz };
}

function sampleCurve(direction, from, to, samples) {
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    points.push(shapeBrain(direction(from + ((to - from) * index) / samples)));
  }
  return points;
}

export function buildBrainShell({ pointCount = 1500, seed = BRAIN_SEED } = {}) {
  const random = mulberry32(seed);
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < pointCount; index += 1) {
    const y = 1 - ((index + 0.5) / pointCount) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    const jitter = 1 + (random() - 0.5) * 0.035;
    points.push(shapeBrain({
      x: Math.cos(theta) * ring * jitter,
      y: y * jitter,
      z: Math.sin(theta) * ring * jitter,
    }));
  }
  // Deep midline fissure. Its crease is wider than the gyri, so sampling just
  // off the midline keeps the line inside the groove.
  const fissure = [
    sampleCurve((angle) => ({ x: 0, y: Math.cos(angle), z: Math.sin(angle) }), -Math.PI / 2, Math.PI / 2, 34),
    sampleCurve((angle) => ({ x: 0.075, y: Math.cos(angle), z: Math.sin(angle) }), -Math.PI / 2, Math.PI / 2, 34),
    sampleCurve((angle) => ({ x: -0.075, y: Math.cos(angle), z: Math.sin(angle) }), -Math.PI / 2, Math.PI / 2, 34),
  ];
  // Gyri: wavy latitude ribbons plus longitudinal folds. These folds, not the
  // point cloud, are what make the surface read as folded brain tissue.
  const contours = [];
  for (let band = 0; band < 9; band += 1) {
    const base = -0.74 + band * 0.185;
    const phase = band * 0.9;
    contours.push(sampleCurve((angle) => {
      const latitude = base + 0.055 * Math.sin(3 * angle + phase) + 0.025 * Math.sin(7 * angle - phase);
      const ring = Math.sqrt(Math.max(0, 1 - latitude * latitude));
      return { x: Math.cos(angle) * ring, y: latitude, z: Math.sin(angle) * ring };
    }, 0, Math.PI * 2, 56));
  }
  for (let fold = 0; fold < 5; fold += 1) {
    const phi = -1.15 + fold * 0.58;
    contours.push(sampleCurve((angle) => {
      const lateral = angle + 0.07 * Math.sin(4 * angle + fold);
      return { x: Math.cos(lateral) * Math.cos(phi), y: Math.sin(lateral), z: Math.cos(lateral) * Math.sin(phi) };
    }, -Math.PI / 2, Math.PI / 2, 32));
  }
  return { points, fissure, contours };
}

// Even surface samples restricted to one hemisphere, used for sources (left)
// and actions (right).
export function hemispherePoints(count, side, seed = BRAIN_SEED) {
  const random = mulberry32(seed + (side < 0 ? 1 : 2));
  const wanted = Math.max(1, count);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const total = 900;
  const candidates = [];
  for (let index = 0; index < total; index += 1) {
    const y = 1 - ((index + 0.5) / total) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;
    if (side < 0 ? x > -0.06 : x < 0.06) continue;
    const jitter = 1 + (random() - 0.5) * 0.02;
    const shaped = shapeBrain({ x: x * jitter, y: y * jitter, z: z * jitter });
    candidates.push({ x: shaped.x * SURFACE_SCALE, y: shaped.y * SURFACE_SCALE, z: shaped.z * SURFACE_SCALE });
  }
  if (!candidates.length) return [{ x: side * 0.5, y: 0, z: 0 }];
  // Stride across the whole candidate set instead of taking the first N, which
  // would pile every neuron into the top of the hemisphere.
  const points = [];
  for (let slot = 0; slot < wanted; slot += 1) {
    const index = wanted === 1 ? Math.floor(candidates.length / 2) : Math.round((slot * (candidates.length - 1)) / (wanted - 1));
    points.push(candidates[Math.min(candidates.length - 1, index)]);
  }
  return points;
}

export function curveBetween(from, to, { bend = 0.2, samples = 18 } = {}) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  const length = Math.hypot(mid.x, mid.y, mid.z) || 1;
  const control = {
    x: mid.x + (mid.x / length) * bend,
    y: mid.y + (mid.y / length) * bend,
    z: mid.z + (mid.z / length) * bend,
  };
  const path = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const inverse = 1 - t;
    path.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
      z: inverse * inverse * from.z + 2 * inverse * t * control.z + t * t * to.z,
    });
  }
  return path;
}

export function samplePath(path, t) {
  if (!path.length) return { x: 0, y: 0, z: 0 };
  const clamped = Math.min(1, Math.max(0, t));
  const span = path.length - 1;
  const scaled = clamped * span;
  const index = Math.min(span - 1, Math.floor(scaled));
  const local = scaled - index;
  const from = path[index];
  const to = path[Math.min(span, index + 1)];
  return {
    x: from.x + (to.x - from.x) * local,
    y: from.y + (to.y - from.y) * local,
    z: from.z + (to.z - from.z) * local,
  };
}

// Sources land on the left hemisphere, topic segments run as a spine through the
// midline, and action neurons land on the right hemisphere. Signal therefore
// crosses the brain from left to right, through its core.
export function brainLayout(model, { shellSeed = BRAIN_SEED } = {}) {
  const sourcePoints = hemispherePoints(model.sources.length, -1, shellSeed);
  const itemPoints = hemispherePoints(model.items.length, 1, shellSeed);
  const nodes = [];
  const nodesById = new Map();

  const push = (node) => { nodes.push(node); nodesById.set(node.id, node); };

  model.sources.forEach((source, index) => push({
    id: source.id, kind: 'source', label: source.label, caption: source.caption || source.label,
    color: source.color, count: source.count, radius: 0.055, p: sourcePoints[index],
  }));

  const topicCount = model.topics.length;
  model.topics.forEach((topic, index) => {
    const t = topicCount <= 1 ? 0.5 : index / (topicCount - 1);
    push({
      id: topic.id, kind: 'topic', label: topic.label, caption: topic.label,
      count: topic.count, radius: 0.05,
      p: { x: 0, y: -0.4 + t * 0.76, z: 0.32 - t * 0.66 },
    });
  });

  // Action neurons inherit their source's colour so the flow stays traceable
  // from the feed that produced them.
  const colorOfSource = new Map(model.sources.map((source) => [source.id, source.color]));
  model.items.forEach((item, index) => push({
    id: item.id, kind: 'item', label: item.label, caption: item.label,
    sourceId: item.sourceId, color: colorOfSource.get(item.sourceId),
    saved: item.saved, read: item.read, score: item.score,
    count: 1, radius: 0.034, p: itemPoints[index],
  }));

  const edges = model.edges.flatMap((edge) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) return [];
    return [{
      id: edge.id, kind: edge.kind, from: edge.from, to: edge.to, weight: edge.weight,
      path: curveBetween(from.p, to.p, { bend: edge.kind === 'source-topic' ? 0.26 : 0.16 }),
    }];
  });

  return { nodes, nodesById, edges };
}

export function rotatePoint(point, yaw, pitch) {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x = point.x * cosYaw + point.z * sinYaw;
  const z = -point.x * sinYaw + point.z * cosYaw;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  return { x, y: point.y * cosPitch - z * sinPitch, z: point.y * sinPitch + z * cosPitch };
}

export const CAMERA_DISTANCE = 2.6;

// Perspective projection onto the canvas. A point at the origin lands in the
// middle; points nearer the camera (larger z) project larger.
export function projectPoint(point, { width, height, zoom = 1, cameraDistance = CAMERA_DISTANCE } = {}) {
  const depth = cameraDistance - point.z;
  const focal = 1.15 * height * zoom;
  const scale = focal / Math.max(0.45, depth);
  // Canvas +y points down, so the brain's up axis is negated here.
  return { x: width / 2 + point.x * scale, y: height / 2 - point.y * scale, depth, scale };
}
