import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface SectionSyncConfig {
  dashboard: boolean;       // Mặt cắt & Tiến độ tổng thể
  dailyReport: boolean;     // Báo cáo ngày
  weeklyReport: boolean;    // Báo cáo tuần & Biên bản
  focusPoints: boolean;     // Điểm cần tập trung
  monitoring: boolean;      // Quan trắc công trình
  submittal: boolean;       // Hồ sơ nghiệm thu
  procurement: boolean;     // Kế hoạch mua hàng
  payment: boolean;         // Thanh toán
}

export interface ScheduledSyncConfig {
  enabled: boolean;
  time: string; // Định dạng "HH:mm" (ví dụ: "17:30")
  lastRunDate?: string; // Định dạng "YYYY-MM-DD" để tránh lặp lại trong ngày
}

export interface DataSyncSettings {
  manualOnly: boolean;          // true = Chỉ cập nhật khi Admin bấm nút hoặc đến giờ hẹn
  sections: SectionSyncConfig;  // Bật/tắt tự động cập nhật thời gian thực cho từng mục
  scheduledSync: ScheduledSyncConfig; // Định giờ cập nhật hàng ngày
  lastRefreshedAt: string;      // Thời điểm làm mới gần nhất (ISO)
  refreshedBy: string;          // Người thực hiện làm mới gần nhất
  refreshCounter: number;       // Bộ đếm làm mới để các máy khách nhận biết có đợt nạp mới
}

export const DATA_SYNC_DOC = 'data_sync_settings';
export const LOCAL_STORAGE_KEY_SYNC_SETTINGS = 'c10_data_sync_settings_v2';

export const DEFAULT_SYNC_SETTINGS: DataSyncSettings = {
  manualOnly: false,
  sections: {
    dashboard: true,
    dailyReport: true, // Báo cáo ngày có listener riêng trên Firestore
    weeklyReport: true,
    focusPoints: true,
    monitoring: true,
    submittal: true,
    procurement: true,
    payment: true,
  },
  scheduledSync: {
    enabled: false,
    time: '17:30',
    lastRunDate: '',
  },
  lastRefreshedAt: new Date().toISOString(),
  refreshedBy: 'Hệ thống',
  refreshCounter: 1,
};

// Đọc cấu hình từ cache nội bộ (fallback khi offline)
export const loadLocalSyncSettings = (): DataSyncSettings => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_SYNC_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SYNC_SETTINGS,
        ...parsed,
        sections: { ...DEFAULT_SYNC_SETTINGS.sections, ...(parsed.sections || {}) },
        scheduledSync: { ...DEFAULT_SYNC_SETTINGS.scheduledSync, ...(parsed.scheduledSync || {}) }
      };
    }
  } catch {}
  return DEFAULT_SYNC_SETTINGS;
};

// Lưu cấu hình vào cache nội bộ
export const saveLocalSyncSettings = (settings: DataSyncSettings) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_SYNC_SETTINGS, JSON.stringify(settings));
  } catch {}
};

