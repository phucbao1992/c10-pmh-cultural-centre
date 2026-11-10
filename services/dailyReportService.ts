import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface WeatherRow {
  id: string;
  type: 'row';
  weather: string;
  time: string;
  note: string;
}

export interface SafetyRow {
  id: string;
  type: 'row';
  desc: string;
}

export interface ManpowerRow {
  id: string;
  type: 'row';
  dept: string;
  regular: number | string;
  overtime: number | string;
}

export interface MachineryRow {
  id: string;
  type: 'row';
  name: string;
  qty: number | string;
}

export interface MaterialRow {
  id: string;
  type: 'A' | 'row';
  name: string;
  supplier?: string;
  unit?: string;
  today?: string;
  cum?: string;
  note?: string;
}

export interface WorkRow {
  id: string;
  type: 'A' | 'row';
  name: string;
  unit?: string;
  plan?: string;
  today?: string;
  cum?: string;
  next?: string;
  note?: string;
}

export interface InspectionRow {
  id: string;
  type: 'row';
  item: string;
  time: string;
  person: string;
  phone: string;
  participants: string;
  assess: string;
}

export interface PhotoRow {
  id: string;
  type: 'row';
  url: string;
  caption: string;
}

export interface GeminiSummaryData {
  overallAssessment: string;
  weatherSummary: string;
  highlights: string[];
  tomorrowFocus: string[];
  recommendations: string[];
  generatedAt?: string;
}

export interface DailyReportCloudConfig {
  driveFolderUrl: string;
  sheetUrl: string;
  appsScriptUrl?: string;
}

export interface DailyReportModel {
  g: {
    project: string;
    location: string;
    reportNo: string;
    reportDate: string;
    client: string;
    consultant: string;
    contractor: string;
    reporter: string;
  };
  logos: {
    tvgs: string;
    cdt: string;
    nt: string;
  };
  sign: {
    cTitle: string;
    cName: string;
    sTitle: string;
    sName: string;
  };
  cloud: DailyReportCloudConfig;
  fileSuffix: string;
  weather: WeatherRow[];
  safety: SafetyRow[];
  man: ManpowerRow[];
  mach: MachineryRow[];
  mat: MaterialRow[];
  work: WorkRow[];
  insp: InspectionRow[];
  photos: PhotoRow[];
  aiSummary?: GeminiSummaryData | null;
  savedAt?: string;
}

export const STORAGE_KEY_PUBLISHED = 'c10_daily_report_published_v3';
export const STORAGE_KEY_DRAFT = 'c10_daily_report_draft_v3';
export const STORAGE_KEY_CLOUD_CONFIG = 'c10_daily_report_cloud_config_v1';
export const STORAGE_KEY_LOGOS_VAULT = 'c10_permanent_logos_v1';
export const DAILY_REPORT_CONFIG_EVENT = 'c10-daily-report-config-updated';
export const DAILY_REPORT_LOGOS_EVENT = 'c10-daily-report-logos-updated';

export const DEFAULT_FILE_SUFFIX = 'Delta-Báo cáo ngày';
export const DEFAULT_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/10sldhCeoddg_8qx78DKVAauYET2J4sCp';
export const DEFAULT_GOOGLE_SHEET_URL = '';
export const DEFAULT_APPS_SCRIPT_URL = '';

export type ReportLogos = DailyReportModel['logos'];

/**
 * Đọc bộ 3 Logo cố định (TVGS, Chủ đầu tư, Nhà thầu) từ bộ nhớ bền vững.
 * Đảm bảo một khi người dùng đã tải logo lên thì không bao giờ bị mất khi đồng bộ app hay sang ngày mới.
 */
export const loadSavedReportLogos = (): ReportLogos => {
  const empty: ReportLogos = { tvgs: '', cdt: '', nt: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGOS_VAULT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          tvgs: typeof parsed.tvgs === 'string' ? parsed.tvgs : '',
          cdt: typeof parsed.cdt === 'string' ? parsed.cdt : '',
          nt: typeof parsed.nt === 'string' ? parsed.nt : ''
        };
      }
    }
  } catch {}
  return empty;
};

/**
 * Hợp nhất logo của báo cáo với kho lưu trữ cố định (ưu tiên giữ logo đã lưu nếu báo cáo truyền vào bị rỗng).
 */
export const mergeWithPermanentLogos = (
  incoming?: Partial<ReportLogos> | null
): ReportLogos => {
  const vault = loadSavedReportLogos();
  return {
    tvgs: incoming?.tvgs && incoming.tvgs.trim() ? incoming.tvgs : vault.tvgs,
    cdt: incoming?.cdt && incoming.cdt.trim() ? incoming.cdt : vault.cdt,
    nt: incoming?.nt && incoming.nt.trim() ? incoming.nt : vault.nt
  };
};

/**
 * Lưu bộ 3 Logo vào LocalStorage cố định (chỉ xóa khi có cờ explicitClearKey).
 */
export const saveReportLogosLocal = (
  partialLogos: Partial<ReportLogos>,
  explicitClearKey?: keyof ReportLogos
): ReportLogos => {
  const current = loadSavedReportLogos();
  const next: ReportLogos = {
    tvgs:
      explicitClearKey === 'tvgs'
        ? ''
        : partialLogos.tvgs && partialLogos.tvgs.trim()
        ? partialLogos.tvgs
        : current.tvgs,
    cdt:
      explicitClearKey === 'cdt'
        ? ''
        : partialLogos.cdt && partialLogos.cdt.trim()
        ? partialLogos.cdt
        : current.cdt,
    nt:
      explicitClearKey === 'nt'
        ? ''
        : partialLogos.nt && partialLogos.nt.trim()
        ? partialLogos.nt
        : current.nt
  };
  try {
    localStorage.setItem(STORAGE_KEY_LOGOS_VAULT, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(DAILY_REPORT_LOGOS_EVENT, { detail: next }));
  } catch {}
  return next;
};

export const sanitizeC10SheetUrl = (url?: string): string => {
  if (!url) return '';
  return url.trim();
};

export const extractFolderIdFromUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = url.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
};

export const extractSpreadsheetIdFromUrl = (url?: string): string => {
  if (!url) return '';
  const trimmed = sanitizeC10SheetUrl(url);
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
};

export const loadSavedDailyReportCloudConfig = (): DailyReportCloudConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLOUD_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          driveFolderUrl: parsed.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL,
          sheetUrl: sanitizeC10SheetUrl(parsed.sheetUrl),
          appsScriptUrl: (parsed.appsScriptUrl || '').trim()
        };
      }
    }
  } catch {}
  return {
    driveFolderUrl: DEFAULT_DRIVE_FOLDER_URL,
    sheetUrl: DEFAULT_GOOGLE_SHEET_URL,
    appsScriptUrl: DEFAULT_APPS_SCRIPT_URL
  };
};

