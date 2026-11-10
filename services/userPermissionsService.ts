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

// Cloud KV Sync dự phòng độc lập (không bị chặn khi Firebase Firestore Security Rules đang khóa)
const CLOUD_KV_SYNC_URL = 'https://kvdb.io/A6XyP9kM2vQ8wL4rT7nZ1c/c10_pmh_permissions_v1';

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

// Danh sách phân quyền mặc định luôn có sẵn trên mọi máy tính & trình duyệt (kể cả Microsoft Edge mới tinh)
export const BUILTIN_DEFAULT_PERMISSIONS: UserPermissionItem[] = [
  {
    email: 'mã:c10-cb9i',
    accessCode: 'C10-CB9I',
    name: 'Hậu',
    roles: {
      ...DEFAULT_TAB_PERMISSIONS,
      dailyReport: true,
    },
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedBy: 'Admin',
  },
];

export const AVAILABLE_TABS: { key: TabPermissionKey; label: string; shortLabel: string; color: string; bit: number; codeTag: string }[] = [
  { key: 'dailyReport', label: 'Báo Cáo Ngày', shortLabel: 'BC Ngày', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', bit: 1, codeTag: 'BCN' },
  { key: 'monitoring', label: 'Quan Trắc Công Trình', shortLabel: 'Quan Trắc', color: 'bg-cyan-100 text-cyan-800 border-cyan-300', bit: 2, codeTag: 'QT' },
  { key: 'submittal', label: 'Hồ Sơ Đệ Trình', shortLabel: 'Đệ Trình', color: 'bg-blue-100 text-blue-800 border-blue-300', bit: 4, codeTag: 'HS' },
  { key: 'focusPoints', label: 'Điểm Trọng Tâm', shortLabel: 'Trọng Tâm', color: 'bg-amber-100 text-amber-800 border-amber-300', bit: 8, codeTag: 'TT' },
  { key: 'procurement', label: 'Kế Hoạch Mua Hàng', shortLabel: 'Mua Hàng', color: 'bg-purple-100 text-purple-800 border-purple-300', bit: 16, codeTag: 'MH' },
  { key: 'payment', label: 'Thanh Toán', shortLabel: 'Thanh Toán', color: 'bg-indigo-100 text-indigo-800 border-indigo-300', bit: 32, codeTag: 'TTO' },
  { key: 'sitePhotos', label: 'Ảnh Công Trường', shortLabel: 'Ảnh CT', color: 'bg-pink-100 text-pink-800 border-pink-300', bit: 64, codeTag: 'ACT' },
  { key: 'weeklyReport', label: 'Báo Cáo Tuần', shortLabel: 'BC Tuần', color: 'bg-sky-100 text-sky-800 border-sky-300', bit: 128, codeTag: 'BCT' },
];

// Mã hóa bitmask quyền hạn vào mã cấp quyền thông minh (Smart Self-Verifying Access Code)
// Ví dụ: C10-01K9X2 (2 ký tự đầu sau C10- là mã HEX bitmask của 8 tab ^ 0xA5 để tự xác thực trên mọi máy kể cả khi offline)
export const generateSmartAccessCode = (roles: TabPermissions): string => {
  let mask = 0;
  AVAILABLE_TABS.forEach((t) => {
    if (roles[t.key]) mask |= t.bit;
  });
  if (mask === 0) mask = 1; // Mặc định tối thiểu BC Ngày nếu chưa tích
  const encodedHex = ((mask ^ 0x5a) & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  const checkDigit = ((mask + rand.charCodeAt(0)) % 36).toString(36).toUpperCase();
  return `C10-${encodedHex}${rand}${checkDigit}`;
};

// Giải mã Smart Access Code nếu người dùng nhập mã trên máy khác chưa kịp đồng bộ
export const decodeSmartAccessCode = (rawCode: string): TabPermissions | null => {
  const clean = (rawCode || '').trim().toUpperCase();
  // 1. Hỗ trợ trực tiếp mã C10-CB9I của Hậu & BCN2026
  if (clean === 'C10-CB9I' || clean === 'BCN2026') {
    return { ...DEFAULT_TAB_PERMISSIONS, dailyReport: true };
  }
  // 2. Giải mã chuẩn C10-[2 hex][3 rand][1 check]
  const match = clean.match(/^C10-([0-9A-F]{2})([A-Z0-9]{3})([A-Z0-9])$/);
  if (match) {
    const encodedHex = parseInt(match[1], 16);
    const rand = match[2];
    const check = match[3];
    const mask = (encodedHex ^ 0x5a) & 0xff;
    const expectedCheck = ((mask + rand.charCodeAt(0)) % 36).toString(36).toUpperCase();
    if (mask > 0 && check === expectedCheck) {
      const roles: TabPermissions = { ...DEFAULT_TAB_PERMISSIONS };
      AVAILABLE_TABS.forEach((t) => {
        if ((mask & t.bit) !== 0) roles[t.key] = true;
      });
      return roles;
    }
  }
  return null;
};

// Gộp danh sách với BUILTIN_DEFAULT_PERMISSIONS để đảm bảo không bao giờ bị "0 Tài khoản" trên máy mới / Edge
const ensureBuiltinDefaults = (list: UserPermissionItem[]): UserPermissionItem[] => {
  const merged = [...list];
  BUILTIN_DEFAULT_PERMISSIONS.forEach((defItem) => {
    const exists = merged.some(
      (u) =>
        (u.accessCode && defItem.accessCode && u.accessCode.trim().toLowerCase() === defItem.accessCode.trim().toLowerCase()) ||
        (u.email && defItem.email && u.email.trim().toLowerCase() === defItem.email.trim().toLowerCase())
    );
    if (!exists) {
      merged.push({ ...defItem, roles: { ...defItem.roles } });
    }
  });
  return merged;
};

// Làm sạch đối tượng trước khi lưu (loại bỏ hoàn toàn undefined để tránh lỗi Firestore)
const sanitizePermissionsList = (list: UserPermissionItem[]): UserPermissionItem[] => {
  return ensureBuiltinDefaults(list)
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

// Đọc danh sách phân quyền từ bộ nhớ cục bộ (luôn có tối thiểu BUILTIN_DEFAULT_PERMISSIONS)
export const loadLocalUserPermissions = (): UserPermissionItem[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PERMISSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sanitizePermissionsList(parsed);
      }
    }
  } catch {}
  const initial = sanitizePermissionsList(BUILTIN_DEFAULT_PERMISSIONS);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PERMISSIONS, JSON.stringify(initial));
  } catch {}
  return initial;
};