// Đọc cấu hình từ Firestore
export const loadDataSyncSettings = async (): Promise<DataSyncSettings> => {
  try {
    if (db) {
      const snap = await getDoc(doc(db, 'c10', DATA_SYNC_DOC));
      if (snap.exists()) {
        const cloudData = snap.data() as Partial<DataSyncSettings>;
        const merged: DataSyncSettings = {
          ...DEFAULT_SYNC_SETTINGS,
          ...cloudData,
          sections: { ...DEFAULT_SYNC_SETTINGS.sections, ...(cloudData.sections || {}) },
          scheduledSync: { ...DEFAULT_SYNC_SETTINGS.scheduledSync, ...(cloudData.scheduledSync || {}) }
        };
        saveLocalSyncSettings(merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('Cannot load sync settings from Firestore, using local cache:', err);
  }
  return loadLocalSyncSettings();
};

// Lưu cấu hình lên bộ nhớ máy và đồng bộ lên Firestore
export const saveDataSyncSettings = async (settings: DataSyncSettings): Promise<boolean> => {
  const cleanSettings: DataSyncSettings = {
    manualOnly: Boolean(settings.manualOnly),
    sections: {
      dashboard: Boolean(settings.sections?.dashboard),
      dailyReport: Boolean(settings.sections?.dailyReport),
      weeklyReport: Boolean(settings.sections?.weeklyReport),
      focusPoints: Boolean(settings.sections?.focusPoints),
      monitoring: Boolean(settings.sections?.monitoring),
      submittal: Boolean(settings.sections?.submittal),
      procurement: Boolean(settings.sections?.procurement),
      payment: Boolean(settings.sections?.payment),
    },
    scheduledSync: {
      enabled: Boolean(settings.scheduledSync?.enabled),
      time: settings.scheduledSync?.time || '17:30',
      lastRunDate: settings.scheduledSync?.lastRunDate || '',
    },
    lastRefreshedAt: settings.lastRefreshedAt || new Date().toISOString(),
    refreshedBy: settings.refreshedBy || 'Admin',
    refreshCounter: Number(settings.refreshCounter || 1),
  };

  // 1. Luôn lưu vào bộ nhớ cục bộ để cấu hình có hiệu lực tức thì trên thiết bị Admin
  saveLocalSyncSettings(cleanSettings);
  window.dispatchEvent(new CustomEvent('c10-sync-settings-changed', { detail: cleanSettings }));

  // 2. Thử đồng bộ lên Firestore đám mây nếu có kết nối
  try {
    if (db) {
      await setDoc(doc(db, 'c10', DATA_SYNC_DOC), cleanSettings, { merge: true });
    }
  } catch (err) {
    console.warn('Sync settings saved locally, Firestore sync skipped or pending auth:', err);
  }

  // Luôn trả về true vì cấu hình đã được áp dụng và lưu thành công
  return true;
};

// Lắng nghe thay đổi cấu hình thời gian thực từ Firestore
export const subscribeDataSyncSettings = (
  onUpdate: (settings: DataSyncSettings) => void
): (() => void) => {
  if (!db) {
    onUpdate(loadLocalSyncSettings());
    return () => {};
  }

  try {
    const unsub = onSnapshot(
      doc(db, 'c10', DATA_SYNC_DOC),
      (snap) => {
        if (snap.exists()) {
          const cloudData = snap.data() as Partial<DataSyncSettings>;
          const merged: DataSyncSettings = {
            ...DEFAULT_SYNC_SETTINGS,
            ...cloudData,
            sections: { ...DEFAULT_SYNC_SETTINGS.sections, ...(cloudData.sections || {}) },
            scheduledSync: { ...DEFAULT_SYNC_SETTINGS.scheduledSync, ...(cloudData.scheduledSync || {}) }
          };
          saveLocalSyncSettings(merged);
          onUpdate(merged);
        } else {
          onUpdate(loadLocalSyncSettings());
        }
      },
      (err) => {
        console.warn('Firestore snapshot error on data_sync_settings, fallback to local:', err);
        onUpdate(loadLocalSyncSettings());
      }
    );
    return unsub;
  } catch (err) {
    console.warn('Cannot subscribe to data_sync_settings:', err);
    onUpdate(loadLocalSyncSettings());
    return () => {};
  }
};

// Kích hoạt Admin làm mới thủ công toàn bộ dữ liệu báo cáo
export const triggerAdminManualRefresh = async (adminEmail: string = 'Admin'): Promise<boolean> => {
  const current = await loadDataSyncSettings();
  const nextSettings: DataSyncSettings = {
    ...current,
    lastRefreshedAt: new Date().toISOString(),
    refreshedBy: adminEmail,
    refreshCounter: (current.refreshCounter || 0) + 1,
  };
  return await saveDataSyncSettings(nextSettings);
};

// Định dạng ngày giờ thân thiện tiếng Việt
export const formatVNDateTime = (isoString?: string): string => {
  if (!isoString) return 'Chưa cập nhật';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Chưa cập nhật';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
  } catch {
    return 'Chưa cập nhật';
  }
};