export const saveDailyReportCloudConfigLocal = (cfg: DailyReportCloudConfig): DailyReportCloudConfig => {
  const normalized: DailyReportCloudConfig = {
    driveFolderUrl: (cfg.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL).trim(),
    sheetUrl: sanitizeC10SheetUrl(cfg.sheetUrl),
    appsScriptUrl: (cfg.appsScriptUrl || '').trim()
  };
  try {
    localStorage.setItem(STORAGE_KEY_CLOUD_CONFIG, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(DAILY_REPORT_CONFIG_EVENT, { detail: normalized }));
  } catch {}
  return normalized;
};

// -------------------------------------------------------------
// Cloud Firestore Realtime Sync, History Archive & Permissions
// -------------------------------------------------------------
export interface DailyReportHistoryEntry {
  date: string;
  dateKey: string;
  reportNo: string;
  project?: string;
  savedAt: string;
  updatedBy?: string;
}

export interface DailyReportPermissions {
  authorizedEmails: string[];
  allowAllEditors: boolean;
  updatedAt?: string;
}

export const STORAGE_KEY_PERMISSIONS = 'c10_daily_report_permissions_v1';
export const DAILY_REPORT_DOC_PUBLISHED = 'daily_report_published';
export const DAILY_REPORT_DOC_INDEX = 'daily_reports_index';
export const DAILY_REPORT_DOC_PERMISSIONS = 'daily_report_permissions';
export const DAILY_REPORT_DOC_LOGOS = 'report_logos_vault';

/**
 * Lưu cố định Logo (TVGS, Chủ đầu tư, Nhà thầu) lên Cloud Firestore (`c10/report_logos_vault`)
 * và đồng bộ ngay vào báo cáo hiện hành (`c10/daily_report_published`).
 * Một khi đã lưu, logo sẽ giữ nguyên vĩnh viễn qua mọi lần đồng bộ app cho đến khi người dùng chủ động đổi logo mới.
 */
export const saveReportLogosToCloudVault = async (
  partialLogos: Partial<ReportLogos>,
  explicitClearKey?: keyof ReportLogos
): Promise<ReportLogos> => {
  const nextLogos = saveReportLogosLocal(partialLogos, explicitClearKey);
  try {
    if (db) {
      const nowIso = new Date().toISOString();
      await Promise.all([
        setDoc(
          doc(db, 'c10', DAILY_REPORT_DOC_LOGOS),
          {
            ...nextLogos,
            updatedAt: nowIso
          },
          { merge: true }
        ),
        setDoc(
          doc(db, 'c10', DAILY_REPORT_DOC_PUBLISHED),
          {
            logos: nextLogos,
            logosUpdatedAt: nowIso
          },
          { merge: true }
        )
      ]);
    }
  } catch (err) {
    console.warn('Lỗi lưu cố định Logo lên Cloud:', err);
  }
  return nextLogos;
};

/**
 * Lắng nghe kho lưu trữ Logo cố định từ Cloud Firestore (`c10/report_logos_vault`).
 * Nếu kho lưu trữ chưa có hoặc thiếu logo, tự động tìm và khôi phục từ các bản báo cáo đã lưu trên Cloud.
 */
export const subscribeReportLogosFromFirestore = (
  onUpdate: (logos: ReportLogos) => void
): (() => void) => {
  if (!db) return () => {};
  try {
    const unsub = onSnapshot(
      doc(db, 'c10', DAILY_REPORT_DOC_LOGOS),
      async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<ReportLogos>;
          const merged = saveReportLogosLocal({
            tvgs: data.tvgs || '',
            cdt: data.cdt || '',
            nt: data.nt || ''
          });
          onUpdate(merged);
          if (merged.tvgs && merged.cdt && merged.nt) return;
        }

        // Tự động khôi phục logo từ bản báo cáo hiện hành hoặc lịch sử nếu kho lưu trữ còn thiếu
        try {
          const currentLocal = loadSavedReportLogos();
          if (currentLocal.tvgs || currentLocal.cdt || currentLocal.nt) {
            await setDoc(
              doc(db, 'c10', DAILY_REPORT_DOC_LOGOS),
              { ...currentLocal, updatedAt: new Date().toISOString() },
              { merge: true }
            );
            onUpdate(currentLocal);
          }

          const pubSnap = await getDoc(doc(db, 'c10', DAILY_REPORT_DOC_PUBLISHED));
          if (pubSnap.exists()) {
            const pubData = pubSnap.data() as DailyReportModel;
            if (pubData?.logos && (pubData.logos.tvgs || pubData.logos.cdt || pubData.logos.nt)) {
              const recovered = saveReportLogosLocal(pubData.logos);
              await setDoc(
                doc(db, 'c10', DAILY_REPORT_DOC_LOGOS),
                { ...recovered, updatedAt: new Date().toISOString() },
                { merge: true }
              );
              onUpdate(recovered);
              return;
            }
          }
        } catch {}
      },
      (err) => {
        console.warn('Lỗi realtime listener report_logos_vault:', err);
      }
    );
    return unsub;
  } catch {
    return () => {};
  }
};

/**
 * Loại bỏ undefined trước khi ghi lên Firestore
 */
export const cleanReportForFirestore = (report: any): any => {
  return JSON.parse(JSON.stringify(report, (key, value) => {
    return value === undefined ? null : value;
  }));
};

/**
 * Đồng bộ toàn bộ 8 mục Báo cáo ngày lên Firebase Firestore (c10 collection)
 * Đồng thời lưu trữ lịch sử theo ngày để xem lại
 */
