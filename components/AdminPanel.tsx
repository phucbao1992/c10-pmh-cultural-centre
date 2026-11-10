import React, { useState, useEffect, useMemo } from 'react';
import { 
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
  Filter
} from 'lucide-react';
import { Tab, Language } from '../types';
import { GOOGLE_SHEET_ID, SITE_IMAGES_FOLDER_ID, PROJECT_NAME } from '../constants';
import { ADMIN_EMAIL } from '../services/firebase';
import { extractSheetId, saveMonitoringSourceConfig } from '../services/sheetsService';
import { extractDriveFolderId as extractDriveFolderIdFromUrl } from '../services/utils';

interface AdminPanelProps {
  language: Language;
  onNavigateTab: (tab: Tab) => void;
  onLogoutAdmin: () => void;
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

export const AdminPanel: React.FC<AdminPanelProps> = ({ language, onNavigateTab, onLogoutAdmin }) => {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'sheet' | 'drive' | 'api'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

    // 9. Defects & NCR Sheet
    const defectsOverride = localStorage.getItem('c10_override_defects_sheet_id');
    const defectsSheetId = defectsOverride ? extractSheetId(defectsOverride) : '1yPaZhqlwRk0RQje_Ferb17XdpheR2nPEcbWlYuQVdWI';
    const defectsSheetUrl = `https://docs.google.com/spreadsheets/d/${defectsSheetId}/edit?gid=0#gid=0`;

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
          { name: 'Tiến độ phần hầm & S-Curve', tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
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
        id: 'defects_sheet',
        name: language === 'VN' ? 'Google Sheet Lỗi Tồn Đọng & NCR (Defects Sheet)' : 'Defects & NCR Tracking Google Sheet',
        category: 'sheet',
        categoryLabel: 'Google Sheet',
        storageKey: 'c10_override_defects_sheet_id',
        defaultUrl: 'https://docs.google.com/spreadsheets/d/1yPaZhqlwRk0RQje_Ferb17XdpheR2nPEcbWlYuQVdWI/edit?gid=0#gid=0',
        currentDisplayUrl: defectsSheetUrl,
        openUrl: defectsSheetUrl,
        targetModules: [
          { name: 'Defects (Lỗi & NCR)', tagColor: 'bg-rose-100 text-rose-800 border-rose-200' },
          { name: 'Biểu đồ Defects tồn đọng (Dashboard)', tagColor: 'bg-amber-100 text-amber-800 border-amber-200' }
        ],
        description: language === 'VN'
          ? 'Cung cấp danh sách lỗi hiện trường, mức độ ưu tiên (Level 2/3), đơn vị xử lý và số ngày tồn đọng cho tab Vấn đề tồn đọng & thẻ KPI trên Dashboard.'
          : 'Feeds site defect items, priority levels, assignees, and aging metrics for the Issues tab and Dashboard.',
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

export default AdminPanel;
