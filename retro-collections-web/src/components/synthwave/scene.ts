/**
 * The synthwave scene: state, per-frame update and drawing. Pure canvas code
 * with no DOM access, so it runs in a worker (OffscreenCanvas) or on the
 * main thread.
 */

/** Hues (0-360) for each part of the scene; kept in the purple/blue range. */
export interface Palette {
  sky: number;
  grid: number;
  glow: number;
}

const DEFAULT_PALETTE: Palette = { sky: 262, grid: 300, glow: 285 };

// Each section of the app tints the scene slightly differently.
const ROUTE_PALETTES: Array<[prefix: string, palette: Palette]> = [
  ['/my-collectibles', DEFAULT_PALETTE],
  ['/my-collections', { sky: 248, grid: 190, glow: 215 }],
  ['/my-wishlists', { sky: 275, grid: 322, glow: 300 }],
  ['/collectors', { sky: 236, grid: 205, glow: 225 }],
  ['/users', { sky: 236, grid: 205, glow: 225 }],
  ['/tags', { sky: 268, grid: 270, glow: 255 }],
  ['/settings', { sky: 245, grid: 235, glow: 250 }],
  ['/profile', { sky: 245, grid: 235, glow: 250 }],
  ['/admin', { sky: 245, grid: 235, glow: 250 }],
];

export const paletteForPath = (pathname: string) =>
  ROUTE_PALETTES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
  DEFAULT_PALETTE;

export const BASE_SPEED = 1;
export const UPLOAD_SPEED = 3.2;
// Scrolling adds a temporary boost proportional to scroll velocity.
const SCROLL_BOOST_PER_PX = 0.02;
const MAX_SCROLL_BOOST = 6;
const SCROLL_BOOST_DECAY = 2.5;
export const MAX_DPR = 1.5;

// Floor grid geometry (world units; the camera sits CAMERA_HEIGHT above it).
const CAMERA_HEIGHT = 1;
/** Focal length relative to the larger screen side (~65° field of view). */
const FOCAL_FACTOR = 0.8;
/** Row spacing: a square tile this many times across the bottom edge. */
const ROW_TILES_ACROSS = 6;
/**
 * Target tile width along the bottom edge, in CSS pixels: wide screens get
 * more vertical lines, phones fewer (never below MIN_COLUMN_TILES).
 */
const COLUMN_TILE_PX = 200;
const MIN_COLUMN_TILES = 4;

interface Star {
  x: number;
  y: number;
  z: number;
}

const createStar = (z = Math.random()): Star => ({
  x: (Math.random() * 2 - 1) * 1.2,
  y: Math.random() * -1,
  z: Math.max(0.05, z),
});

export interface SceneTarget {
  palette: Palette;
  speed: number;
}

/** Moves `current` towards `target` on the shortest way round the hue circle. */
const approachHue = (current: number, target: number, amount: number) => {
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * amount + 360) % 360;
};

export interface SceneState {
  time: number;
  speed: number;
  gridOffset: number;
  triangleOffset: number;
  palette: Palette;
  stars: Star[];
}

