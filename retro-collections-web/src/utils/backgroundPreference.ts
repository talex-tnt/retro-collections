/**
 * Per-device toggle for the animated background (a visual preference, so it
 * stays in this browser rather than the account settings).
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'rc.ui.animatedBackground';
const listeners = new Set<() => void>();

const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

let enabled = read();

export const setAnimatedBackground = (value: boolean) => {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // Not persisted (e.g. private mode); still applies for this session.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useAnimatedBackground = () =>
  useSyncExternalStore(subscribe, () => enabled);
