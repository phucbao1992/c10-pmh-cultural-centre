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

// Đọc danh sách phân quyền từ Firestore (gộp chéo cả c10/user_permissions và c10/daily_report_permissions để đồng bộ 100% giữa mọi máy & trình duyệt)
export const loadUserPermissions = async (): Promise<UserPermissionItem[]> => {
  try {
    if (db) {
      const [upSnap, drSnap] = await Promise.all([
        getDoc(doc(db, 'c10', USER_PERMISSIONS_DOC)).catch(() => null),
        getDoc(doc(db, 'c10', 'daily_report_permissions')).catch(() => null)
      ]);

      let baseList: UserPermissionItem[] = [];
      if (upSnap && upSnap.exists()) {
        const cloudData = upSnap.data();
        if (cloudData && Array.isArray(cloudData.users)) {
          baseList = sanitizePermissionsList(cloudData.users);
        }
      } else {
        baseList = loadLocalUserPermissions();
      }

      // Gộp các email / mã cấp quyền trong daily_report_permissions vào danh sách chung
      if (drSnap && drSnap.exists()) {
        const drData = drSnap.data();
        if (drData && Array.isArray(drData.authorizedEmails)) {
          // Đồng thời lưu luôn vào localStorage của Báo cáo ngày để máy khách/Edge dùng được ngay
          try {
            localStorage.setItem(
              'c10_daily_report_permissions_v1',
              JSON.stringify({
                authorizedEmails: drData.authorizedEmails,
                allowAllEditors: Boolean(drData.allowAllEditors),
                updatedAt: drData.updatedAt || new Date().toISOString()
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
                dailyReport: true
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
                updatedBy: 'CloudSync'
              });
            }
          });
        }
      }

      const sanitized = sanitizePermissionsList(baseList);
      saveLocalUserPermissions(sanitized);
      return sanitized;
    }
  } catch (err) {
    console.warn('Cannot load user permissions from Firestore, using local cache:', err);
  }
  return loadLocalUserPermissions();
};

// Lưu danh sách phân quyền lên Firestore & bộ nhớ cục bộ (đồng bộ sang cả daily_report_permissions)
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

      // Đồng bộ các email & mã có quyền dailyReport sang c10/daily_report_permissions
      try {
        const drSnap = await getDoc(doc(db, 'c10', 'daily_report_permissions')).catch(() => null);
        const existingDrEmails: string[] =
          drSnap && drSnap.exists() && Array.isArray(drSnap.data()?.authorizedEmails)
            ? drSnap.data()!.authorizedEmails
            : ['phucbao1992@gmail.com'];
        const allowAll =
          drSnap && drSnap.exists() ? Boolean(drSnap.data()?.allowAllEditors) : false;

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
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem('c10_daily_report_permissions_v1', JSON.stringify(drPayload));
        await setDoc(doc(db, 'c10', 'daily_report_permissions'), drPayload, { merge: true });
      } catch {}
    }
  } catch (err) {
    console.warn('Saved user permissions locally, cloud sync pending auth/network:', err);
  }

  return true;
};

// Lắng nghe thay đổi phân quyền thời gian thực từ Firestore (cả 2 bảng user_permissions và daily_report_permissions)
export const subscribeUserPermissions = (
  onUpdate: (list: UserPermissionItem[]) => void
): (() => void) => {
  if (!db) {
    onUpdate(loadLocalUserPermissions());
    return () => {};
  }

  try {
    const refreshBoth = async () => {
      const merged = await loadUserPermissions();
      onUpdate(merged);
    };

    const unsub1 = onSnapshot(
      doc(db, 'c10', USER_PERMISSIONS_DOC),
      () => {
        refreshBoth();
      },
      () => {
        onUpdate(loadLocalUserPermissions());
      }
    );

    const unsub2 = onSnapshot(
      doc(db, 'c10', 'daily_report_permissions'),
      () => {
        refreshBoth();
      },
      () => {}
    );

    return () => {
      unsub1();
      unsub2();
    };
  } catch (err) {
    console.warn('Cannot subscribe to user_permissions:', err);
    onUpdate(loadLocalUserPermissions());
    return () => {};
  }
};

// Xác thực và kích hoạt Mã cấp quyền (Access Code) do Admin cấp (kiểm tra đồng thời cả 2 bảng)
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
      (u.email && u.email.trim().toLowerCase() === `mã:${cleanLower}`) ||
      (u.email && u.email.trim().toLowerCase() === cleanLower)
  );

  if (matched && matched.roles) {
    const allowed = AVAILABLE_TABS.filter((t) => Boolean(matched.roles[t.key])).map((t) => t.key);
    if (allowed.length > 0) {
      localStorage.setItem(ACTIVE_ACCESS_CODE_KEY, clean);
      localStorage.setItem('c10_user_email', matched.email || `mã:${cleanLower}`);
      localStorage.setItem('c10_user_role', 'EDITOR');
      localStorage.removeItem('c10_preview_as_viewer');
      localStorage.removeItem('c10_guest_mode');
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
          message: 'Đã mở quyền chỉnh sửa cho: Báo Cáo Ngày'
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

// Xác thực Mã cấp quyền bất đồng bộ: BẮT BUỘC tải danh sách mới nhất từ Cloud Firestore trước khi kiểm tra
// Đảm bảo mở trên máy khác hoặc trình duyệt Edge luôn nhận mã ngay lập tức 100%
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
