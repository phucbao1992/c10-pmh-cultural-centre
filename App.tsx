
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Menu, 
  Lock, 
  ShieldCheck, 
  User, 
  Key, 
  Database, 
  ExternalLink, 
  LogOut, 
  CheckCircle2, 
  Activity, 
  Users, 
  FileText, 
  Layers, 
  Trash2, 
  RefreshCw, 
  Camera,
  FileSpreadsheet,
  FolderGit2,
  Globe,
  Check,
  RotateCcw,
  Link2,
  Info,
  ArrowUpRight,
  Save,
  Search,
  Filter,
  Clock,
  Calendar,
  Zap,
  UserPlus,
  UserCheck
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import GeneralInfo from './components/GeneralInfo';
import Dashboard from './components/Dashboard';
import ModelHouse from './components/ModelHouse';
import IssuesList from './components/IssuesList';
import ProcurementPlan from './components/ProcurementPlan';
import Submittal from './components/Submittal';
import Schedule from './components/Schedule';
import DailyReport from './components/DailyReport';
import Inspection from './components/Inspection';
import Payment from './components/Payment';
import Monitoring from './components/Monitoring';
import FocusPoints from './components/FocusPoints';
import SitePhotos from './components/SitePhotos';
import PasswordProtection from './components/PasswordProtection';
import { Tab, Language } from './types';
import { PROJECT_NAME, PROJECT_SUBTITLE, TRANSLATIONS, ENABLE_PASSWORD_PROTECTION, RENDER_URL, GOOGLE_SHEET_ID, SITE_IMAGES_FOLDER_ID } from './constants';
import { fetchDashboardData, fetchSubmittalData, fetchMonitoringData, MONITORING_CONFIG_EVENT, SheetData, SubmittalData, MonitoringData, extractSheetId, saveMonitoringSourceConfig } from './services/sheetsService';
import { getCache, setCache, isCacheStale, clearDataCacheKeys } from './services/cacheService';
import { db, ADMIN_EMAIL } from './services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  DataSyncSettings,
  SectionSyncConfig,
  loadLocalSyncSettings,
  saveDataSyncSettings,
  subscribeDataSyncSettings,
  triggerAdminManualRefresh,
  formatVNDateTime,
  DEFAULT_SYNC_SETTINGS
} from './services/dataSyncService';
import {
  UserPermissionItem,
  TabPermissionKey,
  TabPermissions,
  AVAILABLE_TABS,
  DEFAULT_TAB_PERMISSIONS,
  loadUserPermissions,
  saveUserPermissions,
  subscribeUserPermissions
} from './services/userPermissionsService';

interface AdminPanelProps {
  language: Language;
  onNavigateTab: (tab: Tab) => void;
  onLogoutAdmin: () => void;
  onRefreshAllData: () => Promise<void>;
  isRefreshingData: boolean;
  syncSettings: DataSyncSettings;
  onUpdateSyncSettings: (newSettings: DataSyncSettings) => Promise<boolean>;
}

export interface CloudResourceDef {
  id: string;
  name: string;
  category: 'sheet' | 'drive' | 'webhook' | 'firebase';
  categoryLabel: string;
  storageKey?: string;
  defaultUrl: string;
  currentDisplayUrl: string;
  targetModules: { name: string; tagColor: string }[];
  description: string;
  isEditable: boolean;
  openUrl: string;
}

