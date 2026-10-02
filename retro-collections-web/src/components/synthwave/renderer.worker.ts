/**
 * Draws the synthwave scene off the main thread. Frames from an
 * OffscreenCanvas reach the screen without the page's thread, so app work
 * (rendering lists, loading images) can't stall the animation.
 */
import { createLoop, type LoopInit, type LoopMessage } from './loop';

type WorkerMessage =
  | ({ type: 'init'; canvas: OffscreenCanvas } & LoopInit)
  | LoopMessage;

// requestAnimationFrame is available in dedicated workers in most browsers;
// fall back to a ~60fps timer where it isn't.
const scheduler =
  typeof self.requestAnimationFrame === 'function'
    ? {
        request: (callback: (now: number) => void) =>
          self.requestAnimationFrame(callback),
        cancel: (handle: number) => self.cancelAnimationFrame(handle),
      }
    : {
        request: (callback: (now: number) => void) =>
          self.setTimeout(() => callback(performance.now()), 16),
        cancel: (handle: number) => self.clearTimeout(handle),
      };

let loop: ReturnType<typeof createLoop> | null = null;

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === 'init') {
    const ctx = message.canvas.getContext('2d');
    if (!ctx) return;
    loop = createLoop(ctx, message, scheduler);
    loop.handle({ type: 'running', running: true });
    return;
  }

  loop?.handle(message);
};