export const syncDailyReportToFirestore = async (
  report: DailyReportModel,
  userEmail?: string
): Promise<boolean> => {
  try {
    if (!db) return false;
    const lockedLogos = saveReportLogosLocal(report.logos || {});
    const reportWithLockedLogos: DailyReportModel = {
      ...report,
      logos: lockedLogos
    };
    const clean = cleanReportForFirestore(reportWithLockedLogos);
    const nowIso = new Date().toISOString();
    const effectiveEmail = (
      userEmail ||
      localStorage.getItem('c10_user_email') ||
      (localStorage.getItem('is_admin') === 'true' ? 'phucbao1992@gmail.com' : 'user')
    );

    const payload = {
      ...clean,
      cloudSyncedAt: nowIso,
      updatedBy: effectiveEmail
    };

    // 0. Nếu có bất kỳ logo nào, khóa luôn vào kho lưu trữ cố định report_logos_vault
    if (lockedLogos.tvgs || lockedLogos.cdt || lockedLogos.nt) {
      await setDoc(
        doc(db, 'c10', DAILY_REPORT_DOC_LOGOS),
        { ...lockedLogos, updatedAt: nowIso },
        { merge: true }
      ).catch(() => {});
    }

    // 1. Cập nhật bản Báo cáo hiện hành (Latest Published) cho tất cả máy
    await setDoc(doc(db, 'c10', DAILY_REPORT_DOC_PUBLISHED), payload, { merge: true });

    // 2. Lưu trữ lịch sử theo ngày (Report History Archive)
    const rawDate = String(report.g?.reportDate || '').trim();
    if (rawDate) {
      const dateKey = rawDate.replace(/[\/.-]/g, '_');
      await setDoc(doc(db, 'c10', `daily_report_${dateKey}`), payload, { merge: true });

      // Cập nhật danh mục lịch sử (History Index)
      try {
        const indexRef = doc(db, 'c10', DAILY_REPORT_DOC_INDEX);
        const indexSnap = await getDoc(indexRef).catch(() => null);
        let list: DailyReportHistoryEntry[] = [];
        if (indexSnap && indexSnap.exists() && Array.isArray(indexSnap.data().list)) {
          list = indexSnap.data().list;
        }

        // Lọc trùng theo dateKey và đẩy mục mới lên đầu
        list = list.filter((item) => item.dateKey !== dateKey);
        list.unshift({
          date: rawDate,
          dateKey,
          reportNo: report.g?.reportNo || '',
          project: report.g?.project || '',
          savedAt: nowIso,
          updatedBy: effectiveEmail
        });

        // Giữ tối đa 60 báo cáo gần nhất trong danh mục
        if (list.length > 60) list = list.slice(0, 60);

        await setDoc(indexRef, { list, latestDate: rawDate, updatedAt: nowIso }, { merge: true });
      } catch (idxErr) {
        console.warn('Lỗi cập nhật danh mục lịch sử báo cáo:', idxErr);
      }
    }

    return true;
  } catch (err) {
    console.error('Lỗi đồng bộ báo cáo ngày lên Firestore:', err);
    return false;
  }
};
/**
 * Lắng nghe cập nhật thời gian thực từ Cloud Firestore
 * Bất cứ khi nào có người xuất báo cáo, các máy khác tự động nhận dữ liệu mới ngay
 */
export const subscribeDailyReportFromFirestore = (
  onUpdate: (report: DailyReportModel) => void
): (() => void) => {
  if (!db) return () => {};
  try {
    const unsub = onSnapshot(
      doc(db, 'c10', DAILY_REPORT_DOC_PUBLISHED),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as DailyReportModel;
          if (data && data.g) {
            const def = createDefaultReport();
            const mergedCloud = {
              ...def.cloud,
              ...(data.cloud || {}),
              sheetUrl: sanitizeC10SheetUrl(data.cloud?.sheetUrl ?? def.cloud.sheetUrl)
            };
            const mergedLogos = saveReportLogosLocal(data.logos || {});
            const fullReport: DailyReportModel = {
              ...def,
              ...data,
              logos: mergedLogos,
              cloud: mergedCloud,
              fileSuffix: data.fileSuffix || DEFAULT_FILE_SUFFIX
            };
            onUpdate(fullReport);
          }
        }
      },
      (err) => {
        console.warn('Lỗi realtime listener Firestore daily_report_published:', err);
      }
    );
    return unsub;
  } catch {
    return () => {};
  }
};

/**
 * Tải danh sách lịch sử báo cáo ngày đã lưu trên Cloud
 */
export const fetchDailyReportHistoryIndex = async (): Promise<DailyReportHistoryEntry[]> => {
  if (!db) return [];
  try {
    const indexSnap = await getDoc(doc(db, 'c10', DAILY_REPORT_DOC_INDEX));
    if (indexSnap.exists() && Array.isArray(indexSnap.data().list)) {
      return indexSnap.data().list;
    }
  } catch (err) {
    console.warn('Lỗi đọc danh mục lịch sử báo cáo:', err);
  }
  return [];
};

/**
 * Tải chi tiết một báo cáo theo ngày đã lưu trong lịch sử
 */
export const fetchDailyReportByDateKey = async (
  dateKey: string
): Promise<DailyReportModel | null> => {
  if (!db || !dateKey) return null;
  try {
    const snap = await getDoc(doc(db, 'c10', `daily_report_${dateKey}`));
    if (snap.exists()) {
      const data = snap.data() as DailyReportModel;
      if (data && data.g) {
        const def = createDefaultReport();
        const mergedCloud = {
          ...def.cloud,
          ...(data.cloud || {}),
          sheetUrl: sanitizeC10SheetUrl(data.cloud?.sheetUrl ?? def.cloud.sheetUrl)
        };
        return {
          ...def,
          ...data,
          logos: mergeWithPermanentLogos(data.logos),
          cloud: mergedCloud,
          fileSuffix: data.fileSuffix || DEFAULT_FILE_SUFFIX
        };
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc báo cáo ngày lịch sử:', err);
  }
  return null;
};

/**
 * Quản lý danh sách phân quyền người được phép Lập & Xuất báo cáo ngày
 */
export const loadDailyReportPermissions = async (): Promise<DailyReportPermissions> => {
  const defaultPerms: DailyReportPermissions = {
    authorizedEmails: ['phucbao1992@gmail.com'],
    allowAllEditors: false
  };

  try {
    // 1. Luôn ưu tiên đọc bản mới nhất từ Cloud Firestore trước để đồng bộ tức thì sang máy khác / trình duyệt Edge
    if (db) {
      const [drSnap, upSnap] = await Promise.all([
        getDoc(doc(db, 'c10', DAILY_REPORT_DOC_PERMISSIONS)).catch(() => null),
        getDoc(doc(db, 'c10', 'user_permissions')).catch(() => null)
      ]);

      const mergedSet = new Set<string>(['phucbao1992@gmail.com']);
      let allowAll = false;
      let updatedAt: string | undefined = undefined;

      if (drSnap && drSnap.exists()) {
        const data = drSnap.data();
        if (data) {
          allowAll = Boolean(data.allowAllEditors);
          updatedAt = data.updatedAt;
          if (Array.isArray(data.authorizedEmails)) {
            data.authorizedEmails.forEach((e: string) => {
              const clean = (e || '').trim().toLowerCase();
              if (clean) mergedSet.add(clean);
            });
          }
        }
      }

      // Gộp thêm các email và mã cấp quyền có bật dailyReport từ bảng user_permissions trên Cloud
      if (upSnap && upSnap.exists()) {
        const upData = upSnap.data();
        if (upData && Array.isArray(upData.users)) {
          upData.users.forEach((u: any) => {
            if (u?.roles?.dailyReport) {
              const em = (u.email || '').trim().toLowerCase();
              const cd = (u.accessCode || '').trim().toLowerCase();
              if (em) mergedSet.add(em);
              if (cd) mergedSet.add(cd);
            }
          });
        }
      }

      if ((drSnap && drSnap.exists()) || (upSnap && upSnap.exists())) {
        const cloudPerms: DailyReportPermissions = {
          authorizedEmails: Array.from(mergedSet),
          allowAllEditors: allowAll,
          updatedAt: updatedAt || new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(cloudPerms));
        return cloudPerms;
      }
    }

    // 2. Dự phòng đọc từ localStorage nếu mất mạng
    const localRaw = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed && Array.isArray(parsed.authorizedEmails)) {
        return parsed;
      }
    }
  } catch {}

  return defaultPerms;
};

