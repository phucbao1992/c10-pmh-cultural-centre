import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, RefreshCw, TrendingUp, AlertTriangle, FileText, 
  ExternalLink, Users, AlertCircle, FileCheck, Clock, CheckCircle2,
  ChevronRight, Layers, ShieldAlert, ArrowDownRight, UserCheck, HardHat
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList 
} from 'recharts';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { ScheduleData, DelayedTaskItem } from '../services/sheetsService';
import { fetchLatestWeeklyReport, fetchRecentDailyReports, LATEST_WEEKLY_REPORT_FALLBACK_URL, WEEKLY_REPORT_FOLDER_ID } from '../services/driveService';

interface ScheduleProps {
  data: ScheduleData | null;
  loading: boolean;
  error: boolean;
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
}

const CustomXAxisTick = ({ x, y, payload }: any) => {
  if (!payload || !payload.value) return null;
  const [date, week] = payload.value.split('|');
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#475569" fontSize={12} fontWeight="bold">
        {date}
      </text>
      <text x={0} y={0} dy={32} textAnchor="middle" fill="#64748b" fontSize={11}>
        {week}
      </text>
    </g>
  );
};

const CustomTooltip = ({ active, payload, label, language }: any) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;
  if (active && payload && payload.length) {
    const dataItem = payload[0].payload;
    const [date, week] = (label || '').split('|');
    return (
      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl text-xs space-y-1.5 border border-slate-800 min-w-[200px]">
        <p className="font-bold text-amber-400 border-b border-slate-800 pb-1.5 flex items-center justify-between">
          <span>{week || label}</span>
          <span className="text-slate-400 font-mono text-[10px]">{date}</span>
        </p>
        <div className="flex justify-between items-center text-slate-300 pt-1">
          <span>{t('plan_progress')}:</span>
          <span className="font-extrabold text-blue-400">{dataItem.plan !== null ? `${dataItem.plan}%` : '---'}</span>
        </div>
        <div className="flex justify-between items-center text-slate-300">
          <span>{t('actual_progress')}:</span>
          <span className="font-extrabold text-rose-400">{dataItem.actual !== null ? `${dataItem.actual}%` : '---'}</span>
        </div>
        {dataItem.forecast !== null && (
          <div className="flex justify-between items-center text-slate-300">
            <span>{t('forecast')}:</span>
            <span className="font-extrabold text-emerald-400">{dataItem.forecast}%</span>
          </div>
        )}
        {dataItem.delayedDays !== undefined && dataItem.delayedDays !== null && (
          <div className="flex justify-between items-center pt-1.5 border-t border-slate-800 text-slate-300 mt-1">
            <span className="flex items-center gap-1 font-semibold">
              <Clock className="w-3 h-3 text-rose-400" /> {t('days_delayed')}:
            </span>
            <span className={`font-black px-1.5 py-0.5 rounded ${dataItem.delayedDays > 0 ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-emerald-950 text-emerald-400 border border-emerald-800'}`}>
              {dataItem.delayedDays} {t('days')}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const Schedule: React.FC<ScheduleProps> = ({ data, loading, error, language, onProtectedAction }) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;
  const defaultFolderLink = `https://drive.google.com/drive/folders/${WEEKLY_REPORT_FOLDER_ID}`;
  const DEFECT_LIST_URL = "https://docs.google.com/spreadsheets/d/1FbTT_F03Od1R85TjyaB6qLWyqEm6SOoqLRZATjO26EM/edit?gid=0#gid=0";
  const MEP_FOLDER_LINK = "https://drive.google.com/drive/folders/1QLNb7R1dWFaf2QHdiEmtzG8tFWzMEdCs";

  const [reportLink, setReportLink] = useState<string>(LATEST_WEEKLY_REPORT_FALLBACK_URL);
  const [isFetchingReport, setIsFetchingReport] = useState(false);
  const [activeScheduleSection, setActiveScheduleSection] = useState<'all' | 'progress' | 'delayed' | 'manpower' | 'minutes'>('all');

  // States for meeting minutes Drive files
  const [weeklyFiles, setWeeklyFiles] = useState<any[]>([]);
  const [mepFiles, setMepFiles] = useState<any[]>([]);
  const [selectedWeeklyId, setSelectedWeeklyId] = useState<string>('');
  const [selectedMepId, setSelectedMepId] = useState<string>('');
  const [loadingWeekly, setLoadingWeekly] = useState<boolean>(true);
  const [loadingMep, setLoadingMep] = useState<boolean>(true);

  useEffect(() => {
    const getReportLink = async () => {
      setIsFetchingReport(true);
      const link = await fetchLatestWeeklyReport();
      if (link) {
        setReportLink(link);
      }
      setIsFetchingReport(false);
    };
    getReportLink();

    const loadWeeklyFiles = async () => {
      try {
        setLoadingWeekly(true);
        const files = await fetchRecentDailyReports('1t5YjAEDdfx7qQmdHXX7IxdV4-REBCJ3G');
        setWeeklyFiles(files || []);
        if (files && files.length > 0) {
          setSelectedWeeklyId(files[0].id);
        }
      } catch (err) {
        console.error("Error loading weekly meeting files:", err);
      } finally {
        setLoadingWeekly(false);
      }
    };

    const loadMepFiles = async () => {
      try {
        setLoadingMep(true);
        const files = await fetchRecentDailyReports('1QLNb7R1dWFaf2QHdiEmtzG8tFWzMEdCs');
        setMepFiles(files || []);
        if (files && files.length > 0) {
          setSelectedMepId(files[0].id);
        }
      } catch (err) {
        console.error("Error loading MEP meeting files:", err);
      } finally {
        setLoadingMep(false);
      }
    };

    loadWeeklyFiles();
    loadMepFiles();
  }, []);

  // Total average manpower
  const totalAverageManpower = useMemo(() => {
    if (!data?.manpowerAvg) return 0;
    return data.manpowerAvg.reduce((sum, item) => sum + Math.round(item.count || 0), 0);
  }, [data]);

  const rawChartData = useMemo(() => {
    return data?.weeklyProgress?.map(item => ({
      ...item,
      xAxisLabel: `${item.date}|${item.week}`
    })) || [];
  }, [data]);

  // Calculate Forecast line using Linear Regression
  const parseDateStr = (str: string | undefined | null) => {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3) {
      const year = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
      return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else if (parts.length === 2) {
      return new Date(new Date().getFullYear(), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    return null;
  };

  const reportDate = parseDateStr(data?.date) || new Date();
  let currentWeekIdx = -1;
  let minDiff = Infinity;
  for (let i = 0; i < rawChartData.length; i++) {
    const itemDate = parseDateStr(rawChartData[i].date);
    if (itemDate) {
      const diff = Math.abs(reportDate.getTime() - itemDate.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        currentWeekIdx = i;
      }
    }
  }

  if (currentWeekIdx === -1 && rawChartData.length > 0) {
    currentWeekIdx = 0;
  }

  // Compute delayed days count corresponding to column I of the week displayed on the chart
  const currentWeekDelayedDays = useMemo(() => {
    if (!rawChartData || rawChartData.length === 0) return null;
    if (currentWeekIdx >= 0 && currentWeekIdx < rawChartData.length) {
      const val = rawChartData[currentWeekIdx].delayedDays;
      if (val !== undefined && val !== null) {
        return val;
      }
      for (let i = currentWeekIdx; i >= 0; i--) {
        const v = rawChartData[i].delayedDays;
        if (v !== undefined && v !== null) {
          return v;
        }
      }
    }
    for (let i = rawChartData.length - 1; i >= 0; i--) {
      const v = rawChartData[i].delayedDays;
      if (v !== undefined && v !== null) {
        return v;
      }
    }
    return null;
  }, [rawChartData, currentWeekIdx]);

  if (loading && !data) {
    return (
      <div className="p-8 flex flex-col justify-center items-center h-64 gap-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Đang đồng bộ dữ liệu Báo cáo tuần...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 text-center text-rose-500 font-medium">
        {t('no_data')}
      </div>
    );
  }

  const actualPoints = rawChartData
    .map((item, index) => ({ x: index, y: item.actual }))
    .slice(0, currentWeekIdx + 1)
    .filter(p => p.y !== null && p.y !== undefined) as { x: number, y: number }[];

  const n = actualPoints.length;
  const chartDataWithForecast = rawChartData.map(item => ({ ...item, forecast: null as number | null }));

  if (n >= 1) {
    const lastActualPoint = actualPoints[n - 1];
    const lastActualIdx = lastActualPoint.x;
    const lastActualValue = lastActualPoint.y;

    let slope = 0;
    if (n >= 2) {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (const p of actualPoints) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumX2 += p.x * p.x;
      }
      const denom = (n * sumX2 - sumX * sumX);
      slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
    }

    if (slope <= 0) {
      slope = lastActualIdx > 0 ? lastActualValue / lastActualIdx : 0.5;
    }

    for (let i = lastActualIdx; i < chartDataWithForecast.length; i++) {
      const forecastVal = lastActualValue + slope * (i - lastActualIdx);
      chartDataWithForecast[i].forecast = Math.max(0, Math.min(100, Number(forecastVal.toFixed(2))));
    }
  }

  let windowedChartData = chartDataWithForecast;
  if (chartDataWithForecast.length > 0) {
    let tempChartData = [...chartDataWithForecast];
    let adjustedCurrentWeekIdx = currentWeekIdx;

    const neededEndIndex = currentWeekIdx + 5;
    while (tempChartData.length <= neededEndIndex) {
      const lastItem = tempChartData[tempChartData.length - 1];
      let nextWeek = '';
      let nextDate = '';
      if (lastItem) {
        const weekNumMatch = lastItem.week.match(/\d+/);
        if (weekNumMatch) {
          const num = parseInt(weekNumMatch[0], 10);
          nextWeek = lastItem.week.replace(/\d+/, (num + 1).toString());
        } else {
          nextWeek = lastItem.week + ' +';
        }
        
        const dateParts = lastItem.date.split('/');
        if (dateParts.length >= 2) {
          const day = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const year = dateParts.length === 3 ? parseInt(dateParts[2], 10) : new Date().getFullYear();
          const d = new Date(year, month, day);
          d.setDate(d.getDate() + 7);
          const nextDayStr = d.getDate().toString().padStart(2, '0');
          const nextMonthStr = (d.getMonth() + 1).toString().padStart(2, '0');
          nextDate = dateParts.length === 3 ? `${nextDayStr}/${nextMonthStr}/${d.getFullYear()}` : `${nextDayStr}/${nextMonthStr}`;
        } else {
          nextDate = lastItem.date;
        }
      } else {
        nextWeek = 'W1';
        nextDate = '01/01';
      }

      tempChartData.push({
        week: nextWeek,
        date: nextDate,
        plan: null,
        actual: null,
        forecast: null,
        delayedDays: null,
        xAxisLabel: `${nextDate}|${nextWeek}`
      } as any);
    }

    const prependedItems: any[] = [];
    while (adjustedCurrentWeekIdx - 5 < 0) {
      const firstItem = prependedItems[0] || tempChartData[0];
      let prevWeek = '';
      let prevDate = '';
      if (firstItem) {
        const weekNumMatch = firstItem.week.match(/\d+/);
        if (weekNumMatch) {
          const num = parseInt(weekNumMatch[0], 10);
          prevWeek = firstItem.week.replace(/\d+/, Math.max(1, num - 1).toString());
        } else {
          prevWeek = firstItem.week + ' -';
        }
        
        const dateParts = firstItem.date.split('/');
        if (dateParts.length >= 2) {
          const day = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const year = dateParts.length === 3 ? parseInt(dateParts[2], 10) : new Date().getFullYear();
          const d = new Date(year, month, day);
          d.setDate(d.getDate() - 7);
          const prevDayStr = d.getDate().toString().padStart(2, '0');
          const prevMonthStr = (d.getMonth() + 1).toString().padStart(2, '0');
          prevDate = dateParts.length === 3 ? `${prevDayStr}/${prevMonthStr}/${d.getFullYear()}` : `${prevDayStr}/${prevMonthStr}`;
        } else {
          prevDate = firstItem.date;
        }
      } else {
        prevWeek = 'W0';
        prevDate = '01/01';
      }

      prependedItems.unshift({
        week: prevWeek,
        date: prevDate,
        plan: null,
        actual: null,
        forecast: null,
        delayedDays: null,
        xAxisLabel: `${prevDate}|${prevWeek}`
      });
      adjustedCurrentWeekIdx++;
    }

    const finalChartData = [...prependedItems, ...tempChartData];
    windowedChartData = finalChartData.slice(adjustedCurrentWeekIdx - 5, adjustedCurrentWeekIdx + 6);
  } else {
    windowedChartData = [];
  }

  const translateTaskDesc = (desc: string) => {
    if (language !== 'EN') return desc;
    return desc
      .replace(/Hệ Shoring lớp 1/gi, 'Shoring System Layer 1')
      .replace(/Đào đất lớp 2/gi, 'Soil Excavation Layer 2')
      .replace(/Kế hoạch/gi, 'Plan')
      .replace(/Thực tế/gi, 'Actual');
  };

  const translateRole = (role: string) => {
    if (language !== 'EN') return role;
    const roleMap: Record<string, string> = {
      'Quản lý dự án': 'Project Manager',
      'Chỉ huy trưởng': 'Site Manager / Project Director',
      'QA/QC/QS/ Shop drawing/ Thư ký': 'QA/QC/QS / Shop Drawing / Secretary',
      'Giám sát thi công': 'Construction Supervisor',
      'An toàn': 'HSE / Safety Engineer',
      'Công nhân thi công': 'Construction Workers'
    };
    return roleMap[role] || role;
  };

  const delayedTasksList = data?.delayedTasks || [];
  const submittals3PlusList = data?.submittals3Plus || [];
  const manpowerAvgList = data?.manpowerAvg || [];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 rounded-xl shadow-md text-white">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{t('schedule')}</h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-extrabold">
                {t('weekly_progress')}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {t('weekly_report_summary_desc')}
            </p>
          </div>
        </div>

        </div>
{/* Quick Schedule Sub-Navigation Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-2 overflow-x-auto custom-scrollbar">
        {[
          { id: 'all', num: '★', labelVN: 'Tất cả mục', labelEN: 'All Sections' },
          { id: 'progress', num: '1', labelVN: 'Tiến độ tổng thể & Dự báo trễ hạn', labelEN: 'Overall Progress & Delay' },
          { id: 'delayed', num: '2', labelVN: 'Công việc chậm trễ & Hồ sơ trình 3+', labelEN: 'Delayed Tasks & Submittals 3+' },
          { id: 'manpower', num: '3', labelVN: 'Nhân lực thi công trung bình', labelEN: 'Average Manpower' },
          { id: 'minutes', num: '4', labelVN: 'Biên bản họp & Báo cáo Drive', labelEN: 'Meeting Minutes & Drive' },
        ].map((item) => {
          const isActive = activeScheduleSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveScheduleSection(item.id as any);
                if (item.id !== 'all') {
                  const el = document.getElementById(`sched-section-${item.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                  : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/60'
              }`}
            >
              <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {item.num}
              </span>
              <span>{language === 'EN' ? item.labelEN : item.labelVN}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================
          1/ TIẾN ĐỘ TỔNG THỂ & DỰ BÁO TRỄ HẠN (PROGRESS & DELAY)
         ======================================================== */}
      {(activeScheduleSection === 'all' || activeScheduleSection === 'progress') && (
        <div id="sched-section-progress" className="space-y-6 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                1
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {language === 'EN' ? 'Overall Progress & Delay Forecast' : 'Tiến độ tổng thể & Dự báo trễ hạn'}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === 'EN' ? 'Weekly execution progress, actual vs plan variance and trend forecast' : 'Theo dõi tiến độ tuần, số ngày trễ hạn và biểu đồ đường cong lũy kế'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
              {language === 'EN' ? 'Section 1 / 4' : 'Mục 1 / 4'}
            </span>
          </div>

          {/* TOP KPI STATS SUMMARY GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Số ngày đang trễ */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-rose-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('days_delayed')}</p>
            <p className={`text-3xl font-black tracking-tight mt-1 ${
              currentWeekDelayedDays !== null && currentWeekDelayedDays > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {currentWeekDelayedDays !== null ? `${currentWeekDelayedDays} ${t('days')}` : '---'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{t('latest_weekly_evaluation')}</p>
          </div>
          <div className={`p-3 rounded-xl border group-hover:scale-105 transition-transform ${
            currentWeekDelayedDays !== null && currentWeekDelayedDays > 0 
              ? 'bg-rose-50 text-rose-600 border-rose-100' 
              : 'bg-emerald-50 text-emerald-600 border-emerald-100'
          }`}>
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Công tác lệch kế hoạch */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-amber-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('off_plan_tasks')}</p>
            <p className="text-3xl font-black text-amber-600 tracking-tight mt-1">{delayedTasksList.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('need_acceleration')}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Hồ sơ trình lần 3 trở lên */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-indigo-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('submittals_3plus')}</p>
            <p className="text-3xl font-black text-indigo-600 tracking-tight mt-1">{submittals3PlusList.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('need_review_approval')}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Nhân lực trung bình */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-blue-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('avg_manpower_total')}</p>
            <p className="text-3xl font-black text-blue-600 tracking-tight mt-1">{totalAverageManpower} {t('persons')}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('avg_daily_mobilization')}</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 group-hover:scale-105 transition-transform">
            <Users className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* WEEKLY PROGRESS CHART SECTION */}
      {rawChartData.length > 0 && (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{t('weekly_progress')}</h3>
                <p className="text-xs text-slate-500 font-medium">{t('schedule_comparison_sub')}</p>
              </div>
            </div>

            {currentWeekDelayedDays !== null && (
              <div className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                currentWeekDelayedDays > 0 
                  ? 'bg-rose-50 text-rose-700 border-rose-200' 
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                <Clock className="w-4 h-4" />
                {t('currently_delayed')} <span className="font-black text-sm">{currentWeekDelayedDays} {t('days')}</span>
              </div>
            )}
          </div>

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={windowedChartData} margin={{ top: 25, right: 15, left: -15, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="xAxisLabel" tick={<CustomXAxisTick />} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} dx={-5} domain={['auto', 'auto']} tickFormatter={(val) => `${val}%`} />
                <Tooltip content={<CustomTooltip language={language} />} />
                <Legend verticalAlign="top" align="right" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '10px', fontSize: '12px', fontWeight: '600' }} />
                <Line type="monotone" dataKey="plan" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name={t('plan')}>
                  <LabelList dataKey="plan" position="top" fill="#3b82f6" fontSize={11} fontWeight="bold" formatter={(val: number) => val !== null ? `${val}%` : ''} />
                </Line>
                <Line type="monotone" dataKey="actual" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name={t('actual')}>
                  <LabelList dataKey="actual" position="bottom" fill="#ef4444" fontSize={11} fontWeight="bold" formatter={(val: number) => val !== null ? `${val}%` : ''} />
                </Line>
                <Line type="monotone" dataKey="forecast" stroke="#22c55e" strokeWidth={3} strokeDasharray="5 5" dot={false} name={t('forecast')} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
        </div>
      )}

      {/* ========================================================
          2/ ĐÁNH GIÁ NGUYÊN NHÂN & CÔNG VIỆC CHẬM TRỄ (DELAYED TASKS & SUBMITTALS 3+)
         ======================================================== */}
      {(activeScheduleSection === 'all' || activeScheduleSection === 'delayed') && (
        <div id="sched-section-delayed" className="space-y-6 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-amber-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                2
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {language === 'EN' ? 'Delayed Items & Multiple Submittals' : 'Đánh giá nguyên nhân & Công việc chậm trễ'}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === 'EN' ? 'Tasks falling behind schedule, variance percentage and submittals submitted 3+ times' : 'Danh sách các công tác trễ hạn, độ lệch % và các hồ sơ trình duyệt từ lần 2 trở lên'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
              {language === 'EN' ? 'Section 2 / 4' : 'Mục 2 / 4'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PANEL 1: THI CÔNG KHÔNG ĐÚNG KẾ HOẠCH */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-amber-50/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{t('off_schedule_construction')}</h3>
                    <p className="text-xs text-slate-400 font-medium">{t('delayed_construction_items')}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-amber-100/80 text-amber-900 border border-amber-200/80 rounded-full text-xs font-bold">
                  {delayedTasksList.length} {t('items')}
                </span>
              </div>

              <div className="p-4 flex-1 overflow-y-auto max-h-[420px] custom-scrollbar space-y-3">
                {delayedTasksList.length > 0 ? (
                  delayedTasksList.map((taskItem, idx) => {
                    const rawDesc = typeof taskItem === 'string' ? taskItem : taskItem.description;
                    let diffValStr = typeof taskItem === 'object' && taskItem?.diffPercent ? taskItem.diffPercent.replace(/^-/, '') : '2%';

                    const match = rawDesc.match(/Kế\s*hoạch:?\s*([\d\.,]+)%?.*Thực\s*tế:?\s*([\d\.,]+)%?/i);
                    if (match) {
                      const planNum = parseFloat(match[1].replace(',', '.'));
                      const actualNum = parseFloat(match[2].replace(',', '.'));
                      if (!isNaN(planNum) && !isNaN(actualNum)) {
                        const diffVal = Math.abs(planNum - actualNum);
                        diffValStr = `${Math.round(diffVal * 10) / 10}%`;
                      }
                    }

                    return (
                      <div key={idx} className="p-3.5 bg-amber-50/20 border border-amber-200/60 rounded-2xl transition-all flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <p className="text-xs font-bold text-slate-800 leading-snug break-words">
                            {translateTaskDesc(rawDesc)}
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-rose-100/90 text-rose-700 border border-rose-200/80 rounded-xl font-bold text-xs whitespace-nowrap flex-shrink-0">
                          {t('variance')}: {diffValStr}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2 my-auto">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500/40" />
                    <p className="text-xs font-semibold">{t('all_tasks_on_schedule')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* PANEL 2: HỒ SƠ TRÌNH LẦN 2+ */}
            <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-rose-50/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-100 text-rose-600 rounded-2xl">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{t('submittals_3plus')}</h3>
                    <p className="text-xs text-slate-400 font-medium">{t('submittals_3plus_list')}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-rose-100/80 text-rose-800 border border-rose-200/80 rounded-full text-xs font-bold">
                  {submittals3PlusList.length} {t('documents')}
                </span>
              </div>

              <div className="p-4 flex-1 flex flex-col items-center justify-center overflow-y-auto max-h-[420px] custom-scrollbar space-y-3">
                {submittals3PlusList.length > 0 ? (
                  submittals3PlusList.map((sub, idx) => (
                    <div key={idx} className="w-full p-3.5 bg-rose-50/20 border border-rose-200/60 rounded-2xl transition-all flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <FileText className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-slate-800 leading-snug">
                          {sub}
                        </p>
                      </div>
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg font-bold text-[10px] uppercase whitespace-nowrap">
                        {t('submittals_3plus')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 my-auto">
                    <div className="w-8 h-8 rounded-full border-2 border-emerald-400 text-emerald-500 font-bold flex items-center justify-center text-sm">
                      ✓
                    </div>
                    <p className="text-xs font-medium text-slate-400 max-w-[240px] leading-relaxed">
                      {t('no_submittals_3plus')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          3/ NHÂN LỰC THI CÔNG TRÊN CÔNG TRƯỜNG (AVERAGE MANPOWER)
         ======================================================== */}
      {(activeScheduleSection === 'all' || activeScheduleSection === 'manpower') && (
        <div id="sched-section-manpower" className="space-y-6 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                3
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {language === 'EN' ? 'Site Average Manpower Structure' : 'Nhân lực thi công trung bình trên công trường'}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === 'EN' ? 'Average daily mobilization count categorized by roles and responsibilities' : 'Cơ cấu huy động nhân lực trung bình theo vị trí chức danh và chỉ huy công trường'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
              {language === 'EN' ? 'Section 3 / 4' : 'Mục 3 / 4'}
            </span>
          </div>

          {/* PANEL 3: NHÂN LỰC TRUNG BÌNH */}
          <div className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-blue-50/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{t('avg_manpower')}</h3>
                  <p className="text-xs text-slate-400 font-medium">{t('site_manpower_structure')}</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-blue-100/80 text-blue-700 border border-blue-200/80 rounded-full text-xs font-bold">
                {totalAverageManpower} {t('persons')}
              </span>
            </div>

            <div className="p-5 flex-1 overflow-y-auto max-h-[500px] custom-scrollbar space-y-4">
              {/* Summary Top Banner */}
              <div className="p-4 bg-blue-50/50 border border-blue-100/80 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-bold text-blue-900">{t('avg_manpower_total')}</span>
                </div>
                <span className="text-sm font-black text-blue-700 bg-white px-4 py-1.5 rounded-xl border border-blue-200/80 shadow-2xs">
                  {totalAverageManpower} {t('persons')}
                </span>
              </div>

              {manpowerAvgList.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {manpowerAvgList.map((item, idx) => {
                    const roundedCount = Math.round(item.count || 0);

                    return (
                      <div key={idx} className="p-3.5 bg-slate-50/80 border border-slate-200/70 rounded-2xl transition-all flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-100/80 text-blue-600 font-bold text-xs flex items-center justify-center shrink-0">
                            <HardHat className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{translateRole(item.role)}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{t('personnel_breakdown')}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-white text-slate-800 font-bold text-xs rounded-xl border border-slate-200/80 shadow-2xs">
                          {roundedCount} <span className="text-[11px] font-medium text-slate-500">{t('persons')}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                  <Users className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-semibold">{t('no_avg_manpower_data')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          4/ BIÊN BẢN HỌP & BÁO CÁO GIAO BAN GOOGLE DRIVE (MEETING MINUTES & DRIVE)
         ======================================================== */}
      {(activeScheduleSection === 'all' || activeScheduleSection === 'minutes') && (
        <div id="sched-section-minutes" className="space-y-6 scroll-mt-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md">
                4
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {language === 'EN' ? 'Meeting Minutes & Drive Weekly Reports' : 'Biên bản họp giao ban & Báo cáo Drive'}
                </h2>
                <p className="text-xs text-slate-500">
                  {language === 'EN' ? 'Weekly coordination meeting minutes (PMH/TVGS) and original PDF report previews' : 'Biên bản họp giao ban tuần, họp MEP & xem trước hồ sơ báo cáo ký số từ Google Drive'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg border border-purple-200">
              {language === 'EN' ? 'Section 4 / 4' : 'Mục 4 / 4'}
            </span>
          </div>

          {/* BOTTOM SECTION: 2 KHUNG PREVIEW BIÊN BẢN HỌP (TUẦN & MEP) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Weekly Meeting Minutes Frame */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden flex flex-col h-[750px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                  <h3 className="font-bold text-slate-900 text-base">{t('weekly_meeting_minutes')}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">{t('review_label')}</span>
                  {loadingWeekly ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  ) : weeklyFiles.length > 0 ? (
                    <select
                      value={selectedWeeklyId}
                      onChange={(e) => setSelectedWeeklyId(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px] truncate"
                    >
                      {weeklyFiles.map((file, idx) => (
                        <option key={file.id} value={file.id}>
                          {idx === 0 ? `${t('latest_tag')} ${file.name}` : file.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-400">{t('file_not_found')}</span>
                  )}
                </div>
              </div>
              <div className="flex-1 bg-slate-100 relative">
                {selectedWeeklyId ? (
                  <iframe
                    src={`https://drive.google.com/file/d/${selectedWeeklyId}/preview`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    title={t('weekly_meeting_minutes')}
                    className="w-full h-full"
                    allow="autoplay"
                  ></iframe>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-slate-600 font-medium text-sm">{t('no_weekly_meeting_file')}</p>
                    <button
                      type="button"
                      className="mt-3 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 cursor-default"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t('open_drive_folder')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* MEP Meeting Minutes Frame */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden flex flex-col h-[750px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h3 className="font-bold text-slate-900 text-base">{t('mep_meeting_minutes')}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">{t('review_label')}</span>
                  {loadingMep ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  ) : mepFiles.length > 0 ? (
                    <select
                      value={selectedMepId}
                      onChange={(e) => setSelectedMepId(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-[200px] truncate"
                    >
                      {mepFiles.map((file, idx) => (
                        <option key={file.id} value={file.id}>
                          {idx === 0 ? `${t('latest_tag')} ${file.name}` : file.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-400">{t('file_not_found')}</span>
                  )}
                </div>
              </div>
              <div className="flex-1 bg-slate-100 relative">
                {selectedMepId ? (
                  <iframe
                    src={`https://drive.google.com/file/d/${selectedMepId}/preview`}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    title={t('mep_meeting_minutes')}
                    className="w-full h-full"
                    allow="autoplay"
                  ></iframe>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    <FileText className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-slate-600 font-medium text-sm">{t('file_not_found')}</p>
                    <button
                      type="button"
                      className="mt-3 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 cursor-default"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {t('open_drive_folder')}
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default Schedule;
