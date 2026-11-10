import React, { useState, useEffect, useMemo } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell, LabelList, LineChart, Line, Legend, ComposedChart,
  PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, AlertOctagon, Activity, Layout, Users, 
  Clock, CheckCircle2, FolderCheck, ShoppingBag, Sparkles, ArrowUpRight, ArrowDownRight, Calendar,
  Layers, Upload, FileCode, RotateCcw, Building2, Eye, HardHat, ExternalLink
} from 'lucide-react';
import { SheetData, SubmittalData, MonitoringData } from '../services/sheetsService';
import { Language } from '../types';
import { TRANSLATIONS, MILESTONES, GOOGLE_SHEET_ID } from '../constants';
import { getStoredMilestones, subscribeMilestones, MilestoneItem } from '../services/milestoneService';
import { parseCSV, calculateDaysElapsed, extractSheetId, fetchDefectsSheetCSV, parseDefectsFromCSV, computeDefectsSummary, FALLBACK_DEFECTS_CSV } from '../services/utils';
import { computeLiveSubmittalDashboardStats, subscribeMasterSubmittals, syncFromGoogleSheet, LiveSubmittalDashboardStats } from './Submittal';
import BuildingFloorPlan from './BuildingFloorPlan';

const renderLastValueLabel = (props: any, data: any[], dataKey: string, dy: number = -12) => {
  const { x, y, value, index } = props;
  let lastIndex = -1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][dataKey] !== null && data[i][dataKey] !== undefined && !isNaN(data[i][dataKey])) {
      lastIndex = i;
      break;
    }
  }
  if (index === lastIndex && value !== null && value !== undefined) {
    return (
      <g>
        <circle cx={x} cy={y} r={5} fill={props.stroke} stroke="#fff" strokeWidth={2.5} />
        <text x={x} y={y + dy} fill={props.stroke} fontSize={12} fontWeight="800" textAnchor="middle">
          {value}%
        </text>
      </g>
    );
  }
  return null;
};

const MilestoneDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (payload.milestones && payload.milestones.length > 0) {
    return (
      <g transform={`translate(${cx},${cy})`} className="cursor-pointer" style={{ pointerEvents: 'auto' }}>
        <path d="M0,0 L0,-24 L16,-18 L0,-12" fill="#ef4444" stroke="#ef4444" strokeWidth="1" strokeLinejoin="round" />
        <line x1="0" y1="0" x2="0" y2="-24" stroke="#ef4444" strokeWidth="2" />
        <circle cx={0} cy={0} r={4} fill="#ef4444" stroke="#fff" strokeWidth={1} />
      </g>
    );
  }
  return null;
};