export const subscribeDailyReportPermissions = (
  onUpdate: (perms: DailyReportPermissions) => void
): (() => void) => {
  if (!db) return () => {};
  try {
    const unsub = onSnapshot(
      doc(db, 'c10', DAILY_REPORT_DOC_PERMISSIONS),
      async () => {
        const latest = await loadDailyReportPermissions();
        onUpdate(latest);
      },
      () => {}
    );
    return unsub;
  } catch {
    return () => {};
  }
};

export const saveDailyReportPermissions = async (
  perms: DailyReportPermissions
): Promise<boolean> => {
  try {
    const cleanList = Array.from(
      new Set([
        'phucbao1992@gmail.com',
        ...perms.authorizedEmails.map((e) => (e || '').trim().toLowerCase()).filter(Boolean)
      ])
    );
    const payload = {
      authorizedEmails: cleanList,
      allowAllEditors: Boolean(perms.allowAllEditors),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY_PERMISSIONS, JSON.stringify(payload));

    if (db) {
      await setDoc(doc(db, 'c10', DAILY_REPORT_DOC_PERMISSIONS), payload, { merge: true });
    }
    return true;
  } catch (err) {
    console.error('Lỗi lưu phân quyền báo cáo ngày:', err);
    return false;
  }
};

export const canUserEditDailyReport = (userEmail?: string): boolean => {
  if (localStorage.getItem('c10_preview_as_viewer') === 'true') return false;

  const isAdmin =
    localStorage.getItem('is_admin') === 'true' &&
    localStorage.getItem('c10_admin_unlocked') === 'true';
  if (isAdmin) return true;

  const email = (
    userEmail ||
    localStorage.getItem('c10_user_email') ||
    ''
  ).trim().toLowerCase();

  const activeCode = (localStorage.getItem('c10_active_access_code') || '').trim().toLowerCase();

  if (email === 'phucbao1992@gmail.com') return true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_PERMISSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.allowAllEditors === true) return true;
      if (Array.isArray(parsed.authorizedEmails)) {
        const matchedDr = parsed.authorizedEmails.some((e: string) => {
          const item = (e || '').trim().toLowerCase();
          if (!item) return false;
          if (email && (item === email || `mã:${item}` === email || item === `mã:${email}`)) return true;
          if (activeCode && (item === activeCode || item === `mã:${activeCode}` || `mã:${item}` === activeCode)) return true;
          return false;
        });
        if (matchedDr) return true;
      }
    }
  } catch {}

  try {
    const upRaw = localStorage.getItem('c10_user_permissions_v1');
    if (upRaw) {
      const users = JSON.parse(upRaw);
      if (Array.isArray(users)) {
        const matchedUp = users.some((u: any) => {
          if (!u?.roles?.dailyReport) return false;
          const uEmail = (u.email || '').trim().toLowerCase();
          const uCode = (u.accessCode || '').trim().toLowerCase();
          if (email && (uEmail === email || (uCode && `mã:${uCode}` === email) || (uCode && uCode === email))) return true;
          if (activeCode && (uCode === activeCode || uEmail === `mã:${activeCode}` || uEmail === activeCode)) return true;
          return false;
        });
        if (matchedUp) return true;
      }
    }
  } catch {}

  return false;
};

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const formatVNDate = (isoDate: string) => (isoDate ? isoDate.split('-').reverse().join('/') : '');

/**
 * Trả về phần đầu cố định "YYMMDD-C10-" dựa trên ngày báo cáo
 */
export const buildFixedReportPrefix = (reportDate: string): string => {
  const parts = String(reportDate || '').split(/[/.-]/).filter(Boolean);
  let year = '', month = '', day = '';
  if (parts.length >= 3) {
    if (parts[0].length === 4) {
      // Dạng YYYY-MM-DD
      [year, month, day] = parts;
    } else if (parts[2].length === 4) {
      // Dạng DD-MM-YYYY hoặc MM-DD-YYYY
      [day, month, year] = parts;
    } else {
      [day, month, year] = parts;
    }
  }
  const now = new Date();
  year = year || String(now.getFullYear());
  month = String(month || (now.getMonth() + 1)).padStart(2, '0');
  day = String(day || now.getDate()).padStart(2, '0');
  // Đảm bảo không bị lộn giữa ngày và tháng
  const mNum = parseInt(month, 10);
  const dNum = parseInt(day, 10);
  if (mNum > 12 && dNum <= 12) {
    const tmp = month;
    month = day;
    day = tmp;
  }
  return `${String(year).slice(-2)}${month}${day}-C10-`;
};

/**
 * Ghép phần đầu cố định "YYMMDD-C10-" và phần đuôi có thể chỉnh sửa (mặc định "Delta-Báo cáo ngày")
 */
export const buildFullReportFileName = (reportDate: string, customSuffix?: string): string => {
  const prefix = buildFixedReportPrefix(reportDate);
  const suffix = (customSuffix && customSuffix.trim()) ? customSuffix.trim() : DEFAULT_FILE_SUFFIX;
  return `${prefix}${suffix}`;
};

export const labelRows = <T extends { type: string }>(list: T[]): (T & { no: string | number })[] => {
  let secIdx = 0;
  let rowIdx = 0;
  return (list || []).map((r) => {
    if (r.type === 'A') {
      rowIdx = 0;
      return { ...r, no: String.fromCharCode(65 + secIdx++) };
    }
    return { ...r, no: ++rowIdx };
  });
};

