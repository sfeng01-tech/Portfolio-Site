import {
  cameraOf, cylinder, extrude, iso, pathOf, ring, roundedPlan, screenRise,
} from './anatomy/iso-kit.mjs';

const PROJECTION = Object.freeze({ origin: [0, 0], scale: 1, azimuth: 45, elevation: 30 });
const CAMERA = cameraOf(PROJECTION);

function screenWorld(x, y, z = 0) {
  const u = x / CAMERA.k;
  const v = y / (CAMERA.sinE * CAMERA.k) + (z * CAMERA.cosE) / CAMERA.sinE;
  return [
    u * CAMERA.sinA + v * CAMERA.cosA,
    -u * CAMERA.cosA + v * CAMERA.sinA,
    z,
  ];
}

function screenRing(plan, topZ, steps = 8) {
  return roundedPlan(plan, steps).map(([x, y]) => {
    const [wx, wy] = screenWorld(x, y, topZ);
    return [wx, wy];
  });
}

function screenSolid(plan, z, height, bevel = 0) {
  return extrude(screenRing(plan, z + height), z, height, PROJECTION, { convex: true, bevel });
}

function screenPath(points, z = 0, closed = false) {
  return pathOf(points.map(([x, y]) => iso(screenWorld(x, y, z), PROJECTION)), closed);
}

const part = (paths, tone = 'mid', className = '', crease = 'faint') => ({ paths, tone, className, crease });

function sourceParts(node) {
  const [x, y] = screenWorld(node.x, node.y, 0);
  const r = node.r;
  return {
    baseZ: 0,
    topZ: 10.3,
    parts: [
      part(cylinder(x, y, r + 2.8, 0, 1.5, PROJECTION, 32, 0.5), 'lo'),
      part(cylinder(x, y, r, 1.5, 7, PROJECTION, 40, 0.7), 'hi', 'orin-brain-body'),
      part(cylinder(x, y, Math.max(2.4, r * 0.36), 8.5, 1.8, PROJECTION, 28, 0.35), 'hi', 'orin-brain-core'),
    ],
    rings: [ring(x, y, Math.max(2, r - 1.4), 8.5, PROJECTION, 40)],
  };
}

function topicParts(node) {
  const [x, y] = screenWorld(node.x, node.y, 1);
  const r = node.r;
  const slices = Math.min(4, Math.max(1, node.topics.length));
  const parts = [part(cylinder(x, y, r + 3.2, 1, 1.5, PROJECTION, 36, 0.45), 'lo')];
  for (let index = 0; index < slices; index += 1) {
    parts.push(part(cylinder(x, y, r - index * 0.35, 2.5 + index * 3.3, 2.6, PROJECTION, 40, 0.45), 'hi', 'orin-brain-body'));
  }
  const topZ = 2.5 + (slices - 1) * 3.3 + 2.6;
  parts.push(part(cylinder(x, y, 2.2, topZ, 1.8, PROJECTION, 24, 0.3), 'hi', 'orin-brain-core'));
  return {
    baseZ: 1,
    topZ: topZ + 1.8,
    parts,
    rings: [ring(x, y, r + 1.2, 2.5, PROJECTION, 40)],
  };
}

function itemParts(node) {
  const [x, y] = screenWorld(node.x, node.y, 1);
  const r = node.r;
  return {
    baseZ: 1,
    topZ: 8.4,
    parts: [
      part(cylinder(x, y, r + 1.8, 1, 1.2, PROJECTION, 28, 0.35), 'lo'),
      part(cylinder(x, y, r, 2.2, 4.8, PROJECTION, 32, 0.45), 'hi', 'orin-brain-body'),
      part(cylinder(x, y, Math.max(1.8, r * 0.43), 7, 1.4, PROJECTION, 24, 0.3), 'hi', 'orin-brain-core'),
    ],
    rings: node.saved ? [ring(x, y, r + 0.9, 7, PROJECTION, 32)] : [],
  };
}

function rulerArt(width, height) {
  const plan = { x: width / 2 - 120, y: height - 36, w: 240, d: 8, r: 1.5 };
  const minor = [];
  const major = [];
  for (let index = 0; index <= 40; index += 1) {
    const x = plan.x + 8 + index * 5.6;
    const length = index % 5 === 0 ? 4 : 2;
    (index % 5 === 0 ? major : minor).push([[x, plan.y], [x, plan.y - length]]);
  }
  return {
    strip: screenSolid(plan, 0, 0.6),
    minorSegments: minor.map((points) => screenPath(points, 0.6)),
    majorSegments: major.map((points) => screenPath(points, 0.6)),
  };
}

export function buildBrainMachine(view) {
  const { width, height } = view;
  const basePlan = { x: 12, y: 12, w: width - 24, d: height - 24, r: 14 };
  const base = screenSolid(basePlan, -9, 9, 1.1);
  const feet = [[38, 38], [width - 38, 38], [38, height - 38], [width - 38, height - 38]].map(([x, y]) => {
    const [wx, wy] = screenWorld(x, y, -9);
    return [
      part(cylinder(wx, wy, 6.5, -15, 2, PROJECTION, 28, 0.4), 'lo'),
      part(cylinder(wx, wy, 4.8, -13, 4, PROJECTION, 28, 0.35), 'mid'),
    ];
  });
  const screwCenters = [[29, 29], [width - 29, 29], [29, height - 29], [width - 29, height - 29]]
    .map(([x, y]) => screenWorld(x, y, 0));
  const screwPoints = screwCenters.map(([x, y]) => iso([x, y, 0.8], PROJECTION));
  const screwRings = screwCenters.map(([x, y]) => part(cylinder(x, y, 2.2, 0, 0.8, PROJECTION, 20, 0.25), 'lo'));

  const trays = (view.blocks || []).map((block) => {
    const plan = { x: 390, y: block.top - 14, w: width - 435, d: Math.max(28, block.bottom - block.top + 28), r: 7 };
    const points = [[402, plan.y + 7], [width - 57, plan.y + 7], [402, plan.y + plan.d - 7], [width - 57, plan.y + plan.d - 7]]
      .map(([x, y]) => iso(screenWorld(x, y, 1.7), PROJECTION));
    return {
      topicId: block.topicId,
      solid: part(screenSolid(plan, 0, 1, 0.55), 'lo', 'orin-brain-tray'),
      outline: screenPath([[plan.x + 5, plan.y + 5], [plan.x + plan.w - 5, plan.y + 5], [plan.x + plan.w - 5, plan.y + plan.d - 5], [plan.x + 5, plan.y + plan.d - 5]], 1, true),
      points,
    };
  });

  const nodes = view.nodes.map((node) => {
    const geometry = node.kind === 'source' ? sourceParts(node) : node.kind === 'topic' ? topicParts(node) : itemParts(node);
    return {
      ...node,
      ...geometry,
      topY: node.y - screenRise(geometry.topZ - geometry.baseZ, PROJECTION),
    };
  });

  return {
    width,
    height,
    base,
    feet,
    screwPoints,
    screwRings,
    groove: screenPath(roundedPlan({ x: 21, y: 21, w: width - 42, d: height - 42, r: 10 }, 8).map(([x, y]) => [x, y]), 0, true),
    channels: [148, width / 2, width - 148 + 26].map((x) => screenPath([[x, 21], [x, height - 21]], 0)),
    ruler: rulerArt(width, height),
    trays,
    nodes,
    links: view.links,
  };
}
