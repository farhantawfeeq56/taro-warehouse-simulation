import { LayoutConfig } from './types';

const KEYS = {
  SETUP_COMPLETE: 'taro_setup_complete',
  LAYOUT_CONFIG: 'taro_layout_config',
};

export function getSetupComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEYS.SETUP_COMPLETE) === 'true';
}

export function setSetupComplete(complete: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.SETUP_COMPLETE, complete ? 'true' : 'false');
}

export function getLayoutConfig(): LayoutConfig | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(KEYS.LAYOUT_CONFIG);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to parse layout config', e);
    return null;
  }
}

export function setLayoutConfig(config: LayoutConfig | null): void {
  if (typeof window === 'undefined') return;
  if (config === null) {
    localStorage.removeItem(KEYS.LAYOUT_CONFIG);
  } else {
    localStorage.setItem(KEYS.LAYOUT_CONFIG, JSON.stringify(config));
  }
}