export const createDefaultReport = (): DailyReportModel => {
  const MS = 'Miền Nam/ TungHo';
  const savedCloud = loadSavedDailyReportCloudConfig();
  return {
    g: {
      project: 'Nhà Văn Hóa Phú Mỹ Hưng',
      location: 'Lô C10 - Khu A, Khu đô thị mới Nam Thành Phố, phường Tân Mỹ, Thành phố Hồ Chí Minh',
      reportNo: '01',
      reportDate: todayISO(),
      client: 'Công ty TNHH Phát Triển Phú Mỹ Hưng',
      consultant: 'Công ty Cổ phần Kiểm định Xây dựng Sài Gòn 2 (SCQC2)',
      contractor: 'Công ty TNHH Tập Đoàn Xây Dựng Delta',
      reporter: ''
    },
    logos: loadSavedReportLogos(),
    sign: {
      cTitle: 'ĐẠI DIỆN NHÀ THẦU DELTA',
      cName: '',
      sTitle: 'GIÁM SÁT SCQC2',
      sName: ''
    },
    cloud: {
      driveFolderUrl: savedCloud.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL,
      sheetUrl: sanitizeC10SheetUrl(savedCloud.sheetUrl),
      appsScriptUrl: savedCloud.appsScriptUrl || ''
    },
    fileSuffix: DEFAULT_FILE_SUFFIX,
    weather: [
      { id: uid(), type: 'row', weather: 'Bình thường/ Normal', time: 'Cả ngày', note: '' },
      { id: uid(), type: 'row', weather: 'Mưa/ Rainy', time: 'TỔNG: 1h05p', note: '' },
      { id: uid(), type: 'row', weather: 'Thời tiết bất lợi khác/ Other adverse weather', time: '', note: '' }
    ],
    safety: [
      { id: uid(), type: 'row', desc: 'Duy trì công tác vệ sinh trong công trường/ Maintain hygiene in the construction site.' },
      { id: uid(), type: 'row', desc: 'Huấn luyện an toàn cho công nhân và cán bộ kỹ thuật/ Safety training for workers and staff.' },
      { id: uid(), type: 'row', desc: 'Kiểm tra công tác điện, máy móc đầu giờ trước khi thi công/ Check electrical work.' }
    ],
    man: [
      { id: uid(), type: 'row', dept: 'Ban chỉ huy/ Site Management Team', regular: 14, overtime: 0 },
      { id: uid(), type: 'row', dept: 'Lái cẩu tháp/ Tower Crane Operators', regular: 4, overtime: 0 },
      { id: uid(), type: 'row', dept: 'Công nhật/ General Workers', regular: 8, overtime: 0 }
    ],
    mach: [
      { id: uid(), type: 'row', name: 'Cẩu tháp/ Tower Crane', qty: 2 },
      { id: uid(), type: 'row', name: 'Xe đào + ủi/ Excavator + Bulldozer', qty: 1 },
      { id: uid(), type: 'row', name: 'Xe đục/ Breaker Excavator', qty: 0 }
    ],
    mat: [
      { id: uid(), type: 'A', name: 'THÉP THANH' },
      ...[['D10', '13.942'], ['D12', '4.156'], ['D16', '3.144'], ['D18', '78.675'], ['D20', '6.936'], ['D22', '0.697'], ['D25', '28.472'], ['D32', '116.947']].map(
        ([n, c]) => ({
          id: uid(),
          type: 'row' as const,
          name: n,
          supplier: MS,
          unit: 'Tấn',
          today: '0',
          cum: c,
          note: ''
        })
      ),
      { id: uid(), type: 'A', name: 'KINGPOST HỆ SHORING' },
      {
        id: uid(),
        type: 'row',
        name: 'Kingpost hệ shoring',
        supplier: 'IPC Sài Gòn',
        unit: 'Cây',
        today: '0',
        cum: '169 / 169',
        note: 'ĐÃ NHẬP ĐỦ'
      }
    ],
    work: [
      { id: uid(), type: 'A', name: 'CÔNG TÁC HỆ SHORING' },
      {
        id: uid(),
        type: 'row',
        name: 'Công tác lắp hệ văng chống lớp 1',
        unit: 'md',
        plan: '30',
        today: '30',
        cum: '3730',
        next: '',
        note: 'ĐÃ HOÀN TẤT'
      },
      {
        id: uid(),
        type: 'row',
        name: 'Công tác lắp hệ văng chống lớp 2',
        unit: 'md',
        plan: '0',
        today: '0',
        cum: '0',
        next: '40',
        note: ''
      },
      { id: uid(), type: 'A', name: 'CÔNG TÁC ĐÀO ĐẤT' },
      {
        id: uid(),
        type: 'row',
        name: 'Công tác đào đất và vận chuyển đất lớp 2 (15m³/ xe)',
        unit: 'Xe',
        plan: '0',
        today: '0',
        cum: '0',
        next: '',
        note: ''
      }
    ],
    insp: [
      {
        id: uid(),
        type: 'row',
        item: 'Kích hệ văng lớp 1',
        time: '10h00',
        person: 'MR.CHÍNH',
        phone: '0989384648',
        participants: 'TVGS + CĐT',
        assess: 'ĐẠT'
      }
    ],
    photos: [
      { id: uid(), type: 'row', url: '', caption: 'Ảnh 1' },
      { id: uid(), type: 'row', url: '', caption: 'Ảnh 2' }
    ],
    aiSummary: null
  };
};
/**
 * Tự động kế thừa dữ liệu (Nhân lực, Máy móc, Thông tin chung, Lũy kế vật tư & công việc)
 * từ báo cáo đã xuất bản gần nhất khi khởi tạo báo cáo ngày mới.
 */
