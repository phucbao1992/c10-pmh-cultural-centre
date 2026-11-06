import { MILESTONES } from '../constants';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface MilestoneItem {
  id: string;
  date: string;
  description: {
    VN: string;
    EN?: string;
  };
  completed: boolean;
  order?: number;
  updatedAt?: string;
  updatedBy?: string;
}

const STORAGE_KEY = 'c10_project_milestones_custom';
const ADMIN_LOCK_KEY = 'c10_milestones_admin_lock_enabled';
const EVENT_NAME = 'c10-milestones-updated';

// Initialize default milestones with stable IDs
export const getDefaultMilestones = (): MilestoneItem[] => {
  return MILESTONES.map((m, idx) => ({
    id: `milestone-${idx + 1}`,
    date: m.date,
    description: {
      VN: m.description.VN,
      EN: m.description.EN
    },
    completed: !!m.completed,
    order: idx + 1
  }));
};

/**
 * Get current milestones from LocalStorage, fallback to constants
 */
export const getStoredMilestones = (): MilestoneItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading stored milestones:', err);
  }
  return getDefaultMilestones();
};

/**
 * Save milestones to LocalStorage and dispatch change event
 */
export const saveMilestones = (items: MilestoneItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
    
    // Asynchronously try to sync to Firestore if possible (non-blocking)
    syncMilestonesToFirestore(items).catch(() => {
      // Ignore if offline or not permitted
    });
  } catch (err) {
    console.error('Error saving milestones to localStorage:', err);
  }
};

/**
 * Asynchronously save to Firestore collection 'project_settings', doc 'milestones'
 */
async function syncMilestonesToFirestore(items: MilestoneItem[]) {
  try {
    if (!db) return;
    const payload = {
      items,
      lastUpdated: new Date().toISOString(),
      updatedBy: localStorage.getItem('user_email') || 'admin'
    };
    await setDoc(doc(db, 'c10', 'project_milestones'), payload, { merge: true });
  } catch {
    // Graceful silent fallback
  }
}

/**
 * Fetch remote milestones from Firestore if available
 */
export async function fetchRemoteMilestones(): Promise<MilestoneItem[] | null> {
  try {
    if (!db) return null;
    // Try c10 collection first
    const refC10 = doc(db, 'c10', 'project_milestones');
    const snapC10 = await getDoc(refC10);
    if (snapC10.exists()) {
      const data = snapC10.data();
      if (Array.isArray(data.items) && data.items.length > 0) {
        saveMilestones(data.items);
        return data.items;
      }
    }

    // Fallback to legacy cn82 collection and migrate
    const refLegacy = doc(db, 'cn82', 'project_milestones');
    const snapLegacy = await getDoc(refLegacy);
    if (snapLegacy.exists()) {
      const data = snapLegacy.data();
      if (Array.isArray(data.items) && data.items.length > 0) {
        saveMilestones(data.items);
        // Auto migrate to c10
        setDoc(refC10, data, { merge: true }).catch(() => {});
        return data.items;
      }
    }
  } catch {
    // Return null on failure
  }
  return null;
}

/**
 * Reset milestones to factory default
 */
export const resetMilestonesToDefault = (): MilestoneItem[] => {
  const defaults = getDefaultMilestones();
  saveMilestones(defaults);
  return defaults;
};

/**
 * Update a specific milestone
 */
export const updateMilestone = (id: string, updates: Partial<MilestoneItem>): MilestoneItem[] => {
  const current = getStoredMilestones();
  const next = current.map(item => {
    if (item.id === id) {
      return {
        ...item,
        ...updates,
        description: {
          ...item.description,
          ...(updates.description || {})
        },
        updatedAt: new Date().toISOString()
      };
    }
    return item;
  });
  saveMilestones(next);
  return next;
};

/**
 * Add a new milestone
 */
export const addMilestone = (item: Omit<MilestoneItem, 'id'>): MilestoneItem[] => {
  const current = getStoredMilestones();
  const newItem: MilestoneItem = {
    ...item,
    id: `milestone-${Date.now()}`,
    order: current.length + 1,
    updatedAt: new Date().toISOString()
  };
  const next = [...current, newItem];
  saveMilestones(next);
  return next;
};

/**
 * Delete a milestone
 */
export const deleteMilestone = (id: string): MilestoneItem[] => {
  const current = getStoredMilestones();
  const next = current.filter(item => item.id !== id);
  saveMilestones(next);
  return next;
};

/**
 * Subscribe to milestones updates
 */
export const subscribeMilestones = (callback: (items: MilestoneItem[]) => void): (() => void) => {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<MilestoneItem[]>;
    if (custom.detail) {
      callback(custom.detail);
    } else {
      callback(getStoredMilestones());
    }
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};

/**
 * Admin permission configuration:
 * Check whether editing is locked by admin policy
 */
export const isMilestonesAdminLockEnabled = (): boolean => {
  return localStorage.getItem(ADMIN_LOCK_KEY) === 'true';
};

export const setMilestonesAdminLock = (enabled: boolean): void => {
  localStorage.setItem(ADMIN_LOCK_KEY, enabled ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent('c10-milestones-admin-lock-changed', { detail: enabled }));
};

/**
 * Check if the current user has permission to edit milestones:
 * - If admin lock is NOT enabled, anyone can click to edit directly.
 * - If admin lock is enabled, user must be authenticated with layer2 / admin.
 */
export const canEditMilestones = (): boolean => {
  const isLocked = isMilestonesAdminLockEnabled();
  if (!isLocked) return true;
  return (
    localStorage.getItem('is_admin') === 'true' &&
    localStorage.getItem('c10_admin_unlocked') === 'true'
  );
};
