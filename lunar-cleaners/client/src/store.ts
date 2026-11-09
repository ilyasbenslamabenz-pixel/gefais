import { create } from 'zustand';
import type { ChatMessage, Profile, RoomInfo, RosterEntry, ZoneProgress } from '../../shared/protocol';

export type Panel = null | 'shop' | 'inventory' | 'missions' | 'profile' | 'settings' | 'leaderboard' | 'pause' | 'rooms' | 'create' | 'help';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  sensitivity: number;
  invertY: boolean;
  volume: number;
  showFps: boolean;
}

export interface Toast { id: number; text: string; kind: 'info' | 'warn' | 'good' }
export interface Floater { id: number; text: string; color: string }

const SETTINGS_KEY = 'lc_settings';
function loadSettings(): Settings {
  const def: Settings = { quality: 'medium', sensitivity: 1, invertY: false, volume: 0.6, showFps: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return def;
  }
}

interface State {
  connected: boolean;
  screen: 'menu' | 'game';
  profile: Profile | null;
  room: RoomInfo | null;
  roster: RosterEntry[];
  zones: ZoneProgress[];
  chat: ChatMessage[];
  toasts: Toast[];
  floaters: Floater[];
  panel: Panel;
  shopTab: 'tools' | 'vehicles' | 'upgrades';
  settings: Settings;
  locked: boolean;
  chatOpen: boolean;
  prompt: string;
  zoneIdx: number;
  vehicle: string;
  selectedVehicle: string;
  autopilot: boolean;
  brushes: boolean;
  debrisVersion: number;
  set: (p: Partial<State>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  floater: (text: string, color: string) => void;
  setSettings: (p: Partial<Settings>) => void;
  openPanel: (p: Panel) => void;
}

let uid = 1;

export const useStore = create<State>((set, get) => ({
  connected: false,
  screen: 'menu',
  profile: null,
  room: null,
  roster: [],
  zones: [],
  chat: [],
  toasts: [],
  floaters: [],
  panel: null,
  shopTab: 'tools',
  settings: loadSettings(),
  locked: false,
  chatOpen: false,
  prompt: '',
  zoneIdx: -1,
  vehicle: '',
  selectedVehicle: localStorage.getItem('lc_vehicle') || '',
  autopilot: false,
  brushes: true,
  debrisVersion: 0,
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = uid++;
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
  },
  floater: (text, color) => {
    const id = uid++;
    set({ floaters: [...get().floaters.slice(-6), { id, text, color }] });
    setTimeout(() => set({ floaters: get().floaters.filter((t) => t.id !== id) }), 1600);
  },
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },
  openPanel: (panel) => {
    if (panel && document.pointerLockElement) document.exitPointerLock();
    set({ panel });
  },
}));