export type SceneContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export const drawScene = (
  ctx: SceneContext,
  width: number,
  height: number,
  scene: SceneState
) => {
  const { palette, time } = scene;
  const horizon = Math.round(height * 0.62);
  const cx = width / 2;
  const pulse = 0.85 + 0.15 * Math.sin(time * 1.3);

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, `hsl(${palette.sky} 55% 5%)`);
  sky.addColorStop(0.7, `hsl(${palette.sky + 10} 60% 10%)`);
  sky.addColorStop(1, `hsl(${palette.sky + 25} 70% 20%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  // Stars flying towards the viewer
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, horizon);
  ctx.clip();
  const starFocal = Math.min(width, height) * 0.6;
  for (const star of scene.stars) {
    const sx = cx + (star.x / star.z) * starFocal;
    const sy = horizon * 0.55 + (star.y / star.z) * starFocal;
    const size = Math.max(0.8, (1 - star.z) * 2.6);
    const alpha = Math.min(1, 0.25 + (1 - star.z) * 1.2);
    ctx.fillStyle = `hsl(${palette.glow + 40} 90% 85% / ${alpha * 0.8})`;
    ctx.fillRect(sx, sy, size, size);
  }
  ctx.restore();

  // Sun with the classic horizontal cut-outs
  const sunRadius = Math.min(width, height) * 0.17;
  const sunY = horizon - sunRadius * 0.35;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, horizon);
  ctx.clip();
  const sun = ctx.createLinearGradient(
    0,
    sunY - sunRadius,
    0,
    sunY + sunRadius
  );
  sun.addColorStop(0, `hsl(${palette.glow + 50} 95% 70%)`);
  sun.addColorStop(1, `hsl(${palette.glow} 90% 45%)`);
  ctx.shadowColor = `hsl(${palette.glow} 100% 60%)`;
  ctx.shadowBlur = 40 * pulse;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(cx, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = `hsl(${palette.sky + 20} 65% 16%)`;
  // Stripes get thicker towards the horizon.
  for (let band = 0; band < 6; band += 1) {
    const bandY = sunY - sunRadius * 0.25 + band * sunRadius * 0.11;
    ctx.fillRect(cx - sunRadius, bandY, sunRadius * 2, 1.5 + band * 1.3);
  }

  // Neon triangles opening outwards, like a tunnel around the sun
  const triangleCount = 4;
  ctx.lineWidth = 2;
  ctx.shadowColor = `hsl(${palette.grid} 100% 60%)`;
  ctx.shadowBlur = 14;
  for (let i = 0; i < triangleCount; i += 1) {
    const phase = (scene.triangleOffset + i / triangleCount) % 1;
    const size = sunRadius * (0.9 + phase * 3.2);
    const alpha = Math.sin(phase * Math.PI) * 0.55 * pulse;
    ctx.strokeStyle = `hsl(${palette.grid} 100% 65% / ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(cx, sunY - size);
    ctx.lineTo(cx + size * 0.866, sunY + size * 0.5);
    ctx.lineTo(cx - size * 0.866, sunY + size * 0.5);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();

  // Floor
  const floor = ctx.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, `hsl(${palette.sky + 20} 60% 9%)`);
  floor.addColorStop(1, `hsl(${palette.sky} 50% 3%)`);
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizon, width, height - horizon);

  // Grid: square tiles on a flat floor, seen through a normal (not
  // wide-angle) pinhole camera, so each tile keeps its shape as it
  // approaches and only grows. The camera sits CAMERA_HEIGHT above the floor.
  const floorHeight = height - horizon;
  const floorFocal = Math.max(width, height) * FOCAL_FACTOR;
  const toScreenY = (depth: number) =>
    horizon + (CAMERA_HEIGHT * floorFocal) / depth;
  const toScreenX = (worldX: number, depth: number) =>
    cx + (worldX * floorFocal) / depth;
  const lineColor = (alpha: number) =>
    `hsl(${palette.grid} 100% 62% / ${alpha * pulse})`;

  // Depth of the floor at the bottom edge of the screen.
  const nearDepth = (CAMERA_HEIGHT * floorFocal) / floorHeight;
  const bottomSpan = (width * nearDepth) / floorFocal;
  const cell = bottomSpan / ROW_TILES_ACROSS;
  const columnTilesAcross = Math.max(
    MIN_COLUMN_TILES,
    Math.round(width / COLUMN_TILE_PX)
  );
  const columnCell = bottomSpan / columnTilesAcross;
  // Stop once rows would be under ~1.5px apart; the horizon haze covers it.
  const farDepth = Math.sqrt((CAMERA_HEIGHT * floorFocal * cell) / 1.5);

  const firstRow = Math.ceil(nearDepth / cell);
  const lastRow = Math.ceil(farDepth / cell) + 1;
  for (let k = firstRow; k <= lastRow; k += 1) {
    const depth = (k - scene.gridOffset) * cell;
    if (depth < nearDepth * 0.98) continue;
    const y = toScreenY(depth);
    const t = (y - horizon) / floorHeight;
    ctx.fillStyle = lineColor(0.1 + t * 0.6);
    ctx.fillRect(0, y, width, Math.max(1, t * 2.5));
  }

  const verticalGradient = ctx.createLinearGradient(0, horizon, 0, height);
  verticalGradient.addColorStop(0, lineColor(0.08));
  verticalGradient.addColorStop(1, lineColor(0.65));
  ctx.strokeStyle = verticalGradient;
  ctx.lineWidth = 1.5;
  // Lines beyond the bottom corners still enter through the side edges;
  // keep drawing them until they would be under ~3px apart there.
  const columns = Math.max(
    Math.ceil(columnTilesAcross / 2) + 1,
    Math.ceil(Math.sqrt((CAMERA_HEIGHT * (width / 2)) / (3 * columnCell)))
  );
  ctx.beginPath();
  for (let j = -columns; j <= columns; j += 1) {
    // Straight lines from the bottom edge to the vanishing point.
    ctx.moveTo(toScreenX(j * columnCell, nearDepth), height);
    ctx.lineTo(cx, horizon);
  }
  ctx.stroke();

  // Horizon glow
  const haze = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 30);
  haze.addColorStop(0, `hsl(${palette.glow} 100% 60% / 0)`);
  haze.addColorStop(0.6, `hsl(${palette.glow} 100% 65% / ${0.28 * pulse})`);
  haze.addColorStop(1, `hsl(${palette.glow} 100% 60% / 0)`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 40, width, 70);
  ctx.fillStyle = `hsl(${palette.grid} 100% 75% / ${0.7 * pulse})`;
  ctx.fillRect(0, horizon, width, 1.5);

  // Dim everything a little so content on top stays readable
  ctx.fillStyle = 'rgb(0 0 0 / 0.22)';
  ctx.fillRect(0, 0, width, height);
};

