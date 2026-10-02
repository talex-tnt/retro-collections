import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useUploadQueue } from '../api/google-drive/uploadQueue';
import { useAnimatedBackground } from '../utils/backgroundPreference';
import { startSynthwave, type SynthwaveEngine } from './synthwave/engine';
import {
  BASE_SPEED,
  MAX_DPR,
  UPLOAD_SPEED,
  paletteForPath,
  type SceneTarget,
} from './synthwave/scene';

const viewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR),
});

export default function SynthwaveBackground() {
  const enabled = useAnimatedBackground();
  const { pathname } = useLocation();
  const { jobs, authNeeded } = useUploadQueue();
  const uploading =
    !authNeeded &&
    jobs.some((job) => job.status === 'pending' || job.status === 'uploading');

  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SynthwaveEngine | null>(null);
  const targetRef = useRef<SceneTarget>({
    palette: paletteForPath(pathname),
    speed: uploading ? UPLOAD_SPEED : BASE_SPEED,
  });

  // Glass panels and their glow (styles/synthwave.css) follow the scene.
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add('synthwave');
    return () => root.classList.remove('synthwave');
  }, [enabled]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--neon-hue',
      String(paletteForPath(pathname).grid)
    );
  }, [pathname]);

  useEffect(() => {
    targetRef.current = {
      palette: paletteForPath(pathname),
      speed: uploading ? UPLOAD_SPEED : BASE_SPEED,
    };
    engineRef.current?.send({ type: 'target', target: targetRef.current });
  }, [pathname, uploading]);

  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;

    // A fresh canvas per run: once handed to a worker it can't be reused.
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.appendChild(canvas);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const engine = startSynthwave(canvas, {
      ...viewport(),
      target: targetRef.current,
      smallScreen: window.matchMedia('(max-width: 768px)').matches,
      reducedMotion: reducedMotion.matches,
    });
    engineRef.current = engine;
    if (!engine) {
      canvas.remove();
      return;
    }

    const handleResize = () => engine.send({ type: 'resize', ...viewport() });

    const handleVisibility = () =>
      engine.send({
        type: 'running',
        running: document.visibilityState === 'visible',
      });

    const handleReducedMotion = () =>
      engine.send({
        type: 'reducedMotion',
        reducedMotion: reducedMotion.matches,
      });

    // Captured at the document so scrolling inside any panel counts too.
    const lastScrollTop = new WeakMap<object, number>();
    const handleScroll = (event: Event) => {
      const target = event.target;
      const source =
        target instanceof Element && target !== document.scrollingElement
          ? target
          : window;
      const top =
        source === window ? window.scrollY : (source as Element).scrollTop;
      const previous = lastScrollTop.get(source) ?? top;
      lastScrollTop.set(source, top);
      if (top !== previous) {
        engine.send({ type: 'scroll', px: Math.abs(top - previous) });
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);
    reducedMotion.addEventListener('change', handleReducedMotion);
    document.addEventListener('scroll', handleScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      reducedMotion.removeEventListener('change', handleReducedMotion);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      engine.destroy();
      engineRef.current = null;
      canvas.remove();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
}
