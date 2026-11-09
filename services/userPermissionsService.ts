import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export type TabPermissionKey = 
  | 'dailyReport' 
  | 'monitoring' 
  | 'submittal' 
  | 'focusPoints' 
  | 'procurement' 
  | 'payment' 
  | 'sitePhotos' 
  | 'weeklyReport';

export interface TabPermissions {
  dailyReport: boolean;     // Lập & sửa Báo cáo ngày
  monitoring: boolean;      // Quản lý cấu hình & đo đạc quan trắc
  submittal: boolean;       // Hồ sơ đệ trình & nghiệm thu
  focusPoints: boolean;     // Điểm cần tập trung
  procurement: boolean;     // Kế hoạch mua sắm
  payment: boolean;         // Hồ sơ thanh toán
  sitePhotos: boolean;      // Hình ảnh công trường
  weeklyReport: boolean;    // Báo cáo tuần & biên bản
}

export interface UserPermissionItem {
  email: string;
  accessCode?: string;      // Mã cấp quyền truy cập/chỉnh sửa theo Tab (không cần đăng nhập Google)
  name?: string;
  roles: TabPermissions;
  createdAt: string;
  updatedBy?: string;
}

export const USER_PERMISSIONS_DOC = 'user_permissions';
export const LOCAL_STORAGE_KEY_PERMISSIONS = 'c10_user_permissions_v1';
export const ACTIVE_ACCESS_CODE_KEY = 'c10_active_access_code';
export const SUPER_ADMIN_EMAIL = 'phucbao1992@gmail.com';

export const DEFAULT_TAB_PERMISSIONS: TabPermissions = {
  dailyReport: false,
  monitoring: false,
  submittal: false,
  focusPoints: false,
  procurement: false,
  payment: false,
  sitePhotos: false,
  weeklyReport: false,
};