export const createInheritedDraftFromPublished = (published?: DailyReportModel | null): DailyReportModel => {
  const def = createDefaultReport();
  if (!published || !published.g) return def;

  const today = todayISO();
  const prevDate = String(published.g.reportDate || '').trim();
  let nextReportNo = String(published.g.reportNo || def.g.reportNo).trim();
  if (prevDate && prevDate !== today) {
    const numMatch = nextReportNo.match(/^(\d+)$/);
    if (numMatch) {
      const incremented = Number(numMatch[1]) + 1;
      nextReportNo = String(incremented).padStart(numMatch[1].length, '0');
    }
  }

  return {
    ...def,
    ...published,
    g: {
      ...def.g,
      ...published.g,
      reportDate: today,
      reportNo: nextReportNo
    },
    cloud: {
      ...def.cloud,
      ...(published.cloud || {})
    },
    logos: mergeWithPermanentLogos(published.logos),
    sign: {
      ...def.sign,
      ...(published.sign || {})
    },
    man: Array.isArray(published.man) && published.man.length > 0
      ? published.man.map((m) => ({ ...m }))
      : def.man,
    mach: Array.isArray(published.mach) && published.mach.length > 0
      ? published.mach.map((eq) => ({ ...eq }))
      : def.mach,
    mat: Array.isArray(published.mat) && published.mat.length > 0
      ? published.mat.map((m) => (m.type === 'row' && prevDate !== today ? { ...m, today: '0' } : { ...m }))
      : def.mat,
    work: Array.isArray(published.work) && published.work.length > 0
      ? published.work.map((w) => (
          w.type === 'row' && prevDate !== today
            ? { ...w, plan: w.next || w.plan || '0', today: '0' }
            : { ...w }
        ))
      : def.work,
    aiSummary: prevDate === today ? published.aiSummary : null
  };
};

export const buildFallbackSummary = (r: DailyReportModel): GeminiSummaryData => {
  const totalReg = r.man.reduce((s, m) => s + (Number(m.regular) || 0), 0);
  const totalOt = r.man.reduce((s, m) => s + (Number(m.overtime) || 0), 0);
  const totalMach = r.mach.reduce((s, m) => s + (Number(m.qty) || 0), 0);
  const activeWorks = r.work.filter((w) => w.type === 'row' && (Number(w.today) > 0 || (w.today && w.today !== '0') || w.note));
  const nextWorks = r.work.filter((w) => w.type === 'row' && w.next && w.next !== '0');
  const weatherDesc =
    r.weather
      .filter((w) => w.time || w.note)
      .map((w) => `${w.weather}: ${[w.time, w.note].filter(Boolean).join(' - ')}`)
      .join('; ') || 'Thời tiết bình thường, thuận lợi cho công tác thi công tại hiện trường.';

  return {
    overallAssessment: `Báo cáo số ${r.g.reportNo} ngày ${formatVNDate(r.g.reportDate)}: Nhà thầu ${r.g.contractor} bố trí tổng cộng ${totalReg} nhân sự trong giờ (${totalOt} tăng ca) cùng ${totalMach} đầu máy thiết bị. Công trường duy trì tốt an toàn vệ sinh lao động và bám sát kế hoạch.`,
    weatherSummary: weatherDesc,
    highlights: [
      `Nhân lực & Thiết bị: Huy động ${totalReg} nhân lực chính quy, ${totalOt} tăng ca và ${totalMach} máy móc thiết bị hoạt động.`,
      activeWorks.length > 0
        ? `Công tác trọng tâm trong ngày: ${activeWorks.map((w) => `${w.name} (Thực hiện: ${w.today || 0} ${w.unit || ''}${w.note ? ` - ${w.note}` : ''})`).join('; ')}.`
        : `Triển khai các hạng mục thi công shoring và đào đất theo đúng tiến độ đề ra.`,
      r.insp.length > 0
        ? `Công tác nghiệm thu: Thực hiện ${r.insp.length} hạng mục (${r.insp.map((i) => `${i.item}: ${i.assess}`).join(', ')}).`
        : `Đảm bảo đầy đủ công tác kiểm tra an toàn điện, máy móc đầu giờ trước khi thi công.`
    ],
    tomorrowFocus:
      nextWorks.length > 0
        ? nextWorks.map((w) => `${w.name}: Kế hoạch ${w.next} ${w.unit || ''}`)
        : ['Tiếp tục triển khai lắp dựng hệ văng chống và đào đất theo kế hoạch ngày tiếp theo.'],
    recommendations: [
      'Theo dõi sát điều kiện thời tiết và duy trì bơm thoát nước hố đào khi có mưa.',
      'Phối hợp chặt chẽ giữa Nhà thầu Delta và TVGS SCQC2 trong công tác nghiệm thu chuyển bước.'
    ],
    generatedAt: new Date().toISOString()
  };
};

/**
 * Chuyển đổi dữ liệu Báo cáo ngày sang cấu trúc bảng phẳng (TSV & mảng dòng) để cập nhật Google Sheet C10 (tab Daily)
 */
export const buildSheetSyncRows = (r: DailyReportModel): string[][] => {
  const weatherSummary =
    r.weather
      .filter((w) => w.time || w.note)
      .map((w) => `${w.weather.split('/')[0].trim()}: ${[w.time, w.note].filter(Boolean).join(' ')}`)
      .join(' | ') || 'Nắng nhẹ';

  const workRows = r.work.filter((w) => w.type === 'row');
  const maxLen = Math.max(r.man.length, r.mach.length, workRows.length, 1);

  const header = [
    'Thời tiết (A)',
    'Thành phần nhân sự (B)',
    'Số lượng nhân sự (C)',
    'Thiết bị thi công (D)',
    'Số lượng thiết bị (E)',
    'Công việc trong ngày (F)',
    'Khối lượng hôm nay (G)',
    'Đánh giá / Ghi chú (H)',
    'Kế hoạch ngày mai (I)',
    'Khối lượng ngày mai (J)'
  ];

  const rows: string[][] = [header];
  for (let i = 0; i < maxLen; i++) {
    const m = r.man[i];
    const eq = r.mach[i];
    const wk = workRows[i];
    const manCount = m ? Number(m.regular || 0) + Number(m.overtime || 0) : '';
    rows.push([
      i === 0 ? weatherSummary : '',
      m ? m.dept : '',
      m ? String(manCount) : '',
      eq ? eq.name : '',
      eq ? String(eq.qty ?? '') : '',
      wk ? wk.name : '',
      wk ? `${wk.today || '0'} ${wk.unit || ''}`.trim() : '',
      wk ? wk.note || 'Đạt' : '',
      wk && wk.next ? wk.name : '',
      wk && wk.next ? `${wk.next} ${wk.unit || ''}`.trim() : ''
    ]);
  }
  return rows;
};