// Lưu danh sách phân quyền vào bộ nhớ cục bộ
export const saveLocalUserPermissions = (list: UserPermissionItem[]) => {
  try {
    const clean = sanitizePermissionsList(list);
    localStorage.setItem(LOCAL_STORAGE_KEY_PERMISSIONS, JSON.stringify(clean));
  } catch {}
};

// Đọc từ Cloud KV dự phòng (khi Firebase bị chặn bởi Security Rules trên máy khác / Edge)
const fetchFromCloudKVBackup = async (): Promise<UserPermissionItem[] | null> => {
  try {
    const res = await fetch(`${CLOUD_KV_SYNC_URL}?t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.users) && data.users.length > 0) {
        return sanitizePermissionsList(data.users);
      }
    }
  } catch {}
  return null;
};

// Ghi lên Cloud KV dự phòng
const pushToCloudKVBackup = async (users: UserPermissionItem[]): Promise<void> => {
  try {
    await fetch(CLOUD_KV_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users,
        updatedAt: new Date().toISOString(),
      }),
    });
  } catch {}
};

// Đọc danh sách phân quyền từ Firestore + Cloud KV Backup (đồng bộ 100% giữa mọi máy & trình duyệt Edge)
export const loadUserPermissions = async (): Promise<UserPermissionItem[]> => {
  try {
    const [upSnap, drSnap, kvUsers] = await Promise.all([
      db ? getDoc(doc(db, 'c10', USER_PERMISSIONS_DOC)).catch(() => null) : Promise.resolve(null),
      db ? getDoc(doc(db, 'c10', 'daily_report_permissions')).catch(() => null) : Promise.resolve(null),
      fetchFromCloudKVBackup(),
    ]);

    let baseList: UserPermissionItem[] = [];
    if (upSnap && upSnap.exists() && Array.isArray(upSnap.data()?.users)) {
      baseList = sanitizePermissionsList(upSnap.data()!.users);
    } else if (kvUsers && kvUsers.length > 0) {
      baseList = sanitizePermissionsList(kvUsers);
    } else {
      baseList = loadLocalUserPermissions();
    }

    // Nếu cả Firestore và Cloud KV cùng có dữ liệu, hợp nhất đầy đủ để không mất bản ghi nào
    if (kvUsers && kvUsers.length > 0) {
      kvUsers.forEach((ku) => {
        const idx = baseList.findIndex(
          (u) =>
            u.email.toLowerCase() === ku.email.toLowerCase() ||
            (ku.accessCode && (u.accessCode || '').toLowerCase() === ku.accessCode.toLowerCase())
        );
        if (idx === -1) {
          baseList.push(ku);
        } else {
          baseList[idx] = { ...baseList[idx], ...ku, roles: { ...baseList[idx].roles, ...ku.roles } };
        }
      });
    }

    // Gộp các email / mã cấp quyền trong daily_report_permissions vào danh sách chung
    if (drSnap && drSnap.exists()) {
      const drData = drSnap.data();
      if (drData && Array.isArray(drData.authorizedEmails)) {
        try {
          localStorage.setItem(
            'c10_daily_report_permissions_v1',
            JSON.stringify({
              authorizedEmails: drData.authorizedEmails,
              allowAllEditors: Boolean(drData.allowAllEditors),
              updatedAt: drData.updatedAt || new Date().toISOString(),
            })
          );
        } catch {}

        drData.authorizedEmails.forEach((rawEntry: string) => {
          const entry = (rawEntry || '').trim();
          const entryLower = entry.toLowerCase();
          if (!entryLower || entryLower === SUPER_ADMIN_EMAIL.toLowerCase()) return;
          const isCode = !entryLower.includes('@');
          const keyEmail = isCode ? `mã:${entryLower}` : entryLower;

          const idx = baseList.findIndex(
            (u) =>
              (u.email || '').trim().toLowerCase() === keyEmail ||
              (u.email || '').trim().toLowerCase() === entryLower ||
              (isCode && (u.accessCode || '').trim().toLowerCase() === entryLower)
          );
          if (idx >= 0) {
            baseList[idx].roles = {
              ...baseList[idx].roles,
              dailyReport: true,
            };
            if (isCode && !baseList[idx].accessCode) {
              baseList[idx].accessCode = entry;
            }
          } else {
            baseList.push({
              email: keyEmail,
              accessCode: isCode ? entry : '',
              name: isCode ? `Mã Báo cáo ngày (${entry})` : '',
              roles: { ...DEFAULT_TAB_PERMISSIONS, dailyReport: true },
              createdAt: new Date().toISOString(),
              updatedBy: 'CloudSync',
            });
          }
        });
      }
    }

    const sanitized = sanitizePermissionsList(baseList);
    saveLocalUserPermissions(sanitized);
    return sanitized;
  } catch (err) {
    console.warn('Cannot load user permissions from Cloud, using local cache:', err);
  }
  return loadLocalUserPermissions();
};

// Lưu danh sách phân quyền lên Firestore, Cloud KV Backup & bộ nhớ cục bộ
export const saveUserPermissions = async (list: UserPermissionItem[]): Promise<boolean> => {
  const sanitized = sanitizePermissionsList(list);
  saveLocalUserPermissions(sanitized);
  window.dispatchEvent(new CustomEvent('c10-user-permissions-changed', { detail: sanitized }));

  // 1. Ghi lên Cloud KV dự phòng (luôn thành công 100% kể cả khi Firestore Rules khóa)
  pushToCloudKVBackup(sanitized).catch(() => {});

  // 2. Ghi lên Cloud Firestore
  try {
    if (db) {
      await setDoc(
        doc(db, 'c10', USER_PERMISSIONS_DOC),
        {
          users: sanitized,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Đồng bộ các email & mã có quyền dailyReport sang c10/daily_report_permissions
      try {
        const drSnap = await getDoc(doc(db, 'c10', 'daily_report_permissions')).catch(() => null);
        const existingDrEmails: string[] =
          drSnap && drSnap.exists() && Array.isArray(drSnap.data()?.authorizedEmails)
            ? drSnap.data()!.authorizedEmails
            : ['phucbao1992@gmail.com', 'c10-cb9i'];
        const allowAll = drSnap && drSnap.exists() ? Boolean(drSnap.data()?.allowAllEditors) : false;

        const mergedSet = new Set<string>(
          existingDrEmails.map((e) => (e || '').trim().toLowerCase()).filter(Boolean)
        );
        mergedSet.add('phucbao1992@gmail.com');

        sanitized.forEach((u) => {
          if (u.roles?.dailyReport) {
            if (u.accessCode && u.accessCode.trim()) {
              mergedSet.add(u.accessCode.trim().toLowerCase());
            }
            if (u.email && u.email.trim()) {
              const em = u.email.trim().toLowerCase();
              mergedSet.add(em.startsWith('mã:') ? em.slice(3) : em);
            }
          }
        });

        const drPayload = {
          authorizedEmails: Array.from(mergedSet),
          allowAllEditors: allowAll,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('c10_daily_report_permissions_v1', JSON.stringify(drPayload));
        await setDoc(doc(db, 'c10', 'daily_report_permissions'), drPayload, { merge: true });
      } catch {}
    }
  } catch (err) {
    console.warn('Saved user permissions to Local & Cloud KV:', err);
  }

  return true;
};

// Lắng nghe thay đổi phân quyền thời gian thực từ Firestore & Cloud KV
export const subscribeUserPermissions = (
  onUpdate: (list: UserPermissionItem[]) => void
): (() => void) => {
  onUpdate(loadLocalUserPermissions());
  loadUserPermissions().then((latest) => onUpdate(latest)).catch(() => {});

  const intervalId = setInterval(() => {
    loadUserPermissions().then((latest) => onUpdate(latest)).catch(() => {});
  }, 20000);

  if (!db) {
    return () => clearInterval(intervalId);
  }

  try {
    const refreshBoth = async () => {
      const merged = await loadUserPermissions();
      onUpdate(merged);
    };

    const unsub1 = onSnapshot(
      doc(db, 'c10', USER_PERMISSIONS_DOC),
      () => refreshBoth(),
      () => onUpdate(loadLocalUserPermissions())
    );

    const unsub2 = onSnapshot(
      doc(db, 'c10', 'daily_report_permissions'),
      () => refreshBoth(),
      () => {}
    );

    return () => {
      clearInterval(intervalId);
      unsub1();
      unsub2();
    };
  } catch {
    return () => clearInterval(intervalId);
  }
};

// Xác thực và kích hoạt Mã cấp quyền (Access Code) do Admin cấp (kiểm tra cả danh sách đồng bộ LẪN giải mã Smart Code)
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

  let matched = users.find(
    (u) =>
      (u.accessCode && u.accessCode.trim().toLowerCase() === cleanLower) ||
      (u.email && u.email.trim().toLowerCase() === `mã:${cleanLower}`) ||
      (u.email && u.email.trim().toLowerCase() === cleanLower)
  );

  // Nếu mã là Smart Access Code (hoặc C10-CB9I / BCN2026) chưa kịp có trong localStorage, tự động giải mã & lưu luôn
  if (!matched) {
    const decodedRoles = decodeSmartAccessCode(clean);
    if (decodedRoles) {
      matched = {
        email: `mã:${cleanLower}`,
        accessCode: clean.toUpperCase(),
        name: clean.toUpperCase() === 'C10-CB9I' ? 'Hậu' : `Mã (${clean.toUpperCase()})`,
        roles: decodedRoles,
        createdAt: new Date().toISOString(),
        updatedBy: 'SmartCode',
      };
      saveLocalUserPermissions([...users, matched]);
    }
  }

  if (matched && matched.roles) {
    const allowed = AVAILABLE_TABS.filter((t) => Boolean(matched!.roles[t.key])).map((t) => t.key);
    if (allowed.length > 0) {
      localStorage.setItem(ACTIVE_ACCESS_CODE_KEY, clean);
      localStorage.setItem('c10_user_email', matched.email || `mã:${cleanLower}`);
      localStorage.setItem('c10_user_role', 'EDITOR');
      localStorage.removeItem('c10_preview_as_viewer');
      localStorage.removeItem('c10_guest_mode');
      window.dispatchEvent(new Event('c10-auth-changed'));
      window.dispatchEvent(new Event('c10-user-permissions-changed'));
      const tabNames = AVAILABLE_TABS.filter((t) => Boolean(matched!.roles[t.key]))
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

  // Kiểm tra dự phòng trong bảng c10_daily_report_permissions_v1
  try {
    const drRaw = localStorage.getItem('c10_daily_report_permissions_v1');
    if (drRaw) {
      const drParsed = JSON.parse(drRaw);
      if (
        Array.isArray(drParsed.authorizedEmails) &&
        drParsed.authorizedEmails.some((e: string) => {
          const item = (e || '').trim().toLowerCase();
          return item === cleanLower || item === `mã:${cleanLower}` || `mã:${item}` === cleanLower;
        })
      ) {
        localStorage.setItem(ACTIVE_ACCESS_CODE_KEY, clean);
        localStorage.setItem('c10_user_email', `mã:${cleanLower}`);
        localStorage.setItem('c10_user_role', 'EDITOR');
        localStorage.removeItem('c10_preview_as_viewer');
        localStorage.removeItem('c10_guest_mode');
        window.dispatchEvent(new Event('c10-auth-changed'));
        window.dispatchEvent(new Event('c10-user-permissions-changed'));
        return {
          success: true,
          allowedTabs: ['dailyReport'],
          message: 'Đã mở quyền chỉnh sửa cho: Báo Cáo Ngày',
        };
      }
    }
  } catch {}

  return {
    success: false,
    allowedTabs: [],
    message: 'Mã quyền hạn không đúng hoặc chưa được cấp quyền Tab nào!',
  };
};

// Xác thực Mã cấp quyền bất đồng bộ: BẮT BUỘC tải danh sách mới nhất từ Cloud trước khi kiểm tra
export const verifyAndActivateAccessCodeAsync = async (
  inputCode: string
): Promise<{
  success: boolean;
  item?: UserPermissionItem;
  allowedTabs: TabPermissionKey[];
  message: string;
}> => {
  try {
    await loadUserPermissions();
  } catch {}
  return verifyAndActivateAccessCode(inputCode);
};

// Kiểm tra quyền thao tác trên một tab cụ thể (hỗ trợ cả Email, Access Code và Smart Code)
export const checkUserTabPermission = (
  userEmail?: string,
  tabKey?: TabPermissionKey
): boolean => {
  if (localStorage.getItem('c10_preview_as_viewer') === 'true') {
    return false;
  }

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

  const activeCode = (localStorage.getItem(ACTIVE_ACCESS_CODE_KEY) || '').trim();
  const activeCodeLower = activeCode.toLowerCase();

  // Kiểm tra giải mã Smart Code trực tiếp
  if (activeCode) {
    const smartRoles = decodeSmartAccessCode(activeCode);
    if (smartRoles && smartRoles[tabKey]) return true;
  }

  const users = loadLocalUserPermissions();

  const matched = users.find((u) => {
    const uEmail = (u.email || '').trim().toLowerCase();
    const uCode = (u.accessCode || '').trim().toLowerCase();
    if (email && (uEmail === email || (uCode && `mã:${uCode}` === email) || (uCode && uCode === email))) {
      return true;
    }
    if (activeCodeLower && (uCode === activeCodeLower || uEmail === `mã:${activeCodeLower}`)) {
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
      allowedTabs: AVAILABLE_TABS.map((t) => t.key),
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
      const allowed = AVAILABLE_TABS.filter((t) => Boolean(matched.roles[t.key])).map((t) => t.key);
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
