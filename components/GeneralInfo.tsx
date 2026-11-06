import React, { useState, useEffect } from 'react';
import { 
  PROJECT_NAME, PROJECT_SUBTITLE, PROJECT_SPECS, SAFETY_START_DATE, 
  PROJECT_OVERVIEW, LOGO_URL, TRANSLATIONS, DEFAULT_GENERAL_INFO_CONFIG, GOOGLE_SHEET_ID 
} from '../constants';
import { 
  Clock, ShieldCheck, Ruler, Layers, ArrowUp, Building2, MapPin, 
  Building, Phone, CheckCircle2, RefreshCw, Settings2, ExternalLink, 
  Check, AlertCircle, FileSpreadsheet, X, HelpCircle, Compass, 
  TreePine, Car, Flag, Users, HardHat, AlertTriangle, Activity, 
  CheckSquare, HeartHandshake, Eye, Sparkles
} from 'lucide-react';
import { Language } from '../types';
import { 
  fetchGeneralInfoData, GeneralInfoData, extractSheetId, 
  fetchLiveUpcomingMilestonesFromSheet, SheetMilestoneItem 
} from '../services/sheetsService';
import Building3DViewer from './Building3DViewer';
import MilestonesCard from './MilestonesCard';
import ManagementTeamCard from './ManagementTeamCard';

interface GeneralInfoProps {
  language: Language;
  isAdmin?: boolean;
}

type GeneralSection = 'all' | 'overview' | 'safety' | 'milestones' | 'specs' | 'management';