/**
 * Sinh gói dữ liệu chuẩn gửi qua Google Apps Script Webhook để:
 * 1) Tự động kết xuất & lưu file PDF chuẩn A4 tên "YYMMDD-C10-Delta-Báo cáo ngày.pdf" vào thư mục Google Drive C10
 * 2) Tự động điền số lượng báo cáo ngày vào các tab trên Google Sheet C10:
 *    - Tab "Daily" (A1:J...)
 *    - Tab "Manpower" (Ngày, Kế hoạch, Thực tế)
 *    - Tab "Equipment" (Ngày, Tổng thiết bị & chi tiết)
 *    - Tab "Materials" (Vật liệu nhập trong ngày & lũy kế)
 *    - Tab "WorkQuantity" (Khối lượng công việc thực hiện & kế hoạch)
 *    - Tab "Inspection" (Nghiệm thu trong ngày)
 *    - Tab "LichSuBaoCao" (Tổng hợp lịch sử báo cáo ngày kèm link file PDF trên Drive)
 */
export const buildWebhookPayloadForAppsScript = (
  report: DailyReportModel,
  fileName: string,
  printableHtmlContent?: string
) => {
  const totalReg = report.man.reduce((s, m) => s + (Number(m.regular) || 0), 0);
  const totalOt = report.man.reduce((s, m) => s + (Number(m.overtime) || 0), 0);
  const totalManpower = totalReg + totalOt;
  const totalMachinery = report.mach.reduce((s, m) => s + (Number(m.qty) || 0), 0);
  const vnDate = formatVNDate(report.g.reportDate);

  const fullPrintableDocument = printableHtmlContent
    ? `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<title>${fileName}</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 10pt; color: #000; margin: 0; padding: 0; line-height: 1.25; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td, th { border: 1px solid #000; padding: 3px 5px; text-align: center; vertical-align: middle; }
  th { background: #a9c9ec; font-weight: 700; }
  i { font-weight: 400; }
  .l { text-align: left; }
  .b { font-weight: 700; }
  .sec td { background: #dbe8f7; font-weight: 700; }
  .c10-a4-ttl { font-weight: 700; color: #1b2a49; font-size: 11.5pt; margin: 8px 0 4px; }
</style>
</head>
<body>
${printableHtmlContent}
</body>
</html>`
    : '';

  return {
    action: 'c10_save_pdf_and_sync_sheet',
    fileName,
    reportNo: report.g.reportNo,
    reportDateISO: report.g.reportDate,
    reportDateVN: vnDate,
    project: report.g.project,
    contractor: report.g.contractor,
    driveFolderId: extractFolderIdFromUrl(report.cloud?.driveFolderUrl),
    driveFolderUrl: report.cloud?.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL,
    spreadsheetId: extractSpreadsheetIdFromUrl(report.cloud?.sheetUrl),
    sheetUrl: sanitizeC10SheetUrl(report.cloud?.sheetUrl),
    printableHtml: fullPrintableDocument,
    metrics: {
      totalRegularManpower: totalReg,
      totalOvertimeManpower: totalOt,
      totalManpower,
      totalMachinery,
      materialsCount: report.mat.filter((m) => m.type === 'row').length,
      worksCount: report.work.filter((w) => w.type === 'row').length,
      inspectionsCount: report.insp.length
    },
    dailyTabRows: buildSheetSyncRows(report),
    manpowerRows: report.man.map((m, idx) => [
      idx + 1,
      vnDate,
      m.dept,
      Number(m.regular || 0),
      Number(m.overtime || 0),
      Number(m.regular || 0) + Number(m.overtime || 0)
    ]),
    machineryRows: report.mach.map((eq, idx) => [
      idx + 1,
      vnDate,
      eq.name,
      Number(eq.qty || 0)
    ]),
    materialRows: labelRows(report.mat).map((m) => [
      String(m.no),
      vnDate,
      m.type === 'A' ? `[MỤC] ${m.name}` : m.name,
      m.supplier || '',
      m.unit || '',
      m.today || '0',
      m.cum || '',
      m.note || ''
    ]),
    workRows: labelRows(report.work).map((w) => [
      String(w.no),
      vnDate,
      w.type === 'A' ? `[HẠNG MỤC] ${w.name}` : w.name,
      w.plan || '0',
      w.today || '0',
      w.cum || '0',
      w.next || '',
      w.unit || '',
      w.note || ''
    ]),
    inspectionRows: report.insp.map((ins, idx) => [
      idx + 1,
      vnDate,
      ins.item,
      ins.time || '',
      ins.person || '',
      ins.phone || '',
      ins.participants || '',
      ins.assess || 'ĐẠT'
    ])
  };
};

/**
 * Mã nguồn Google Apps Script hoàn chỉnh để người dùng dán vào Extensions -> Apps Script trên Google Sheet C10
 */
