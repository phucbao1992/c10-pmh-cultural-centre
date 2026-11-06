import { MANAGEMENT_TEAM } from '../constants';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface TeamMember {
  id: string;
  name: string;
  role: {
    VN: string;
    EN?: string;
  };
  contact: string;
  order?: number;
  updatedAt?: string;
}

const STORAGE_KEY = 'c10_project_management_team_v3';
const EVENT_NAME = 'c10-management-team-updated';

export const getDefaultTeamMembers = (): TeamMember[] => {
  return MANAGEMENT_TEAM.map((m: any, idx: number) => ({
    id: `member-${idx + 1}`,
    name: m.name,
    role: {
      VN: typeof m.role === 'object' ? m.role.VN : m.role,
      EN: typeof m.role === 'object' ? m.role.EN : m.role
    },
    contact: m.contact || '',
    order: idx + 1
  }));
};

export const getStoredTeamMembers = (): TeamMember[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure we have the full 5 members and not old 4-member mock
      if (Array.isArray(parsed) && parsed.length >= 5) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading stored team members:', err);
  }
  const defaults = getDefaultTeamMembers();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
};

export const saveTeamMembers = (items: TeamMember[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
    
    // Async sync to Firestore
    syncTeamToFirestore(items).catch(() => {});
  } catch (err) {
    console.error('Error saving team members:', err);
  }
};

async function syncTeamToFirestore(items: TeamMember[]) {
  try {
    if (!db) return;
    const payload = {
      items,
      lastUpdated: new Date().toISOString()
    };
    await setDoc(doc(db, 'c10', 'project_team'), payload, { merge: true });
  } catch {}
}

export async function fetchRemoteTeamMembers(): Promise<TeamMember[] | null> {
  try {
    if (!db) return null;
    // Try c10 collection first
    const refC10 = doc(db, 'c10', 'project_team');
    const snapC10 = await getDoc(refC10);
    if (snapC10.exists()) {
      const data = snapC10.data();
      if (Array.isArray(data.items) && data.items.length > 0) {
        saveTeamMembers(data.items);
        return data.items;
      }
    }

    // Fallback to legacy cn82 collection and migrate
    const refLegacy = doc(db, 'cn82', 'project_team');
    const snapLegacy = await getDoc(refLegacy);
    if (snapLegacy.exists()) {
      const data = snapLegacy.data();
      if (Array.isArray(data.items) && data.items.length > 0) {
        saveTeamMembers(data.items);
        setDoc(refC10, data, { merge: true }).catch(() => {});
        return data.items;
      }
    }
  } catch {}
  return null;
}

export const resetTeamToDefault = (): TeamMember[] => {
  const defaults = getDefaultTeamMembers();
  saveTeamMembers(defaults);
  return defaults;
};

export const updateTeamMember = (id: string, updates: Partial<TeamMember>): TeamMember[] => {
  const current = getStoredTeamMembers();
  const next = current.map(item => {
    if (item.id === id) {
      return {
        ...item,
        ...updates,
        role: {
          ...item.role,
          ...(updates.role || {})
        },
        updatedAt: new Date().toISOString()
      };
    }
    return item;
  });
  saveTeamMembers(next);
  return next;
};

export const addTeamMember = (item: Omit<TeamMember, 'id'>): TeamMember[] => {
  const current = getStoredTeamMembers();
  const newItem: TeamMember = {
    ...item,
    id: `member-${Date.now()}`,
    order: current.length + 1,
    updatedAt: new Date().toISOString()
  };
  const next = [...current, newItem];
  saveTeamMembers(next);
  return next;
};

export const deleteTeamMember = (id: string): TeamMember[] => {
  const current = getStoredTeamMembers();
  const next = current.filter(item => item.id !== id);
  saveTeamMembers(next);
  return next;
};

export const subscribeTeamMembers = (callback: (items: TeamMember[]) => void): (() => void) => {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<TeamMember[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getStoredTeamMembers());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};
