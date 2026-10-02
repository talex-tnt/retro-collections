/**
 * Frame loop around the scene. The same code runs inside the worker or, when
 * OffscreenCanvas isn't available, on the main thread.
 */
import {
  addScrollBoost,
  createScene,
  drawScene,
  stepScene,
  type SceneContext,
  type SceneTarget,
} from './scene';

export interface LoopInit {
  width: number;
  height: number;
  dpr: number;
  target: SceneTarget;
  smallScreen: boolean;
  reducedMotion: boolean;
}

/** Messages the main thread sends to the loop. */
export type LoopMessage =
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'target'; target: SceneTarget }
  | { type: 'scroll'; px: number }
  | { type: 'running'; running: boolean }
  | { type: 'reducedMotion'; reducedMotion: boolean };

interface Scheduler {
  request: (callback: (now: number) => void) => number;
  cancel: (handle: number) => void;
}

export const createLoop = (
  ctx: SceneContext,
  init: LoopInit,
  scheduler: Scheduler
) => {
  const scene = createScene(init.target, init.smallScreen);
  let { width, height } = init;
  let target = init.target;
  let reducedMotion = init.reducedMotion;
  let frame = 0;
  let running = false;
  let lastTime = 0;

  const resize = (nextWidth: number, nextHeight: number, dpr: number) => {
    width = nextWidth;
    height = nextHeight;
    ctx.canvas.width = Math.round(width * dpr);
    ctx.canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, width, height, scene);
  };

  const step = (now: number) => {
    // Clamp so a long pause (hidden tab) doesn't cause a jump.
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    stepScene(scene, dt, target, reducedMotion);
    drawScene(ctx, width, height, scene);
    frame = scheduler.request(step);
  };

  const setRunning = (next: boolean) => {
    if (next === running) return;
    running = next;
    scheduler.cancel(frame);
    if (running) {
      lastTime = performance.now();
      frame = scheduler.request(step);
    }
  };

  resize(init.width, init.height, init.dpr);

  return {
    handle(message: LoopMessage) {
      switch (message.type) {
        case 'resize':
          resize(message.width, message.height, message.dpr);
          break;
        case 'target':
          target = message.target;
          break;
        case 'scroll':
          addScrollBoost(scene, message.px);
          break;
        case 'running':
          setRunning(message.running);
          break;
        case 'reducedMotion':
          reducedMotion = message.reducedMotion;
          break;
      }
    },
    stop: () => setRunning(false),
  };
};