const CustomTooltip = ({ active, payload, label, language }: any) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 text-white p-4 rounded-xl shadow-xl border border-slate-700/80 backdrop-blur-md z-50 min-w-[200px]">
        <p className="font-bold text-slate-200 border-b border-slate-700/60 pb-1.5 mb-2.5 text-xs">
          {t('month_prefix')} {data.month}{data.year ? `/${data.year}` : ''}
        </p>
        {payload.map((entry: any, index: number) => (
          entry.dataKey !== 'milestoneY' && (
            <div key={index} className="flex items-center justify-between text-xs my-1 font-medium">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                {entry.name}:
              </span>
              <span className="font-bold text-white ml-3">{entry.value}%</span>
            </div>
          )
        ))}
        {data.milestones && data.milestones.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-700/60">
            <p className="text-[11px] font-bold text-rose-400 mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {t('milestone_label')}
            </p>
            {data.milestones.map((m: any, i: number) => (
              <p key={i} className="text-[11px] text-slate-300 leading-tight my-0.5">• {m.date} - {m.description[language]}</p>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
};

interface UpcomingProcurementItem {
  category: string;
  tenderDate: string;
  requiredDate: string;
  daysLeft?: string;
  isThisMonth?: boolean;
  isNextMonth?: boolean;
}

interface DashboardProps {
  sheetData: SheetData | null;
  submittalData?: SubmittalData | null;
  monitoringData?: MonitoringData | null;
  loading: boolean;
  error: boolean;
  language: Language;
  onRefresh?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  sheetData, 
  submittalData, 
  monitoringData, 
  loading, 
  error, 
  language 
}) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;

  const [defectsSummary, setDefectsSummary] = useState<{ pending: number; overdue7Days: number; normalPending: number; resolved?: number; total?: number }>(() => {
    try {
      const cached = localStorage.getItem('c10_live_defects_summary');
      if (cached) return JSON.parse(cached);
    } catch {}
    const initial = computeDefectsSummary(parseDefectsFromCSV(FALLBACK_DEFECTS_CSV));
    return {
      pending: initial.pending,
      overdue7Days: initial.overdue7Days,
      normalPending: initial.normalPending,
      resolved: initial.resolved,
      total: initial.total
    };
  });
  const [submittalMetrics, setSubmittalMetrics] = useState<LiveSubmittalDashboardStats>(() => computeLiveSubmittalDashboardStats());
  const [upcomingProcurement, setUpcomingProcurement] = useState<UpcomingProcurementItem[]>([]);
  const [currentMilestones, setCurrentMilestones] = useState<MilestoneItem[]>(getStoredMilestones());

  useEffect(() => {
    const unsub = subscribeMilestones((items) => {
      setCurrentMilestones(items);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // 1. Đồng bộ động dữ liệu Hồ sơ trễ hạn từ tab Theo dõi hồ sơ (Submittal)
    const refreshSubmittalMetrics = () => {
      setSubmittalMetrics(computeLiveSubmittalDashboardStats());
    };
    refreshSubmittalMetrics();

    const unsubSubmittals = subscribeMasterSubmittals((records) => {
      setSubmittalMetrics(computeLiveSubmittalDashboardStats(records));
    });

    // Tự động quét nền từ Google Sheet Hồ sơ đệ trình để đảm bảo số liệu mới nhất ngay cả khi mở Dashboard trước
    syncFromGoogleSheet()
      .then(() => refreshSubmittalMetrics())
      .catch(() => {});

    window.addEventListener('c10-submittals-updated', refreshSubmittalMetrics);
    return () => {
      unsubSubmittals();
      window.removeEventListener('c10-submittals-updated', refreshSubmittalMetrics);
    };
  }, []);

  useEffect(() => {
    // 2. Đồng bộ động dữ liệu Defects tồn đọng từ mục Defects
    const fetchDefects = async () => {
      try {
        const text = await fetchDefectsSheetCSV();
        const rows = parseDefectsFromCSV(text);
        const finalRows = rows.length > 0 ? rows : parseDefectsFromCSV(FALLBACK_DEFECTS_CSV);
        const summary = computeDefectsSummary(finalRows);
        setDefectsSummary({
          pending: summary.pending,
          overdue7Days: summary.overdue7Days,
          normalPending: summary.normalPending,
          resolved: summary.resolved,
          total: summary.total
        });
        try {
          localStorage.setItem('c10_live_defects_summary', JSON.stringify(summary));
        } catch {}
      } catch (err) {
        console.error("Error fetching defects:", err);
      }
    };

    const handleDefectsEvent = () => {
      try {
        const cached = localStorage.getItem('c10_live_defects_summary');
        if (cached) {
          const parsed = JSON.parse(cached);
          setDefectsSummary({
            pending: parsed.pending ?? 0,
            overdue7Days: parsed.overdue7Days ?? 0,
            normalPending: parsed.normalPending ?? 0,
            resolved: parsed.resolved,
            total: parsed.total
          });
        }
      } catch {}
    };

        // Fetch procurement PMH sheet data to get all items for this month & next month
    const fetchProcurementData = async () => {
      try {
        let text = '';
        const customId = localStorage.getItem('c10_procurement_sheet_id');

        if (customId) {
          try {
            const res = await fetch(`https://docs.google.com/spreadsheets/d/${customId}/gviz/tq?tqx=out:csv&gid=1573500963`);
            if (res.ok) {
              text = await res.text();
            }
          } catch (e) {
            console.warn("Could not fetch remote sheet, falling back to local procurement file:", e);
          }
        }

        if (!text) {
          const resLocal = await fetch('/assets/aistudio/C10_Procurement_data_22cf8358');
          if (resLocal.ok) {
            text = await resLocal.text();
          }
        }

        if (!text) return;

        const csv = parseCSV(text);
        
        const parseDate = (dStr: string) => {
          if (!dStr || dStr === '—') return null;
          const parts = dStr.trim().split('/');
          if (parts.length === 3) {
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10) - 1;
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;
            return new Date(year, month, day);
          } else if (parts.length === 2) {
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10) - 1;
            let year = new Date().getFullYear();
            return new Date(year, month, day);
          }
          return null;
        };

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const nextMonth = (currentMonth + 1) % 12;
        const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;

        const checkInWindow = (d: Date | null) => {
          if (!d) return false;
          const m = d.getMonth();
          const y = d.getFullYear();
          return (m === currentMonth && y === currentYear) || (m === nextMonth && y === nextYear);
        };

        const items: UpcomingProcurementItem[] = [];

        csv.forEach((row, i) => {
          if (i === 0 || row[0] === 'STT' || row[0]?.includes('Hạng mục khác')) return;
          const cat = (row[1] || '').trim().replace(/\n/g, ' ');
          const tenderDateStr = (row[3] || '').trim();
          const reqDateStr = (row[4] || '').trim();

          if (cat && (tenderDateStr || reqDateStr)) {
            const tenderObj = parseDate(tenderDateStr);
            const reqObj = parseDate(reqDateStr);

            const isThisM = (tenderObj && tenderObj.getMonth() === currentMonth && tenderObj.getFullYear() === currentYear) ||
                            (reqObj && reqObj.getMonth() === currentMonth && reqObj.getFullYear() === currentYear);
            const isNextM = (tenderObj && tenderObj.getMonth() === nextMonth && tenderObj.getFullYear() === nextYear) ||
                            (reqObj && reqObj.getMonth() === nextMonth && reqObj.getFullYear() === nextYear);

            if (checkInWindow(tenderObj) || checkInWindow(reqObj)) {
              items.push({
                category: cat,
                tenderDate: tenderDateStr,
                requiredDate: reqDateStr,
                isThisMonth: !!isThisM,
                isNextMonth: !!isNextM
              });
            }
          }
        });

        // Fallback: if no items match exact month window, take all valid items
        let result = items;
        if (result.length === 0) {
          const allItems: UpcomingProcurementItem[] = [];
          csv.forEach((row, i) => {
            if (i === 0 || row[0] === 'STT' || row[0]?.includes('Hạng mục khác')) return;
            const cat = (row[1] || '').trim().replace(/\n/g, ' ');
            const tenderDateStr = (row[3] || '').trim();
            const reqDateStr = (row[4] || '').trim();
            if (cat && (tenderDateStr || reqDateStr)) {
              allItems.push({
                category: cat,
                tenderDate: tenderDateStr,
                requiredDate: reqDateStr,
                isThisMonth: true,
                isNextMonth: false
              });
            }
          });
          result = allItems;
        }

        setUpcomingProcurement(result);
      } catch (err) {
        console.error("Error fetching procurement sheet:", err);
      }
    };

    fetchDefects();
    fetchProcurementData();

    const handleSync = () => {
      fetchDefects();
      fetchProcurementData();
      setSubmittalMetrics(computeLiveSubmittalDashboardStats());
    };
    const pollInterval = setInterval(() => {
      fetchDefects();
    }, 30000);

    window.addEventListener('c10-defects-updated', handleDefectsEvent);
    window.addEventListener('c10-auth-changed', handleSync);
    window.addEventListener('c10-resource-updated', handleSync);
    window.addEventListener('storage', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('c10-defects-updated', handleDefectsEvent);
      window.removeEventListener('c10-auth-changed', handleSync);
      window.removeEventListener('c10-resource-updated', handleSync);
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, []);

  // Compute Submittal totals
  const submittalMetrics = useMemo(() => {
    if (!submittalData) return { approved: 0, unapproved: 0, total: 0, delayed: 0 };
    const categories = [
      submittalData.ds, submittalData.sd, submittalData.ma, submittalData.mos,
      submittalData.ots, submittalData.dsMep, submittalData.sdMep,
      submittalData.matMep, submittalData.mosMep, submittalData.rfi
    ].filter(Boolean);

    let approved = 0, unapproved = 0, total = 0, delayed = 0;
    categories.forEach(item => {
      approved += item.approved || 0;
      unapproved += item.unapproved || 0;
      total += item.total || 0;
      delayed += item.delayedDocuments ? item.delayedDocuments.length : 0;
    });

    return { approved, unapproved, total, delayed };
  }, [submittalData]);

  // Delayed days count from latest weekly progress
  const delayedDays = useMemo(() => {
    if (!sheetData?.schedule?.weeklyProgress || sheetData.schedule.weeklyProgress.length === 0) return 0;
    for (let i = sheetData.schedule.weeklyProgress.length - 1; i >= 0; i--) {
      const val = sheetData.schedule.weeklyProgress[i].delayedDays;
      if (val !== undefined && val !== null) {
        return val;
      }
    }
    return 0;
  }, [sheetData]);

  // ICL Monitoring Summary Item & Content
  const iclSummaryItem = useMemo(() => {
    if (!monitoringData?.sumData || monitoringData.sumData.length === 0) return null;
    return monitoringData.sumData.find(item => item.id === 'icl') || monitoringData.sumData[0] || null;
  }, [monitoringData]);

  const iclContent = useMemo(() => {
    return iclSummaryItem?.content || 'Tất cả các điểm đo chuyển vị ngang tường vây (ICL) nằm trong giới hạn cho phép, đảm bảo an toàn tuyệt đối cho hố đào.';
  }, [iclSummaryItem]);

  const iclStatus = iclSummaryItem?.status || 'SAFE';

  const procurementWindowLabel = useMemo(() => {
    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    const nextM = curM === 12 ? 1 : curM + 1;
    const nextY = curM === 12 ? curY + 1 : curY;
    return `T${curM} - T${nextM}/${nextY}`;
  }, []);

  // Calculate progress health
  const actualProgress = sheetData?.summary?.overallProgress?.actual !== undefined && sheetData?.summary?.overallProgress?.actual !== null ? sheetData.summary.overallProgress.actual : 65.4;
  const plannedProgress = sheetData?.summary?.overallProgress?.plan !== undefined && sheetData?.summary?.overallProgress?.plan !== null ? sheetData.summary.overallProgress.plan : 64.5;
  const progressDiff = Math.abs(actualProgress - plannedProgress);
  const calculatedProgressHealth = Math.round(Math.max(0, 100 - (progressDiff * 20)));
  const calculatedIssuesHealth = Math.round(Math.max(0, 100 - (defectsSummary.pending * 2)));

  // Health Data
  const healthData = [
    { subject: t('progress'), A: Math.round(calculatedProgressHealth), fullMark: 100, green: 100, yellow: 80, red: 50 },
    { subject: t('payment'), A: sheetData?.health?.payment !== undefined && sheetData?.health?.payment !== null ? Math.round(sheetData.health.payment) : 70, fullMark: 100, green: 100, yellow: 80, red: 50 },
    { subject: t('manpower'), A: sheetData?.health?.manpower !== undefined && sheetData?.health?.manpower !== null ? Math.round(sheetData.health.manpower) : 90, fullMark: 100, green: 100, yellow: 80, red: 50 },
    { subject: t('submittal'), A: sheetData?.health?.submittal !== undefined && sheetData?.health?.submittal !== null ? Math.round(sheetData.health.submittal) : 65, fullMark: 100, green: 100, yellow: 80, red: 50 },
    { subject: t('issues'), A: Math.round(calculatedIssuesHealth), fullMark: 100, green: 100, yellow: 80, red: 50 },
  ];

  const areaProgressData = sheetData?.areaProgress?.length ? sheetData.areaProgress : [
    { name: t('facade'), progress: 15 },
    { name: t('mep'), progress: 30 },
    { name: t('finishing'), progress: 45 },
    { name: t('superstructure'), progress: 85 },
    { name: t('basement'), progress: 100 },
    { name: t('foundation'), progress: 100 },
  ];

  const dummyMonths = Array.from({ length: 12 }, (_, i) => ({
    id: `${i + 1}`,
    month: `${t('month')} ${i + 1}`,
    plan: null as number | null,
    actual: null as number | null,
    forecast: null as number | null,
    milestones: [] as any[],
    milestoneY: undefined as number | undefined
  }));
  let constructionProgressData = sheetData?.constructionProgress?.length 
    ? sheetData.constructionProgress.map(d => ({ ...d, milestones: d.milestones ? [...d.milestones] : [] })) 
    : dummyMonths;

  // Map milestones & calculate forecast using Linear Regression
  if (sheetData?.constructionProgress?.length) {
    currentMilestones.forEach(milestone => {
      const parts = milestone.date.split('/');
      if (parts.length === 3) {
        const mMonth = parseInt(parts[1], 10);
        const mYear = parseInt(parts[2], 10);
        
        const dataPoint = constructionProgressData.find((d: any) => {
          const dMonthNum = parseInt(d.month.replace(/\D/g, ''), 10);
          return dMonthNum === mMonth && d.year === mYear;
        });
        if (dataPoint) {
          if (!dataPoint.milestones) dataPoint.milestones = [];
          const descEN = milestone.description.EN || milestone.description.VN;
          if (!dataPoint.milestones.find((m: any) => m.date === milestone.date && (m.description.EN === descEN || m.id === milestone.id))) {
            dataPoint.milestones.push({
              date: milestone.date,
              description: {
                VN: milestone.description.VN,
                EN: descEN
              },
              completed: milestone.completed
            });
          }
          dataPoint.milestoneY = dataPoint.plan;
        }
      }
    });

    let lastActualIndex = -1;
    for (let i = constructionProgressData.length - 1; i >= 0; i--) {
      if (constructionProgressData[i].actual !== null && constructionProgressData[i].actual !== undefined) {
        lastActualIndex = i;
        break;
      }
    }

    if (lastActualIndex !== -1) {
      const validPoints: {x: number, y: number}[] = [];
      constructionProgressData.forEach((item: any, index: number) => {
        if (typeof item.actual === 'number') {
          validPoints.push({ x: index, y: item.actual });
        }
      });

      let slope = 0;
      if (validPoints.length >= 2) {
        const n = validPoints.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        validPoints.forEach(p => {
          sumX += p.x;
          sumY += p.y;
          sumXY += p.x * p.y;
          sumXX += p.x * p.x;
        });
        const denom = (n * sumXX - sumX * sumX);
        slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      }

      if (slope <= 0) slope = 2;

      constructionProgressData[lastActualIndex].forecast = constructionProgressData[lastActualIndex].actual;
      for (let i = lastActualIndex + 1; i < constructionProgressData.length; i++) {
        const prevForecast = constructionProgressData[i - 1].forecast || 0;
        let newForecast = prevForecast + slope;
        if (newForecast > 100) newForecast = 100;
        constructionProgressData[i].forecast = Number(newForecast.toFixed(2));
      }
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 rounded-2xl shadow-sm text-white border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Activity className="w-4 h-4" /> {language === 'EN' ? 'Overview' : 'Tổng quan'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Project Executive Dashboard</h1>
          <p className="text-slate-300 text-xs sm:text-sm">
            {language === 'EN' ? 'Progress report, health metrics, manpower & excavation safety' : 'Báo cáo tiến độ, chỉ số sức khỏe, nhân lực & an toàn hố đào'}
          </p>
        </div>

        
      </div>

      {/* BENTO GRID: 3 Balanced KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4">
        
        {/* Card 1: Tiến độ phần hầm (4 cols) */}
        <div className="md:col-span-2 lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('overall_progress')}</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {actualProgress}%
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                actualProgress >= plannedProgress ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {actualProgress >= plannedProgress ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {actualProgress >= plannedProgress 
                  ? (language === 'EN' ? `${(actualProgress - plannedProgress).toFixed(1)}% ahead of plan` : `Vượt ${(actualProgress - plannedProgress).toFixed(1)}% KH`)
                  : (language === 'EN' ? `${(plannedProgress - actualProgress).toFixed(1)}% behind plan` : `Chậm ${(plannedProgress - actualProgress).toFixed(1)}% KH`)}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>{language === 'EN' ? 'Plan:' : 'Kế hoạch:'} <strong className="text-slate-700 font-bold">{plannedProgress}%</strong></span>
            <span>{language === 'EN' ? 'Actual:' : 'Thực tế:'} <strong className="text-blue-600 font-bold">{actualProgress}%</strong></span>
          </div>
        </div>

        {/* Card 2: Defects tồn đọng - Biểu đồ tròn (4 cols) */}
        <div className="md:col-span-2 lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-rose-300 hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {language === 'EN' ? 'Pending Defects' : 'Defects tồn đọng'}
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 group-hover:scale-105 transition-transform">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 my-1">
            {/* Biểu đồ Tròn / Donut */}
            <div className="w-[88px] h-[88px] relative shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={defectsSummary.pending > 0 ? [
                      { name: language === 'EN' ? 'Overdue > 7 days' : 'Trễ > 7 ngày', value: defectsSummary.overdue7Days, color: '#ef4444' },
                      { name: language === 'EN' ? 'On time (≤ 7 days)' : 'Trong hạn (≤ 7 ngày)', value: defectsSummary.normalPending, color: '#eab308' }
                    ] : [{ name: language === 'EN' ? 'Resolved' : 'Đã sửa', value: 1, color: '#10b981' }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={24}
                    outerRadius={38}
                    paddingAngle={defectsSummary.overdue7Days > 0 && defectsSummary.normalPending > 0 ? 3 : 0}
                    dataKey="value"
                    stroke="none"
                  >
                    {(defectsSummary.pending > 0 ? [
                      { name: language === 'EN' ? 'Overdue > 7 days' : 'Trễ > 7 ngày', value: defectsSummary.overdue7Days, color: '#ef4444' },
                      { name: language === 'EN' ? 'On time (≤ 7 days)' : 'Trong hạn (≤ 7 ngày)', value: defectsSummary.normalPending, color: '#eab308' }
                    ] : [{ name: language === 'EN' ? 'Resolved' : 'Đã sửa', value: 1, color: '#10b981' }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-base font-black text-slate-900 leading-none">{defectsSummary.pending}</span>
                <span className="text-[9px] font-semibold text-slate-400 uppercase">
                  {language === 'EN' ? 'defects' : 'lỗi'}
                </span>
              </div>
            </div>

            {/* Chú thích & Chi tiết */}
            <div className="flex-1 space-y-1 text-xs">
              <div className="flex items-center justify-between p-1.5 bg-rose-50/80 rounded-lg border border-rose-100">
                <div className="flex items-center gap-1 font-bold text-rose-700 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span>{language === 'EN' ? 'Overdue > 7 days:' : 'Trễ > 7 ngày:'}</span>
                </div>
                <span className="font-black text-rose-700 text-xs">{defectsSummary.overdue7Days}</span>
              </div>

              <div className="flex items-center justify-between p-1.5 bg-amber-50/80 rounded-lg border border-amber-100">
                <div className="flex items-center gap-1 font-semibold text-amber-800 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <span>{language === 'EN' ? 'On time:' : 'Trong hạn:'}</span>
                </div>
                <span className="font-bold text-amber-900 text-xs">{defectsSummary.normalPending}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-500">
            <span>{language === 'EN' ? 'Total unresolved' : 'Tổng lỗi chưa sửa'}</span>
            <strong className="text-slate-900 font-bold">
              {defectsSummary.pending} {language === 'EN' ? 'defects' : 'lỗi'}
            </strong>
          </div>
        </div>

        {/* Card 3: Hồ sơ trễ hạn (4 cols) */}
        <div className="md:col-span-2 lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {language === 'EN' ? 'Delayed Submittals' : 'Hồ sơ trễ hạn'}
            </span>
            <div className={`p-2 rounded-xl border group-hover:scale-105 transition-transform ${
              submittalMetrics.delayed > 0 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
            }`}>
              <FolderCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className={`text-2xl font-black tracking-tight ${submittalMetrics.delayed > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {submittalMetrics.delayed} <span className="text-xs font-semibold text-slate-500">{language === 'EN' ? 'documents' : 'hồ sơ'}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                submittalMetrics.delayed > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {submittalMetrics.delayed > 0 
                  ? (language === 'EN' ? 'Urgent action required' : 'Cần xử lý gấp') 
                  : (language === 'EN' ? 'Approved on time' : 'Đã duyệt đúng hạn')}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between text-[11px] text-slate-500">
            <span>{language === 'EN' ? 'Total:' : 'Tổng:'} <strong className="text-slate-700 font-bold">{submittalMetrics.total}</strong></span>
            <span>{language === 'EN' ? 'Approved:' : 'Đã duyệt:'} <strong className="text-emerald-600 font-bold">{submittalMetrics.approved}</strong></span>
          </div>
        </div>

      </div>

      {/* SECTION: Mặt cắt dự án (Bên trái) & Sức Khỏe Dự Án (Bên phải) - Side-by-side on Desktop */}
      <div className="grid grid-cols-1 gap-8 items-stretch">
        
        {/* Mặt cắt dự án (Mô hình tòa nhà) */}
        <BuildingFloorPlan language={language} />

        {/* Project Health Radar */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" /> {t('project_health')}
            </h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
              {language === 'EN' ? 'Radar Chart' : 'Biểu đồ Radar'}
            </span>
          </div>
          <div className="h-[380px] sm:h-[450px] w-full flex items-center justify-center my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={healthData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                
                {/* Background Zones */}
                <Radar name="Green Zone" dataKey="green" stroke="none" fill="#10b981" fillOpacity={0.12} isAnimationActive={false} />
                <Radar name="Yellow Zone" dataKey="yellow" stroke="none" fill="#f59e0b" fillOpacity={0.25} isAnimationActive={false} />
                <Radar name="Red Zone" dataKey="red" stroke="none" fill="#ef4444" fillOpacity={0.45} isAnimationActive={false} />

                {/* Actual Data */}
                <Radar
                  name={t('project_health')}
                  dataKey="A"
                  stroke="#0f172a"
                  strokeWidth={3}
                  fill="rgba(15, 23, 42, 0.15)"
                  dot={{ r: 4, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }}
                  label={{ 
                    position: 'top', 
                    fill: '#0f172a', 
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    formatter: (val: any) => `${Math.round(Number(val))}%`,
                    offset: 10
                  }}
                />
                <Tooltip 
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const data = payload.find((p: any) => p.dataKey === 'A');
                      if (data) {
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs font-medium border border-slate-700">
                            <p className="font-bold text-slate-200 mb-1">{label}</p>
                            <p className="text-blue-400 font-bold">
                              {data.name}: {Math.round(Number(data.value))}%
                            </p>
                          </div>
                        );
                      }
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* SECTION: Tiến độ phần hầm (Full Width Line Chart) */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs w-full overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" /> {t('construction_progress')}
          </h3>
          <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            {language === 'EN' ? 'Trend Forecast & Milestones' : 'Dự báo xu hướng & Mốc Milestone'}
          </span>
        </div>
        <div className="h-[380px] md:h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={constructionProgressData} margin={{ top: 20, bottom: 25, left: -10, right: 25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="id" tickFormatter={(val) => {
                const d = constructionProgressData.find(d => d.id === val);
                return d ? (d.year ? `${d.month}/${d.year.toString().slice(2)}` : d.month) : '';
              }} tick={{fontSize: 11, fill: '#64748b', fontWeight: 600}} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={35} label={{ value: t('month'), position: 'insideBottomRight', offset: -15, style: {fontSize: '11px', fill: '#94a3b8', fontWeight: 'bold'} }} />
              <YAxis type="number" domain={[0, 100]} tickCount={6} width={45} tickFormatter={(val) => `${val}%`} tick={{fontSize: 11, fill: '#64748b', fontWeight: 600}} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip language={language} />} cursor={{ stroke: '#e2e8f0', strokeWidth: 2 }} />
              <Legend verticalAlign="bottom" align="center" wrapperStyle={{fontSize: '12px', paddingTop: '20px'}}/>
              <Line type="monotone" dataKey="plan" stroke="#3b82f6" strokeWidth={3} dot={false} name={t('plan_progress')} label={(props: any) => renderLastValueLabel(props, constructionProgressData, 'plan', -12)} />
              <Line type="monotone" dataKey="actual" stroke="#ef4444" strokeWidth={3} dot={false} name={t('actual_progress')} label={(props: any) => renderLastValueLabel(props, constructionProgressData, 'actual', 20)} />
              <Line type="monotone" dataKey="forecast" stroke="#10b981" strokeWidth={2.5} strokeDasharray="5 5" dot={false} name={t('forecast')} />
              <Line type="monotone" dataKey="milestoneY" stroke="none" dot={<MilestoneDot />} activeDot={false} tooltipType="none" legendType="none" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION: Tiến độ giai đoạn & Quan trắc chuyển vị (Song song nhau) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        
        {/* Area Progress Bar Chart */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col justify-between h-full">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Layout className="w-5 h-5 text-emerald-600" /> {t('area_progress')}
            </h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
              {language === 'EN' ? 'Completion Rate %' : 'Tỷ lệ hoàn thành %'}
            </span>
          </div>
          <div className="h-[360px] w-full my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={areaProgressData}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                  width={90}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}%`, t('area_progress')]}
                />
                <Bar dataKey="progress" radius={[0, 8, 8, 0]} barSize={22}>
                  <LabelList dataKey="progress" position="insideRight" fill="#fff" fontSize={10} fontWeight="bold" formatter={(val: any) => `${val}%`} offset={8} />
                  {areaProgressData.map((entry, index) => {
                    let fillColor = entry.progress === 100 ? '#10b981' : entry.progress > 80 ? '#3b82f6' : entry.progress > 50 ? '#f59e0b' : '#ef4444';
                    const nameLower = entry.name.toLowerCase();
                    if (nameLower.includes('mep')) {
                      fillColor = '#eab308';
                    } else if (nameLower.includes('facade') || nameLower.includes('mặt ngoài')) {
                      fillColor = '#8b5cf6';
                    }
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={fillColor} 
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quan trắc chuyển vị tường vây (ICL) */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all flex flex-col justify-between h-full space-y-4">
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border shrink-0 ${
                  iclStatus === 'DANGER'
                    ? 'bg-rose-50 text-rose-600 border-rose-100'
                    : iclStatus === 'WARNING'
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                }`}>
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {language === 'EN' ? 'Diaphragm Wall Displacement Monitoring (ICL)' : 'Quan Trắc Chuyển Vị Tường Vây (ICL)'}
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {language === 'EN' ? 'Geotechnical status & excavation deformation safety' : 'Tình trạng địa kỹ thuật & an toàn biến dạng hố đào'}
                  </span>
                </div>
              </div>
              {iclSummaryItem?.latestCycle && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 shrink-0">
                  {iclSummaryItem.latestCycle}
                </span>
              )}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-2xs border ${
                iclStatus === 'DANGER'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : iclStatus === 'WARNING'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                <CheckCircle2 className={`w-4 h-4 ${
                  iclStatus === 'DANGER' ? 'text-rose-600' : iclStatus === 'WARNING' ? 'text-amber-600' : 'text-emerald-600'
                }`} />
                {iclStatus === 'DANGER'
                  ? (language === 'EN' ? 'Exceeds safety warning threshold' : 'Vượt ngưỡng cảnh báo an toàn')
                  : iclStatus === 'WARNING'
                  ? (language === 'EN' ? 'Approaching warning threshold (≥80%)' : 'Tiệm cận ngưỡng cảnh báo (≥80%)')
                  : (language === 'EN' ? 'Below safety threshold' : 'Dưới ngưỡng cảnh báo an toàn')}
              </span>
              {iclSummaryItem?.maxVal !== undefined && iclSummaryItem?.warningVal !== undefined && (
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                  Max: <strong className="text-slate-900">{iclSummaryItem.maxVal} {iclSummaryItem.unit || 'mm'}</strong> / {iclSummaryItem.warningVal} {iclSummaryItem.unit || 'mm'}
                </span>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100/80 text-xs text-slate-700 leading-relaxed font-medium space-y-2">
              <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${
                  iclStatus === 'DANGER' ? 'bg-rose-500' : iclStatus === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}></span>
                {language === 'EN' ? 'Latest Measurement Summary:' : 'Tóm tắt dữ liệu đo đạc mới nhất:'}
              </div>
              <p className={`pl-3 border-l-2 text-slate-700 ${
                iclStatus === 'DANGER' ? 'border-rose-300' : iclStatus === 'WARNING' ? 'border-amber-300' : 'border-emerald-300'
              }`}>
                {iclContent}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              {language === 'EN' ? 'Status:' : 'Trạng thái:'}{' '}
              <strong className={`font-bold ${
                iclStatus === 'DANGER' ? 'text-rose-700' : iclStatus === 'WARNING' ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                {iclStatus === 'DANGER'
                  ? (language === 'EN' ? 'Warning Exceeded' : 'Vượt ngưỡng')
                  : iclStatus === 'WARNING'
                  ? (language === 'EN' ? 'Watch Closely' : 'Cần theo dõi')
                  : (language === 'EN' ? 'Safe' : 'An toàn')}
              </strong>
            </span>
            <span className="text-slate-400 font-medium">
              {iclSummaryItem?.latestCycle
                ? (language === 'EN' ? `Real-time sync (${iclSummaryItem.latestCycle})` : `Đồng bộ thời gian thực (${iclSummaryItem.latestCycle})`)
                : (language === 'EN' ? 'Updated daily' : 'Cập nhật hàng ngày')}
            </span>
          </div>
        </div>

      </div>

      {/* Today Plans: Kế hoạch nghiệm thu & Kế hoạch đổ bê tông */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Kế hoạch nghiệm thu hôm nay */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Kế hoạch nghiệm thu hôm nay</h3>
              <p className="text-xs text-slate-500 font-medium">Cập nhật từ tab Plan</p>
            </div>
            <span className="ml-auto text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
              {sheetData?.todayPlans?.inspectionPlans?.length || 0} nội dung
            </span>
          </div>

          <div className="flex-1 max-h-[350px] overflow-y-auto pr-1">
            {sheetData?.todayPlans?.inspectionPlans && sheetData.todayPlans.inspectionPlans.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {sheetData.todayPlans.inspectionPlans.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/70 transition-colors">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-[10px] mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-slate-700 font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Chưa có kế hoạch nghiệm thu hôm nay
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Kế hoạch đổ bê tông hôm nay */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Kế hoạch đổ bê tông hôm nay</h3>
              <p className="text-xs text-slate-500 font-medium">Cập nhật từ tab Plan</p>
            </div>
            <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
              {sheetData?.todayPlans?.concretePlans?.length || 0} nội dung
            </span>
          </div>

          <div className="flex-1 max-h-[350px] overflow-y-auto pr-1">
            {sheetData?.todayPlans?.concretePlans && sheetData.todayPlans.concretePlans.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {sheetData.todayPlans.concretePlans.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-50/40 border border-amber-100/80 hover:bg-amber-50 transition-colors">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px] mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-slate-700 font-medium leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Chưa có kế hoạch đổ bê tông hôm nay
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manpower Chart */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs w-full overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" /> {t('manpower_chart')}
          </h3>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">{t('people')}</span>
        </div>

        <div className="h-[380px] md:h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sheetData?.manpower || []} margin={{ top: 35, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b', fontWeight: 600}} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{fontSize: 12, fill: '#64748b', fontWeight: 600}} axisLine={false} tickLine={false} dx={-5} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#0f172a', color: '#fff' }} />
              <Legend verticalAlign="bottom" align="center" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="plan" fill="#3b82f6" name={t('plan')} radius={[6, 6, 0, 0]} barSize={28}>
                <LabelList dataKey="plan" position="center" fill="#ffffff" fontSize={11} fontWeight="bold" />
              </Bar>
              <Line type="monotone" dataKey="actual" stroke="#ef4444" strokeWidth={3.5} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} name={t('actual')}>
                <LabelList dataKey="actual" position="top" fill="#ef4444" fontSize={12} fontWeight="bold" offset={10} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full-width Expanded Upcoming Procurement Section */}
      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200/80 shadow-2xs w-full overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600" /> {language === 'EN' ? 'Upcoming Procurement Plan (This & Next Month)' : 'Kế hoạch Mua hàng sắp tới (Tháng này & Tháng sau)'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {language === 'EN' 
                ? 'List of all procurement packages expected to open or require contractors this and next month'
                : 'Danh sách tất cả các gói thầu & mua hàng dự kiến mở thầu hoặc cần nhà thầu trong tháng này và tháng sau'}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              {procurementWindowLabel}
            </span>
            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
              {upcomingProcurement.length} {language === 'EN' ? 'items' : 'hạng mục'}
            </span>
          </div>
        </div>

        {upcomingProcurement.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-500 text-[11px] font-bold uppercase tracking-wider border-y border-slate-200/70">
                  <th className="py-3 px-4 text-center w-12">{language === 'EN' ? 'No.' : 'STT'}</th>
                  <th className="py-3 px-4 min-w-[280px]">{language === 'EN' ? 'Procurement Item / Package' : 'Hạng mục mua hàng / Đợt thầu'}</th>
                  <th className="py-3 px-4 text-center min-w-[160px]">{language === 'EN' ? 'Tender Issue' : 'Phát hành HSMT (Tender)'}</th>
                  <th className="py-3 px-4 text-center min-w-[160px]">{language === 'EN' ? 'Contractor Required' : 'Cần Nhà thầu'}</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">{language === 'EN' ? 'Timeframe' : 'Thời gian'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
                {upcomingProcurement.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-center font-bold text-slate-500 bg-slate-50/30">
                      {idx + 1}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 leading-relaxed break-words">
                      {item.category}
                    </td>
                    <td className="py-3.5 px-4 text-center font-semibold">
                      {item.tenderDate ? (
                        <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 font-bold text-[11px]">
                          {item.tenderDate}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-semibold">
                      {item.requiredDate ? (
                        <span className="inline-block px-3 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-100 font-bold text-[11px]">
                          {item.requiredDate}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {item.isNextMonth ? (
                        <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-100 text-[10px]">
                          {language === 'EN' ? 'Next Month' : 'Tháng sau'}
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-100 text-[10px]">
                          {language === 'EN' ? 'This Month' : 'Tháng này'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400 text-xs italic">
            {language === 'EN' ? 'Loading procurement plan data...' : 'Đang tải dữ liệu kế hoạch mua hàng...'}
          </div>
        )}
      </div>

    </div>
  );
};

export default Dashboard;
