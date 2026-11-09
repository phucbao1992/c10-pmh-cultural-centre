import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText, RefreshCw, CloudSun, Calendar, CheckCircle2, Sparkles,
  Printer, Save, FolderOpen, Edit3, ShieldCheck, CloudUpload,
  Database, ExternalLink, X, Copy, Check, Code2, Send, AlertCircle, HelpCircle,
  History, Users, Lock, CloudCheck, Plus, Trash2, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { ScheduleData, EquipmentData, DailyTabData } from '../services/sheetsService';
import { db } from '../services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  DailyReportModel,
  GeminiSummaryData,
  STORAGE_KEY_PUBLISHED,
  STORAGE_KEY_DRAFT,
  DEFAULT_FILE_SUFFIX,
  DEFAULT_DRIVE_FOLDER_URL,
  DEFAULT_GOOGLE_SHEET_URL,
  sanitizeC10SheetUrl,
  saveDailyReportCloudConfigLocal,
  todayISO,
  formatVNDate,
  buildFixedReportPrefix,
  buildFullReportFileName,
  labelRows,
  createDefaultReport,
  buildFallbackSummary,
  buildSheetSyncRows,
  buildWebhookPayloadForAppsScript,
  generateC10GoogleAppsScriptCode,
  DailyReportHistoryEntry,
  DailyReportPermissions,
  syncDailyReportToFirestore,
  subscribeDailyReportFromFirestore,
  fetchDailyReportHistoryIndex,
  fetchDailyReportByDateKey,
  loadDailyReportPermissions,
  saveDailyReportPermissions,
  canUserEditDailyReport,
  DAILY_REPORT_DOC_PUBLISHED,
  mergeWithPermanentLogos,
  saveReportLogosLocal,
  subscribeReportLogosFromFirestore,
  DAILY_REPORT_LOGOS_EVENT
} from '../services/dailyReportService';
import DailyReportEditor from './DailyReportEditor';
import DailyReportPrintSheet from './DailyReportPrintSheet';
import { checkUserTabPermission } from '../services/userPermissionsService';

interface DailyReportProps {
  data: ScheduleData | null;
  equipment: EquipmentData | null;
  dailyTab?: DailyTabData | null;
  loading: boolean;
  error: boolean;
  language: Language;
}