export const createScene = (
  target: SceneTarget,
  smallScreen: boolean
): SceneState & { scrollBoost: number } => ({
  time: 0,
  speed: target.speed,
  gridOffset: 0,
  triangleOffset: 0,
  palette: { ...target.palette },
  stars: Array.from({ length: smallScreen ? 70 : 140 }, () => createStar()),
  scrollBoost: 0,
});

export const addScrollBoost = (
  scene: { scrollBoost: number },
  scrolledPx: number
) => {
  scene.scrollBoost = Math.min(
    MAX_SCROLL_BOOST,
    scene.scrollBoost + scrolledPx * SCROLL_BOOST_PER_PX
  );
};

/** Advances the scene by `dt` seconds towards `target`. */
export const stepScene = (
  scene: SceneState & { scrollBoost: number },
  dt: number,
  target: SceneTarget,
  reducedMotion: boolean
) => {
  const ease = Math.min(1, dt * 1.5);

  scene.scrollBoost *= Math.exp(-dt * SCROLL_BOOST_DECAY);
  // Respond to scrolling quickly, settle back slowly.
  const targetSpeed = target.speed + scene.scrollBoost;
  const speedEase = targetSpeed > scene.speed ? Math.min(1, dt * 6) : ease;
  scene.speed += (targetSpeed - scene.speed) * speedEase;
  scene.palette = {
    sky: approachHue(scene.palette.sky, target.palette.sky, ease),
    grid: approachHue(scene.palette.grid, target.palette.grid, ease),
    glow: approachHue(scene.palette.glow, target.palette.glow, ease),
  };

  if (reducedMotion) return;
  scene.time += dt;
  scene.gridOffset = (scene.gridOffset + dt * 0.55 * scene.speed) % 1;
  scene.triangleOffset = (scene.triangleOffset + dt * 0.06 * scene.speed) % 1;
  for (const star of scene.stars) {
    star.z -= dt * 0.07 * scene.speed;
    if (star.z <= 0.05) Object.assign(star, createStar(1));
  }
};