export const generateC10GoogleAppsScriptCode = (
  defaultFolderUrl?: string,
  defaultSheetUrl?: string
): string => {
  const folderId = extractFolderIdFromUrl(defaultFolderUrl) || '10sldhCeoddg_8qx78DKVAauYET2J4sCp';
  const sheetId = extractSpreadsheetIdFromUrl(defaultSheetUrl);

  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT TỰ ĐỘNG HÓA BÁO CÁO NGÀY DỰ ÁN C10 (1 NÚT BẤM)
 * - Tự động tạo & lưu file PDF chuẩn A4 ("YYMMDD-C10-Delta-Báo cáo ngày.pdf") vào Google Drive
 * - Tự động cập nhật số lượng Báo cáo ngày (Nhân lực, Thiết bị, Vật tư, Công việc, Nghiệm thu)
 *   vào các tab trên Google Sheet C10 mà không cần copy-paste thủ công.
 * ============================================================================
 * HƯỚNG DẪN CÀI ĐẶT NHANH (CHỈ LÀM 1 LẦN):
 * 1. Mở file Google Sheet C10 mới của bạn -> Chọn menu "Tiện ích mở rộng" (Extensions) -> "Apps Script".
 * 2. Xóa mã mặc định và dán toàn bộ đoạn mã này vào -> Bấm biểu tượng Đĩa mềm (Lưu).
 * 3. Bấm nút "Triển khai" (Deploy) ở góc phải trên -> Chọn "Tùy chọn triển khai mới" (New deployment).
 * 4. Chọn loại: "Ứng dụng web" (Web app):
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 5. Bấm "Triển khai" (Deploy), cấp quyền truy cập và sao chép "URL ứng dụng web" (https://script.google.com/macros/s/.../exec).
 * 6. Dán URL vừa chép vào ô "Link Webhook Google Apps Script" trên màn hình Báo cáo ngày C10!
 */

const DEFAULT_DRIVE_FOLDER_ID = "${folderId}";
const DEFAULT_SPREADSHEET_ID = "${sheetId}";

function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(rawBody);

    const folderId = data.driveFolderId || DEFAULT_DRIVE_FOLDER_ID;
    const spreadsheetId = data.spreadsheetId || DEFAULT_SPREADSHEET_ID;
    const fileName = (data.fileName || "C10-Delta-Bao-cao-ngay") + ".pdf";

    let pdfFileUrl = "";
    let pdfFileId = "";

    // 1. TỰ ĐỘNG TẠO VÀ LƯU FILE PDF VÀO THƯ MỤC GOOGLE DRIVE C10
    if (data.printableHtml && folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        const htmlBlob = Utilities.newBlob(data.printableHtml, "text/html", fileName + ".html");
        const pdfBlob = htmlBlob.getAs("application/pdf").setName(fileName);

        // Nếu trong thư mục đã có file trùng tên trong ngày thì ghi đè (chuyển file cũ vào thùng rác)
        const existingFiles = folder.getFilesByName(fileName);
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }

        const savedFile = folder.createFile(pdfBlob);
        pdfFileId = savedFile.getId();
        pdfFileUrl = savedFile.getUrl();
      } catch (driveErr) {
        pdfFileUrl = "Lỗi lưu Drive: " + driveErr.toString();
      }
    }

    // 2. TỰ ĐỘNG CẬP NHẬT SỐ LƯỢNG VÀO GOOGLE SHEET C10 (CHỈ CHẠY KHI CÓ LỆNH ARCHIVE-SHEET)
    let sheetUpdated = false;
    if (data.action === "c10_save_pdf_and_sync_sheet") {
      const ss = spreadsheetId
        ? SpreadsheetApp.openById(spreadsheetId)
        : SpreadsheetApp.getActiveSpreadsheet();

      if (ss) {
        // 2.1. Cập nhật tab "Daily" (bảng chuẩn A1:J dùng để đồng bộ giao diện Web C10)
        if (Array.isArray(data.dailyTabRows) && data.dailyTabRows.length > 0) {
          let dailySheet = ss.getSheetByName("Daily");
          if (!dailySheet) dailySheet = ss.insertSheet("Daily");
          dailySheet.clearContents();
          dailySheet
            .getRange(1, 1, data.dailyTabRows.length, data.dailyTabRows[0].length)
            .setValues(data.dailyTabRows);
        }

        // 2.2. Cập nhật tab "Manpower" (Biểu đồ nhân lực theo ngày: Ngày | Kế hoạch | Thực tế)
        if (data.metrics && data.reportDateVN) {
          let mpSheet = ss.getSheetByName("Manpower");
          if (!mpSheet) {
            mpSheet = ss.insertSheet("Manpower");
            mpSheet.getRange(1, 1, 2, 3).setValues([
              ["BIỂU ĐỒ NHÂN LỰC DỰ ÁN C10", "", ""],
              ["Ngày", "Kế hoạch", "Thực tế"]
            ]);
          }
          const lastRow = Math.max(mpSheet.getLastRow(), 2);
          const dates = lastRow >= 3 ? mpSheet.getRange(3, 1, lastRow - 2, 1).getDisplayValues().flat() : [];
          const existingIdx = dates.findIndex(function(d) { return String(d).trim() === String(data.reportDateVN).trim(); });
          const totalMp = Number(data.metrics.totalManpower || 0);
          if (existingIdx >= 0) {
            mpSheet.getRange(existingIdx + 3, 3).setValue(totalMp);
          } else {
            mpSheet.appendRow([data.reportDateVN, totalMp, totalMp]);
          }
        }

        // 2.3. Cập nhật chi tiết Vật tư nhập (tab "VatTuNhap")
        if (Array.isArray(data.materialRows) && data.materialRows.length > 0) {
          let matSheet = ss.getSheetByName("VatTuNhap");
          if (!matSheet) {
            matSheet = ss.insertSheet("VatTuNhap");
            matSheet.appendRow(["STT", "Ngày", "Vật liệu", "Nhà cung cấp", "Đơn vị", "Nhập trong ngày", "Lũy kế nhập", "Ghi chú"]);
          } else {
            matSheet.clearContents();
            matSheet.appendRow(["STT", "Ngày", "Vật liệu", "Nhà cung cấp", "Đơn vị", "Nhập trong ngày", "Lũy kế nhập", "Ghi chú"]);
          }
          matSheet.getRange(2, 1, data.materialRows.length, 8).setValues(data.materialRows);
        }

        // 2.4. Cập nhật chi tiết Khối lượng công việc (tab "KhoiLuongCongViec")
        if (Array.isArray(data.workRows) && data.workRows.length > 0) {
          let workSheet = ss.getSheetByName("KhoiLuongCongViec");
          if (!workSheet) {
            workSheet = ss.insertSheet("KhoiLuongCongViec");
            workSheet.appendRow(["STT", "Ngày", "Nội dung công việc", "KH hôm nay", "TH hôm nay", "Lũy kế", "KH ngày mai", "Đơn vị", "Ghi chú"]);
          } else {
            workSheet.clearContents();
            workSheet.appendRow(["STT", "Ngày", "Nội dung công việc", "KH hôm nay", "TH hôm nay", "Lũy kế", "KH ngày mai", "Đơn vị", "Ghi chú"]);
          }
          workSheet.getRange(2, 1, data.workRows.length, 9).setValues(data.workRows);
        }

        // 2.5. Ghi nhật ký tổng hợp vào tab "LichSuBaoCao"
        let logSheet = ss.getSheetByName("LichSuBaoCao");
        if (!logSheet) {
          logSheet = ss.insertSheet("LichSuBaoCao");
          logSheet.appendRow([
            "Thời gian cập nhật",
            "Báo cáo số",
            "Ngày báo cáo",
            "Tên file PDF",
            "Nhân lực trong giờ",
            "Nhân lực tăng ca",
            "Tổng nhân lực",
            "Tổng máy móc thiết bị",
            "Số hạng mục nghiệm thu",
            "Link PDF trên Google Drive"
          ]);
        }
        logSheet.appendRow([
          new Date(),
          data.reportNo || "",
          data.reportDateVN || "",
          fileName,
          data.metrics ? data.metrics.totalRegularManpower : 0,
          data.metrics ? data.metrics.totalOvertimeManpower : 0,
          data.metrics ? data.metrics.totalManpower : 0,
          data.metrics ? data.metrics.totalMachinery : 0,
          data.metrics ? data.metrics.inspectionsCount : 0,
          pdfFileUrl
        ]);

        sheetUpdated = true;
      }
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        fileName: fileName,
        pdfFileId: pdfFileId,
        pdfFileUrl: pdfFileUrl,
        sheetUpdated: sheetUpdated
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: err ? err.toString() : "Unknown error"
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
};