const extractDriveFolderIdFromUrl = (input?: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
};

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  language, 
  onNavigateTab, 
  onLogoutAdmin,
  onRefreshAllData,
  isRefreshingData,
  syncSettings,
  onUpdateSyncSettings
}) => {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sheet' | 'drive' | 'api'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // States for scheduled sync & section toggles
  const [scheduledEnabled, setScheduledEnabled] = useState<boolean>(syncSettings?.scheduledSync?.enabled ?? false);
  const [scheduledTime, setScheduledTime] = useState<string>(syncSettings?.scheduledSync?.time || '17:30');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  useEffect(() => {
    if (syncSettings?.scheduledSync) {
      setScheduledEnabled(syncSettings.scheduledSync.enabled);
      setScheduledTime(syncSettings.scheduledSync.time || '17:30');
    }
  }, [syncSettings]);

  const handleToggleSection = async (sectionKey: keyof SectionSyncConfig) => {
    if (!syncSettings) return;
    const nextSections = {
      ...syncSettings.sections,
      [sectionKey]: !syncSettings.sections[sectionKey]
    };
    const nextSettings: DataSyncSettings = {
      ...syncSettings,
      sections: nextSections
    };
    const success = await onUpdateSyncSettings(nextSettings);
    if (success) {
      showToast(language === 'VN' 
        ? `Đã cập nhật chế độ cho mục: ${sectionKey}` 
        : `Updated sync mode for: ${sectionKey}`);
    }
  };

  const handleSaveSchedule = async () => {
    if (!syncSettings) return;
    setIsSavingSchedule(true);
    const nextSettings: DataSyncSettings = {
      ...syncSettings,
      scheduledSync: {
        ...syncSettings.scheduledSync,
        enabled: scheduledEnabled,
        time: scheduledTime
      }
    };
    const success = await onUpdateSyncSettings(nextSettings);
    setIsSavingSchedule(false);
    if (success) {
      showToast(language === 'VN'
        ? `Đã lưu giờ cập nhật định kỳ: ${scheduledTime} hàng ngày!`
        : `Saved daily sync time: ${scheduledTime}!`);
    } else {
      showToast('Lỗi khi lưu cấu hình, vui lòng thử lại');
    }
  };

  // User Permissions Management State
  const [userPermissions, setUserPermissions] = useState<UserPermissionItem[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberAccessCode, setNewMemberAccessCode] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRoles, setNewMemberRoles] = useState<TabPermissions>({ ...DEFAULT_TAB_PERMISSIONS });
  const [isSavingUserPerms, setIsSavingUserPerms] = useState(false);

  useEffect(() => {
    loadUserPermissions().then(list => setUserPermissions(list));
    const unsub = subscribeUserPermissions(list => setUserPermissions(list));
    return () => unsub();
  }, []);

  const handleToggleNewMemberRole = (roleKey: TabPermissionKey) => {
    setNewMemberRoles(prev => ({ ...prev, [roleKey]: !prev[roleKey] }));
  };

  const handleAddUserPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newMemberEmail.trim().toLowerCase();
    const cleanCode = newMemberAccessCode.trim();
    const cleanName = newMemberName.trim();

    if (!cleanEmail && !cleanCode) {
      showToast(
        language === 'VN'
          ? 'Vui lòng nhập Email Google hoặc Mã cấp quyền (Access Code)!'
          : 'Please enter an Email or Access Code'
      );
      return;
    }

    if (cleanEmail && !cleanEmail.includes('@')) {
      showToast(language === 'VN' ? 'Email không hợp lệ (vd: hoten@gmail.com)' : 'Invalid email format');
      return;
    }

    const effectiveKey = cleanEmail || `mã:${cleanCode.toLowerCase()}`;

    if (
      userPermissions.some(
        (u) =>
          (cleanEmail && u.email.toLowerCase() === cleanEmail) ||
          (cleanCode && (u.accessCode || '').trim().toLowerCase() === cleanCode.toLowerCase())
      )
    ) {
      showToast(
        language === 'VN'
          ? 'Email hoặc Mã cấp quyền này đã tồn tại trong danh sách!'
          : 'Email or Access Code already exists!'
      );
      return;
    }

    setIsSavingUserPerms(true);
    const nextList: UserPermissionItem[] = [
      ...userPermissions,
      {
        email: effectiveKey,
        accessCode: cleanCode,
        name: cleanName,
        roles: { ...newMemberRoles },
        createdAt: new Date().toISOString(),
        updatedBy: 'Admin'
      }
    ];

    const ok = await saveUserPermissions(nextList);
    setIsSavingUserPerms(false);
    if (ok) {
      setUserPermissions(nextList);
      setNewMemberEmail('');
      setNewMemberAccessCode('');
      setNewMemberName('');
      setNewMemberRoles({ ...DEFAULT_TAB_PERMISSIONS });
      showToast(
        language === 'VN'
          ? `Đã cấp quyền thành công (${cleanCode ? `Mã: ${cleanCode}` : cleanEmail})!`
          : `Authorized successfully!`
      );
    } else {
      showToast('Lỗi khi lưu phân quyền, vui lòng thử lại');
    }
  };

  const handleUpdateUserAccessCode = async (userEmail: string, newCode: string) => {
    const cleanCode = newCode.trim();
    const nextList = userPermissions.map((u) => {
      if (u.email.toLowerCase() === userEmail.toLowerCase()) {
        return {
          ...u,
          accessCode: cleanCode
        };
      }
      return u;
    });
    setUserPermissions(nextList);
    await saveUserPermissions(nextList);
    showToast(
      language === 'VN'
        ? `Đã lưu mã cấp quyền "${cleanCode || 'Trống'}" cho ${userEmail}`
        : `Updated access code for ${userEmail}`
    );
  };

  const handleToggleUserTab = async (userEmail: string, tabKey: TabPermissionKey) => {
    const nextList = userPermissions.map(u => {
      if (u.email.toLowerCase() === userEmail.toLowerCase()) {
        return {
          ...u,
          roles: {
            ...u.roles,
            [tabKey]: !u.roles[tabKey]
          }
        };
      }
      return u;
    });
    setUserPermissions(nextList);
    await saveUserPermissions(nextList);
    showToast(language === 'VN' ? `Đã cập nhật quyền cho ${userEmail}` : `Updated permissions for ${userEmail}`);
  };

  const handleRemoveUserPermission = async (userEmail: string) => {
    if (!window.confirm(language === 'VN' ? `Bạn có chắc muốn thu hồi toàn bộ quyền của tài khoản ${userEmail}?` : `Revoke permissions for ${userEmail}?`)) {
      return;
    }
    const nextList = userPermissions.filter(u => u.email.toLowerCase() !== userEmail.toLowerCase());
    setUserPermissions(nextList);
    await saveUserPermissions(nextList);
    showToast(language === 'VN' ? `Đã thu hồi quyền của: ${userEmail}` : `Revoked: ${userEmail}`);
  };

  // Input states for each resource row
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  // Update counter to force re-render when local storage updates
  const [refreshKey, setRefreshKey] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleClearCache = () => {
    setClearingCache(true);
    setTimeout(() => {
      const preserveAuthAdmin = localStorage.getItem('is_admin');
      const preserveLayer2 = localStorage.getItem('layer2-auth');
      const preserveAdminUnlock = localStorage.getItem('c10_admin_unlocked');
      const preserveAppAuth = localStorage.getItem('app-auth');

      // Preserve all overridden resource links
      const preservedOverrides: Record<string, string> = {};
      const overrideKeys = [
        'c10_override_main_sheet_id',
        'c10_override_submittal_sheet_id',
        'c10_override_monitoring_sheet_id',
        'c10_daily_report_drive_folder',
        'c10_daily_report_sheet_url',
        'c10_override_site_photos_folder_id',
        'c10_override_weekly_report_folder_id',
        'c10_daily_report_webhook_url'
      ];
      overrideKeys.forEach(k => {
        const val = localStorage.getItem(k);
        if (val) preservedOverrides[k] = val;
      });

      localStorage.clear();

      if (preserveAuthAdmin) localStorage.setItem('is_admin', preserveAuthAdmin);
      if (preserveLayer2) localStorage.setItem('layer2-auth', preserveLayer2);
      if (preserveAdminUnlock) localStorage.setItem('c10_admin_unlocked', preserveAdminUnlock);
      if (preserveAppAuth) localStorage.setItem('app-auth', preserveAppAuth);

      Object.entries(preservedOverrides).forEach(([k, v]) => {
        localStorage.setItem(k, v);
      });

      setClearingCache(false);
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
      showToast(language === 'VN' ? 'Đã làm mới dữ liệu và dọn dẹp bộ nhớ đệm cache!' : 'Cache cleared successfully!');
    }, 600);
  };

  // Define master list of all 9 cloud and app data resources
  const resources: CloudResourceDef[] = useMemo(() => {
    // 1. Main Project Sheet
    const mainSheetOverride = localStorage.getItem('c10_override_main_sheet_id');
    const mainSheetId = mainSheetOverride || GOOGLE_SHEET_ID;
    const mainSheetUrl = `https://docs.google.com/spreadsheets/d/${mainSheetId}/edit`;

    // 2. Submittal Sheet
    const submittalOverride = localStorage.getItem('c10_override_submittal_sheet_id');
    const submittalSheetId = submittalOverride || '1POEaqpDjZu4pL7PNXWpgMuHyhKq_-IoBPdQ8EAWR3_s';
    const submittalSheetUrl = `https://docs.google.com/spreadsheets/d/${submittalSheetId}/edit`;

    // 3. Monitoring Sheet
    const monitoringOverride = localStorage.getItem('c10_override_monitoring_sheet_id');
    let monitoringSheetId = '1cE7s2Qe7-eMfxn6bN4CjM7gQp2v0F3n8L9a1b2c3d4';
    try {
      const rawCfg = localStorage.getItem('c10_monitoring_config');
      if (rawCfg) {
        const parsed = JSON.parse(rawCfg);
        if (parsed.customSheetId) monitoringSheetId = extractSheetId(parsed.customSheetId);
      }
    } catch {}
    if (monitoringOverride) monitoringSheetId = extractSheetId(monitoringOverride);
    const monitoringSheetUrl = `https://docs.google.com/spreadsheets/d/${monitoringSheetId}/edit`;

    // 4. Daily Report Drive Folder
    const dailyDriveOverride = localStorage.getItem('c10_daily_report_drive_folder');
    const dailyDriveId = dailyDriveOverride ? extractDriveFolderIdFromUrl(dailyDriveOverride) : '10sldhCeoddg_8qx78DKVAauYET2J4sCp';
    const dailyDriveUrl = `https://drive.google.com/drive/folders/${dailyDriveId}`;

    // 5. Daily Report Quantity Sheet
    const dailySheetOverride = localStorage.getItem('c10_daily_report_sheet_url');
    const dailySheetId = dailySheetOverride ? extractSheetId(dailySheetOverride) : '';
    const dailySheetUrl = dailySheetId ? `https://docs.google.com/spreadsheets/d/${dailySheetId}/edit` : '';

    // 6. Site Photos Drive Folder
    const sitePhotosOverride = localStorage.getItem('c10_override_site_photos_folder_id');
    const sitePhotosId = sitePhotosOverride ? extractDriveFolderIdFromUrl(sitePhotosOverride) : SITE_IMAGES_FOLDER_ID;
    const sitePhotosUrl = `https://drive.google.com/drive/folders/${sitePhotosId}`;

    // 7. Weekly Reports & Minutes Drive Folder
    const weeklyOverride = localStorage.getItem('c10_override_weekly_report_folder_id');
    const weeklyFolderId = weeklyOverride ? extractDriveFolderIdFromUrl(weeklyOverride) : '1K27iyUSy7hER-oo2qmHairwEAA2dpwsy';
    const weeklyFolderUrl = `https://drive.google.com/drive/folders/${weeklyFolderId}`;

    // 8. Apps Script Webhook
    const webhookUrl = localStorage.getItem('c10_daily_report_webhook_url') || '';

    return [
      {
        id: 'main_sheet',
        name: language === 'VN' ? 'Google Sheet Trung Tâm C10 (Main Project Sheet)' : 'C10 Main Project Google Sheet',
        category: 'sheet',
        categoryLabel: 'Google Sheet',
        storageKey: 'c10_override_main_sheet_id',
        defaultUrl: `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit`,
        currentDisplayUrl: mainSheetUrl,
        openUrl: mainSheetUrl,
        targetModules: [
          { name: 'Dashboard', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Tiến độ tổng & S-Curve', tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
          { name: 'Báo cáo tuần', tagColor: 'bg-sky-100 text-sky-800 border-sky-200' },
          { name: 'Defects (Lỗi)', tagColor: 'bg-rose-100 text-rose-800 border-rose-200' },
          { name: 'Thanh toán EV', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
          { name: 'Nhân lực & Thiết bị', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' },
          { name: 'Nhà mẫu', tagColor: 'bg-purple-100 text-purple-800 border-purple-200' },
          { name: 'Kế hoạch mua hàng', tagColor: 'bg-slate-100 text-slate-800 border-slate-200' }
        ],
        description: language === 'VN'
          ? 'Cung cấp dữ liệu cốt lõi cho toàn bộ dự án: tiến độ tổng (Construction), sản lượng giải ngân (Payment), nhân lực thi công (Manpower), thiết bị cơ giới (Equipment), danh sách lỗi (Issues) và tiến độ khu vực (Area).'
          : 'Feeds primary project data: overall progress, S-Curve payment data, manpower, machinery equipment, defects issues, and area milestones.',
        isEditable: true
      },
      {
        id: 'submittal_sheet',
        name: language === 'VN' ? 'Google Sheet Hồ Sơ Trình Duyệt (Submittal)' : 'Submittal & Technical Docs Google Sheet',
        category: 'sheet',
        categoryLabel: 'Google Sheet',
        storageKey: 'c10_override_submittal_sheet_id',
        defaultUrl: 'https://docs.google.com/spreadsheets/d/1POEaqpDjZu4pL7PNXWpgMuHyhKq_-IoBPdQ8EAWR3_s/edit',
        currentDisplayUrl: submittalSheetUrl,
        openUrl: submittalSheetUrl,
        targetModules: [
          { name: 'Theo dõi hồ sơ', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Shopdrawing (SD/SDW)', tagColor: 'bg-teal-100 text-teal-800 border-teal-200' },
          { name: 'Vật tư (MA/MAT)', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
          { name: 'Biện pháp (MOS)', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' },
          { name: 'Yêu cầu RFI', tagColor: 'bg-rose-100 text-rose-800 border-rose-200' },
          { name: 'Hồ sơ trễ hạn (Dashboard)', tagColor: 'bg-purple-100 text-purple-800 border-purple-200' }
        ],
        description: language === 'VN'
          ? 'Cung cấp dữ liệu đệ trình và phê duyệt hồ sơ: Bản vẽ Shopdrawing, phê duyệt mẫu vật tư, biện pháp thi công, công tác thí nghiệm và danh sách hồ sơ chậm trễ cần đôn đốc.'
          : 'Feeds submittal tracking: Shopdrawings, materials approval, method statements (MOS), RFIs, and overdue submittal alerts on the dashboard.',
        isEditable: true
      },
      {
        id: 'monitoring_sheet',
        name: language === 'VN' ? 'Google Sheet Quan Trắc Công Trình (Monitoring Sheet)' : 'Geotechnical Monitoring Google Sheet',
        category: 'sheet',
        categoryLabel: 'Google Sheet',
        storageKey: 'c10_override_monitoring_sheet_id',
        defaultUrl: 'https://docs.google.com/spreadsheets/d/1cE7s2Qe7-eMfxn6bN4CjM7gQp2v0F3n8L9a1b2c3d4/edit',
        currentDisplayUrl: monitoringSheetUrl,
        openUrl: monitoringSheetUrl,
        targetModules: [
          { name: 'Quan trắc (Monitoring)', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' },
          { name: 'Chuyển vị tường vây (ICL)', tagColor: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
          { name: 'Móng cẩu tháp (TC)', tagColor: 'bg-orange-100 text-orange-800 border-orange-200' },
          { name: 'Ứng suất giằng (SS)', tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
          { name: 'Lún lân cận (SM)', tagColor: 'bg-rose-100 text-rose-800 border-rose-200' },
          { name: 'Nghiêng lân cận (TM)', tagColor: 'bg-pink-100 text-pink-800 border-pink-200' },
          { name: 'Lún mặt đường (RSM)', tagColor: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
          { name: 'Đỉnh tường vây (TDW)', tagColor: 'bg-teal-100 text-teal-800 border-teal-200' },
          { name: 'Tổng hợp cảnh báo (Sum)', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
        ],
        description: language === 'VN'
          ? 'Cung cấp số liệu đo đạc trắc địa thời gian thực cho 7 hạng mục quan trắc công trình ngầm và bảng tổng hợp Sum phân tích ngưỡng cảnh báo an toàn hố đào.'
          : 'Feeds live geotechnical monitoring data across 7 underground categories and warning summaries.',
        isEditable: true
      },
      {
        id: 'daily_report_drive',
        name: language === 'VN' ? 'Google Drive: Thư Mục Báo Cáo Ngày (Daily PDF Storage)' : 'Daily Report PDF Google Drive Folder',
        category: 'drive',
        categoryLabel: 'Google Drive',
        storageKey: 'c10_daily_report_drive_folder',
        defaultUrl: 'https://drive.google.com/drive/folders/10sldhCeoddg_8qx78DKVAauYET2J4sCp',
        currentDisplayUrl: dailyDriveUrl,
        openUrl: dailyDriveUrl,
        targetModules: [
          { name: 'Báo cáo ngày (Daily Report)', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
          { name: 'Nút "Lưu vào Drive" (PDF)', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Danh sách báo cáo ngày gần nhất', tagColor: 'bg-slate-100 text-slate-800 border-slate-200' }
        ],
        description: language === 'VN'
          ? 'Thư mục trên Google Drive để lưu trữ và tải lên tự động các tệp file Báo cáo ngày PDF chuẩn A4 (định dạng YYMMDD-C10-Delta-Báo cáo ngày.pdf) và quét danh sách các file đã lưu.'
          : 'Google Drive destination folder where exported A4 daily report PDFs are archived and retrieved.',
        isEditable: true
      },
      {
        id: 'daily_report_sheet',
        name: language === 'VN' ? 'Google Sheet Tổng Hợp Số Lượng Báo Cáo Ngày' : 'Daily Report Quantity Sync Google Sheet',
        category: 'sheet',
        categoryLabel: 'Google Sheet',
        storageKey: 'c10_daily_report_sheet_url',
        defaultUrl: language === 'VN' ? 'Chưa cấu hình (Đang tạo link riêng cho C10)' : 'Unset',
        currentDisplayUrl: dailySheetUrl || (language === 'VN' ? 'Chưa thiết lập (Dán link Sheet mới vào bên phải)' : 'Not set'),
        openUrl: dailySheetUrl || '#',
        targetModules: [
          { name: 'Báo cáo ngày (Daily Report)', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
          { name: 'Drive lưu trữ & tổng hợp', tagColor: 'bg-teal-100 text-teal-800 border-teal-200' },
          { name: 'Đồng bộ số lượng nhân lực/máy móc/vật tư', tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' }
        ],
        description: language === 'VN'
          ? 'Trang tính Google Sheet độc lập dành riêng cho dự án C10 để nhận số liệu tổng hợp tự động khi người dùng bấm nút "Drive lưu trữ và tổng hợp" (tách biệt hoàn toàn với file cũ của CN82).'
          : 'Independent Google Sheet receiving tabulated daily report manpower, machinery, and inspection data.',
        isEditable: true
      },
      {
        id: 'site_photos_drive',
        name: language === 'VN' ? 'Google Drive: Thư Mục Hình Ảnh Công Trường' : 'Site Photos Google Drive Folder',
        category: 'drive',
        categoryLabel: 'Google Drive',
        storageKey: 'c10_override_site_photos_folder_id',
        defaultUrl: `https://drive.google.com/drive/folders/${SITE_IMAGES_FOLDER_ID}`,
        currentDisplayUrl: sitePhotosUrl,
        openUrl: sitePhotosUrl,
        targetModules: [
          { name: 'Hình ảnh công trường', tagColor: 'bg-purple-100 text-purple-800 border-purple-200' },
          { name: 'Album ảnh hiện trường thực tế', tagColor: 'bg-pink-100 text-pink-800 border-pink-200' },
          { name: 'Thư viện hình ảnh nghiệm thu', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' }
        ],
        description: language === 'VN'
          ? 'Thư mục Google Drive lưu trữ các album ảnh thi công thực tế tại công trường. Ứng dụng tự động quét và hiển thị hình ảnh chất lượng cao lên tab Hình ảnh công trường.'
          : 'Google Drive folder containing real site construction photos automatically rendered on the Site Photos tab.',
        isEditable: true
      },
      {
        id: 'weekly_reports_drive',
        name: language === 'VN' ? 'Google Drive: Thư Mục Báo Cáo Tuần & Biên Bản Họp' : 'Weekly Reports & Meeting Minutes Folder',
        category: 'drive',
        categoryLabel: 'Google Drive',
        storageKey: 'c10_override_weekly_report_folder_id',
        defaultUrl: 'https://drive.google.com/drive/folders/1K27iyUSy7hER-oo2qmHairwEAA2dpwsy',
        currentDisplayUrl: weeklyFolderUrl,
        openUrl: weeklyFolderUrl,
        targetModules: [
          { name: 'Báo cáo tuần (Schedule)', tagColor: 'bg-sky-100 text-sky-800 border-sky-200' },
          { name: 'Mở báo cáo tuần này (PDF)', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Biên bản họp tuần trước', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' },
          { name: 'Yêu cầu CĐT PMH & TVGS', tagColor: 'bg-rose-100 text-rose-800 border-rose-200' }
        ],
        description: language === 'VN'
          ? 'Thư mục lưu trữ tệp PDF Báo cáo tuần mới nhất, biên bản cuộc họp giao ban định kỳ giữa Phú Mỹ Hưng, SCQC2 và Delta. Nút "Mở báo cáo tuần này" sẽ quét file mới nhất từ thư mục này.'
          : 'Google Drive folder for latest weekly report PDFs and meeting minutes opened directly from the Schedule tab.',
        isEditable: true
      },
      {
        id: 'apps_script_webhook',
        name: language === 'VN' ? 'Google Apps Script Webhook (Đồng Bộ Báo Cáo Ngày)' : 'Daily Report Apps Script Webhook API',
        category: 'webhook',
        categoryLabel: 'Apps Script API',
        storageKey: 'c10_daily_report_webhook_url',
        defaultUrl: language === 'VN' ? 'Chưa cấu hình URL Webhook' : 'Unset',
        currentDisplayUrl: webhookUrl || (language === 'VN' ? 'Chưa thiết lập (Dán Webhook URL Google Apps Script)' : 'Not configured'),
        openUrl: webhookUrl || '#',
        targetModules: [
          { name: 'Báo cáo ngày (Daily Report)', tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
          { name: 'Tự động đẩy file PDF lên Drive', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Tự động ghi số dòng lên Google Sheet', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
        ],
        description: language === 'VN'
          ? 'Đường dẫn Webhook Google Apps Script thực hiện lưu trữ file PDF trực tiếp vào Google Drive và ghi thêm dòng dữ liệu tự động vào Google Sheet mà không bị chặn bởi quyền tài khoản.'
          : 'Google Apps Script Webhook receiving JSON payloads to upload daily report PDFs and append rows to Google Sheets.',
        isEditable: true
      },
      {
        id: 'firebase_cloud',
        name: language === 'VN' ? 'Firebase Cloud Firestore & Authentication' : 'Firebase Cloud Firestore & Auth',
        category: 'firebase',
        categoryLabel: 'Firebase Cloud',
        defaultUrl: 'Firebase Project: c10-management / Auth: Google OAuth 2.0',
        currentDisplayUrl: 'Đang hoạt động thời gian thực (Real-time Active)',
        openUrl: 'https://console.firebase.google.com',
        targetModules: [
          { name: 'Quyền Super Admin', tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
          { name: 'Ban Chỉ Huy (GeneralInfo)', tagColor: 'bg-blue-100 text-blue-800 border-blue-200' },
          { name: 'Mốc tiến độ (Milestones)', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' },
          { name: 'Cấu hình quan trắc thời gian thực', tagColor: 'bg-purple-100 text-purple-800 border-purple-200' }
        ],
        description: language === 'VN'
          ? 'Cơ sở dữ liệu đám mây NoSQL Firestore lưu trữ danh sách thành viên ban chỉ huy, trạng thái khóa bảo mật các mốc tiến độ và quản lý phiên đăng nhập Google Admin của anh Lê Trần Phúc Bảo.'
          : 'Real-time NoSQL Firestore database handling management team profiles, project milestone locks, and admin credentials.',
        isEditable: false
      }
    ];
  }, [language, refreshKey]);

  // Handle saving link change
  const handleSaveLink = (resource: CloudResourceDef) => {
    if (!resource.storageKey) return;
    const inputVal = (inputValues[resource.id] || '').trim();
    if (!inputVal) {
      showToast(language === 'VN' ? 'Vui lòng dán link hoặc ID mới trước khi bấm Lưu!' : 'Please enter a valid URL or ID first!');
      return;
    }

    let finalValue = inputVal;
    if (resource.category === 'sheet') {
      const extracted = extractSheetId(inputVal);
      finalValue = extracted || inputVal;
    } else if (resource.category === 'drive') {
      const extracted = extractDriveFolderIdFromUrl(inputVal);
      finalValue = extracted || inputVal;
    }

    localStorage.setItem(resource.storageKey, finalValue);

    // If it's monitoring, also synchronize with monitoring source config & firestore
    if (resource.id === 'monitoring_sheet') {
      saveMonitoringSourceConfig({
        sourceType: 'custom_sheet',
        customSheetId: finalValue
      }).catch(console.warn);
    }

    // Trigger global update event
    window.dispatchEvent(new Event('c10-resource-updated'));
    window.dispatchEvent(new Event('c10-auth-changed'));

    // Clear input
    setInputValues(prev => ({ ...prev, [resource.id]: '' }));
    setRefreshKey(k => k + 1);

    showToast(language === 'VN' 
      ? `Đã cập nhật thành công link cho "${resource.name}"!` 
      : `Successfully updated link for "${resource.name}"!`);
  };

  // Handle reset to default link
  const handleResetLink = (resource: CloudResourceDef) => {
    if (!resource.storageKey) return;
    localStorage.removeItem(resource.storageKey);

    if (resource.id === 'monitoring_sheet') {
      saveMonitoringSourceConfig({
        sourceType: 'default_file',
        fileName: 'C10 Tổng hợp kết quả quan trắc'
      }).catch(console.warn);
    }

    window.dispatchEvent(new Event('c10-resource-updated'));
    window.dispatchEvent(new Event('c10-auth-changed'));

    setInputValues(prev => ({ ...prev, [resource.id]: '' }));
    setRefreshKey(k => k + 1);

    showToast(language === 'VN' 
      ? `Đã khôi phục "${resource.name}" về link mặc định ban đầu!` 
      : `Restored "${resource.name}" to default link!`);
  };

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter(res => {
      // Category filter
      if (categoryFilter === 'sheet' && res.category !== 'sheet') return false;
      if (categoryFilter === 'drive' && res.category !== 'drive') return false;
      if (categoryFilter === 'api' && (res.category !== 'webhook' && res.category !== 'firebase')) return false;

      // Text search filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchName = res.name.toLowerCase().includes(q);
        const matchDesc = res.description.toLowerCase().includes(q);
        const matchTarget = res.targetModules.some(m => m.name.toLowerCase().includes(q));
        const matchUrl = res.currentDisplayUrl.toLowerCase().includes(q);
        return matchName || matchDesc || matchTarget || matchUrl;
      }
      return true;
    });
  }, [resources, categoryFilter, searchFilter]);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-6 max-w-7xl mx-auto">
      {/* Toast notification banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[200] max-w-md bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-slide-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-bold leading-relaxed">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-700/60 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-emerald-500/10 to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                  {language === 'VN' ? 'Trung Tâm Quản Trị Hệ Thống C10' : 'C10 System Administration'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Super Admin
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-300 mt-1">
                {language === 'VN'
                  ? `Đang đăng nhập với quyền Quản trị viên: ${ADMIN_EMAIL}`
                  : `Authenticated Administrator Session: ${ADMIN_EMAIL}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onLogoutAdmin}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>{language === 'VN' ? 'Đăng xuất Admin' : 'Exit Admin'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Profile & Security Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Admin Profile */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <User className="w-5 h-5 text-blue-600" />
              <h2 className="font-bold text-slate-800 text-sm">
                {language === 'VN' ? 'Tài Khoản Quản Trị' : 'Admin Profile'}
              </h2>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {language === 'VN' ? 'Đã xác thực' : 'Verified'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Họ & Tên:</span>
              <p className="text-slate-800 font-bold mt-0.5 text-sm">Lê Trần Phúc Bảo</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Email Google Quản trị:</span>
              <p className="text-blue-600 font-mono font-bold mt-0.5 break-all">{ADMIN_EMAIL}</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Quyền hạn hệ thống:</span>
              <p className="text-slate-700 font-semibold mt-0.5">
                Toàn quyền (Đổi link Sheet/Drive, Quản lý Nhân sự, Quan trắc, Báo cáo)
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Security & Protection Status */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <Key className="w-5 h-5 text-amber-500" />
              <h2 className="font-bold text-slate-800 text-sm">
                {language === 'VN' ? 'Bảo Mật & Phân Quyền Khách' : 'Security & Guest Access'}
              </h2>
            </div>
            <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Khóa Lớp 2 Đang Bật
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-medium">Trạng thái Khách:</span>
              <p className="text-slate-700 font-semibold mt-0.5">
                {language === 'VN' ? 'Ẩn nút Quyền Admin với tất cả người xem' : 'Hidden for all guest users'}
              </p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Mã PIN bảo mật Layer 2:</span>
              <p className="text-slate-800 font-mono font-bold mt-0.5 tracking-widest">456321</p>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Cơ chế xác thực:</span>
              <p className="text-slate-700 font-semibold mt-0.5">Google OAuth 2.0 Admin Account</p>
            </div>
          </div>
        </div>
      </div>

      {/* MASTER SECTION: CẤU HÌNH ĐỒNG BỘ & LÀM MỚI DỮ LIỆU DỰ ÁN */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Section Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-6 h-6 text-indigo-400" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight">
                  {language === 'VN'
                    ? 'Cấu Hình Đồng Bộ & Phân Quyền Cập Nhật Báo Cáo'
                    : 'Report Data Synchronization & Realtime Permission Settings'}
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                {language === 'VN'
                  ? 'Quản lý cơ chế cập nhật dữ liệu từ Google Sheets: Bấm "Làm mới báo cáo" để cập nhật dữ liệu mới lên app, phân quyền tự động cập nhật thời gian thực cho từng mục riêng biệt, và cài đặt khung giờ cố định tự động quét dữ liệu mỗi ngày.'
                  : 'Manage report sync from Google Sheets: Trigger manual refresh, configure realtime auto-sync per section, and define scheduled daily refresh time.'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 md:p-6 space-y-6">
          {/* Top 2 Cards: Làm Mới Báo Cáo & Định Giờ Cập Nhật Hàng Ngày */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Nút Làm Mới Báo Cáo Thủ Công */}
            <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-800 text-sm">
                      {language === 'VN' ? 'Làm Mới Báo Cáo Thủ Công' : 'Manual Report Refresh'}
                    </h3>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    {language === 'VN' ? 'Quyền Admin' : 'Admin Action'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  {language === 'VN'
                    ? 'Chỉ khi bấm vào nút này, dữ liệu mới nhất từ Google Sheets mới được tải về và lưu vào bộ đệm của hệ thống để phân phối cho toàn bộ người dùng.'
                    : 'New data from Google Sheets is only published across the app when this button is clicked or when scheduled sync triggers.'}
                </p>
                <div className="bg-white rounded-lg p-3 border border-slate-200 mb-4 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">{language === 'VN' ? 'Lần làm mới gần nhất:' : 'Last Refreshed:'}</span>
                    <span className="font-bold text-slate-800 font-mono">
                      {formatVNDateTime(syncSettings?.lastRefreshedAt)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">{language === 'VN' ? 'Người thực hiện:' : 'Refreshed By:'}</span>
                    <span className="font-semibold text-indigo-600">
                      {syncSettings?.refreshedBy || 'Hệ thống'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={onRefreshAllData}
                disabled={isRefreshingData}
                className="w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingData ? 'animate-spin' : ''}`} />
                <span>
                  {isRefreshingData
                    ? (language === 'VN' ? 'Đang tải dữ liệu từ Google Sheets...' : 'Fetching live Sheets data...')
                    : (language === 'VN' ? 'Làm Mới Báo Cáo Ngay' : 'Refresh Report Now')}
                </span>
              </button>
            </div>

            {/* Card 2: Định Giờ Cập Nhật Cố Định Hàng Ngày */}
            <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <h3 className="font-bold text-slate-800 text-sm">
                      {language === 'VN' ? 'Định Giờ Cập Nhật Hàng Ngày' : 'Scheduled Daily Auto-Sync'}
                    </h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${scheduledEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {scheduledEnabled 
                      ? (language === 'VN' ? 'Đang Bật Hẹn Giờ' : 'Active') 
                      : (language === 'VN' ? 'Đang Tắt' : 'Disabled')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                  {language === 'VN'
                    ? 'Tick chọn bên dưới và gõ thời gian cố định hàng ngày (ví dụ 17:30 sau giờ làm việc). Hệ thống sẽ tự động quét và cập nhật báo cáo vào đúng khung giờ này.'
                    : 'Enable checkbox and enter a fixed daily time (e.g. 17:30). The system will automatically refresh all reports at that specific time.'}
                </p>

                <div className="bg-white rounded-lg p-3.5 border border-slate-200 mb-4 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={scheduledEnabled}
                      onChange={(e) => setScheduledEnabled(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">
                      {language === 'VN' ? 'Bật chế độ tự động làm mới theo giờ cố định hàng ngày' : 'Enable daily scheduled auto-refresh'}
                    </span>
                  </label>

                  <div className="flex items-center gap-3 pt-1">
                    <label className="text-xs font-medium text-slate-500 whitespace-nowrap">
                      {language === 'VN' ? 'Khung giờ cập nhật:' : 'Refresh time:'}
                    </label>
                    <div className="relative flex-1 max-w-[160px]">
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        disabled={!scheduledEnabled}
                        className="w-full px-3 py-1.5 text-sm font-mono font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-100"
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      {language === 'VN' ? '(Giờ:Phút)' : '(HH:mm)'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveSchedule}
                disabled={isSavingSchedule}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                <Save className="w-4 h-4 text-emerald-400" />
                <span>
                  {isSavingSchedule
                    ? (language === 'VN' ? 'Đang lưu cấu hình...' : 'Saving schedule...')
                    : (language === 'VN' ? 'Lưu Giờ Cập Nhật Định Kỳ' : 'Save Scheduled Time')}
                </span>
              </button>
            </div>
          </div>

          {/* Section 2: Phân Quyền Cập Nhật Thời Gian Thực Theo Từng Mục */}
          <div className="border border-slate-200 rounded-xl p-5 bg-gradient-to-b from-white to-slate-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  {language === 'VN'
                    ? 'Phân Quyền Cập Nhật Thời Gian Thực Theo Từng Phân Hệ'
                    : 'Real-time Auto-Sync Permissions per Section'}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                  {language === 'VN' ? 'BẬT: Thời gian thực (Realtime)' : 'ON: Realtime'}
                </span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                  {language === 'VN' ? 'TẮT: Cập nhật khi làm mới (Cached)' : 'OFF: Cached'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {language === 'VN'
                ? 'Anh có thể tick chọn vào mục nào muốn tự động cập nhật theo thời gian thực: Mục đó sẽ tự động nạp số liệu mới từ Google Sheets mỗi khi người dùng truy cập. Các mục tắt realtime sẽ giữ ổn định số liệu đã lưu cho đến khi Admin bấm "Làm mới báo cáo" hoặc đến giờ hẹn hàng ngày.'
                : 'Toggle any section to enable realtime updates directly from Google Sheets. Unchecked sections will load cached data until Admin manual refresh or scheduled sync.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                { key: 'dashboard' as const, label: 'Tổng Quan Dự Án & Tiến Độ', desc: 'Mặt cắt C10, tiến độ thi công, hồ sơ trễ hạn' },
                { key: 'dailyReport' as const, label: 'Báo Cáo Ngày (Daily Report)', desc: 'Nhân lực, máy móc, hình ảnh nhật ký thi công' },
                { key: 'weeklyReport' as const, label: 'Báo Cáo Tuần & Biên Bản', desc: 'Folder báo cáo tuần và biên bản họp' },
                { key: 'focusPoints' as const, label: 'Điểm Cần Tập Trung', desc: 'Bảng theo dõi các nút thắt kỹ thuật trọng điểm' },
                { key: 'monitoring' as const, label: 'Quan Trắc Công Trình Ngầm', desc: '7 hạng mục quan trắc trắc địa & bảng Sum cảnh báo' },
                { key: 'submittal' as const, label: 'Hồ Sơ Đệ Trình & Nghiệm Thu', desc: 'Shopdrawing, vật tư, MOS, RFI, phê duyệt mẫu' },
                { key: 'procurement' as const, label: 'Kế Hoạch Mua Hàng', desc: 'Tiến độ cung ứng vật tư & thiết bị dự án' },
                { key: 'payment' as const, label: 'Thanh Toán & Dòng Tiền', desc: 'Hồ sơ đệ trình thanh toán, tạm ứng, quyết toán' },
              ].map((item) => {
                const isRealtime = syncSettings?.sections?.[item.key] ?? false;
                return (
                  <div
                    key={item.key}
                    onClick={() => handleToggleSection(item.key)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                      isRealtime
                        ? 'bg-emerald-50/70 border-emerald-300 shadow-sm ring-1 ring-emerald-300/60'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-bold text-xs text-slate-800 leading-snug">
                          {item.label}
                        </span>
                        <div
                          className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                            isRealtime ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition-transform" />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
                        {item.desc}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Trạng thái:</span>
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          isRealtime
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isRealtime ? 'Tự động Realtime' : 'Theo lần làm mới'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* MASTER SECTION: PHÂN QUYỀN TRUY CẬP & CẬP NHẬT DỮ LIỆU THÀNH VIÊN */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Section Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Users className="w-6 h-6 text-indigo-400" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight">
                  {language === 'VN'
                    ? 'Bảng Phân Quyền Truy Cập & Cập Nhật Dữ Liệu Theo Từng Tab'
                    : 'Member Permissions Matrix & Tab Access Control'}
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                {language === 'VN'
                  ? 'Quản lý tài khoản Google của nhân sự dự án: Cấp quyền chi tiết cho từng người được phép cập nhật dữ liệu ở tab nào (Báo cáo ngày, Quan trắc, Đệ trình hồ sơ, Điểm trọng tâm, Mua hàng, Thanh toán...). Khi nhân sự đăng nhập, họ chỉ được mở khóa thao tác ở các tab anh đã tick chọn.'
                  : 'Grant fine-grained tab permissions per member email. Authorized members can only edit tabs checked by the Administrator.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                {userPermissions.length} {language === 'VN' ? 'Tài khoản được cấp quyền' : 'Authorized Members'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 md:p-6 space-y-6">
          {/* Add New Member Form */}
          <form onSubmit={handleAddUserPermission} className="bg-slate-50/80 rounded-xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  {language === 'VN' ? 'Cấp Quyền Bằng Email Google Hoặc Mã Truy Cập (Access Code)' : 'Authorize by Google Email or Access Code'}
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                Hỗ trợ cả Đăng nhập Email & Nhập Mã trực tiếp tại Tab
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {language === 'VN' ? 'Tên người dùng / Ghi chú bộ phận:' : 'Member Name / Note:'}
                  </label>
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder={language === 'VN' ? 'vd: KS. Nguyễn Văn A - Báo cáo ngày' : 'e.g. Engineer A'}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    {language === 'VN' ? 'Cách 1 — Email Google (Tùy chọn):' : 'Google Email (Optional):'}
                  </label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder={language === 'VN' ? 'vd: kisu@gmail.com' : 'member@gmail.com'}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-indigo-700">
                      {language === 'VN' ? 'Cách 2 — Mã cấp quyền:' : 'Access Code:'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const rand = 'C10-' + Math.random().toString(36).substring(2, 6).toUpperCase();
                        setNewMemberAccessCode(rand);
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      + Tạo mã nhanh
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newMemberAccessCode}
                    onChange={(e) => setNewMemberAccessCode(e.target.value)}
                    placeholder={language === 'VN' ? 'vd: BCN2026, HOSO123...' : 'e.g. BCN2026'}
                    className="w-full px-3 py-2 text-xs bg-indigo-50/50 border border-indigo-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono font-bold text-indigo-900"
                  />
                </div>

                <p className="sm:col-span-2 text-[11px] text-slate-500 leading-relaxed">
                  {language === 'VN'
                    ? '💡 Bạn có thể nhập chỉ Mã cấp quyền (không cần Email), hoặc nhập cả hai. Người dùng chỉ cần gõ đúng Mã này là được thêm/chỉnh sửa dữ liệu trong các Tab đã tích chọn.'
                    : 'Enter an Access Code, an Email, or both.'}
                </p>
              </div>

              <div className="lg:col-span-7 space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  {language === 'VN' ? 'Chọn các tab cho phép người này thêm / chỉnh sửa dữ liệu:' : 'Select permitted tabs:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {AVAILABLE_TABS.map((tab) => {
                    const isChecked = Boolean(newMemberRoles[tab.key]);
                    return (
                      <label
                        key={tab.key}
                        onClick={() => handleToggleNewMemberRole(tab.key)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                          isChecked
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent label onClick
                          className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 pointer-events-none"
                        />
                        <span className="truncate text-[11px]">{tab.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingUserPerms || (!newMemberEmail.trim() && !newMemberAccessCode.trim())}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {isSavingUserPerms
                    ? (language === 'VN' ? 'Đang lưu phân quyền...' : 'Saving...')
                    : (language === 'VN' ? 'Lưu Cấp Quyền (Email / Mã Truy Cập)' : 'Save Authorization')}
                </span>
              </button>
            </div>
          </form>

          {/* Members Permissions Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">
                  {language === 'VN' ? 'Danh Sách Phân Quyền Chi Tiết (Theo Email & Mã Cấp Quyền)' : 'Active Permissions Matrix'}
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                {language === 'VN' ? 'Click vào ô checkbox để bật/tắt quyền hoặc nhập/sửa Mã cấp quyền trực tiếp' : 'Click checkboxes to toggle immediately'}
              </span>
            </div>

            {userPermissions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <Users className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                <p className="text-xs font-medium">
                  {language === 'VN'
                    ? 'Chưa có tài khoản hoặc mã nào được phân quyền. Bạn hãy thêm Email hoặc Mã cấp quyền ở bảng trên.'
                    : 'No members or access codes authorized yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <th className="py-3 px-4 w-56">{language === 'VN' ? 'Người Dùng / Email' : 'Member / Email'}</th>
                      <th className="py-3 px-3 w-44">{language === 'VN' ? '🔑 Mã Cấp Quyền' : 'Access Code'}</th>
                      {AVAILABLE_TABS.map((tab) => (
                        <th key={tab.key} className="py-3 px-2 text-center text-[11px] whitespace-nowrap">
                          {tab.shortLabel}
                        </th>
                      ))}
                      <th className="py-3 px-3 text-center w-16">{language === 'VN' ? 'Xóa' : 'Revoke'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userPermissions.map((user) => (
                      <tr key={user.email} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-800 text-[11px]">
                          <div className="flex flex-col gap-0.5">
                            {user.name && (
                              <span className="font-bold text-slate-900 text-xs">{user.name}</span>
                            )}
                            <div className="flex items-center gap-1.5 font-mono text-slate-600">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span className="truncate max-w-[200px]" title={user.email}>
                                {user.email.startsWith('mã:') ? '(Chỉ dùng Mã cấp quyền)' : user.email}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              defaultValue={user.accessCode || ''}
                              placeholder="Gán mã..."
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (user.accessCode || '')) {
                                  handleUpdateUserAccessCode(user.email, val);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-28 px-2 py-1 text-xs font-mono font-bold text-indigo-800 bg-indigo-50/60 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              title="Nhập mã cấp quyền rồi nhấn Enter hoặc click ra ngoài để lưu tự động"
                            />
                          </div>
                        </td>
                        {AVAILABLE_TABS.map((tab) => {
                          const hasRole = Boolean(user.roles?.[tab.key]);
                          return (
                            <td key={tab.key} className="py-3 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={hasRole}
                                onChange={() => handleToggleUserTab(user.email, tab.key)}
                                title={`${user.name || user.email}: ${hasRole ? 'Đang có quyền' : 'Chưa có quyền'} ${tab.label}`}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveUserPermission(user.email)}
                            title={language === 'VN' ? `Thu hồi toàn bộ quyền của ${user.email}` : `Revoke ${user.email}`}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MASTER SECTION: TÀI NGUYÊN ĐÁM MÂY & LIÊN KẾT ỨNG DỤNG */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        {/* Section Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Database className="w-6 h-6 text-blue-400" />
                <h2 className="text-lg md:text-xl font-bold tracking-tight">
                  {language === 'VN'
                    ? 'Quản Lý Tài Nguyên Đám Mây & Nguồn Dữ Liệu Ứng Dụng'
                    : 'Cloud Resources & App Data Sources Management'}
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                {language === 'VN'
                  ? 'Bảng tra cứu chi tiết toàn bộ link Google Drive, Google Sheet và Webhook cấp dữ liệu cho từng mục trong website. Bạn có thể dán link mới vào cột bên phải và bấm "Lưu thay đổi" để hệ thống cập nhật nguồn dữ liệu ngay lập tức!'
                  : 'Complete directory of all Google Drive, Google Sheet, and Webhook links feeding each application feature. You can paste replacement links on the right to update live data instantly.'}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-3 py-1 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-xl font-mono font-bold">
                {filteredResources.length} / {resources.length} {language === 'VN' ? 'tài nguyên' : 'resources'}
              </span>
            </div>
          </div>

          {/* Search & Filters Bar */}
          <div className="mt-5 pt-4 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder={language === 'VN' ? 'Tìm theo tên, link, hoặc mục ứng dụng...' : 'Search by name, link, or module...'}
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  categoryFilter === 'all'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {language === 'VN' ? 'Tất cả (9)' : 'All (9)'}
              </button>
              <button
                onClick={() => setCategoryFilter('sheet')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  categoryFilter === 'sheet'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Google Sheet (4)</span>
              </button>
              <button
                onClick={() => setCategoryFilter('drive')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  categoryFilter === 'drive'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Google Drive (3)</span>
              </button>
              <button
                onClick={() => setCategoryFilter('api')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  categoryFilter === 'api'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>API & Cloud (2)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Resources Table / List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-72">{language === 'VN' ? 'Hạng Mục & Dữ Liệu Cấp Cho Web' : 'Resource & Target Features'}</th>
                <th className="py-3.5 px-4 min-w-[320px]">{language === 'VN' ? 'Link / ID Đang Sử Dụng' : 'Current Link / ID'}</th>
                <th className="py-3.5 px-4 min-w-[380px]">{language === 'VN' ? 'Gửi Link Thay Đổi Cho Vị Trí Này' : 'Update Replacement Link'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-xs">
              {filteredResources.map((res, idx) => {
                const isOverridden = Boolean(res.storageKey && localStorage.getItem(res.storageKey));
                const currentInputValue = inputValues[res.id] || '';

                return (
                  <tr key={res.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Column 1: Resource & Target Modules */}
                    <td className="py-4 px-4 align-top space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <div className="p-2 rounded-xl bg-slate-100 text-slate-700 mt-0.5 shrink-0">
                          {res.category === 'sheet' && <FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                          {res.category === 'drive' && <FolderGit2 className="w-4 h-4 text-amber-600" />}
                          {res.category === 'webhook' && <Globe className="w-4 h-4 text-indigo-600" />}
                          {res.category === 'firebase' && <Database className="w-4 h-4 text-purple-600" />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm leading-snug">
                            {res.name}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {res.categoryLabel}
                          </span>
                        </div>
                      </div>

                      {/* Target App Modules Tags */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {language === 'VN' ? 'Cấp dữ liệu cho các mục:' : 'Feeds data to:'}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {res.targetModules.map((mod, i) => (
                            <span
                              key={i}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${mod.tagColor}`}
                            >
                              {mod.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-relaxed italic bg-slate-50 p-2 rounded-lg border border-slate-150">
                        {res.description}
                      </p>
                    </td>

                    {/* Column 2: Current Link & Status */}
                    <td className="py-4 px-4 align-top space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">
                          {language === 'VN' ? 'Trạng thái link:' : 'Link status:'}
                        </span>
                        {isOverridden ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" />
                            {language === 'VN' ? 'Đã tùy chỉnh' : 'Customized'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {language === 'VN' ? 'Mặc định hệ thống' : 'Default'}
                          </span>
                        )}
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 break-all leading-relaxed select-all">
                        {res.currentDisplayUrl}
                      </div>

                      {res.openUrl && res.openUrl !== '#' && (
                        <div className="flex items-center gap-2 pt-1">
                          <a
                            href={res.openUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                          >
                            <span>{language === 'VN' ? 'Mở kiểm tra liên kết' : 'Open Link'}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </td>

                    {/* Column 3: Replacement Link Input & Save */}
                    <td className="py-4 px-4 align-top">
                      {res.isEditable ? (
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/90 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                              <Link2 className="w-3.5 h-3.5 text-blue-600" />
                              {language === 'VN' ? 'Dán link Google mới vào đây:' : 'Paste new link/ID here:'}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <input
                              type="text"
                              value={currentInputValue}
                              onChange={e => setInputValues(prev => ({ ...prev, [res.id]: e.target.value }))}
                              placeholder={
                                res.category === 'sheet'
                                  ? 'https://docs.google.com/spreadsheets/d/... hoặc ID Sheet'
                                  : res.category === 'drive'
                                  ? 'https://drive.google.com/drive/folders/... hoặc ID Thư mục'
                                  : 'https://script.google.com/macros/s/.../exec'
                              }
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                            />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveLink(res)}
                                disabled={!currentInputValue.trim()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{language === 'VN' ? 'Lưu thay đổi' : 'Save Link'}</span>
                              </button>

                              {isOverridden && (
                                <button
                                  type="button"
                                  onClick={() => handleResetLink(res)}
                                  className="inline-flex items-center gap-1 py-2 px-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                                  title={language === 'VN' ? 'Khôi phục về link mặc định ban đầu' : 'Reset to default'}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>{language === 'VN' ? 'Mặc định' : 'Reset'}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-[10px] text-slate-400 leading-tight">
                            {language === 'VN'
                              ? 'Hệ thống tự động lọc và trích xuất đúng ID của Google Sheet hoặc Google Drive khi lưu.'
                              : 'Automatically extracts the exact Google Sheet or Drive ID upon saving.'}
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-slate-500 text-xs flex items-center gap-2">
                          <Info className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>
                            {language === 'VN'
                              ? 'Tài nguyên lõi của hệ thống được quản lý tự động qua Firebase config.'
                              : 'Core cloud resource managed via Firebase configuration.'}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Quick Shortcuts */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80">
        <h2 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span>{language === 'VN' ? 'Lối Tắt Điều Khiển Quản Trị' : 'Admin Quick Control'}</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigateTab(Tab.GENERAL)}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group cursor-pointer"
          >
            <Users className="w-5 h-5 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-xs text-slate-800">{language === 'VN' ? 'Ban Chỉ Huy' : 'Management Team'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{language === 'VN' ? 'Thêm / Sửa nhân sự' : 'Edit personnel'}</div>
          </button>

          <button
            onClick={() => onNavigateTab(Tab.DAILY_REPORT)}
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 text-left transition-all group cursor-pointer"
          >
            <FileText className="w-5 h-5 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-xs text-slate-800">{language === 'VN' ? 'Báo Cáo Ngày' : 'Daily Report'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{language === 'VN' ? 'In PDF & Lưu Drive' : 'Export & sync Drive'}</div>
          </button>

          <button
            onClick={() => onNavigateTab(Tab.MONITORING)}
            className="p-4 rounded-xl border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 text-left transition-all group cursor-pointer"
          >
            <Activity className="w-5 h-5 text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-xs text-slate-800">{language === 'VN' ? 'Quan Trắc' : 'Monitoring'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{language === 'VN' ? 'Chế độ Ghi & Cảnh báo' : 'Write mode & alerts'}</div>
          </button>

          <button
            onClick={() => onNavigateTab(Tab.SITE_PHOTOS)}
            className="p-4 rounded-xl border border-slate-200 hover:border-purple-400 hover:bg-purple-50/50 text-left transition-all group cursor-pointer"
          >
            <Camera className="w-5 h-5 text-purple-600 mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-xs text-slate-800">{language === 'VN' ? 'Hình Ảnh Dự Án' : 'Site Photos'}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{language === 'VN' ? 'Cập nhật từ Drive' : 'Sync from Drive'}</div>
          </button>
        </div>
      </div>

      {/* Maintenance & Cache Utilities */}
      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-slate-500" />
            <span>{language === 'VN' ? 'Bảo Trì & Dọn Dẹp Bộ Nhớ Đệm (Cache)' : 'Cache & Maintenance'}</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {language === 'VN'
              ? 'Xóa bộ nhớ đệm trình duyệt để buộc tải lại dữ liệu mới nhất từ Google Sheets và Firebase (các link đã đổi sẽ vẫn được giữ nguyên).'
              : 'Clear browser cache to force reload the freshest data from Google Sheets & Firebase.'}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {cacheCleared && (
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-fade-in">
              <CheckCircle2 className="w-4 h-4" />
              {language === 'VN' ? 'Đã dọn dẹp cache!' : 'Cache cleared!'}
            </span>
          )}
          <button
            onClick={handleClearCache}
            disabled={clearingCache}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${clearingCache ? 'animate-spin' : ''}`} />
            <span>{language === 'VN' ? 'Dọn dẹp Cache' : 'Clear Cache'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const PROTECTED_TABS: Tab[] = [
  Tab.FOCUS_POINTS,
  Tab.MONITORING,
  Tab.ISSUES,
  Tab.PROCUREMENT,
  Tab.SUBMITTAL,
  Tab.PAYMENT,
  Tab.INSPECTION,
  Tab.SITE_PHOTOS,
  Tab.MODEL_HOUSE,
  Tab.MATERIALS,
  Tab.DEFECTS,
  Tab.ADMIN
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState<Language>('VN');
  const [isGlobalAuthenticated, setIsGlobalAuthenticated] = useState<boolean>(() => {
    return !ENABLE_PASSWORD_PROTECTION || localStorage.getItem('app-auth') === 'true';
  });
  const [isLayer2Authenticated, setIsLayer2Authenticated] = useState<boolean>(() => {
    if (localStorage.getItem('c10_guest_mode') === 'true') return false;
    return (
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true'
    );
  });

  const t = (key: string) => TRANSLATIONS[language][key] || key;

  // --- Global State ---
  const [sheetData, setSheetData] = useState<SheetData | null>(null);
  const [submittalData, setSubmittalData] = useState<SubmittalData | null>(null);
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'link', url: string } | null>(null);
  const [globalPasswordError, setGlobalPasswordError] = useState(false);

  // Data Sync Settings & Manual Refresh State
  const [syncSettings, setSyncSettings] = useState<DataSyncSettings>(() => loadLocalSyncSettings());
  const [isRefreshingAllData, setIsRefreshingAllData] = useState<boolean>(false);

  // Subscribe to real-time sync settings from Firestore
  useEffect(() => {
    const unsub = subscribeDataSyncSettings((settings) => {
      setSyncSettings(settings);
    });
    return () => unsub();
  }, []);

  // Update sync settings handler
  const handleUpdateSyncSettings = useCallback(async (newSettings: DataSyncSettings) => {
    const ok = await saveDataSyncSettings(newSettings);
    if (ok) {
      setSyncSettings(newSettings);
    }
    return ok;
  }, []);

  // Manual refresh all data handler
  const handleRefreshAllData = useCallback(async () => {
    setIsRefreshingAllData(true);
    try {
      clearDataCacheKeys();
      const [dashRes, subRes, monRes] = await Promise.all([
        fetchDashboardData().catch(() => null),
        fetchSubmittalData().catch(() => null),
        fetchMonitoringData().catch(() => null),
      ]);
      if (dashRes) {
        setSheetData(dashRes);
        setCache('sheets', dashRes);
      }
      if (subRes) {
        setSubmittalData(subRes);
        setCache('submittal', subRes);
      }
      if (monRes) {
        setMonitoringData(monRes);
        setCache('monitoring', monRes);
      }
      await triggerAdminManualRefresh(ADMIN_EMAIL);
      setError(false);
    } catch (err) {
      console.error('Error refreshing all reports:', err);
    } finally {
      setIsRefreshingAllData(false);
    }
  }, []);

  // Scheduled daily auto-sync checker
  useEffect(() => {
    if (!syncSettings?.scheduledSync?.enabled) return;

    const intervalId = setInterval(() => {
      const sched = syncSettings.scheduledSync;
      if (!sched.enabled || !sched.time) return;

      const now = new Date();
      const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (currentHHmm === sched.time && sched.lastRunDate !== todayStr) {
        console.log(`[AutoSync] Kích hoạt cập nhật tự động định giờ: ${sched.time}`);
        handleRefreshAllData();
        saveDataSyncSettings({
          ...syncSettings,
          scheduledSync: {
            ...sched,
            lastRunDate: todayStr
          }
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [syncSettings, handleRefreshAllData]);

  // Check if a section is allowed for realtime auto-fetching
  const isSectionRealtime = useCallback((sectionKey: keyof SectionSyncConfig): boolean => {
    return syncSettings?.sections?.[sectionKey] ?? false;
  }, [syncSettings]);

  // Sync admin/layer2 auth state across components
  useEffect(() => {
    const syncAuth = () => {
      if (localStorage.getItem('c10_guest_mode') === 'true') {
        setIsLayer2Authenticated(false);
        return;
      }
      const hasAuth = 
        localStorage.getItem('is_admin') === 'true' &&
        localStorage.getItem('c10_admin_unlocked') === 'true';
      setIsLayer2Authenticated(Boolean(hasAuth));
    };
    window.addEventListener('c10-auth-changed', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('c10-auth-changed', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  const handleProtectedLink = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    const isAuth = isLayer2Authenticated || localStorage.getItem('layer2-auth') === 'true' || localStorage.getItem('c10_admin_unlocked') === 'true';
    if (!ENABLE_PASSWORD_PROTECTION || isAuth) {
      window.open(url, '_blank');
    } else {
      setPendingAction({ type: 'link', url });
      setIsPasswordModalOpen(true);
    }
  };

  const handlePasswordSuccess = () => {
    setIsPasswordModalOpen(false);
    setIsLayer2Authenticated(true);
    localStorage.removeItem('c10_guest_mode');
    localStorage.setItem('layer2-auth', 'true');
    localStorage.setItem('c10_admin_unlocked', 'true');
    localStorage.setItem('is_admin', 'true');
    window.dispatchEvent(new Event('c10-auth-changed'));
    if (pendingAction?.type === 'link') {
      window.open(pendingAction.url, '_blank');
      setPendingAction(null);
    }
  };

  // Lazy Data Fetching Logic (Honoring Section Realtime & Admin Refresh Settings)
  const loadDataForTab = useCallback(async (tab: Tab) => {
    if (tab === Tab.DASHBOARD || tab === Tab.MODEL_HOUSE || tab === Tab.ISSUES || tab === Tab.SCHEDULE || tab === Tab.PAYMENT) {
      const cachedSheets = getCache('sheets');
      const isRealtime = tab === Tab.PAYMENT ? isSectionRealtime('payment') : isSectionRealtime('dashboard');
      
      if (cachedSheets) {
        setSheetData(cachedSheets.data);
      }

      if (!cachedSheets || isCacheStale(cachedSheets.timestamp, isRealtime)) {
        if (!cachedSheets) setLoading(true);
        const res = await fetchDashboardData();
        if (res) {
          setSheetData(res);
          setCache('sheets', res);
          setError(false);
        } else if (!cachedSheets) {
          setError(true);
        }
        setLoading(false);
      }

      // Also ensure submittal and monitoring data are fetched for Dashboard executive summaries
      if (tab === Tab.DASHBOARD) {
        if (!submittalData) {
          const isSubRealtime = isSectionRealtime('submittal');
          const cachedSub = getCache('submittal');
          if (cachedSub) setSubmittalData(cachedSub.data);
          if (!cachedSub || isCacheStale(cachedSub.timestamp, isSubRealtime)) {
            fetchSubmittalData().then(res => res && setSubmittalData(res)).catch(() => {});
          }
        }
        if (!monitoringData) {
          const isMonRealtime = isSectionRealtime('monitoring');
          const cachedMon = getCache('monitoring');
          if (cachedMon) setMonitoringData(cachedMon.data);
          if (!cachedMon || isCacheStale(cachedMon.timestamp, isMonRealtime)) {
            fetchMonitoringData().then(res => res && setMonitoringData(res)).catch(() => {});
          }
        }
      }
    }

    if (tab === Tab.SUBMITTAL) {
      const cachedSubmittal = getCache('submittal');
      const isRealtime = isSectionRealtime('submittal');
      
      if (cachedSubmittal) {
        setSubmittalData(cachedSubmittal.data);
      }

      if (!cachedSubmittal || isCacheStale(cachedSubmittal.timestamp, isRealtime)) {
        if (!cachedSubmittal) setLoading(true);
        const res = await fetchSubmittalData();
        if (res) {
          setSubmittalData(res);
          setCache('submittal', res);
          setError(false);
        } else if (!cachedSubmittal) {
          setError(true);
        }
        setLoading(false);
      }
    }

    if (tab === Tab.MONITORING) {
      const cachedMonitoring = getCache('monitoring');
      const isRealtime = isSectionRealtime('monitoring');
      
      if (cachedMonitoring) {
        setMonitoringData(cachedMonitoring.data);
      }

      if (!cachedMonitoring || isCacheStale(cachedMonitoring.timestamp, isRealtime)) {
        if (!cachedMonitoring) setLoading(true);
        const res = await fetchMonitoringData();
        if (res) {
          setMonitoringData(res);
          setCache('monitoring', res);
          setError(false);
        } else if (!cachedMonitoring) {
          setError(true);
        }
        setLoading(false);
      }
    }
  }, [isSectionRealtime]);

  const refreshMonitoringNow = useCallback(async () => {
    const res = await fetchMonitoringData();
    if (res) {
      setMonitoringData(res);
      setCache('monitoring', res);
      setError(false);
    }
  }, []);

  const refreshPaymentDataNow = useCallback(async () => {
    const res = await fetchDashboardData();
    if (res) {
      setSheetData(res);
      setCache('sheets', res);
      setError(false);
    }
  }, []);

  // Effect: Load data whenever active tab changes
  useEffect(() => {
    if (isGlobalAuthenticated) {
      loadDataForTab(activeTab);
    }
  }, [activeTab, loadDataForTab, isGlobalAuthenticated]);

  // Effect: Real-time polling & live config listener for Monitoring, Dashboard, and Payment
  useEffect(() => {
    if (!isGlobalAuthenticated) return;

    const handleConfigChange = () => {
      refreshMonitoringNow();
    };
    window.addEventListener(MONITORING_CONFIG_EVENT, handleConfigChange);

    let unsubscribeSnapshot: (() => void) | undefined;
    try {
      if (db) {
        unsubscribeSnapshot = onSnapshot(doc(db, 'c10', 'monitoring_config'), () => {
          refreshMonitoringNow();
        }, () => {});
      }
    } catch {}

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (activeTab === Tab.MONITORING) {
      intervalId = setInterval(() => {
        refreshMonitoringNow();
      }, 15000);
    } else if (activeTab === Tab.DASHBOARD || activeTab === Tab.PAYMENT) {
      intervalId = setInterval(() => {
        refreshPaymentDataNow();
      }, 15000);
    }

    return () => {
      window.removeEventListener(MONITORING_CONFIG_EVENT, handleConfigChange);
      if (unsubscribeSnapshot) unsubscribeSnapshot();
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, isGlobalAuthenticated, refreshMonitoringNow, refreshPaymentDataNow]);

  const renderContent = () => {
    const isAuth = isLayer2Authenticated || localStorage.getItem('layer2-auth') === 'true' || localStorage.getItem('c10_admin_unlocked') === 'true';
    if (ENABLE_PASSWORD_PROTECTION && PROTECTED_TABS.includes(activeTab) && !isAuth) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <div className="bg-amber-100 p-4 rounded-2xl text-amber-600 mb-4 shadow-sm border border-amber-200">
            <Lock className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Trang bị khóa bảo mật</h2>
          <p className="text-sm text-slate-500 max-w-md mb-6">
            Tab này yêu cầu mật khẩu lớp 2 để truy cập. Vui lòng nhập mật khẩu để mở khóa.
          </p>
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Nhập mật khẩu mở khóa
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case Tab.GENERAL:
        return <GeneralInfo language={language} isAdmin={isLayer2Authenticated} />;
      case Tab.DASHBOARD:
        return (
            <Dashboard 
                sheetData={sheetData}
                submittalData={submittalData}
                monitoringData={monitoringData}
                loading={loading}
                error={error}
                language={language}
                onRefresh={refreshPaymentDataNow}
            />
        );
      case Tab.MONITORING:
        return (
          <Monitoring 
            data={monitoringData} 
            loading={loading} 
            error={error} 
            language={language}
            onRefresh={refreshMonitoringNow}
            isAdmin={isLayer2Authenticated}
          />
        );
      case Tab.FOCUS_POINTS:
        return <FocusPoints language={language} />;
      case Tab.SCHEDULE:
        return (
          <Schedule 
            data={sheetData?.schedule || null} 
            loading={loading} 
            error={error} 
            language={language}
            onProtectedAction={handleProtectedLink}
          />
        );
      case Tab.DAILY_REPORT:
        return (
          <DailyReport 
            data={sheetData?.schedule || null} 
            equipment={sheetData?.equipment || null}
            dailyTab={sheetData?.dailyTab || null}
            loading={loading} 
            error={error} 
            language={language}
          />
        );
      case Tab.INSPECTION:
        return <Inspection language={language} onProtectedAction={handleProtectedLink} />;
      case Tab.PAYMENT:
        return (
          <Payment 
            sheetData={sheetData}
            loading={loading}
            error={error}
            language={language}
            onProtectedAction={handleProtectedLink}
            onRefresh={refreshPaymentDataNow}
          />
        );
      case Tab.SUBMITTAL:
        return (
          <Submittal 
            data={submittalData} 
            loading={loading} 
            error={error} 
            language={language}
            onProtectedAction={handleProtectedLink}
          />
        );
      case Tab.ISSUES:
        return (
          <IssuesList 
            data={sheetData} 
            language={language}
            onProtectedAction={handleProtectedLink}
          />
        );
      case Tab.PROCUREMENT:
        return (
          <ProcurementPlan 
            language={language}
            onProtectedAction={handleProtectedLink}
            isAdmin={isLayer2Authenticated}
          />
        );
      case Tab.MODEL_HOUSE:
        return (
          <ModelHouse 
            data={sheetData?.modelHouse || []} 
            loading={loading} 
            error={error} 
            language={language}
          />
        );
      case Tab.SITE_PHOTOS:
        return <SitePhotos language={language} />;
      case Tab.ADMIN:
        if (!isLayer2Authenticated) {
          return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="bg-amber-100 p-4 rounded-2xl text-amber-600 mb-4 shadow-sm border border-amber-200">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">
                {language === 'VN' ? 'Khu Vực Quản Trị Hệ Thống C10' : 'C10 Admin System'}
              </h2>
              <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
                {language === 'VN'
                  ? 'Trang này chỉ dành cho Quản trị viên đã đăng nhập tài khoản Google Admin. Người xem thông thường không có quyền truy cập.'
                  : 'Restricted area. Please sign in as an authorized Google Admin to access.'}
              </p>
              <button
                onClick={() => setIsPasswordModalOpen(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center gap-2"
              >
                <Key className="w-4 h-4" />
                {language === 'VN' ? 'Đăng nhập Quản trị viên' : 'Sign in as Admin'}
              </button>
            </div>
          );
        }
        return (
          <AdminPanel
            language={language}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onLogoutAdmin={() => {
              localStorage.setItem('c10_guest_mode', 'true');
              localStorage.removeItem('layer2-auth');
              localStorage.removeItem('c10_admin_unlocked');
              localStorage.removeItem('is_admin');
              localStorage.removeItem('c10_user_email');
              localStorage.removeItem('c10_user_role');
              setIsLayer2Authenticated(false);
              setActiveTab(Tab.DASHBOARD);
              window.dispatchEvent(new Event('c10-auth-changed'));
            }}
            onRefreshAllData={handleRefreshAllData}
            isRefreshingData={isRefreshingAllData}
            syncSettings={syncSettings}
            onUpdateSyncSettings={handleUpdateSyncSettings}
          />
        );
      default:
        return <Dashboard sheetData={sheetData} loading={loading} error={error} language={language} />;
    }
  };

  const handleGlobalPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = data.get('password') as string;
    
    if (password === '456321') {
      localStorage.setItem('app-auth', 'true');
      setGlobalPasswordError(false);
      setIsGlobalAuthenticated(true);
    } else {
      setGlobalPasswordError(true);
    }
  };

  if (!isGlobalAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-900">
        {/* Blurred Background Image from General Info */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat filter blur-[6px] scale-105 opacity-70"
          style={{ backgroundImage: `url(${RENDER_URL})` }}
        />
        {/* Dark overlay gradient for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/50 to-slate-950/80 backdrop-blur-[2px]" />

        <form onSubmit={handleGlobalPasswordSubmit} className="relative z-10 bg-white/90 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/40 w-full max-w-sm animate-scale-in">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="bg-blue-600/10 p-3.5 rounded-2xl text-blue-600 border border-blue-500/20 shadow-inner">
               <Lock className="w-8 h-8" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">{PROJECT_NAME[language] || 'Dự Án C10'}</h2>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mt-0.5">{PROJECT_SUBTITLE[language]}</p>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mt-1">Hệ thống Quản lý Dự án</p>
            </div>
            <p className="text-sm text-slate-500 text-center leading-relaxed">Vui lòng nhập mã bảo mật để xem thông tin dự án.</p>
          </div>
          <input 
             type="password"
             name="password"
             onChange={() => setGlobalPasswordError(false)}
             className={`w-full px-4 py-3.5 border rounded-xl mb-3 text-center tracking-[0.5em] font-mono text-lg focus:ring-2 focus:outline-none bg-white/80 shadow-inner transition-all ${
               globalPasswordError ? 'border-rose-400 focus:ring-rose-500 animate-shake' : 'border-slate-200/80 focus:ring-blue-500 focus:border-blue-500'
             }`}
             placeholder="••••••"
             required
             autoFocus
          />
          {globalPasswordError && (
            <p className="text-xs text-rose-600 font-bold text-center mb-3">{t('incorrect_password')}</p>
          )}
          <button type="submit" className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
             <span>Xác nhận</span>
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-800 text-white z-40 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
             <button onClick={() => setIsSidebarOpen(true)} className="p-1">
                <Menu className="w-6 h-6" />
             </button>
             <div className="flex flex-col">
               <span className="font-bold text-sm leading-tight truncate">{PROJECT_NAME[language]}</span>
               <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                 {PROJECT_SUBTITLE[language]}
               </span>
             </div>
        </div>
      </div>

      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false); 
        }} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        language={language}
        setLanguage={setLanguage}
        isLayer2Authenticated={isLayer2Authenticated}
        setIsLayer2Authenticated={setIsLayer2Authenticated}
      />

      {/* Main Content */}
      <main className={`flex-1 min-w-0 transition-all duration-300 pt-14 md:pt-0 w-full md:ml-64`}>
        {renderContent()}
      </main>

      <PasswordProtection 
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handlePasswordSuccess}
        language={language}
      />
    </div>
  );
};

export default App;