export const AVAILABLE_TABS: { key: TabPermissionKey; label: string; shortLabel: string; color: string }[] = [
  { key: 'dailyReport', label: 'Báo Cáo Ngày', shortLabel: 'BC Ngày', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: 'monitoring', label: 'Quan Trắc Công Trình', shortLabel: 'Quan Trắc', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { key: 'submittal', label: 'Hồ Sơ Đệ Trình', shortLabel: 'Đệ Trình', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: 'focusPoints', label: 'Điểm Trọng Tâm', shortLabel: 'Trọng Tâm', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'procurement', label: 'Kế Hoạch Mua Hàng', shortLabel: 'Mua Hàng', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { key: 'payment', label: 'Thanh Toán', shortLabel: 'Thanh Toán', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { key: 'sitePhotos', label: 'Ảnh Công Trường', shortLabel: 'Ảnh CT', color: 'bg-pink-100 text-pink-800 border-pink-300' },
  { key: 'weeklyReport', label: 'Báo Cáo Tuần', shortLabel: 'BC Tuần', color: 'bg-sky-100 text-sky-800 border-sky-300' },
];

// Đọc danh sách phân quyền từ bộ nhớ cục bộ
export const loadLocalUserPermissions = (): UserPermissionItem[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PERMISSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
};

// Lưu danh sách phân quyền vào bộ nhớ cục bộ
export const saveLocalUserPermissions = (list: UserPermissionItem[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PERMISSIONS, JSON.stringify(list));
  } catch {}
};

// Làm sạch đối tượng trước khi lưu (loại bỏ hoàn toàn undefined để tránh lỗi Firestore)
const sanitizePermissionsList = (list: UserPermissionItem[]): UserPermissionItem[] => {
  return list
    .map((item) => {
      const cleanCode = (item.accessCode || '').trim();
      const rawEmail = (item.email || '').trim().toLowerCase();
      const effectiveEmail = rawEmail || (cleanCode ? `mã:${cleanCode.toLowerCase()}` : '');
      return {
        email: effectiveEmail,
        accessCode: cleanCode,
        name: item.name || '',
        roles: {
          dailyReport: Boolean(item.roles?.dailyReport),
          monitoring: Boolean(item.roles?.monitoring),
          submittal: Boolean(item.roles?.submittal),
          focusPoints: Boolean(item.roles?.focusPoints),
          procurement: Boolean(item.roles?.procurement),
          payment: Boolean(item.roles?.payment),
          sitePhotos: Boolean(item.roles?.sitePhotos),
          weeklyReport: Boolean(item.roles?.weeklyReport),
        },
        createdAt: item.createdAt || new Date().toISOString(),
        updatedBy: item.updatedBy || 'Admin',
      };
    })
    .filter((item) => item.email.length > 0 || (item.accessCode && item.accessCode.length > 0));
};

// Đọc danh sách phân quyền từ Firestore
export const loadUserPermissions = async (): Promise<UserPermissionItem[]> => {
  try {
    if (db) {
      const snap = await getDoc(doc(db, 'c10', USER_PERMISSIONS_DOC));
      if (snap.exists()) {
        const cloudData = snap.data();
        if (cloudData && Array.isArray(cloudData.users)) {
          const sanitized = sanitizePermissionsList(cloudData.users);
          saveLocalUserPermissions(sanitized);
          return sanitized;
        }
      }
    }
  } catch (err) {
    console.warn('Cannot load user permissions from Firestore, using local cache:', err);
  }
  return loadLocalUserPermissions();
};

// Lưu danh sách phân quyền lên Firestore & bộ nhớ cục bộ
export const saveUserPermissions = async (list: UserPermissionItem[]): Promise<boolean> => {
  const sanitized = sanitizePermissionsList(list);
  saveLocalUserPermissions(sanitized);
  window.dispatchEvent(new CustomEvent('c10-user-permissions-changed', { detail: sanitized }));

  try {
    if (db) {
      await setDoc(doc(db, 'c10', USER_PERMISSIONS_DOC), {
        users: sanitized,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {
    console.warn('Saved user permissions locally, cloud sync pending auth/network:', err);
  }

  return true;
};

// Lắng nghe thay đổi phân quyền thời gian thực từ Firestore
export const subscribeUserPermissions = (
  onUpdate: (list: UserPermissionItem[]) => void
): (() => void) => {
  if (!db) {
    onUpdate(loadLocalUserPermissions());
    return () => {};
  }

  try {
    const unsub = onSnapshot(
      doc(db, 'c10', USER_PERMISSIONS_DOC),
      (snap) => {
        if (snap.exists()) {
          const cloudData = snap.data();
          if (cloudData && Array.isArray(cloudData.users)) {
            const sanitized = sanitizePermissionsList(cloudData.users);
            saveLocalUserPermissions(sanitized);
            onUpdate(sanitized);
            return;
          }
        }
        onUpdate(loadLocalUserPermissions());
      },
      (err) => {
        console.warn('Firestore snapshot error on user_permissions, fallback to local:', err);
        onUpdate(loadLocalUserPermissions());
      }
    );
    return unsub;
  } catch (err) {
    console.warn('Cannot subscribe to user_permissions:', err);
    onUpdate(loadLocalUserPermissions());
    return () => {};
  }
};

// Xác thực và kích hoạt Mã cấp quyền (Access Code) do Admin cấp
export const verifyAndActivateAccessCode = (
  inputCode: string
): {
  success: boolean;
  item?: UserPermissionItem;
  allowedTabs: TabPermissionKey[];
  message: string;
} => {
  const clean = (inputCode || '').trim();
  if (!clean) {
    return { success: false, allowedTabs: [], message: 'Vui lòng nhập mã quyền hạn!' };
  }
  const cleanLower = clean.toLowerCase();
  const users = loadLocalUserPermissions();

  const matched = users.find(
    (u) =>
      (u.accessCode && u.accessCode.trim().toLowerCase() === cleanLower) ||
      (u.email && u.email.trim().toLowerCase() === `mã:${cleanLower}`)
  );

  if (matched && matched.roles) {
    const allowed = AVAILABLE_TABS.filter((t) => Boolean(matched.roles[t.key])).map((t) => t.key);
    if (allowed.length > 0) {
      localStorage.setItem(ACTIVE_ACCESS_CODE_KEY, clean);
      localStorage.setItem('c10_user_email', matched.email || `mã:${cleanLower}`);
      localStorage.removeItem('c10_preview_as_viewer');
      window.dispatchEvent(new Event('c10-auth-changed'));
      window.dispatchEvent(new Event('c10-user-permissions-changed'));
      const tabNames = AVAILABLE_TABS.filter((t) => Boolean(matched.roles[t.key]))
        .map((t) => t.label)
        .join(', ');
      return {
        success: true,
        item: matched,
        allowedTabs: allowed,
        message: `Đã mở quyền chỉnh sửa cho: ${tabNames}`,
      };
    }
  }

  return {
    success: false,
    allowedTabs: [],
    message: 'Mã quyền hạn không đúng hoặc chưa được cấp quyền Tab nào!',
  };
};

// Kiểm tra quyền thao tác trên một tab cụ thể (hỗ trợ cả Email và Mã cấp quyền Access Code)
export const checkUserTabPermission = (
  userEmail?: string,
  tabKey?: TabPermissionKey
): boolean => {
  if (localStorage.getItem('c10_preview_as_viewer') === 'true') {
    return false;
  }

  // 1. Nếu là Admin tối cao (đã đăng nhập quyền Admin qua mã PIN hoặc Google Admin)
  const isAdmin = 
    localStorage.getItem('is_admin') === 'true' &&
    localStorage.getItem('c10_admin_unlocked') === 'true';
  if (isAdmin) return true;

  if (!tabKey) return false;

  const email = (
    userEmail || 
    localStorage.getItem('c10_user_email') || 
    ''
  ).trim().toLowerCase();

  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

  const activeCode = (localStorage.getItem(ACTIVE_ACCESS_CODE_KEY) || '').trim().toLowerCase();
  const users = loadLocalUserPermissions();

  // 2. Tra cứu theo Email hoặc theo Mã cấp quyền (Access Code)
  const matched = users.find((u) => {
    const uEmail = (u.email || '').trim().toLowerCase();
    const uCode = (u.accessCode || '').trim().toLowerCase();
    if (email && (uEmail === email || (uCode && `mã:${uCode}` === email) || (uCode && uCode === email))) {
      return true;
    }
    if (activeCode && (uCode === activeCode || uEmail === `mã:${activeCode}`)) {
      return true;
    }
    return false;
  });

  if (matched && matched.roles) {
    return Boolean(matched.roles[tabKey]);
  }

  return false;
};

// Lấy thông tin phiên người dùng hiện tại
export const getCurrentUserSession = (): {
  email: string;
  accessCode?: string;
  name?: string;
  role: 'ADMIN' | 'EDITOR' | 'GUEST';
  isAdmin: boolean;
  isEditor: boolean;
  allowedTabs: TabPermissionKey[];
} => {
  const isAdmin = 
    localStorage.getItem('is_admin') === 'true' &&
    localStorage.getItem('c10_admin_unlocked') === 'true';

  const email = (localStorage.getItem('c10_user_email') || '').trim().toLowerCase();
  const activeCode = (localStorage.getItem(ACTIVE_ACCESS_CODE_KEY) || '').trim();

  if (isAdmin || email === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return {
      email: email || SUPER_ADMIN_EMAIL,
      role: 'ADMIN',
      isAdmin: true,
      isEditor: true,
      allowedTabs: AVAILABLE_TABS.map(t => t.key),
    };
  }

  if (email || activeCode) {
    const users = loadLocalUserPermissions();
    const cleanCodeLower = activeCode.toLowerCase();
    const matched = users.find((u) => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uCode = (u.accessCode || '').trim().toLowerCase();
      if (email && (uEmail === email || (uCode && `mã:${uCode}` === email) || (uCode && uCode === email))) {
        return true;
      }
      if (cleanCodeLower && (uCode === cleanCodeLower || uEmail === `mã:${cleanCodeLower}`)) {
        return true;
      }
      return false;
    });
    if (matched && matched.roles) {
      const allowed = AVAILABLE_TABS.filter(t => Boolean(matched.roles[t.key])).map(t => t.key);
      if (allowed.length > 0) {
        return {
          email: matched.name || (matched.accessCode ? `Mã: ${matched.accessCode}` : matched.email),
          accessCode: matched.accessCode || activeCode,
          name: matched.name,
          role: 'EDITOR',
          isAdmin: false,
          isEditor: true,
          allowedTabs: allowed,
        };
      }
    }
  }

  return {
    email: '',
    role: 'GUEST',
    isAdmin: false,
    isEditor: false,
    allowedTabs: [],
  };
};
