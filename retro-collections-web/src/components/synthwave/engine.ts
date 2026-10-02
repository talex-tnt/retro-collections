/**
 * Starts the synthwave animation on a canvas: in a worker when the browser
 * supports OffscreenCanvas (so main-thread work can't freeze it), otherwise
 * on the main thread with the same loop.
 */
import { createLoop, type LoopInit, type LoopMessage } from './loop';

export interface SynthwaveEngine {
  send: (message: LoopMessage) => void;
  destroy: () => void;
}

const supportsWorkerCanvas = () => {
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined' ||
    !('transferControlToOffscreen' in HTMLCanvasElement.prototype)
  ) {
    return false;
  }
  try {
    return Boolean(new OffscreenCanvas(1, 1).getContext('2d'));
  } catch {
    return false;
  }
};

export const startSynthwave = (
  canvas: HTMLCanvasElement,
  init: LoopInit
): SynthwaveEngine | null => {
  if (supportsWorkerCanvas()) {
    // transferControlToOffscreen can only be called once per canvas, so the
    // caller must pass a fresh canvas each time.
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(
      new URL('./renderer.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.postMessage({ type: 'init', canvas: offscreen, ...init }, [
      offscreen,
    ]);
    return {
      send: (message) => worker.postMessage(message),
      destroy: () => worker.terminate(),
    };
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const loop = createLoop(ctx, init, {
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  });
  loop.handle({ type: 'running', running: true });
  return { send: loop.handle, destroy: loop.stop };
};
