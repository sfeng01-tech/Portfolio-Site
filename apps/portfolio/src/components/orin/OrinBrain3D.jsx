import React, { useEffect, useMemo, useRef } from 'react';
import { CAMERA_DISTANCE, brainLayout, buildBrainShell, projectPoint, rotatePoint, samplePath } from './brainScene';

const BINS = 16;
const FOCUS_BINS_FROM = Math.round(BINS * 0.62);

function hexToRgb(value) {
  const hex = String(value).trim();
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(hex);
  if (match) {
    const digits = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
  }
  const parts = hex.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return parts ? { r: Number(parts[1]), g: Number(parts[2]), b: Number(parts[3]) } : { r: 128, g: 128, b: 128 };
}

const rgba = (color, alpha) => `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readTheme(element) {
  const style = getComputedStyle(element);
  const value = (name, fallback) => style.getPropertyValue(name) || fallback;
  return {
    ink: hexToRgb(value('--ink', '#292b26')),
    accent: hexToRgb(value('--accent', '#b44828')),
    muted: hexToRgb(value('--muted', '#6b6e64')),
    paper: hexToRgb(value('--paper', '#f7f6f2')),
  };
}

export default function OrinBrain3D({ model, selection, focus, showItemLabels, onSelect }) {
  const canvasRef = useRef(null);
  const shell = useMemo(() => buildBrainShell(), []);
  const layout = useMemo(() => brainLayout(model), [model]);

  // The animation loop reads everything through refs so it never restarts.
  const live = useRef({ selection, focus, showItemLabels, onSelect, layout, shell });
  live.current = { selection, focus, showItemLabels, onSelect, layout, shell };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let theme = readTheme(canvas);
    let dirty = true;

    const view = { yaw: 0.62, pitch: -0.24 };
    let width = 0, height = 0, dragging = false, moved = false, lastX = 0, lastY = 0, hover = null, lastSelection = undefined;
    let raf = 0;
    const hits = [];
    const sx = new Float32Array(shell.points.length);
    const sy = new Float32Array(shell.points.length);
    const sz = new Float32Array(shell.points.length);
    const ss = new Float32Array(shell.points.length);
    const bins = Array.from({ length: BINS }, () => []);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(300, rect.width);
      height = clamp(Math.round(width * 0.62), 340, 560);
      canvas.style.height = `${height}px`;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    }

    const themeObserver = new MutationObserver(() => { theme = readTheme(canvas); dirty = true; });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    function pointAt(event) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      for (const hit of hits) {
        if ((x - hit.x) ** 2 + (y - hit.y) ** 2 <= hit.r ** 2) return hit.id;
      }
      return null;
    }

    const onPointerDown = (event) => {
      dragging = true; moved = false; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-dragging');
    };
    const onPointerMove = (event) => {
      if (dragging) {
        view.yaw += (event.clientX - lastX) * 0.007;
        view.pitch = clamp(view.pitch - (event.clientY - lastY) * 0.007, -0.95, 0.95);
        lastX = event.clientX; lastY = event.clientY; moved = true; dirty = true;
        return;
      }
      const id = pointAt(event);
      if (id !== hover) { hover = id; dirty = true; canvas.style.cursor = id ? 'pointer' : 'grab'; }
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
    };
    const onPointerUp = (event) => {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
      // Leaving the canvas during a drag must not count as a click.
      if (moved) return;
      live.current.onSelect({ id: pointAt(event) });
      dirty = true;
    };
    const onKeyDown = (event) => {
      const step = 0.16;
      const moves = { ArrowLeft: -step, ArrowRight: step, ArrowUp: step, ArrowDown: -step };
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') view.yaw += moves[event.key];
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') view.pitch = clamp(view.pitch + moves[event.key], -0.95, 0.95);
      else return;
      event.preventDefault();
      dirty = true;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', endDrag);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.style.cursor = 'grab';

    function drawNode(node, projected, colors) {
      const base = node.kind === 'topic' ? colors.accent : node.color ? hexToRgb(node.color) : colors.ink;
      const alpha = node.kind === 'item' && node.read ? 0.4 : 0.92;
      const radius = Math.max(2.4, node.radius * projected.scale);
      const glow = ctx.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius * 3.4);
      glow.addColorStop(0, rgba(base, 0.3));
      glow.addColorStop(1, rgba(base, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(base, alpha);
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (node.saved) {
        ctx.strokeStyle = rgba(colors.accent, 0.9);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius + 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      return radius;
    }

    function drawLabel(text, left, y, colors, strong) {
      ctx.font = "10px 'SFMono-Regular', Consolas, monospace";
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = rgba(colors.paper, 0.82);
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(left - 4, y - 8, textWidth + 8, 15, 3);
        ctx.fill();
      } else {
        ctx.fillRect(left - 4, y - 8, textWidth + 8, 15);
      }
      ctx.fillStyle = rgba(strong ? colors.ink : colors.muted, 0.95);
      ctx.fillText(text, left, y + 3);
    }

    function draw(seconds) {
      const { selection: selectedId, focus: focusSet, showItemLabels: labels, layout: scene } = live.current;
      const cosYaw = Math.cos(view.yaw), sinYaw = Math.sin(view.yaw);
      const cosPitch = Math.cos(view.pitch), sinPitch = Math.sin(view.pitch);
      const focal = 1.15 * height;

      ctx.clearRect(0, 0, width, height);
      const halo = ctx.createRadialGradient(width / 2, height / 2, 8, width / 2, height / 2, Math.min(width, height) * 0.55);
      halo.addColorStop(0, rgba(theme.accent, 0.07));
      halo.addColorStop(1, rgba(theme.paper, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);

      // Project the shell into typed arrays, bucketed by depth, to avoid
      // allocating thousands of objects every frame.
      for (const bin of bins) bin.length = 0;
      const points = live.current.shell.points;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const x1 = point.x * cosYaw + point.z * sinYaw;
        const z1 = -point.x * sinYaw + point.z * cosYaw;
        const y2 = point.y * cosPitch - z1 * sinPitch;
        const z2 = point.y * sinPitch + z1 * cosPitch;
        const scale = focal / Math.max(0.45, CAMERA_DISTANCE - z2);
        sx[index] = width / 2 + x1 * scale;
        sy[index] = height / 2 - y2 * scale;
        sz[index] = z2;
        ss[index] = scale;
        bins[clamp(Math.floor(((z2 + 1.1) / 2.2) * BINS), 0, BINS - 1)].push(index);
      }

      const drawShell = (fromBin, toBin, alphaScale) => {
        for (let bin = fromBin; bin < toBin; bin += 1) {
          const bucket = bins[bin];
          if (!bucket.length) continue;
          const near = bin / (BINS - 1);
          ctx.fillStyle = rgba(theme.ink, (0.05 + near * 0.3) * alphaScale);
          for (const index of bucket) {
            const size = clamp(ss[index] * 0.0095, 0.6, 2.1);
            ctx.fillRect(sx[index] - size / 2, sy[index] - size / 2, size, size);
          }
        }
      };
      drawShell(0, BINS, 1);

      // Silhouette: the outermost projected shell points, bucketed by screen
      // angle. This is what gives the shape a readable outline.
      const centreX = width / 2;
      const centreY = height / 2;
      const RIM = 96;
      const rimX = new Float32Array(RIM);
      const rimY = new Float32Array(RIM);
      const rimR = new Float32Array(RIM);
      for (let index = 0; index < points.length; index += 1) {
        const dx = sx[index] - centreX;
        const dy = sy[index] - centreY;
        const radius = Math.hypot(dx, dy);
        const bucket = clamp(Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * RIM), 0, RIM - 1);
        if (radius > rimR[bucket]) { rimR[bucket] = radius; rimX[bucket] = sx[index]; rimY[bucket] = sy[index]; }
      }
      const runs = [];
      let run = [];
      for (let bucket = 0; bucket < RIM * 2; bucket += 1) {
        const spot = bucket % RIM;
        if (rimR[spot] && bucket < RIM + run.length + 1) run.push({ x: rimX[spot], y: rimY[spot] });
        else if (run.length) { runs.push(run); run = []; }
      }
      if (run.length) runs.push(run);
      ctx.strokeStyle = rgba(theme.ink, 0.32);
      ctx.lineWidth = 1.2;
      for (const segment of runs) {
        if (segment.length < 12) continue;
        let smoothed = segment;
        for (let pass = 0; pass < 3; pass += 1) {
          const next = [];
          for (let index = 0; index < smoothed.length; index += 1) {
            const a = smoothed[index];
            const b = smoothed[(index + 1) % smoothed.length];
            next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
            next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
          }
          smoothed = next;
        }
        ctx.beginPath();
        smoothed.forEach((point, index) => {
          if (index) ctx.lineTo(point.x, point.y);
          else ctx.moveTo(point.x, point.y);
        });
        ctx.stroke();
      }

      // Gyri folds, shaded by how near each fold sits to the camera.
      ctx.lineWidth = 0.9;
      for (const contour of live.current.shell.contours) {
        const mid = rotatePoint(contour[Math.floor(contour.length / 2)], view.yaw, view.pitch);
        ctx.strokeStyle = rgba(theme.ink, clamp(0.06 + ((mid.z + 1) / 2) * 0.26, 0.05, 0.34));
        ctx.beginPath();
        contour.forEach((point, index) => {
          const projected = projectPoint(rotatePoint(point, view.yaw, view.pitch), { width, height });
          if (index) ctx.lineTo(projected.x, projected.y);
          else ctx.moveTo(projected.x, projected.y);
        });
        ctx.stroke();
      }

      // Fissure strands run inside the midline groove.
      ctx.strokeStyle = rgba(theme.accent, 0.42);
      ctx.lineWidth = 1.3;
      for (const strand of live.current.shell.fissure) {
        ctx.beginPath();
        strand.forEach((point, index) => {
          const projected = projectPoint(rotatePoint(point, view.yaw, view.pitch), { width, height });
          if (index) ctx.lineTo(projected.x, projected.y);
          else ctx.moveTo(projected.x, projected.y);
        });
        ctx.stroke();
      }

      // Edges, then pulses travelling along them.
      const edgeAlpha = (path) => {
        const mid = path[Math.floor(path.length / 2)];
        const rotated = rotatePoint(mid, view.yaw, view.pitch);
        return clamp(0.2 + ((rotated.z + 1) / 2) * 0.3, 0.12, 0.55);
      };
      const related = (edge) => !focusSet || focusSet.has(edge.from) || focusSet.has(edge.to);
      for (const edge of scene.edges) {
        const inFocus = related(edge);
        ctx.strokeStyle = inFocus ? rgba(theme.ink, edgeAlpha(edge.path)) : rgba(theme.ink, 0.05);
        ctx.lineWidth = clamp(0.6 + edge.weight * 0.3, 0.6, 2.2);
        ctx.beginPath();
        edge.path.forEach((point, index) => {
          const projected = projectPoint(rotatePoint(point, view.yaw, view.pitch), { width, height });
          if (index) ctx.lineTo(projected.x, projected.y);
          else ctx.moveTo(projected.x, projected.y);
        });
        ctx.stroke();
      }

      drawShell(FOCUS_BINS_FROM, BINS, 0.22);

      const t = reduced ? 0.5 : (seconds * 0.24) % 1;
      scene.edges.forEach((edge, index) => {
        if (!related(edge)) return;
        const point = samplePath(edge.path, reduced ? (index * 0.13) % 1 : (t + index * 0.13) % 1);
        const rotated = rotatePoint(point, view.yaw, view.pitch);
        if (rotated.z < -0.4) return;
        const projected = projectPoint(rotated, { width, height });
        ctx.fillStyle = rgba(theme.accent, clamp(0.3 + ((rotated.z + 1) / 2) * 0.6, 0.2, 0.9) * (focusSet ? 0.9 : 0.5));
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, clamp(projected.scale * 0.012, 1.1, 2.4), 0, Math.PI * 2);
        ctx.fill();
      });

      // Neurons and labels. Nodes are drawn nearest-last so closer ones win.
      hits.length = 0;
      const drawable = scene.nodes.map((node) => {
        const rotated = rotatePoint(node.p, view.yaw, view.pitch);
        return { node, rotated, projected: projectPoint(rotated, { width, height }) };
      }).sort((left, right) => left.projected.depth - right.projected.depth);

      const labelled = [];
      for (const entry of drawable) {
        const inFocus = !focusSet || focusSet.has(entry.node.id);
        const active = selectedId === entry.node.id || hover === entry.node.id;
        ctx.globalAlpha = inFocus ? 1 : 0.16;
        const radius = drawNode(entry.node, entry.projected, theme) * (active ? 1.25 : 1);
        ctx.globalAlpha = 1;
        if (active) {
          ctx.strokeStyle = rgba(theme.accent, 0.95);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(entry.projected.x, entry.projected.y, radius + 5.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        hits.push({ id: entry.node.id, x: entry.projected.x, y: entry.projected.y, r: radius + 7 });
        const wantsLabel = entry.node.kind !== 'item' || labels;
        // Only label neurons on the near side, so occluded ones stay quiet.
        if (inFocus && wantsLabel && entry.rotated.z > -0.06) labelled.push({ ...entry, active });
      }

      // Greedy label placement: the nearest neuron claims space first, and any
      // label that would overlap, or spill outside the canvas, is skipped.
      // Seed the placement grid with the neurons themselves so a label never
      // covers another neuron's dot.
      const placed = drawable
        .filter((entry) => (!focusSet || focusSet.has(entry.node.id)) && entry.rotated.z > -0.06 && entry.node.kind !== 'item')
        .map((entry) => ({ x1: entry.projected.x - 8, x2: entry.projected.x + 8, y1: entry.projected.y - 8, y2: entry.projected.y + 8 }));
      for (const entry of labelled) {
        const { node, projected } = entry;
        const text = node.kind === 'source' ? `${node.caption} · ${node.count}` : node.label.slice(0, 26);
        ctx.font = "10px 'SFMono-Regular', Consolas, monospace";
        const textWidth = ctx.measureText(text).width;
        const anchorX = node.kind === 'source'
          ? projected.x - projected.scale * (node.radius + 0.035)
          : projected.x + projected.scale * (node.radius + 0.03);
        const left = node.kind === 'source' ? anchorX - textWidth : anchorX;
        const rect = { x1: left - 6, x2: left + textWidth + 6, y1: projected.y - 11, y2: projected.y + 10 };
        if (rect.x1 < 4 || rect.x2 > width - 4 || rect.y1 < 4 || rect.y2 > height - 4) continue;
        if (placed.some((other) => !(rect.x2 < other.x1 || rect.x1 > other.x2 || rect.y2 < other.y1 || rect.y1 > other.y2))) continue;
        placed.push(rect);
        drawLabel(text, left, projected.y, theme, entry.active || node.kind === 'topic');
      }
    }

    let lastLayout = null;
    function frame(now) {
      const seconds = now / 1000;
      const selectedId = live.current.selection;
      if (selectedId !== lastSelection) { lastSelection = selectedId; dirty = true; }
      if (live.current.layout !== lastLayout) { lastLayout = live.current.layout; dirty = true; }
      const spinning = !dragging && !reduced && document.visibilityState === 'visible';
      if (spinning) {
        view.yaw += 0.0016;
        dirty = true;
      }
      if (dirty && document.visibilityState !== 'hidden') {
        // The shell projection is only worth paying for when something changed.
        draw(seconds);
        dirty = false;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', endDrag);
      canvas.removeEventListener('keydown', onKeyDown);
    };
  }, [shell]);

  const label = model.items.length
    ? `Interactive 3D brain: ${model.stats?.items ?? model.items.length} action neurons fed by ${model.sources.length} sources through ${model.topics.length} topic segments. Use the arrow keys to rotate; every segment and item is listed in the panel below.`
    : 'Interactive 3D brain with no items to display.';

  return <div className="orin-brain3d" title="Drag to rotate">
    <canvas ref={canvasRef} className="orin-brain3d-canvas" role="img" tabIndex={0} aria-label={label}/>
    <p className="orin-brain3d-hint" aria-hidden="true">Drag to rotate · click a neuron to trace it · arrow keys to turn</p>
  </div>;
}