const DailyReport: React.FC<DailyReportProps> = ({ data, dailyTab, loading, language }) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;

  // Load published report or initialize (auto-strip legacy CN82 Sheet link)
  const [publishedReport, setPublishedReport] = useState<DailyReportModel>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PUBLISHED);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.g) {
          const def = createDefaultReport();
          const mergedCloud = {
            ...def.cloud,
            ...(parsed.cloud || {}),
            sheetUrl: sanitizeC10SheetUrl(parsed.cloud?.sheetUrl ?? def.cloud.sheetUrl)
          };
          const mergedLogos = saveReportLogosLocal(parsed.logos || {});
          return {
            ...def,
            ...parsed,
            logos: mergedLogos,
            cloud: mergedCloud,
            fileSuffix: parsed.fileSuffix || DEFAULT_FILE_SUFFIX
          };
        }
      }
    } catch {}
    const def = createDefaultReport();
    def.aiSummary = buildFallbackSummary(def);
    return def;
  });

  // Draft report for editing inside the Form Builder (auto-strip legacy CN82 Sheet link & lock permanent logos)
  const [draftReport, setDraftReport] = useState<DailyReportModel>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAFT);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.g) {
          const def = createDefaultReport();
          const mergedCloud = {
            ...def.cloud,
            ...(parsed.cloud || {}),
            sheetUrl: sanitizeC10SheetUrl(parsed.cloud?.sheetUrl ?? def.cloud.sheetUrl)
          };
          const mergedLogos = saveReportLogosLocal(parsed.logos || {});
          return {
            ...def,
            ...parsed,
            logos: mergedLogos,
            cloud: mergedCloud,
            fileSuffix: parsed.fileSuffix || DEFAULT_FILE_SUFFIX
          };
        }
      }
    } catch {}
    return createInheritedDraftFromPublished(publishedReport);
  });

  // Editable suffix state (always defaults to "Delta-Báo cáo ngày")
  const [customSuffix, setCustomSuffix] = useState<string>(
    publishedReport.fileSuffix || DEFAULT_FILE_SUFFIX
  );
  // Cho phép người dùng chỉnh sửa tự do toàn bộ tên file xuất (gồm cả ngày tháng và tên)
  const [customFullFileName, setCustomFullFileName] = useState<string>('');

  // Mode: 'view' (8 synchronized web sections) vs 'edit' (Form Builder I-VII)
  const [isEditingReport, setIsEditingReport] = useState<boolean>(false);
  const [activeWebSection, setActiveWebSection] = useState<string>('all');
  const [isGeneratingAI, setIsGeneratingAI] = useState<boolean>(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Drive, C10 Sheet & Apps Script Webhook Modal State
  const [driveModalMode, setDriveModalMode] = useState<null | 'save-drive' | 'archive-sheet'>(null);
  const [driveFolderInput, setDriveFolderInput] = useState<string>(
    publishedReport.cloud?.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL
  );
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(
    sanitizeC10SheetUrl(publishedReport.cloud?.sheetUrl) || DEFAULT_GOOGLE_SHEET_URL
  );
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState<string>(
    publishedReport.cloud?.appsScriptUrl || ''
  );
  const [copiedTsv, setCopiedTsv] = useState<boolean>(false);
  const [copiedAppsScript, setCopiedAppsScript] = useState<boolean>(false);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState<boolean>(false);
  const [isSyncingWebhook, setIsSyncingWebhook] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportedPdfModal, setExportedPdfModal] = useState<{
    url: string;
    name: string;
    pageCount: number;
  } | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    pdfUrl?: string;
  } | null>(null);

  // Cloud Sync, History & Permission State
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<DailyReportHistoryEntry[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState<boolean>(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const computeCanEdit = () => {
    // Nếu Admin đang bật chế độ xem thử giao diện Người xem:
    if (localStorage.getItem('c10_preview_as_viewer') === 'true') {
      return false;
    }
    const isAdmin = 
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true';
    if (isAdmin) return true;
    const email = (localStorage.getItem('c10_user_email') || '').trim().toLowerCase();
    if (!email) return false;
    return checkUserTabPermission(email, 'dailyReport') || canUserEditDailyReport(email);
  };

  const [canEdit, setCanEdit] = useState<boolean>(computeCanEdit);
  const [showPermissionsModal, setShowPermissionsModal] = useState<boolean>(false);
  const [permissionsState, setPermissionsState] = useState<DailyReportPermissions>({
    authorizedEmails: ['phucbao1992@gmail.com'],
    allowAllEditors: false
  });
  const [newEmailInput, setNewEmailInput] = useState<string>('');

  // Sync canEdit on auth / permissions events
  useEffect(() => {
    const handleAuthChange = () => {
      setCanEdit(computeCanEdit());
    };
    window.addEventListener('c10-auth-changed', handleAuthChange);
    window.addEventListener('c10-user-permissions-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('c10-auth-changed', handleAuthChange);
      window.removeEventListener('c10-user-permissions-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, []);

  // Check if current device is authenticated as Admin
  const isCurrentAdmin = useMemo(() => {
    return (
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true'
    );
  }, []);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  };

  // 1. Realtime Firestore synchronization for project-wide real-time update
  useEffect(() => {
    const unsub = subscribeDailyReportFromFirestore((remoteReport) => {
      setPublishedReport((prev) => {
        // If user is currently inspecting a historical report, don't overwrite view
        if (selectedHistoryDate && selectedHistoryDate !== remoteReport.g?.reportDate) {
          return prev;
        }
        try {
          localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(remoteReport));
        } catch {}
        return remoteReport;
      });
      setIsCloudSynced(true);
    });

    // 2. Realtime Permanent Logo Vault synchronization (c10/report_logos_vault)
    const unsubLogos = subscribeReportLogosFromFirestore((cloudLogos) => {
      setPublishedReport((prev) => {
        const updatedLogos = mergeWithPermanentLogos({ ...prev.logos, ...cloudLogos });
        if (
          updatedLogos.tvgs === prev.logos?.tvgs &&
          updatedLogos.cdt === prev.logos?.cdt &&
          updatedLogos.nt === prev.logos?.nt
        ) {
          return prev;
        }
        const next = { ...prev, logos: updatedLogos };
        try {
          localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(next));
        } catch {}
        return next;
      });
      setDraftReport((prev) => {
        const updatedLogos = mergeWithPermanentLogos({ ...prev.logos, ...cloudLogos });
        if (
          updatedLogos.tvgs === prev.logos?.tvgs &&
          updatedLogos.cdt === prev.logos?.cdt &&
          updatedLogos.nt === prev.logos?.nt
        ) {
          return prev;
        }
        return { ...prev, logos: updatedLogos };
      });
    });

    const handleLogosUpdatedEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setPublishedReport((prev) => {
        const next = { ...prev, logos: detail };
        try {
          localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(next));
        } catch {}
        return next;
      });
    };
    window.addEventListener(DAILY_REPORT_LOGOS_EVENT, handleLogosUpdatedEvent);

    // 3. Load historical reports index
    fetchDailyReportHistoryIndex().then((list) => {
      if (list && Array.isArray(list)) setHistoryList(list);
    });

    // 4. Load permissions
    loadDailyReportPermissions().then((perms) => {
      setPermissionsState(perms);
      setCanEdit(computeCanEdit());
    });

    return () => {
      unsub();
      unsubLogos();
      window.removeEventListener(DAILY_REPORT_LOGOS_EVENT, handleLogosUpdatedEvent);
    };
  }, [selectedHistoryDate]);

  // Keep fileSuffix synced into draft/published report
  useEffect(() => {
    setDraftReport((prev) => ({ ...prev, fileSuffix: customSuffix }));
    setPublishedReport((prev) => ({ ...prev, fileSuffix: customSuffix }));
  }, [customSuffix]);

  // Auto-save draft changes to localStorage
  useEffect(() => {
    try {
      const liteDraft = {
        ...draftReport,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(liteDraft));
    } catch {}
  }, [draftReport]);

  const activeReport = isEditingReport ? draftReport : publishedReport;
  const fixedPrefix = useMemo(() => buildFixedReportPrefix(activeReport.g.reportDate), [activeReport.g.reportDate]);
  const defaultCalculatedFileName = useMemo(
    () => buildFullReportFileName(activeReport.g.reportDate, customSuffix),
    [activeReport.g.reportDate, customSuffix]
  );
  const fullReportFileName = useMemo(
    () => (customFullFileName && customFullFileName.trim()) ? customFullFileName.trim() : defaultCalculatedFileName,
    [customFullFileName, defaultCalculatedFileName]
  );

  // Trigger Gemini Flash Summary for a given report
  const generateGeminiSummary = async (reportToAnalyze: DailyReportModel, updateBoth: boolean = true) => {
    setIsGeneratingAI(true);
    try {
      const compactPayload = {
        general: reportToAnalyze.g,
        weather: reportToAnalyze.weather,
        safety: reportToAnalyze.safety,
        manpower: reportToAnalyze.man,
        machinery: reportToAnalyze.mach,
        materials: reportToAnalyze.mat,
        works: reportToAnalyze.work,
        inspections: reportToAnalyze.insp
      };

      const res = await fetch('/api/gemini/summarize-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData: compactPayload })
      });
      const json = await res.json();
      if (res.ok && json?.summary) {
        const newSummary: GeminiSummaryData = {
          ...json.summary,
          generatedAt: new Date().toISOString()
        };
        const updated = { ...reportToAnalyze, aiSummary: newSummary };
        setPublishedReport(updated);
        if (updateBoth) setDraftReport(updated);
        try {
          localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(updated));
        } catch {}
        showToast('Đã đồng bộ & tổng hợp đánh giá chung bằng Gemini Flash!');
        return;
      }
      throw new Error(json?.error || 'Fallback to local summary');
    } catch {
      const fallback = buildFallbackSummary(reportToAnalyze);
      const updated = { ...reportToAnalyze, aiSummary: fallback };
      setPublishedReport(updated);
      if (updateBoth) setDraftReport(updated);
      try {
        localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(updated));
      } catch {}
      showToast('Đã xuất và đồng bộ toàn bộ 8 mục báo cáo ngày!');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Publish report from editor -> Web View (8 sections) + Cloud Firestore Sync + trigger Gemini Flash
  const handlePublishReport = async () => {
    if (!canUserEditDailyReport()) {
      showToast('Bạn đang ở quyền Người xem. Chỉ Admin hoặc người được cấp quyền mới có thể xuất báo cáo.');
      return;
    }

    const nextReport: DailyReportModel = {
      ...draftReport,
      fileSuffix: customSuffix || DEFAULT_FILE_SUFFIX,
      aiSummary: draftReport.aiSummary || buildFallbackSummary(draftReport),
      savedAt: new Date().toISOString()
    };
    setPublishedReport(nextReport);
    try {
      localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(nextReport));
    } catch {}
    setIsEditingReport(false);
    setSelectedHistoryDate(null);

    // Đồng bộ tức thời lên Cloud Firestore cho mọi thiết bị
    showToast('Đang đồng bộ 8 mục báo cáo ngày lên Cloud...');
    const syncOk = await syncDailyReportToFirestore(nextReport);
    if (syncOk) {
      setIsCloudSynced(true);
      showToast('Đã xuất và đồng bộ thành công toàn bộ 8 mục lên Cloud cho mọi thiết bị!');
      fetchDailyReportHistoryIndex().then((list) => {
        if (list && Array.isArray(list)) setHistoryList(list);
      });
    } else {
      showToast('Đã lưu nội bộ (đang thử kết nối Cloud ở chế độ nền)');
    }

    await generateGeminiSummary(nextReport, true);
  };

  const handleSelectHistoryReport = async (entry: DailyReportHistoryEntry) => {
    setShowHistoryDropdown(false);
    showToast(`Đang tải báo cáo ngày ${formatVNDate(entry.date)}...`);
    const hist = await fetchDailyReportByDateKey(entry.dateKey);
    if (hist) {
      setSelectedHistoryDate(entry.date);
      setPublishedReport(hist);
      setCustomSuffix(hist.fileSuffix || DEFAULT_FILE_SUFFIX);
      showToast(`Đang xem báo cáo ngày ${formatVNDate(entry.date)}`);
    } else {
      showToast('Không tải được bản ghi lịch sử ngày này!');
    }
  };

  const handleReturnToLatestReport = async () => {
    setSelectedHistoryDate(null);
    showToast('Đang quay lại báo cáo ngày mới nhất...');
    try {
      const snap = await getDoc(doc(db, 'c10', DAILY_REPORT_DOC_PUBLISHED));
      if (snap.exists()) {
        const data = snap.data() as DailyReportModel;
        if (data && data.g) {
          const def = createDefaultReport();
          const full: DailyReportModel = {
            ...def,
            ...data,
            fileSuffix: data.fileSuffix || DEFAULT_FILE_SUFFIX
          };
          setPublishedReport(full);
          showToast('Đã trở về báo cáo mới nhất!');
          return;
        }
      }
    } catch {}
    const saved = localStorage.getItem(STORAGE_KEY_PUBLISHED);
    if (saved) {
      try {
        setPublishedReport(JSON.parse(saved));
      } catch {}
    }
  };

  const handleAddAuthorizedEmail = async () => {
    const email = newEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Email không hợp lệ. Vui lòng kiểm tra lại!');
      return;
    }
    if (permissionsState.authorizedEmails.includes(email)) {
      showToast('Email này đã có trong danh sách phân quyền!');
      return;
    }
    const nextPerms: DailyReportPermissions = {
      ...permissionsState,
      authorizedEmails: [...permissionsState.authorizedEmails, email]
    };
    setPermissionsState(nextPerms);
    setNewEmailInput('');
    await saveDailyReportPermissions(nextPerms);
    setCanEdit(canUserEditDailyReport());
    showToast(`Đã cấp quyền lập báo cáo cho: ${email}`);
  };

  const handleRemoveAuthorizedEmail = async (emailToRemove: string) => {
    if (emailToRemove === 'phucbao1992@gmail.com') {
      showToast('Không thể xoá tài khoản Admin chính!');
      return;
    }
    const nextPerms: DailyReportPermissions = {
      ...permissionsState,
      authorizedEmails: permissionsState.authorizedEmails.filter((e) => e !== emailToRemove)
    };
    setPermissionsState(nextPerms);
    await saveDailyReportPermissions(nextPerms);
    setCanEdit(canUserEditDailyReport());
    showToast(`Đã thu hồi quyền của: ${emailToRemove}`);
  };

  const handleToggleAllowAll = async (allow: boolean) => {
    const nextPerms: DailyReportPermissions = {
      ...permissionsState,
      allowAllEditors: allow
    };
    setPermissionsState(nextPerms);
    await saveDailyReportPermissions(nextPerms);
    setCanEdit(canUserEditDailyReport());
    showToast(allow ? 'Đã cho phép mọi người dùng chỉnh sửa!' : 'Đã giới hạn chỉ Admin & người được cấp quyền!');
  };

  // Xuất & tải trực tiếp file PDF chuẩn khổ A4 (hoạt động ngay cả trong khung iframe sandbox của AI Studio nơi window.print() bị chặn)
  const triggerPrintWithFileName = async (fileNameToUse: string) => {
    const sheetEl = document.getElementById('c10-printable-a4-sheet');
    if (!sheetEl) {
      showToast('Không tìm thấy khung mẫu báo cáo A4 để xuất PDF!');
      return;
    }

    setIsExportingPdf(true);
    showToast(`Đang kết xuất file ${fileNameToUse}.pdf chuẩn A4...`);

    const loadScriptOnce = (src: string, checkFn: () => boolean): Promise<void> => {
      if (checkFn()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    try {
      // Nạp trực tiếp html2canvas và jsPDF độc lập để đảm bảo 100% có sẵn constructor chuẩn trên window
      await Promise.all([
        loadScriptOnce(
          'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
          () => typeof (window as any).html2canvas === 'function'
        ),
        loadScriptOnce(
          'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
          () => Boolean((window as any).jspdf?.jsPDF || (window as any).jsPDF)
        )
      ]);

      const pageElements = Array.from(document.querySelectorAll<HTMLElement>('.c10-a4-page'));
      const jsPDFConstructor = (window as any).jspdf?.jsPDF || (window as any).jsPDF;

      if (jsPDFConstructor && typeof (window as any).html2canvas === 'function' && pageElements.length > 0) {
        // Chờ toàn bộ font chữ và hình ảnh trong khung A4 tải xong hoàn toàn trước khi chụp
        if ((document as any).fonts?.ready) {
          try {
            await (document as any).fonts.ready;
          } catch {}
        }
        const allSheetImgs = Array.from(sheetEl.querySelectorAll<HTMLImageElement>('img'));
        await Promise.all(
          allSheetImgs.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (!img.src || img.complete) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
          )
        );

        const firstIsLandscape = pageElements[0].classList.contains('c10-a4-sheet-landscape');
        const pdf = new jsPDFConstructor({
          orientation: firstIsLandscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true
        });

        // Tạo render wrapper đặt tại tọa độ tuyệt đối (0,0) của document.body để không bị ảnh hưởng bởi Sidebar hay cuộn trang
        const renderWrapper = document.createElement('div');
        renderWrapper.id = 'c10-pdf-render-wrapper';
        renderWrapper.style.position = 'absolute';
        renderWrapper.style.top = '0px';
        renderWrapper.style.left = '0px';
        renderWrapper.style.zIndex = '-9999';
        renderWrapper.style.opacity = '1';
        renderWrapper.style.pointerEvents = 'none';
        renderWrapper.style.background = '#ffffff';
        renderWrapper.style.margin = '0';
        renderWrapper.style.padding = '0';
        renderWrapper.style.boxSizing = 'border-box';
        document.body.appendChild(renderWrapper);

        // Đảm bảo img có display: inline-block để html2canvas đo chính xác FontMetrics baseline (không làm lệch chữ)
        const globalTailwindFix = document.createElement('style');
        globalTailwindFix.id = 'c10-h2c-tailwind-fix';
        globalTailwindFix.textContent = `
          img { display: inline-block !important; }
          #c10-pdf-render-wrapper, #c10-pdf-render-wrapper * {
            -webkit-font-smoothing: antialiased;
            letter-spacing: normal !important;
          }
        `;
        document.head.appendChild(globalTailwindFix);

        try {
          for (let i = 0; i < pageElements.length; i++) {
            const pageEl = pageElements[i];
            const isLandscape = pageEl.classList.contains('c10-a4-sheet-landscape');

            const clone = pageEl.cloneNode(true) as HTMLElement;
            clone.style.margin = '0';
            clone.style.boxShadow = 'none';
            clone.style.boxSizing = 'border-box';
            clone.style.display = 'flex';
            clone.style.flexDirection = 'column';
            clone.style.justifyContent = 'space-between';
            clone.style.padding = '34px 42px 34px 42px';
            clone.style.background = '#ffffff';

            const targetWidth = isLandscape ? 1123 : 794;
            const targetHeight = isLandscape ? 794 : 1123;
            clone.style.width = `${targetWidth}px`;
            clone.style.minHeight = `${targetHeight}px`;
            clone.style.height = 'auto';
            clone.style.overflow = 'visible';

            // Đảm bảo toàn bộ ô bảng giữ căn giữa tự nhiên
            clone.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
              cell.style.verticalAlign = 'middle';
            });

            // Giữ tỷ lệ chuẩn cho ảnh thi công
            const origImgs = pageEl.querySelectorAll<HTMLImageElement>('.c10-photo-frame img, img');
            const cloneImgs = clone.querySelectorAll<HTMLImageElement>('.c10-photo-frame img, img');

            origImgs.forEach((origImg, imgIdx) => {
              const cloneImg = cloneImgs[imgIdx];
              if (!cloneImg) return;

              if (origImg.naturalWidth && origImg.naturalHeight) {
                const parent = origImg.parentElement;
                if (parent) {
                  const parentRect = parent.getBoundingClientRect();
                  const maxW = parentRect.width > 20 ? parentRect.width - 12 : 490;
                  const maxH = parentRect.height > 20 ? parentRect.height - 12 : 260;
                  const aspect = origImg.naturalWidth / origImg.naturalHeight;

                  let w = maxW;
                  let h = w / aspect;
                  if (h > maxH) {
                    h = maxH;
                    w = h * aspect;
                  }

                  cloneImg.style.width = `${Math.round(w)}px`;
                  cloneImg.style.height = `${Math.round(h)}px`;
                  cloneImg.style.maxWidth = 'none';
                  cloneImg.style.maxHeight = 'none';
                  cloneImg.style.objectFit = 'contain';
                  cloneImg.style.display = 'block';
                  cloneImg.style.margin = '0 auto';
                }
              }
            });

            renderWrapper.style.width = `${targetWidth}px`;
            renderWrapper.style.height = 'auto';
            renderWrapper.innerHTML = '';
            renderWrapper.appendChild(clone);

            const actualHeight = Math.max(targetHeight, clone.scrollHeight, clone.offsetHeight);
            clone.style.height = `${actualHeight}px`;
            renderWrapper.style.height = `${actualHeight}px`;

            const canvas = await (window as any).html2canvas(clone, {
              scale: 2,
              useCORS: true,
              allowTaint: true,
              logging: false,
              backgroundColor: '#ffffff',
              x: 0,
              y: 0,
              scrollX: 0,
              scrollY: 0,
              width: targetWidth,
              height: actualHeight,
              windowWidth: targetWidth,
              windowHeight: actualHeight,
              onclone: (doc: Document) => {
                const st = doc.createElement('style');
                st.textContent = 'img { display: inline-block !important; }';
                doc.head.appendChild(st);
              }
            });

            if (i > 0) {
              pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.96);
            const pageW = isLandscape ? 297 : 210;
            const pageH = isLandscape ? 210 : 297;

            // Tự động co giãn tỷ lệ vừa khít 100% trong trang A4 nếu chiều cao thực tế lớn hơn 1123px (không bao giờ tràn sang trang trắng thứ 2)
            const imgRatio = canvas.width / canvas.height;
            const pageRatio = pageW / pageH;
            let drawW = pageW;
            let drawH = pageH;
            let offsetX = 0;
            let offsetY = 0;

            if (actualHeight > targetHeight + 6) {
              if (imgRatio < pageRatio) {
                drawH = pageH;
                drawW = drawH * imgRatio;
                offsetX = (pageW - drawW) / 2;
              } else {
                drawW = pageW;
                drawH = drawW / imgRatio;
              }
            }

            pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
          }

          // 1. Tạo blob chuẩn trực tiếp từ jsPDF
          const blob = pdf.output('blob');
          const blobUrl = URL.createObjectURL(blob);
          const fullPdfName = `${fileNameToUse}.pdf`;

          // 2. Kích hoạt tải xuống trực tiếp bằng anchor tag
          try {
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = fullPdfName;
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
              if (document.body.contains(downloadLink)) document.body.removeChild(downloadLink);
            }, 1000);
          } catch (dlErr) {
            console.warn('Auto download error:', dlErr);
          }

          // 3. Hiển thị popup / modal trực tiếp để người dùng bấm tải hoặc mở xem ngay 100% thành công
          setExportedPdfModal({
            url: blobUrl,
            name: fullPdfName,
            pageCount: pageElements.length
          });

          showToast(`Đã xuất thành công: ${fullPdfName} (${pageElements.length} trang chuẩn A4)`);
          return;
        } finally {
          if (document.body.contains(renderWrapper)) {
            document.body.removeChild(renderWrapper);
          }
          if (document.head.contains(globalTailwindFix)) {
            document.head.removeChild(globalTailwindFix);
          }
        }
      }
    } catch (err) {
      console.error('Direct PDF export error:', err);
      showToast('Có lỗi khi kết xuất PDF. Vui lòng thử lại!');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // 1. In PDF
  const handlePrintPDF = () => {
    triggerPrintWithFileName(fullReportFileName);
  };

  // Gửi dữ liệu tới cổng Webhook Google Apps Script (1 nút bấm: Lưu PDF vào Drive + Tự động điền số lượng lên Google Sheet C10)
  const executeAppsScriptWebhook = async (
    reportToSync: DailyReportModel,
    mode: 'save-drive' | 'archive-sheet',
    overrideWebhookUrl?: string
  ) => {
    const targetWebhookUrl = (overrideWebhookUrl ?? appsScriptUrlInput ?? reportToSync.cloud?.appsScriptUrl ?? '').trim();
    if (!targetWebhookUrl) {
      setWebhookStatus({
        type: 'info',
        message: 'Chưa gắn Link Webhook Google Apps Script. Bạn có thể bấm nút "Lấy mã Apps Script tự động (1 nút bấm)" bên dưới để cài trong 1 phút, hoặc dùng nút Xuất PDF / Chép bảng Sheet.'
      });
      return false;
    }

    setIsSyncingWebhook(true);
    setWebhookStatus({
      type: 'info',
      message:
        mode === 'save-drive'
          ? `Đang tự động xuất & lưu file ${fullReportFileName}.pdf trực tiếp vào Google Drive C10...`
          : `Đang tự động lưu ${fullReportFileName}.pdf vào Google Drive VÀ điền số lượng báo cáo ngày lên Google Sheet C10...`
    });

    try {
      const sheetEl = document.getElementById('c10-printable-a4-sheet');
      const printableHtmlContent = sheetEl ? sheetEl.innerHTML : '';
      const payload = buildWebhookPayloadForAppsScript(reportToSync, fullReportFileName, printableHtmlContent);
      if (mode === 'save-drive') {
        payload.action = 'c10_save_pdf_only';
      }

      const res = await fetch('/api/daily-report/sync-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: targetWebhookUrl,
          payload
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        const pdfUrl = data?.result?.pdfFileUrl || '';
        setWebhookStatus({
          type: 'success',
          message:
            mode === 'save-drive'
              ? `Đã tự động lưu file ${fullReportFileName}.pdf vào thư mục Google Drive C10 thành công!`
              : `Đã tự động lưu ${fullReportFileName}.pdf vào Drive VÀ cập nhật toàn bộ số lượng báo cáo ngày lên Google Sheet C10!`,
          pdfUrl: pdfUrl && pdfUrl.startsWith('http') ? pdfUrl : undefined
        });
        showToast(
          mode === 'save-drive'
            ? `Đã lưu tự động ${fullReportFileName}.pdf vào Drive!`
            : `Đã lưu PDF vào Drive & cập nhật số lượng lên Google Sheet C10!`
        );
        return true;
      } else {
        throw new Error(data?.error || 'Không thể kết nối tới Google Apps Script Webhook.');
      }
    } catch (err: any) {
      setWebhookStatus({
        type: 'error',
        message: err?.message || 'Lỗi khi gọi Webhook Google Apps Script. Vui lòng kiểm tra lại URL Web App (quyền truy cập: Bất kỳ ai / Anyone).'
      });
      return false;
    } finally {
      setIsSyncingWebhook(false);
    }
  };

  // 2. Lưu vào Drive (xuất file PDF với tên chuẩn + lưu vào Drive)
  const handleOpenSaveToDrive = async () => {
    const target = isEditingReport ? draftReport : publishedReport;
    const cleanSheet = sanitizeC10SheetUrl(sheetUrlInput || target.cloud?.sheetUrl);
    const nextCloud = saveDailyReportCloudConfigLocal({
      driveFolderUrl: driveFolderInput || target.cloud?.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL,
      sheetUrl: cleanSheet,
      appsScriptUrl: appsScriptUrlInput || target.cloud?.appsScriptUrl || ''
    });

    const synced: DailyReportModel = {
      ...target,
      fileSuffix: customSuffix || DEFAULT_FILE_SUFFIX,
      cloud: nextCloud,
      savedAt: new Date().toISOString()
    };
    setPublishedReport(synced);
    setDraftReport(synced);
    try {
      localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(synced));
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(synced));
    } catch {}
    setDriveFolderInput(nextCloud.driveFolderUrl);
    setSheetUrlInput(nextCloud.sheetUrl);
    setAppsScriptUrlInput(nextCloud.appsScriptUrl || '');
    setWebhookStatus(null);
    setDriveModalMode('save-drive');

    if (nextCloud.appsScriptUrl) {
      await executeAppsScriptWebhook(synced, 'save-drive', nextCloud.appsScriptUrl);
    }
  };

  // 3. Drive lưu trữ và tổng hợp (lưu trữ file PDF + tự động điền số lượng báo cáo ngày lên Google Sheet C10 & Firestore)
  const handleOpenDriveArchiveAndSheetSync = async () => {
    const target = isEditingReport ? draftReport : publishedReport;
    const sheetRows = buildSheetSyncRows(target);
    const tsvText = sheetRows.map((row) => row.join('\t')).join('\n');

    // Copy TSV to clipboard automatically so user can also Ctrl+V into Google Sheet if desired
    try {
      await navigator.clipboard.writeText(tsvText);
      setCopiedTsv(true);
      setTimeout(() => setCopiedTsv(false), 4000);
    } catch {}

    const cleanSheet = sanitizeC10SheetUrl(sheetUrlInput || target.cloud?.sheetUrl);
    const nextCloud = saveDailyReportCloudConfigLocal({
      driveFolderUrl: driveFolderInput || target.cloud?.driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL,
      sheetUrl: cleanSheet,
      appsScriptUrl: appsScriptUrlInput || target.cloud?.appsScriptUrl || ''
    });

    // Sync to Firestore 'c10/daily_report_latest' for real-time project-wide access
    try {
      if (db) {
        await setDoc(
          doc(db, 'c10', 'daily_report_latest'),
          {
            reportName: fullReportFileName,
            reportDate: target.g.reportDate,
            contractor: target.g.contractor,
            cloud: nextCloud,
            sheetRows: sheetRows.map((r) => r.join(' | ')),
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      }
    } catch {}

    const synced: DailyReportModel = {
      ...target,
      fileSuffix: customSuffix || DEFAULT_FILE_SUFFIX,
      cloud: nextCloud,
      savedAt: new Date().toISOString()
    };
    setPublishedReport(synced);
    setDraftReport(synced);
    try {
      localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(synced));
      localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(synced));
    } catch {}
    if (isEditingReport) setIsEditingReport(false);

    setDriveFolderInput(nextCloud.driveFolderUrl);
    setSheetUrlInput(nextCloud.sheetUrl);
    setAppsScriptUrlInput(nextCloud.appsScriptUrl || '');
    setWebhookStatus(null);
    setDriveModalMode('archive-sheet');
    generateGeminiSummary(synced, true);

    if (nextCloud.appsScriptUrl) {
      await executeAppsScriptWebhook(synced, 'archive-sheet', nextCloud.appsScriptUrl);
    }
  };

  // Download Excel (.xlsx) formatted for Google Sheet import/update
  const handleDownloadSheetExcel = () => {
    const target = isEditingReport ? draftReport : publishedReport;
    const rows = buildSheetSyncRows(target);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily');
    XLSX.writeFile(wb, `${fullReportFileName}-SheetSync.xlsx`);
    showToast(`Đã tải bảng tổng hợp Excel: ${fullReportFileName}-SheetSync.xlsx`);
  };

  // 4. Lưu bản nháp (.json)
  const handleSaveDraftFile = () => {
    const target = isEditingReport ? draftReport : publishedReport;
    const fn = `${fullReportFileName}.json`;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...target,
            fileSuffix: customSuffix || DEFAULT_FILE_SUFFIX,
            reportName: fullReportFileName,
            app: 'daily-report',
            savedAt: new Date().toISOString()
          },
          null,
          2
        )
      ],
      { type: 'application/json;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fn;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Đã lưu bản nháp: ${fn}`);
  };

  // 5. Mở bản nháp (.json)
  const handleOpenDraftFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !parsed.g) throw new Error('Invalid');
        const def = createDefaultReport();
        const normalized: DailyReportModel = {
          ...def,
          ...parsed,
          cloud: { ...def.cloud, ...(parsed.cloud || {}) },
          fileSuffix: parsed.fileSuffix || DEFAULT_FILE_SUFFIX
        };
        setCustomSuffix(normalized.fileSuffix);
        setDraftReport(normalized);
        setPublishedReport(normalized);
        try {
          localStorage.setItem(STORAGE_KEY_DRAFT, JSON.stringify(normalized));
          localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(normalized));
        } catch {}
        showToast(`Đã mở và đồng bộ báo cáo ngày ${formatVNDate(normalized.g.reportDate)}!`);
        await generateGeminiSummary(normalized, true);
      } catch {
        showToast('File bản nháp không hợp lệ. Vui lòng kiểm tra lại!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Totals from publishedReport for web view
  const totalRegularManpower = useMemo(
    () => publishedReport.man.reduce((s, r) => s + (Number(r.regular) || 0), 0),
    [publishedReport.man]
  );
  const totalOvertimeManpower = useMemo(
    () => publishedReport.man.reduce((s, r) => s + (Number(r.overtime) || 0), 0),
    [publishedReport.man]
  );
  const totalMachinery = useMemo(
    () => publishedReport.mach.reduce((s, r) => s + (Number(r.qty) || 0), 0),
    [publishedReport.mach]
  );

  const weatherBadgeText = useMemo(() => {
    const rainy = publishedReport.weather.find((w) => w.weather.toLowerCase().includes('mưa') && w.time && w.time.trim() !== '');
    if (rainy) return `Mưa (${rainy.time})`;
    const first = publishedReport.weather[0];
    if (first && first.time) return `${first.weather.split('/')[0]} (${first.time})`;
    return dailyTab?.weather || 'Bình thường';
  }, [publishedReport.weather, dailyTab?.weather]);

  const currentSummary = useMemo(
    () => publishedReport.aiSummary || buildFallbackSummary(publishedReport),
    [publishedReport]
  );

  // 8 Navigation items (1 AI Overview + 7 Roman Numeral Sections I..VII)
  const webNavItems = [
    { id: 'all', badge: '★', title: 'Tất cả (8 mục)' },
    { id: 'overview', badge: 'AI', title: 'Tổng hợp & Thời tiết' },
    { id: 'sec-I', badge: 'I', title: 'I. Ghi chép thời tiết' },
    { id: 'sec-II', badge: 'II', title: 'II. Quản lý an toàn' },
    { id: 'sec-III', badge: 'III', title: 'III. Nhân lực trong ngày' },
    { id: 'sec-IV', badge: 'IV', title: 'IV. Máy móc & thiết bị' },
    { id: 'sec-V', badge: 'V', title: 'V. Vật liệu nhập' },
    { id: 'sec-VI', badge: 'VI', title: 'VI. Khối lượng công việc' },
    { id: 'sec-VII', badge: 'VII', title: 'VII. Nghiệm thu trong ngày' }
  ];

  const labeledMat = useMemo(() => labelRows(publishedReport.mat), [publishedReport.mat]);
  const labeledWork = useMemo(() => labelRows(publishedReport.work), [publishedReport.work]);

  if (loading && !data && !dailyTab && !publishedReport) {
    return (
      <div className="p-8 flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in pb-20">
      {/* Print Styles for A4 Sheet */}
      <style>{`
        body > div > img {
          display: inline-block !important;
        }
        @media print {
          aside, nav, header, .no-print {
            display: none !important;
          }
          body, html, #root, main {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }
          #c10-printable-a4-sheet, #c10-printable-a4-sheet * {
            visibility: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          @page landscape-page {
            size: A4 landscape;
            margin: 0;
          }
          .c10-a4-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 210mm !important;
            height: 296mm !important;
            min-height: 296mm !important;
            max-height: 296mm !important;
            page-break-after: always !important;
            break-after: page !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .c10-a4-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .c10-a4-sheet-landscape {
            page: landscape-page !important;
            width: 297mm !important;
            height: 209mm !important;
            min-height: 209mm !important;
            max-height: 209mm !important;
          }
        }
        .c10-a4-sheet, .a4-page-portrait {
          background: #fff;
          color: #000;
          font-family: "Times New Roman", Times, serif;
          font-size: 9.5pt;
          width: 794px;
          height: 1123px;
          min-height: 1123px;
          padding: 38px 45px 38px 45px;
          box-sizing: border-box;
          overflow: hidden;
          margin: 0 auto 24px auto;

          box-shadow: 0 4px 18px rgba(0,0,0,0.18);
          line-height: 1.35;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .c10-a4-sheet-landscape {
          width: 297mm !important;
          min-height: 210mm !important;
          max-width: 297mm !important;
          padding: 10mm 12mm 10mm 12mm !important;
        }
        .c10-page-content {
          flex: 1 0 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }
        .c10-page-footer {
          flex-shrink: 0;
          margin-top: auto;
        }
        .c10-a4-sheet table {
          width: 100%;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          border-top: 1px solid #000 !important;
          border-left: 1px solid #000 !important;
          margin-bottom: 4px;
        }
        .c10-a4-sheet td, .c10-a4-sheet th {
          border-top: none !important;
          border-left: none !important;
          border-right: 1px solid #000 !important;
          border-bottom: 1px solid #000 !important;
          padding: 5px 6px;
          text-align: center;
          vertical-align: middle;
          box-sizing: border-box;
          line-height: 1.35;
        }
        .c10-a4-sheet img {
          display: inline-block !important;
        }
        .c10-a4-sheet .c10-logo-box {
          height: 48px !important;
          min-height: 48px !important;
          overflow: visible !important;
        }
        .c10-a4-sheet img.c10-logo-img {
          display: block !important;
          height: 44px !important;
          max-height: 44px !important;
          width: auto !important;
          max-width: 100% !important;
          object-fit: contain !important;
          margin: 0 auto !important;
        }
        .c10-a4-sheet tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .c10-a4-sheet th {
          background: #a9c9ec !important;
          font-weight: 700;
          vertical-align: middle;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .c10-a4-sheet i {
          font-weight: 400;
        }
        .c10-a4-sheet .l {
          text-align: left;
        }
        .c10-a4-sheet .b {
          font-weight: 700;
        }
        .c10-a4-sheet .sec td {
          background: #dbe8f7 !important;
          font-weight: 700;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .c10-a4-ttl {
          font-weight: 700;
          color: #1b2a49;
          font-size: 10pt;
          margin: 4px 0 2px;
        }
      `}</style>

      {/* Toast Notification */}
      {statusToast && (
        <div className="no-print fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* ========================================================
          MODAL: LƯU VÀO DRIVE & DRIVE LƯU TRỮ VÀ TỔNG HỢP (KÈM APPS SCRIPT WEBHOOK 1 NÚT BẤM)
         ======================================================== */}
      {driveModalMode && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden my-8">
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl text-white ${driveModalMode === 'save-drive' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                  {driveModalMode === 'save-drive' ? <CloudUpload className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {driveModalMode === 'save-drive'
                      ? 'Lưu Báo Cáo Ngày (PDF) vào Google Drive C10'
                      : 'Drive Lưu Trữ PDF & Tự Động Tổng Hợp Số Lượng Lên Google Sheet C10'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tên file chuẩn: <b className="text-blue-700 font-mono">{fullReportFileName}.pdf</b>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDriveModalMode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Webhook Real-time Status Banner */}
              {webhookStatus && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                    webhookStatus.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : webhookStatus.type === 'error'
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : 'bg-blue-50 border-blue-200 text-blue-900'
                  }`}
                >
                  {webhookStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : webhookStatus.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <RefreshCw className={`w-4 h-4 text-blue-600 shrink-0 mt-0.5 ${isSyncingWebhook ? 'animate-spin' : ''}`} />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="font-bold">{webhookStatus.message}</div>
                    {webhookStatus.pdfUrl && (
                      <a
                        href={webhookStatus.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-700 hover:underline font-bold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở xem file PDF vừa lưu trên Google Drive</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Step 1: Google Drive Folder Link */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Link thư mục Google Drive lưu trữ C10 (nhập link thư mục Drive của bạn):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={driveFolderInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDriveFolderInput(val);
                      const nextCloud = saveDailyReportCloudConfigLocal({
                        driveFolderUrl: val,
                        sheetUrl: sheetUrlInput,
                        appsScriptUrl: appsScriptUrlInput
                      });
                      setPublishedReport((prev) => ({ ...prev, cloud: nextCloud }));
                      setDraftReport((prev) => ({ ...prev, cloud: nextCloud }));
                    }}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={isExportingPdf}
                    onClick={async () => {
                      if (driveFolderInput && /^https?:\/\//i.test(driveFolderInput.trim())) {
                        window.open(driveFolderInput.trim(), '_blank', 'noopener,noreferrer');
                      }
                      await triggerPrintWithFileName(fullReportFileName);
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    {isExportingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                    <span>{isExportingPdf ? 'Đang xuất PDF...' : 'Xuất PDF & Mở Drive'}</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Only shown for 'archive-sheet' mode */}
              {driveModalMode === 'archive-sheet' && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      2. Link Google Sheet C10 cập nhật số lượng Báo cáo ngày (đã tách riêng khỏi Sheet CN82 cũ):
                    </label>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Chuẩn dự án C10
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={sheetUrlInput}
                      onChange={(e) => {
                        const val = sanitizeC10SheetUrl(e.target.value);
                        setSheetUrlInput(val);
                        const nextCloud = saveDailyReportCloudConfigLocal({
                          driveFolderUrl: driveFolderInput,
                          sheetUrl: val,
                          appsScriptUrl: appsScriptUrlInput
                        });
                        setPublishedReport((prev) => ({ ...prev, cloud: nextCloud }));
                        setDraftReport((prev) => ({ ...prev, cloud: nextCloud }));
                      }}
                      placeholder="Dán link Google Sheet C10 mới của bạn vào đây (https://docs.google.com/spreadsheets/d/...)"
                      className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                    />
                    {sheetUrlInput ? (
                      <a
                        href={sheetUrlInput}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở Sheet C10</span>
                      </a>
                    ) : (
                      <a
                        href="https://sheets.new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                        title="Tạo ngay 1 file Google Sheet mới trên tài khoản của bạn"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Tạo Sheet C10 mới</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Cổng Webhook Google Apps Script Tự Động 1 Nút Bấm */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Code2 className="w-4 h-4 text-indigo-600" />
                    <span>
                      {driveModalMode === 'save-drive'
                        ? '2. Cổng Webhook Google Apps Script (Tự động tạo & lưu thẳng PDF vào Drive không cần tải thủ công):'
                        : '3. Cổng Webhook Google Apps Script (1 nút bấm: Tự động lưu PDF vào Drive + Điền số lượng vào Sheet C10):'}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAppsScriptGuide((prev) => !prev)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{showAppsScriptGuide ? 'Ẩn mã & hướng dẫn' : 'Lấy mã Apps Script & Hướng dẫn cài (1 phút)'}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={appsScriptUrlInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAppsScriptUrlInput(val);
                      const nextCloud = saveDailyReportCloudConfigLocal({
                        driveFolderUrl: driveFolderInput,
                        sheetUrl: sheetUrlInput,
                        appsScriptUrl: val
                      });
                      setPublishedReport((prev) => ({ ...prev, cloud: nextCloud }));
                      setDraftReport((prev) => ({ ...prev, cloud: nextCloud }));
                    }}
                    placeholder="Dán URL Web App Apps Script (https://script.google.com/macros/s/.../exec)"
                    className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={isSyncingWebhook}
                    onClick={() => executeAppsScriptWebhook(activeReport, driveModalMode)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    <Send className={`w-3.5 h-3.5 ${isSyncingWebhook ? 'animate-pulse' : ''}`} />
                    <span>
                      {isSyncingWebhook
                        ? 'Đang đồng bộ...'
                        : driveModalMode === 'save-drive'
                        ? 'Chạy lưu PDF tự động'
                        : 'Chạy lưu PDF & Ghi Sheet tự động'}
                    </span>
                  </button>
                </div>

                {/* Collapsible Apps Script Code & Step-by-Step Instructions */}
                {showAppsScriptGuide && (
                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-3 border border-slate-700 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2.5">
                      <div>
                        <span className="font-bold text-amber-300 block">
                          Hướng dẫn tạo Cổng tự động ghi Google Sheet C10 & lưu PDF vào Drive (Chỉ làm 1 lần):
                        </span>
                        <span className="text-[11px] text-slate-300">
                          Mã dưới đây đã được điền sẵn ID thư mục Drive và ID Google Sheet C10 bạn nhập ở trên.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const scriptCode = generateC10GoogleAppsScriptCode(driveFolderInput, sheetUrlInput);
                          await navigator.clipboard.writeText(scriptCode);
                          setCopiedAppsScript(true);
                          setTimeout(() => setCopiedAppsScript(false), 3500);
                          showToast('Đã sao chép toàn bộ mã Google Apps Script C10!');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        {copiedAppsScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedAppsScript ? 'Đã chép mã Apps Script' : 'Sao chép mã Apps Script'}</span>
                      </button>
                    </div>

                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-200 leading-relaxed">
                      <li>
                        Mở file Google Sheet C10 của bạn (hoặc bấm <b>"Tạo Sheet C10 mới"</b> ở trên), trên thanh menu chọn{' '}
                        <b className="text-white">Tiện ích mở rộng (Extensions) &rarr; Apps Script</b>.
                      </li>
                      <li>
                        Xóa đoạn mã mặc định trong trình soạn thảo, bấm <b>"Sao chép mã Apps Script"</b> ở góc trên rồi dán (<kbd className="px-1 bg-slate-800 rounded">Ctrl+V</kbd>) vào và bấm Lưu.
                      </li>
                      <li>
                        Bấm nút <b className="text-amber-300">Triển khai (Deploy) &rarr; Tùy chọn triển khai mới (New deployment)</b>.
                      </li>
                      <li>
                        Chọn loại: <b className="text-white">Ứng dụng web (Web app)</b>. Mục <i>Thực thi dưới dạng</i> chọn <b>Tôi (Me)</b>; mục{' '}
                        <i>Ai có quyền truy cập</i> chọn <b className="text-emerald-300">Bất kỳ ai (Anyone)</b> rồi bấm <b>Triển khai</b>.
                      </li>
                      <li>
                        Sao chép <b>URL ứng dụng web</b> (<code className="text-amber-200">https://script.google.com/macros/s/.../exec</code>) dán vào ô số 3 phía trên. Từ nay mỗi lần bạn bấm <b>"Drive lưu trữ và tổng hợp"</b>, hệ thống sẽ tự động lưu file PDF vào Drive VÀ tự động điền toàn bộ số lượng vào các tab <b>Daily, Manpower, VatTuNhap, KhoiLuongCongViec, LichSuBaoCao</b> trên Google Sheet C10!
                      </li>
                    </ol>

                    <pre className="bg-slate-950 text-emerald-300 p-3 rounded-lg overflow-x-auto max-h-48 text-[11px] font-mono border border-slate-800">
                      {generateC10GoogleAppsScriptCode(driveFolderInput, sheetUrlInput)}
                    </pre>
                  </div>
                )}

                {/* Backup Manual Copy / Excel Download */}
                {driveModalMode === 'archive-sheet' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-emerald-900">
                      <span className="font-bold block">Đồng bộ dự phòng (Dán nhanh hoặc xuất file Excel):</span>
                      <span className="text-[11px] text-emerald-700">
                        Ngoài cổng tự động Apps Script, bảng dữ liệu chuẩn cũng đã được chép sẵn vào bộ nhớ tạm để bạn có thể <kbd className="px-1.5 py-0.5 bg-white border rounded">Ctrl+V</kbd> hoặc tải file <code className="font-mono">.xlsx</code>.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const rows = buildSheetSyncRows(activeReport);
                          await navigator.clipboard.writeText(rows.map((r) => r.join('\t')).join('\n'));
                          setCopiedTsv(true);
                          setTimeout(() => setCopiedTsv(false), 3000);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedTsv ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedTsv ? 'Đã chép bảng' : 'Chép bảng Sheet'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadSheetExcel}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                      >
                        Tải file .xlsx
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDriveModalMode(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TOP HEADER BAR & ACTION BUTTONS (CHỈ HIỂN THỊ VỚI ADMIN & TÀI KHOẢN CÓ QUYỀN LÀM BÁO CÁO)
         ======================================================== */}
      {canEdit ? (
        <div className="no-print bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-blue-600 p-3 rounded-xl shadow-md text-white shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-slate-800">
                    {t('daily_report')}
                  </h2>
                  <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-blue-200 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatVNDate(publishedReport.g.reportDate)}
                  </span>
                  <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200">
                    Báo cáo số: {publishedReport.g.reportNo}
                  </span>

                  {/* Cloud Realtime Sync Status Badge */}
                  <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Cloud Realtime</span>
                  </span>

                  {/* Historical Reports Dropdown */}
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-300 flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <History className="w-3.5 h-3.5 text-slate-600" />
                      <span>Lịch sử ({historyList.length})</span>
                    </button>
                    {showHistoryDropdown && (
                      <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-72 overflow-y-auto">
                        <div className="text-[11px] font-bold text-slate-500 uppercase px-2 py-1 border-b border-slate-100 flex items-center justify-between">
                          <span>Lịch sử báo cáo đã lưu</span>
                          <span className="text-[10px] text-blue-600 font-semibold">{historyList.length} bản ghi</span>
                        </div>
                        {historyList.length === 0 ? (
                          <div className="text-xs text-slate-400 p-3 text-center">Chưa có lịch sử lưu trữ trên Cloud</div>
                        ) : (
                          <div className="space-y-1 mt-1">
                            {historyList.map((entry) => (
                              <button
                                key={entry.dateKey}
                                type="button"
                                onClick={() => handleSelectHistoryReport(entry)}
                                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                  selectedHistoryDate === entry.date
                                    ? 'bg-blue-100 text-blue-900 font-bold'
                                    : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div>
                                  <div className="font-semibold">{formatVNDate(entry.date)}</div>
                                  <div className="text-[10px] text-slate-400">Báo cáo số {entry.reportNo || '01'}</div>
                                </div>
                                <span className="text-[11px] text-blue-600 font-bold">Xem</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Return to Latest Button when viewing History */}
                  {selectedHistoryDate && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg text-xs text-amber-900 font-medium">
                      <span>Đang xem lịch sử: <b>{formatVNDate(selectedHistoryDate)}</b></span>
                      <button
                        type="button"
                        onClick={handleReturnToLatestReport}
                        className="text-blue-700 font-bold underline hover:text-blue-900 ml-1 cursor-pointer"
                      >
                        Về bản mới nhất
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {publishedReport.g.project} — Nhà thầu: <span className="font-semibold text-slate-700">{publishedReport.g.contractor}</span>
                </p>
              </div>
            </div>

            {/* Weather Quick Badge & Mode Toggle */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-amber-50/90 border border-amber-200 px-3.5 py-2 rounded-xl text-amber-900">
                <CloudSun className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">
                    {t('weather')}
                  </span>
                  <span className="text-xs font-bold text-amber-900">{weatherBadgeText}</span>
                </div>
              </div>

              {/* Admin-only: Phân quyền & Xem thử giao diện người xem */}
              {isCurrentAdmin && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPermissionsModal(true)}
                    title="Phân quyền người lập / xuất báo cáo ngày"
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-xs cursor-pointer transition-all"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Phân quyền</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('c10_preview_as_viewer', 'true');
                      setCanEdit(false);
                      showToast('Đang chuyển sang chế độ xem thử giao diện Người xem (ẩn thanh công cụ)');
                    }}
                    title="Xem trước giao diện như một người xem thông thường (ẩn hoàn toàn các nút thao tác)"
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-dashed border-slate-300 font-bold text-xs cursor-pointer transition-all"
                  >
                    <Eye className="w-4 h-4 text-indigo-600" />
                    <span>Xem thử khách</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!canEdit) {
                    showToast('Bạn đang ở quyền Người xem. Vui lòng đăng nhập tài khoản đã được phân quyền hoặc liên hệ Quản trị viên để được cấp quyền sửa báo cáo.');
                    return;
                  }
                  if (!isEditingReport) {
                    setDraftReport(publishedReport);
                    setIsEditingReport(true);
                  } else {
                    handlePublishReport();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer ${
                  !canEdit
                    ? 'bg-slate-100 text-slate-500 border border-slate-300 hover:bg-slate-200'
                    : isEditingReport
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {!canEdit ? (
                  <>
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>Quyền xem (Chỉ Admin / Được cấp quyền mới sửa)</span>
                  </>
                ) : isEditingReport ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Xuất báo cáo ngày (Đồng bộ 8 mục)</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4" />
                    <span>Lập / Chỉnh sửa báo cáo ngày (Mục I–VII)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Action Toolbar: In PDF | Lưu vào Drive | Drive lưu trữ và tổng hợp | Lưu bản nháp | Mở bản nháp */}
          <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrintPDF}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {isExportingPdf ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>{isExportingPdf ? 'Đang xuất PDF...' : 'In PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenSaveToDrive}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Lưu vào Drive</span>
              </button>

              <button
                type="button"
                onClick={handleOpenDriveArchiveAndSheetSync}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>Drive lưu trữ và tổng hợp</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDraftFile}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                <Save className="w-4 h-4 text-blue-600" />
                <span>Lưu bản nháp</span>
              </button>

              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold transition-all cursor-pointer">
                <FolderOpen className="w-4 h-4 text-amber-600" />
                <span>Mở bản nháp</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleOpenDraftFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Filename Control: Cho phép chỉnh sửa tự do toàn bộ tên file xuất + Nút đặt lại mặc định */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold mr-1">Tên file xuất:</span>
              <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden shadow-2xs">
                <input
                  type="text"
                  value={customFullFileName || fullReportFileName}
                  onChange={(e) => {
                    setCustomFullFileName(e.target.value);
                  }}
                  placeholder={defaultCalculatedFileName}
                  className="px-2.5 py-1.5 bg-white text-blue-700 font-mono font-bold text-xs w-60 sm:w-72 md:w-80 focus:outline-none focus:bg-blue-50/40"
                  title="Tên file xuất PDF (Bạn có thể tự do chỉnh sửa trực tiếp cả phần ngày YYMMDD/YYDDMM và tên)"
                />
                <span className="px-2 py-1.5 bg-slate-100 text-slate-500 font-mono text-xs select-none border-l border-slate-300">
                  .pdf
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const fresh = buildFullReportFileName(activeReport.g.reportDate);
                    setCustomFullFileName(fresh);
                    setCustomSuffix(DEFAULT_FILE_SUFFIX);
                    showToast('Đã đặt lại tên file theo ngày làm báo cáo thực tế!');
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border-l border-slate-300 text-xs transition-colors cursor-pointer flex items-center gap-1"
                  title="Khôi phục tên file mặc định theo ngày làm báo cáo thực tế"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-semibold">Mặc định</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* HEADER TINH TẾ CHO TÀI KHOẢN NGƯỜI XEM (VIEW-ONLY) */
        <div className="no-print bg-white p-4 md:p-5 rounded-2xl shadow-xs border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base md:text-lg font-bold text-slate-800 tracking-tight">
                  {t('daily_report')}
                </h2>
                <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-lg text-xs font-bold border border-blue-200 flex items-center gap-1 font-mono">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatVNDate(publishedReport.g.reportDate)}
                </span>
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-[11px] font-semibold border border-slate-200">
                  Số: {publishedReport.g.reportNo}
                </span>
                <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Bản chính thức
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {publishedReport.g.project} — Nhà thầu: <span className="font-semibold text-slate-700">{publishedReport.g.contractor}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nếu máy thực tế là Admin nhưng đang bật chế độ xem thử */}
            {localStorage.getItem('is_admin') === 'true' && localStorage.getItem('c10_preview_as_viewer') === 'true' && (
              <div className="flex items-center gap-2 mr-2">
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                  <Eye className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  <span>Đang xem thử khách</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('c10_preview_as_viewer');
                    setCanEdit(computeCanEdit());
                    showToast('Đã trở lại giao diện Quản trị viên.');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                >
                  Quay lại Admin
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 bg-amber-50/90 border border-amber-200 px-3.5 py-2 rounded-xl text-amber-900 shrink-0">
              <CloudSun className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mr-1">
                  {t('weather')}:
                </span>
                <span className="font-bold">{weatherBadgeText}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODE 1: INTERACTIVE FORM BUILDER (MỤC I -> VII)
         ======================================================== */}
      {isEditingReport && (
        <DailyReportEditor
          draftReport={draftReport}
          setDraftReport={setDraftReport}
          onPublish={handlePublishReport}
          onClose={() => setIsEditingReport(false)}
          showToast={showToast}
        />
      )}

      {/* ========================================================
          SUB-NAVIGATION BAR FOR THE 8 SYNCHRONIZED WEB SECTIONS (ENHANCED PILL TABS - TRIỆT TIÊU THANH CUỘN THÔ)
         ======================================================== */}
      <div 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        className="no-print bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden sticky top-2 z-20 transition-all select-none"
      >
        {webNavItems.map((item) => {
          const isActive = activeWebSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveWebSection(item.id);
                if (item.id !== 'all') {
                  const el = document.getElementById(`c10-web-${item.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer select-none ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                  : 'bg-slate-50/90 hover:bg-slate-100/90 text-slate-700 hover:text-indigo-600 border border-slate-200/70'
              }`}
            >
              <span
                className={`px-1.5 min-w-[20px] h-5 rounded-md flex items-center justify-center text-[10px] font-black tracking-tight ${
                  isActive 
                    ? 'bg-white/20 text-white ring-1 ring-white/30' 
                    : 'bg-slate-200/90 text-slate-700'
                }`}
              >
                {item.badge}
              </span>
              <span className="font-semibold">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================
          MỤC MỞ ĐẦU (1/8): TỔNG HỢP BÁO CÁO & ĐIỀU KIỆN THỜI TIẾT (GEMINI FLASH)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'overview') && (
        <div id="c10-web-overview" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="px-2.5 h-8 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-md">
                AI
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  Tổng hợp báo cáo & Điều kiện thời tiết (Đánh giá chung Gemini Flash)
                </h2>
                <p className="text-xs text-slate-500">
                  Tự động phân tích và tóm tắt 100% từ dữ liệu Báo cáo ngày đã xuất (Mục I đến Mục VII)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => generateGeminiSummary(publishedReport, true)}
                disabled={isGeneratingAI}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                <span>{isGeneratingAI ? 'Gemini Flash đang tổng hợp...' : 'Làm mới đánh giá AI'}</span>
              </button>
              <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                Mục 1 / 8
              </span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md relative overflow-hidden space-y-4">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-10 pointer-events-none">
              <Sparkles className="w-48 h-48" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-200 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                <span>Đánh giá tổng hợp từ Gemini Flash — Ngày {formatVNDate(publishedReport.g.reportDate)}</span>
              </div>
              <span className="text-[11px] bg-white/10 px-2.5 py-1 rounded-full text-amber-200 border border-white/15">
                Thời tiết: {currentSummary.weatherSummary}
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-4 text-xs leading-relaxed text-slate-100">
              <span className="font-bold text-amber-300 uppercase text-[11px] block mb-1">• Đánh giá chung trong ngày:</span>
              {currentSummary.overallAssessment}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-3.5 text-xs">
                <span className="font-bold text-blue-200 block mb-1.5 uppercase text-[11px] tracking-wide">
                  • Điểm nổi bật trong ngày (Nhân lực, Vật tư, Thi công & Nghiệm thu)
                </span>
                <ul className="space-y-1.5 text-slate-100 list-disc list-inside">
                  {(currentSummary.highlights || []).map((item, idx) => (
                    <li key={idx} className="leading-relaxed">{item}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-xl p-3.5 text-xs space-y-3">
                <div>
                  <span className="font-bold text-emerald-200 block mb-1.5 uppercase text-[11px] tracking-wide">
                    • Trọng tâm kế hoạch ngày mai
                  </span>
                  <ul className="space-y-1 text-slate-100 list-disc list-inside">
                    {(currentSummary.tomorrowFocus || []).map((item, idx) => (
                      <li key={idx} className="leading-relaxed">{item}</li>
                    ))}
                  </ul>
                </div>
                {currentSummary.recommendations && currentSummary.recommendations.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <span className="font-bold text-amber-200 block mb-1 uppercase text-[11px] tracking-wide">
                      • Lưu ý điều hành
                    </span>
                    <ul className="space-y-1 text-slate-100 list-disc list-inside">
                      {currentSummary.recommendations.map((item, idx) => (
                        <li key={idx} className="leading-relaxed">{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC I (2/8): I. GHI CHÉP THỜI TIẾT (WEATHER RECORDS)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-I') && (
        <div id="c10-web-sec-I" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black text-sm flex items-center justify-center shadow-md">
                I
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  I. Ghi chép thời tiết (Weather Records)
                </h2>
                <p className="text-xs text-slate-500">
                  Ghi nhận tình hình thời tiết thực tế tại công trường ngày {formatVNDate(publishedReport.g.reportDate)}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
              Mục 2 / 8 (Mục I)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-16 text-center">STT</th>
                  <th className="py-2.5 px-4">Thời tiết (Weather)</th>
                  <th className="py-2.5 px-4 w-48 text-center">Thời gian (Time)</th>
                  <th className="py-2.5 px-4 w-64">Ghi chú (Note)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedReport.weather.map((w, idx) => (
                  <tr key={w.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{w.weather}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-amber-700">{w.time || '-'}</td>
                    <td className="py-2.5 px-4 text-slate-600">{w.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC II (3/8): II. QUẢN LÝ AN TOÀN CÔNG TRÌNH (SAFETY MANAGEMENT)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-II') && (
        <div id="c10-web-sec-II" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                II
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  II. Quản lý an toàn công trình (Construction Safety Management)
                </h2>
                <p className="text-xs text-slate-500">
                  Công tác kiểm soát an toàn lao động, vệ sinh môi trường và huấn luyện đầu ca
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              Mục 3 / 8 (Mục II)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-16 text-center">STT</th>
                  <th className="py-2.5 px-4">Mô tả công tác an toàn (Description)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedReport.safety.map((s, idx) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{s.desc}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC III (4/8): III. NHÂN LỰC TRONG NGÀY (DAILY MANPOWER)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-III') && (
        <div id="c10-web-sec-III" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                III
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  III. Nhân lực trong ngày (Daily Manpower)
                </h2>
                <p className="text-xs text-slate-500">
                  Quân số Ban chỉ huy, kỹ sư và công nhân trực tiếp thi công trên công trường
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg">
                Trong giờ: {totalRegularManpower} | Tăng ca: {totalOvertimeManpower}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                Mục 4 / 8 (Mục III)
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-16 text-center">STT</th>
                  <th className="py-2.5 px-4">Bộ phận (Personnel Category)</th>
                  <th className="py-2.5 px-4 w-36 text-center">Trong giờ (Regular)</th>
                  <th className="py-2.5 px-4 w-36 text-center">Tăng ca (Overtime)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedReport.man.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{m.dept}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-blue-700">{m.regular || 0}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-indigo-700">{m.overtime || 0}</td>
                  </tr>
                ))}
                <tr className="bg-blue-50/60 font-bold text-slate-900">
                  <td colSpan={2} className="py-2.5 px-4 text-right">Tổng nhân lực / Total:</td>
                  <td className="py-2.5 px-4 text-center text-blue-800">{totalRegularManpower}</td>
                  <td className="py-2.5 px-4 text-center text-indigo-800">{totalOvertimeManpower}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC IV (5/8): IV. MÁY MÓC VÀ THIẾT BỊ (MACHINERY & EQUIPMENT)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-IV') && (
        <div id="c10-web-sec-IV" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                IV
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  IV. Máy móc và thiết bị (Machinery & Equipment)
                </h2>
                <p className="text-xs text-slate-500">
                  Danh mục máy móc thiết bị thi công hiện diện tại công trường
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg">
                Tổng thiết bị: {totalMachinery}
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                Mục 5 / 8 (Mục IV)
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 w-16 text-center">STT</th>
                  <th className="py-2.5 px-4">Tên thiết bị (Equipment Name)</th>
                  <th className="py-2.5 px-4 w-40 text-center">Số lượng (Quantity)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedReport.mach.map((eq, idx) => (
                  <tr key={eq.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 text-center font-semibold text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{eq.name}</td>
                    <td className="py-2.5 px-4 text-center font-bold text-indigo-700">{eq.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC V (6/8): V. VẬT LIỆU NHẬP VÀO CÔNG TRÌNH (MATERIALS DELIVERED)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-V') && (
        <div id="c10-web-sec-V" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-cyan-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                V
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  V. Vật liệu nhập vào công trình (Materials Delivered to Site)
                </h2>
                <p className="text-xs text-slate-500">
                  Khối lượng vật tư nhập trong ngày và lũy kế nhập đến hiện tại
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-lg border border-cyan-200">
              Mục 6 / 8 (Mục V)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-14 text-center">STT</th>
                  <th className="py-2.5 px-3">Vật liệu (Material)</th>
                  <th className="py-2.5 px-3 w-48">Nhà cung cấp (Supplier)</th>
                  <th className="py-2.5 px-3 w-24 text-center">Đơn vị</th>
                  <th className="py-2.5 px-3 w-36 text-center">SL nhập trong ngày</th>
                  <th className="py-2.5 px-3 w-36 text-center">Lũy kế nhập</th>
                  <th className="py-2.5 px-3 w-44">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labeledMat.map((m) =>
                  m.type === 'A' ? (
                    <tr key={m.id} className="bg-cyan-50/70 font-bold text-cyan-950">
                      <td className="py-2 px-3 text-center">{m.no}</td>
                      <td colSpan={6} className="py-2 px-3">{m.name}</td>
                    </tr>
                  ) : (
                    <tr key={m.id} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 text-center font-semibold text-slate-500">{m.no}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{m.name}</td>
                      <td className="py-2 px-3 text-slate-600">{m.supplier || '-'}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{m.unit || '-'}</td>
                      <td className="py-2 px-3 text-center font-bold text-blue-700">{m.today || '0'}</td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-700">{m.cum || '-'}</td>
                      <td className="py-2 px-3 text-slate-600 font-medium">{m.note || '-'}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC VI (7/8): VI. KHỐI LƯỢNG CÔNG VIỆC THỰC HIỆN TRONG NGÀY
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-VI') && (
        <div id="c10-web-sec-VI" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-violet-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                VI
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  VI. Khối lượng công việc thực hiện trong ngày (Daily Work Quantity)
                </h2>
                <p className="text-xs text-slate-500">
                  Theo dõi Kế hoạch hôm nay, Thực hiện hôm nay, Lũy kế và Kế hoạch ngày mai
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-violet-50 text-violet-700 rounded-lg border border-violet-200">
              Mục 7 / 8 (Mục VI)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-14 text-center">STT</th>
                  <th className="py-2.5 px-3">Nội dung công việc (Work Description)</th>
                  <th className="py-2.5 px-3 w-28 text-center">KH hôm nay</th>
                  <th className="py-2.5 px-3 w-28 text-center">TH hôm nay</th>
                  <th className="py-2.5 px-3 w-28 text-center">Lũy kế</th>
                  <th className="py-2.5 px-3 w-28 text-center">KH ngày mai</th>
                  <th className="py-2.5 px-3 w-20 text-center">Đơn vị</th>
                  <th className="py-2.5 px-3 w-40">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labeledWork.map((w) =>
                  w.type === 'A' ? (
                    <tr key={w.id} className="bg-violet-50/70 font-bold text-violet-950">
                      <td className="py-2 px-3 text-center">{w.no}</td>
                      <td colSpan={7} className="py-2 px-3">{w.name}</td>
                    </tr>
                  ) : (
                    <tr key={w.id} className="hover:bg-slate-50/80">
                      <td className="py-2 px-3 text-center font-semibold text-slate-500">{w.no}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{w.name}</td>
                      <td className="py-2 px-3 text-center text-slate-700 font-medium">{w.plan || '0'}</td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-700">{w.today || '0'}</td>
                      <td className="py-2 px-3 text-center font-bold text-blue-700">{w.cum || '0'}</td>
                      <td className="py-2 px-3 text-center font-bold text-amber-700">{w.next || '-'}</td>
                      <td className="py-2 px-3 text-center text-slate-600">{w.unit || '-'}</td>
                      <td className="py-2 px-3 font-semibold text-slate-700">{w.note || '-'}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MỤC VII (8/8): VII. CÔNG TÁC NGHIỆM THU TRONG NGÀY (DAILY INSPECTION WORKS)
         ======================================================== */}
      {(activeWebSection === 'all' || activeWebSection === 'sec-VII') && (
        <div id="c10-web-sec-VII" className="no-print space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-rose-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                VII
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  VII. Công tác nghiệm thu trong ngày (Daily Inspection Works)
                </h2>
                <p className="text-xs text-slate-500">
                  Kết quả nghiệm thu kỹ thuật giữa Nhà thầu, TVGS SCQC2 và Chủ đầu tư
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200">
              Mục 8 / 8 (Mục VII)
            </span>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-14 text-center">STT</th>
                  <th className="py-2.5 px-3">Hạng mục (Work Item)</th>
                  <th className="py-2.5 px-3 w-36 text-center">Thời gian & Ngày</th>
                  <th className="py-2.5 px-3 w-40">Cán bộ phụ trách</th>
                  <th className="py-2.5 px-3 w-32">SĐT</th>
                  <th className="py-2.5 px-3 w-44">Thành phần tham gia</th>
                  <th className="py-2.5 px-3 w-28 text-center">Đánh giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publishedReport.insp.length > 0 ? (
                  publishedReport.insp.map((n, idx) => (
                    <tr key={n.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 text-center font-semibold text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{n.item}</td>
                      <td className="py-2.5 px-3 text-center text-slate-600">{n.time || '-'}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">{n.person || '-'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{n.phone || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{n.participants || '-'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {n.assess || 'ĐẠT'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                      Chưa có hạng mục nghiệm thu trong ngày
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL XUẤT FILE PDF THÀNH CÔNG (TẢI TRỰC TIẾP & MỞ XEM)
         ======================================================== */}
      {exportedPdfModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Xuất File PDF Thành Công!</h3>
              <p className="text-xs text-slate-600 mt-1 font-mono break-all font-semibold text-blue-700">
                {exportedPdfModal.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                (Đầy đủ {exportedPdfModal.pageCount} trang chuẩn khổ A4)
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 text-left space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Trình duyệt đã kích hoạt tải xuống file PDF.</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Nếu trình duyệt hoặc sandbox chặn tải ngầm, bạn có thể bấm trực tiếp 2 nút bên dưới:
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <a
                href={exportedPdfModal.url}
                download={exportedPdfModal.name}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Tải file PDF về máy</span>
              </a>
              <a
                href={exportedPdfModal.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Mở xem tab mới</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setExportedPdfModal(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium pt-1 cursor-pointer block mx-auto"
            >
              Đóng cửa sổ này
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: PHÂN QUYỀN NGƯỜI LẬP & XUẤT BÁO CÁO NGÀY (DÀNH CHO ADMIN)
         ======================================================== */}
      {showPermissionsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 no-print animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Phân quyền Báo cáo ngày</h3>
                  <p className="text-xs text-slate-500">Chỉ định những tài khoản được phép Lập & Xuất báo cáo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPermissionsModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Option: Allow all editors */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-800">Cho phép mọi người dùng chỉnh sửa</div>
                  <div className="text-[11px] text-slate-500">Nếu bật, bất kỳ máy nào mở app cũng có thể lập & xuất báo cáo</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={permissionsState.allowAllEditors}
                    onChange={(e) => handleToggleAllowAll(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Add email */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Thêm email người được cấp quyền:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    placeholder="vd: kisu@delta.com.vn hoặc gmail"
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAuthorizedEmail();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddAuthorizedEmail}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-all shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm</span>
                  </button>
                </div>
              </div>

              {/* Authorized emails list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Danh sách tài khoản được cấp quyền ({permissionsState.authorizedEmails.length}):</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {permissionsState.authorizedEmails.map((email) => {
                    const isPrimaryAdmin = email.toLowerCase() === 'phucbao1992@gmail.com';
                    return (
                      <div
                        key={email}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <ShieldCheck className={`w-4 h-4 ${isPrimaryAdmin ? 'text-amber-600' : 'text-blue-600'}`} />
                          <span className="font-semibold text-slate-800">{email}</span>
                          {isPrimaryAdmin && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                              Admin chính
                            </span>
                          )}
                        </div>
                        {!isPrimaryAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAuthorizedEmail(email)}
                            title="Xoá quyền"
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button 
                type="button"
                onClick={() => setShowPermissionsModal(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Hoàn tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          PRINTABLE A4 SHEET PREVIEW (DÙNG KHI BẤM "IN PDF" HOẶC "LƯU VÀO DRIVE")
         ======================================================== */}
      <DailyReportPrintSheet report={activeReport} />
    </div>
  );
};

export default DailyReport;