const GeneralInfo: React.FC<GeneralInfoProps> = ({ language, isAdmin }) => {
  const [activeSection, setActiveSection] = useState<GeneralSection>('all');
  const [safetyHours, setSafetyHours] = useState(0);
  const [liveSheetMilestones, setLiveSheetMilestones] = useState<SheetMilestoneItem[]>([]);
  const [isLoadingMilestones, setIsLoadingMilestones] = useState(false);
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;

  // Google Sheets General Info State
  const [generalInfo, setGeneralInfo] = useState<GeneralInfoData>(() => {
    return {
      investor: PROJECT_OVERVIEW.investor,
      projectName: PROJECT_OVERVIEW.projectName,
      location: PROJECT_OVERVIEW.location,
      source: 'default',
      sheetId: DEFAULT_GENERAL_INFO_CONFIG.sheetId,
      tabName: DEFAULT_GENERAL_INFO_CONFIG.tabName
    };
  });
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [sheetConfig, setSheetConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('c10_general_info_config') || localStorage.getItem('h8_general_info_config');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      sheetUrlOrId: DEFAULT_GENERAL_INFO_CONFIG.sheetId,
      tabName: DEFAULT_GENERAL_INFO_CONFIG.tabName
    };
  });

  const loadGeneralInfo = async (configOverride?: { sheetUrlOrId: string; tabName: string }) => {
    setIsLoadingSheet(true);
    setConfigFeedback(null);
    const targetConfig = configOverride || sheetConfig;
    try {
      const data = await fetchGeneralInfoData(targetConfig.sheetUrlOrId, targetConfig.tabName);
      if (data) {
        setGeneralInfo(data);
        return { success: true, data };
      } else {
        setGeneralInfo(prev => ({
          ...prev,
          source: 'default',
          lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }));
        return { success: false, reason: 'notFound' };
      }
    } catch (err) {
      console.error('Error fetching general info from sheet:', err);
      return { success: false, reason: 'error' };
    } finally {
      setIsLoadingSheet(false);
    }
  };

  const loadSheetMilestones = async () => {
    setIsLoadingMilestones(true);
    try {
      const list = await fetchLiveUpcomingMilestonesFromSheet();
      setLiveSheetMilestones(list);
    } catch (err) {
      console.error('Error fetching live sheet milestones:', err);
    } finally {
      setIsLoadingMilestones(false);
    }
  };

  useEffect(() => {
    loadGeneralInfo();
    loadSheetMilestones();
  }, []);

  useEffect(() => {
    const calculateSafetyHours = () => {
      const start = new Date(SAFETY_START_DATE).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      if (diff < 0) return 0;
      return Math.floor(diff / (1000 * 60 * 60));
    };

    setSafetyHours(calculateSafetyHours());
    const interval = setInterval(() => {
      setSafetyHours(calculateSafetyHours());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleSaveAndTestConfig = async () => {
    const cleanId = extractSheetId(sheetConfig.sheetUrlOrId);
    if (!cleanId) {
      setConfigFeedback({
        type: 'error',
        message: language === 'VN' ? 'Vui lòng nhập Link hoặc ID Google Sheet hợp lệ.' : 'Please enter a valid Google Sheet URL or ID.'
      });
      return;
    }

    const newCfg = {
      sheetUrlOrId: cleanId,
      tabName: sheetConfig.tabName.trim() || 'GeneralInfo'
    };

    localStorage.setItem('c10_general_info_config', JSON.stringify(newCfg));
    setSheetConfig(newCfg);

    const res = await loadGeneralInfo(newCfg);
    if (res.success && res.data) {
      setConfigFeedback({
        type: 'success',
        message: language === 'VN'
          ? `Đã đồng bộ thành công từ tab "${res.data.tabName}"! Đã cập nhật: Chủ đầu tư, Tên dự án, Địa điểm.`
          : `Successfully synchronized from tab "${res.data.tabName}"! Updated: Investor, Project Name, Location.`
      });
    } else {
      setConfigFeedback({
        type: 'error',
        message: language === 'VN'
          ? `Không tìm thấy tab "${newCfg.tabName}" hoặc trang tính chưa bật quyền chia sẻ công khai ("Bất kỳ ai có đường liên kết"). Hệ thống đang hiển thị dữ liệu mặc định.`
          : `Tab "${newCfg.tabName}" not found or sheet is not shared publicly ("Anyone with the link"). Reverted to default.`
      });
    }
  };

  const handleResetDefault = () => {
    const defaultCfg = {
      sheetUrlOrId: DEFAULT_GENERAL_INFO_CONFIG.sheetId,
      tabName: DEFAULT_GENERAL_INFO_CONFIG.tabName
    };
    localStorage.removeItem('c10_general_info_config');
    localStorage.removeItem('h8_general_info_config');
    setSheetConfig(defaultCfg);
    setGeneralInfo({
      investor: PROJECT_OVERVIEW.investor,
      projectName: PROJECT_OVERVIEW.projectName,
      location: PROJECT_OVERVIEW.location,
      source: 'default',
      sheetId: DEFAULT_GENERAL_INFO_CONFIG.sheetId,
      tabName: DEFAULT_GENERAL_INFO_CONFIG.tabName,
      lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    });
    setConfigFeedback({
      type: 'info',
      message: language === 'VN' ? 'Đã khôi phục cài đặt mặc định.' : 'Restored to default settings.'
    });
  };

  const currentDisplayName = generalInfo.projectName?.[language] || PROJECT_NAME[language];
  const currentInvestor = generalInfo.investor?.[language] || PROJECT_OVERVIEW.investor[language];
  const currentLocation = generalInfo.location?.[language] || PROJECT_OVERVIEW.location[language];

  // Navigation Items according to exact user instruction
  const navTabs: { id: GeneralSection; labelVN: string; labelEN: string }[] = [
    { id: 'all', labelVN: 'Tất cả mục', labelEN: 'All Sections' },
    { id: 'overview', labelVN: 'Tổng quan dự án', labelEN: 'Project Overview' },
    { id: 'safety', labelVN: 'An toàn lao động', labelEN: 'Labor Safety (HSE)' },
    { id: 'milestones', labelVN: 'Mốc tiến độ', labelEN: 'Milestones' },
    { id: 'specs', labelVN: 'Thông số kỹ thuật', labelEN: 'Specifications' },
    { id: 'management', labelVN: 'Ban quản lý dự án', labelEN: 'Project Board' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* Top Header & Sticky Navigation Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider border border-blue-200">
                {language === 'VN' ? 'Hồ Sơ Dự Án' : 'Project Profile'}
              </span>
              <span className="text-xs text-slate-400 font-mono">C10 Phú Mỹ Hưng</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              {language === 'VN' ? 'THÔNG TIN CHUNG DỰ ÁN' : 'PROJECT GENERAL INFORMATION'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'VN'
                ? 'Tổng quan dự án · An toàn lao động · Mốc tiến độ · Thông số kỹ thuật · Ban quản lý dự án'
                : 'Project Overview · Labor Safety (HSE) · Milestones · Specifications · Project Board'}
            </p>
          </div>

          {/* Sync & Settings */}
          <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
            {generalInfo.source === 'sheet' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Google Sheet ({generalInfo.tabName})
                {generalInfo.lastUpdated && <span className="text-[10px] text-emerald-600/80 font-normal">· {generalInfo.lastUpdated}</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Mặc định (constants)
              </span>
            )}

            <button
              onClick={() => {
                loadGeneralInfo();
                loadSheetMilestones();
              }}
              disabled={isLoadingSheet}
              title={language === 'VN' ? 'Làm mới từ Google Sheets' : 'Refresh from Google Sheets'}
              className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingSheet ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            <button
              onClick={() => {
                setConfigFeedback(null);
                setIsConfigOpen(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors border border-slate-200"
            >
              <Settings2 className="w-4 h-4 text-slate-500" />
              {language === 'VN' ? 'Cấu hình Sheet' : 'Sheet Config'}
            </button>
          </div>
        </div>

        {/* Quick Section Nav Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-2 border-t border-slate-100 custom-scrollbar">
          {navTabs.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSection(tab.id);
                  if (tab.id !== 'all') {
                    const el = document.getElementById(`section-${tab.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/60'
                }`}
              >
                <span>{language === 'VN' ? tab.labelVN : tab.labelEN}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={activeSection === 'all' ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6 items-start' : 'space-y-6'}>
        <div className="space-y-6 min-w-0">
      {/* ========================================================
          TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)
         ======================================================== */}
      {(activeSection === 'all' || activeSection === 'overview') && (
        <section id="section-overview" className="space-y-4 scroll-mt-6">
          {/* 3D Model Multi-Angle Viewer */}
          <Building3DViewer 
            language={language}
            projectName={currentDisplayName}
            logoUrl={LOGO_URL}
          />


          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {language === 'VN' ? 'Tổng quan dự án' : 'Project Overview'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'VN' ? 'Mô hình không gian 3D, thông tin quy hoạch tổng thể & ranh giới dự án' : '3D building visual, overall master plan, investor and location'}
              </p>
            </div>
          </div>

          {/* Detailed Project Metadata Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-base">
                {language === 'VN' ? 'Thông Tin Chi Tiết Dự Án' : 'Project Master Details'}
              </h3>
            </div>

            <div className="space-y-4 text-sm">
              <OverviewItem 
                label={t('investor')} 
                value={currentInvestor} 
                isUppercase 
                highlight 
              />
              <OverviewItem 
                label={t('project_name')} 
                value={currentDisplayName} 
                subValue={PROJECT_SUBTITLE[language]} 
              />
              <OverviewItem 
                label={t('location')} 
                value={currentLocation} 
                icon={<MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0"/>} 
              />
              
              {/* Four Boundary Streets Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border-b border-slate-100 pb-3">
                <span className="text-slate-500 text-sm font-medium flex items-start gap-2 col-span-1">
                  <Compass className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  {language === 'VN' ? '4 Mặt tiền tiếp giáp' : 'Surrounding Streets'}
                </span>
                <div className="col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{language === 'VN' ? 'Phía Bắc' : 'North'}</span>
                    <span className="text-xs font-bold text-slate-800">Đ. Russell</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{language === 'VN' ? 'Phía Nam' : 'South'}</span>
                    <span className="text-xs font-bold text-slate-800">Đ. Morison</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{language === 'VN' ? 'Phía Đông' : 'East'}</span>
                    <span className="text-xs font-bold text-slate-800">Đ. Nguyễn Lương Bằng</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{language === 'VN' ? 'Phía Tây' : 'West'}</span>
                    <span className="text-xs font-bold text-slate-800">Đ. Nguyễn Khắc Viện</span>
                  </div>
                </div>
              </div>

              {/* Construction Scope Description */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                <span className="text-slate-500 text-sm font-medium flex items-start gap-2 col-span-1">
                  <Layers className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  {language === 'VN' ? 'Phạm vi gói thầu' : 'Contract Scope'}
                </span>
                <div className="col-span-2 text-xs text-slate-700 leading-relaxed bg-blue-50/50 border border-blue-100 p-3 rounded-xl">
                  {language === 'VN'
                    ? 'Thi công toàn bộ phần Cọc khoan nhồi D800/D1000, Tường vây Barrette Diaphragm Wall dày 800mm, Hệ Kingpost & Shoring thép giằng chống vách hố đào, và 02 tầng hầm (Basement B1 & B2).'
                    : 'Execution of Bored Piles D800/D1000, 800mm thick Diaphragm Wall (D-Wall), Kingpost & Steel Strutting Shoring System, and 02 Basements (B1 & B2).'}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          THÔNG SỐ KỸ THUẬT (TECHNICAL SPECIFICATIONS)
         ======================================================== */}
      {(activeSection === 'all' || activeSection === 'specs') && (
        <section id="section-specs" className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {language === 'VN' ? 'Thông số kỹ thuật' : 'Technical Specifications'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'VN' ? 'Chỉ tiêu kiến trúc, quy hoạch & thông số kết cấu công trình đã thẩm định' : 'Appraised architectural, structural and planning parameters'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-amber-600"/> {t('specifications')}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {language === 'VN' ? 'Căn cứ: 17542/SXD-QLXDCT Thông báo KQ Thẩm định BCNCKT' : 'Ref: 17542/SXD-QLXDCT Feasibility Study Appraisal Report'}
                </p>
              </div>
            </div>

            {/* Quick Executive KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  {language === 'VN' ? 'Chiều cao' : 'Building Height'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-slate-900">{PROJECT_SPECS.height}</span>
                  <span className="text-[11px] text-slate-400">đỉnh mái</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  {language === 'VN' ? 'Chiều sâu' : 'Building Depth'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-slate-900">{PROJECT_SPECS.depth}</span>
                  <span className="text-[11px] text-slate-400">đáy hầm 2</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  {language === 'VN' ? 'Mật độ xây dựng' : 'Building Density'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-emerald-600">{PROJECT_SPECS.buildingDensity}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  {language === 'VN' ? 'Hệ số SD đất' : 'Floor Area Ratio'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-blue-600">{PROJECT_SPECS.floorAreaRatio}</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                  {language === 'VN' ? 'Diện tích đất' : 'Site Area'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-slate-900">{PROJECT_SPECS.landArea}</span>
                </div>
              </div>

              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide block">
                  {language === 'VN' ? 'Tổng GFA (có hầm)' : 'Total GFA'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-black text-blue-700">{PROJECT_SPECS.areaTotalWithBasement}</span>
                </div>
              </div>
            </div>

            {/* Detailed Spec List */}
            <ul className="space-y-3.5 divide-y divide-slate-100">
              <SpecItem label={t('spec_depth')} value={PROJECT_SPECS.depth} icon={<ArrowUp className="rotate-180 w-4 h-4 text-slate-400"/>} />
              <SpecItem label={t('spec_height')} value={PROJECT_SPECS.height} icon={<ArrowUp className="w-4 h-4 text-slate-400"/>} />
              <SpecItem label={t('spec_land_area')} value={PROJECT_SPECS.landArea} icon={<Ruler className="w-4 h-4 text-slate-400"/>} />
              <SpecItem 
                label={language === 'VN' ? 'Diện tích đất phù hợp quy hoạch' : 'Conforming Land Area'} 
                value={PROJECT_SPECS.landAreaPlanning} 
                icon={<Compass className="w-4 h-4 text-slate-400"/>} 
              />
              <SpecItem 
                label={language === 'VN' ? 'Đất vạt góc giao lộ' : 'Corner-cut Area'} 
                value={PROJECT_SPECS.cornerCutArea} 
                icon={<Compass className="w-4 h-4 text-amber-500"/>} 
              />
              <SpecItem 
                label={language === 'VN' ? 'Đất xây dựng công trình' : 'Building Footprint'} 
                value={PROJECT_SPECS.buildingFootprint} 
                icon={<Building className="w-4 h-4 text-slate-400"/>} 
              />
              <SpecItem 
                label={language === 'VN' ? 'Đất trồng cây xanh' : 'Greenery Land Area'} 
                value={PROJECT_SPECS.greeneryArea} 
                icon={<TreePine className="w-4 h-4 text-emerald-500"/>} 
              />
              <SpecItem 
                label={language === 'VN' ? 'Đất đường nội bộ, sân bãi' : 'Internal Roads & Yards'} 
                value={PROJECT_SPECS.internalRoadArea} 
                icon={<Car className="w-4 h-4 text-slate-400"/>} 
              />
              <SpecItem label={t('spec_density')} value={PROJECT_SPECS.buildingDensity} icon={<Building className="w-4 h-4 text-slate-400"/>} />
              <SpecItem label={t('spec_ratio')} value={PROJECT_SPECS.floorAreaRatio} icon={<Layers className="w-4 h-4 text-slate-400"/>} />
              <SpecItem label={t('spec_gfa_1')} value={PROJECT_SPECS.areaGround} icon={<Ruler className="w-4 h-4 text-slate-400"/>} />
              <SpecItem 
                label={t('spec_gfa_no_base')} 
                value={PROJECT_SPECS.areaTotalNoBasement} 
                icon={<Layers className="w-4 h-4 text-slate-400"/>} 
              />
              <SpecItem 
                label={t('spec_gfa_base')} 
                value={PROJECT_SPECS.areaTotalWithBasement} 
                icon={<Layers className="w-4 h-4 text-blue-600"/>} 
              />
              <SpecItem 
                label={t('spec_floors')} 
                value={PROJECT_SPECS.floors[language]} 
                icon={<Building2 className="w-4 h-4 text-slate-400"/>} 
              />
            </ul>
          </div>
        </section>
      )}

        </div>
        <div className="space-y-6 min-w-0">
      {/* ========================================================
          AN TOÀN LAO ĐỘNG (LABOR SAFETY - HSE)
         ======================================================== */}
      {activeSection === 'all' && (
          <>
            <section id="section-safety" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-center text-white shadow-lg">
              <ShieldCheck className="pointer-events-none absolute -right-3 -top-4 h-32 w-32 text-white/10" />
              <h2 className="relative border-b border-white/20 pb-3 text-lg font-bold uppercase">{language === 'VN' ? 'An toàn lao động' : 'Workplace Safety'}</h2>
              <div className="relative mt-4 text-5xl font-black tracking-tight">{safetyHours.toLocaleString()}</div>
              <p className="mt-2 text-sm font-semibold text-emerald-100">{t('safety_hours')}</p>
              <span className="mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">{t('safety_since')}</span>
            </section>
            <section id="section-milestones" className="space-y-3">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">{language === 'VN' ? 'Mốc tiến độ' : 'Key Project Milestones'}</h2>
              <MilestonesCard language={language} />
            </section>
          </>
        )}
        {activeSection === 'safety' && (
        <section id="section-safety" className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {language === 'VN' ? 'An toàn lao động' : 'Labor Safety (HSE)'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'VN' ? 'Giờ làm việc an toàn, chỉ số không tai nạn LTI & quy chuẩn an toàn công trường' : 'Safe working hours, zero LTI record, PPE compliance and HSE protocols'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Safe Working Hours Hero Banner */}
            <div className="lg:col-span-1 bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-between relative overflow-hidden">
              <ShieldCheck className="w-40 h-40 absolute -right-8 -top-8 text-white/10 pointer-events-none" />
              <div>
                <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-wider mb-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-200" />
                  <span>{t('safety')}</span>
                </div>
                <div className="text-5xl font-black font-mono tracking-tight text-white mb-2">
                  {safetyHours.toLocaleString()}
                </div>
                <p className="text-emerald-100 text-sm font-semibold">
                  {t('safety_hours')}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-white/20 space-y-1">
                <span className="text-xs text-emerald-200 block">
                  {t('safety_since')} (14/07/2025)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/20 text-white">
                  <Check className="w-3.5 h-3.5 text-emerald-300" /> 100% An toàn không gián đoạn
                </span>
              </div>
            </div>

            {/* 4 Core HSE KPI Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Zero Lost Time Incidents */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-start gap-3.5">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-emerald-600">0</span>
                    <span className="text-xs font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {language === 'VN' ? 'Tuyệt đối an toàn' : 'Zero Incidents'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mt-1">
                    {language === 'VN' ? 'Tai nạn mất thời gian (LTI)' : 'Lost Time Incidents (LTI)'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {language === 'VN' ? 'Không xảy ra bất kỳ tai nạn hay sự cố gián đoạn thi công nào.' : 'Zero lost-time injury or fatal incidents on site.'}
                  </p>
                </div>
              </div>

              {/* PPE Compliance */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-start gap-3.5">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                  <HardHat className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-blue-600">100%</span>
                    <span className="text-xs font-bold uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {language === 'VN' ? 'Bắt buộc' : 'Strict'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mt-1">
                    {language === 'VN' ? 'Tuân thủ Trang bị BHLĐ (PPE)' : 'PPE Compliance'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {language === 'VN' ? '100% công nhân và kỹ sư mang nón, áo phản quang, giày mũi sắt, đai an toàn.' : 'Mandatory helmet, safety shoes, reflective vest and harness on site.'}
                  </p>
                </div>
              </div>

              {/* Daily Toolbox Meeting */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-start gap-3.5">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-amber-600">100%</span>
                    <span className="text-xs font-bold uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                      {language === 'VN' ? 'Mỗi sáng' : 'Daily'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mt-1">
                    {language === 'VN' ? 'Họp An Toàn Đầu Giờ (Toolbox Talk)' : 'Daily Toolbox Meeting'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {language === 'VN' ? 'Phổ biến mối nguy cơ và biện pháp phòng ngừa 15 phút trước mỗi ca làm việc.' : '15-min daily hazard identification briefing conducted every morning.'}
                  </p>
                </div>
              </div>

              {/* Equipment Certification */}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-start gap-3.5">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-black text-purple-600">100%</span>
                    <span className="text-xs font-bold uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                      {language === 'VN' ? 'Hợp chuẩn' : 'Certified'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 mt-1">
                    {language === 'VN' ? 'Kiểm định thiết bị & máy móc' : 'Equipment Safety Certification'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    {language === 'VN' ? 'Cẩu bánh xích, giàn khoan, máy đào, máy hàn đều có hồ sơ kiểm định còn hiệu lực.' : 'All cranes, drilling rigs, excavators, and machinery inspected and certified.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Basement Safety & Emergency Protocols */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {language === 'VN' ? 'Quy chuẩn an toàn đặc thù thi công tầng hầm & hố đào sâu' : 'Specialized Basement Deep Excavation HSE Protocols'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">
                  1. {language === 'VN' ? 'Đo khí độc & Thông gió hầm' : 'Gas Detection & Ventilation'}
                </span>
                <span className="text-slate-600 text-[11px] leading-relaxed block">
                  {language === 'VN' ? 'Kiểm tra nồng độ khí O₂, CO, H₂S định kỳ trước khi công nhân xuống hố đào và vận hành quạt gió liên tục.' : 'Routine monitoring of O₂, CO, H₂S before pit entry and continuous exhaust fan operation.'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">
                  2. {language === 'VN' ? 'Rào chắn & Chiếu sáng an toàn' : 'Barricades & Safety Lighting'}
                </span>
                <span className="text-slate-600 text-[11px] leading-relaxed block">
                  {language === 'VN' ? 'Lan can bảo vệ cao 1.1m mép hố đào, lưới chắn vật rơi, đèn chiếu sáng chống ẩm 110V/220V an toàn.' : '1.1m edge barricades, debris catch nets, and waterproof 110V/220V low-voltage work lighting.'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">
                  3. {language === 'VN' ? 'Quan trắc cảnh báo sớm 24/7' : '24/7 Monitoring Early Warning'}
                </span>
                <span className="text-slate-600 text-[11px] leading-relaxed block">
                  {language === 'VN' ? 'Đo chuyển vị tường vây, lún công trình lân cận và ứng suất thanh giằng shoring theo chu kỳ nghiêm ngặt.' : 'Strict cycle measurements for D-Wall inclinometer, adjacent settlement, and strut strain gauges.'}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================
          MỐC TIẾN ĐỘ (KEY MILESTONES)
         ======================================================== */}
      {activeSection === 'milestones' && (
        <section id="section-milestones" className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {language === 'VN' ? 'Mốc tiến độ' : 'Key Project Milestones'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'VN' ? 'Cập nhật trực tiếp từ Google Sheet Construction (B35:B45) & Timeline các mốc trọng yếu' : 'Live synced milestones from Google Sheet Construction tab (B35:B45) and project timeline'}
              </p>
            </div>
          </div>

          {/* Prominent Live Google Sheet Milestone Spotlight Banner */}
          <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md border border-rose-800/40 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                  <Flag className="w-6 h-6 text-rose-400 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-rose-500/30 text-rose-300 border border-rose-400/40">
                      🚩 {language === 'VN' ? 'Mốc Tiến Độ Trọng Yếu Sắp Tới' : 'Upcoming Critical Milestones'}
                    </span>
                    <span className="text-[11px] text-slate-300 font-mono">
                      (Google Sheet: Tab Construction B35:B45)
                    </span>
                  </div>

                  {/* Render items from B35:B45 */}
                  <div className="mt-2.5 space-y-1.5">
                    {liveSheetMilestones.length > 0 ? (
                      liveSheetMilestones.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          <span className="text-amber-300 font-mono">{m.date || '---'}</span>
                          <span className="text-slate-200">: {m.description || m.rawText}</span>
                        </div>
                      ))
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          <span className="text-amber-300 font-mono">01/07/2026</span>
                          <span className="text-slate-200">: Hoàn thành tường vây và cọc đại trà</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                          <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          <span className="text-amber-300 font-mono">30/12/2026</span>
                          <span className="text-slate-200">: Nghiệm thu phần móng</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                <button
                  onClick={loadSheetMilestones}
                  disabled={isLoadingMilestones}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMilestones ? 'animate-spin' : ''}`} />
                  <span>{language === 'VN' ? 'Đồng bộ lại' : 'Sync Milestones'}</span>
                </button>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit#gid=0`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <span>Google Sheet</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Interactive Milestones Timeline Card Component */}
          <MilestonesCard language={language} />
        </section>
      )}

        </div>
      </div>

      {/* ========================================================
          BAN QUẢN LÝ DỰ ÁN (PROJECT MANAGEMENT BOARD)
         ======================================================== */}
      {(activeSection === 'all' || activeSection === 'management') && (
        <section id="section-management" className="space-y-4 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {language === 'VN' ? 'Ban quản lý dự án' : 'Project Management Board'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'VN' ? 'Sơ đồ tổ chức, các đơn vị tham gia & danh bạ nhân sự chủ chốt' : 'Organizational structure, project stakeholders and key leadership directory'}
              </p>
            </div>
          </div>

          {/* Key Stakeholders High-Level Directory Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
              <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {language === 'VN' ? 'Chủ Đầu Tư' : 'Client / Developer'}
              </span>
              <h4 className="text-xs font-bold text-slate-900 mt-2">
                CÔNG TY TNHH PHÁT TRIỂN PHÚ MỸ HƯNG
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                {language === 'VN' ? 'Chủ quản dự án, phê duyệt kế hoạch & ngân sách' : 'Project Sponsor, approvals and master oversight'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
              <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {language === 'VN' ? 'Tư Vấn Giám Sát' : 'Supervision Consultant'}
              </span>
              <h4 className="text-xs font-bold text-slate-900 mt-2">
                BAN TƯ VẤN GIÁM SÁT & QUẢN LÝ DỰ ÁN
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                {language === 'VN' ? 'Giám sát chất lượng kỹ thuật, an toàn & tiến độ' : 'Quality assurance, HSE oversight and work inspections'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
              <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {language === 'VN' ? 'Tổng Thầu Thi Công' : 'Main Contractor'}
              </span>
              <h4 className="text-xs font-bold text-slate-900 mt-2">
                BAN CHỈ HUY TRƯỞNG CÔNG TRƯỜNG
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                {language === 'VN' ? 'Trực tiếp tổ chức thi công, nhân lực, thiết bị' : 'Site execution, construction workforce and plant mobilization'}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200">
              <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {language === 'VN' ? 'Tư Vấn Thiết Kế' : 'Design Consultant'}
              </span>
              <h4 className="text-xs font-bold text-slate-900 mt-2">
                ĐƠN VỊ THIẾT KẾ KIẾN TRÚC & KẾT CẤU
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                {language === 'VN' ? 'Xử lý kỹ thuật thiết kế, shopdrawing & RFI' : 'Engineering design, structural shopdrawing and RFI clarification'}
              </p>
            </div>
          </div>

          {/* Full Interactive Management Team Directory */}
          <ManagementTeamCard language={language} isAdmin={isAdmin} />
        </section>
      )}

      {/* Google Sheets Configuration & Setup Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {language === 'VN' ? 'Cấu hình đồng bộ Google Sheet' : 'Google Sheets Sync Configuration'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {language === 'VN' ? 'Cập nhật Chủ đầu tư, Tên Dự Án, Địa Điểm tự động' : 'Automatically sync Investor, Project Name, and Location'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {configFeedback && (
                <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                  configFeedback.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : configFeedback.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}>
                  {configFeedback.type === 'success' ? (
                    <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 text-xs leading-relaxed font-medium">
                    {configFeedback.message}
                  </div>
                </div>
              )}

              {/* Form Input */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'VN' ? 'Link hoặc ID Google Sheet:' : 'Google Sheet URL or ID:'}
                  </label>
                  <input
                    type="text"
                    value={sheetConfig.sheetUrlOrId}
                    onChange={(e) => setSheetConfig({ ...sheetConfig, sheetUrlOrId: e.target.value })}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'VN' ? 'Tên Tab (Sheet Name):' : 'Tab Name:'}
                  </label>
                  <input
                    type="text"
                    value={sheetConfig.tabName}
                    onChange={(e) => setSheetConfig({ ...sheetConfig, tabName: e.target.value })}
                    placeholder="GeneralInfo"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Gợi ý: <code className="text-blue-600 font-mono">GeneralInfo</code>, <code className="text-blue-600 font-mono">ThongTinChung</code> hoặc <code className="text-blue-600 font-mono">Overview</code>
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetDefault}
                className="text-xs text-slate-600 hover:text-rose-600 font-medium px-3 py-2 rounded-lg transition-colors hover:bg-rose-50"
              >
                {language === 'VN' ? 'Khôi phục mặc định' : 'Reset to Default'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 font-medium hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {language === 'VN' ? 'Đóng' : 'Close'}
                </button>

                <button
                  type="button"
                  disabled={isLoadingSheet}
                  onClick={handleSaveAndTestConfig}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                  {language === 'VN' ? 'Kiểm tra & Áp dụng' : 'Test & Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SpecItem = ({ label, value, icon }: any) => (
  <div className="flex justify-between items-start border-b border-slate-100 pb-2 last:border-0 hover:bg-slate-50 px-2 rounded transition-colors">
    <span className="text-slate-500 flex items-center gap-2 text-sm">{icon} {label}</span>
    <span className="font-medium text-slate-900 text-right text-sm max-w-[50%]">{value}</span>
  </div>
);

const OverviewItem = ({ label, value, subValue, icon, isUppercase, highlight }: any) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 border-b border-slate-100 pb-3 last:border-0">
    <span className="text-slate-500 text-sm font-medium flex items-start gap-2 col-span-1">{label}</span>
    <div className={`col-span-2 text-slate-900 flex items-start gap-2 ${highlight ? 'font-bold' : 'font-medium'} ${isUppercase ? 'uppercase' : ''}`}>
      {icon && <span className="mt-0.5">{icon}</span>}
      <div>
        <span>{value}</span>
        {subValue && (
          <span className="block text-xs font-bold text-blue-700 uppercase tracking-wide mt-0.5">
            {subValue}
          </span>
        )}
      </div>
    </div>
  </div>
);

export default GeneralInfo;
