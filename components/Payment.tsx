import React, { useState, useMemo } from 'react';
import { 
  Wallet, TrendingUp, TrendingDown, DollarSign, Calendar, Search, 
  ExternalLink, CheckCircle2, Clock, ShieldAlert, ArrowUpRight, Filter, RefreshCw
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { SheetData } from '../services/sheetsService';
import { Language } from '../types';
import { TRANSLATIONS, GOOGLE_SHEET_ID } from '../constants';

interface PaymentProps {
  sheetData: SheetData | null;
  loading: boolean;
  error: boolean;
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
  onRefresh?: () => Promise<void>;
}

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
        <circle cx={x} cy={y} r={4} fill={props.stroke} stroke="#fff" strokeWidth={2} />
        <text x={x} y={y + dy} fill={props.stroke} fontSize={11} fontWeight="800" textAnchor="middle">
          {value}%
        </text>
      </g>
    );
  }
  return null;
};

const Payment: React.FC<PaymentProps> = ({ sheetData, loading, error, language, onProtectedAction, onRefresh }) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;

  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'disbursed' | 'pending' | 'high_cpi'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() => 
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  const handleManualRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastUpdated(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const paymentTrackingData = useMemo(() => {
    return sheetData?.paymentTracking?.length ? sheetData.paymentTracking : [];
  }, [sheetData]);

  // Derived CPI, SPI, and Latest Payment Progress calculations
  const metrics = useMemo(() => {
    let latestPayment: number | null = null;
    let latestActual: number | null = null;
    let latestMonthStr = '';
    let cpiVal: number | null = null;
    let cpiMonthLabel = '';

    if (paymentTrackingData && paymentTrackingData.length > 0) {
      // Find latest valid data point with non-null payment or actual
      for (let i = paymentTrackingData.length - 1; i >= 0; i--) {
        const item = paymentTrackingData[i];
        if (item.payment !== null && item.payment !== undefined && !isNaN(item.payment)) {
          latestPayment = item.payment;
          latestActual = item.actual;
          latestMonthStr = item.year ? `Tháng ${item.month}/${item.year}` : item.month;
          break;
        }
      }

      // Calculate overall CPI from latest non-zero month
      const currentMonthNum = new Date().getMonth() + 1;
      const currentYearNum = new Date().getFullYear();
      
      let targetData = paymentTrackingData.find(d => 
        parseInt(d.month) === currentMonthNum && d.year === currentYearNum
      );

      if (!targetData || targetData.actual === null || targetData.payment === null) {
        for (let i = paymentTrackingData.length - 1; i >= 0; i--) {
          const d = paymentTrackingData[i];
          if (d.actual !== null && d.payment !== null && d.payment > 0) {
            targetData = d;
            break;
          }
        }
      }

      if (targetData && targetData.actual !== null && targetData.payment !== null) {
        const ev = targetData.actual;
        const ac = targetData.payment;
        cpiVal = ac > 0 ? ev / ac : (ev > 0 ? 1 : 0);
        cpiMonthLabel = `Tháng ${targetData.month}/${targetData.year}`;
      }
    }

    // Fallback if summary has data
    if (latestPayment === null && sheetData?.summary?.paymentProgress?.actual !== undefined) {
      latestPayment = sheetData.summary.paymentProgress.actual;
    }

    const gap = (latestActual !== null && latestPayment !== null) ? (latestActual - latestPayment) : null;

    return {
      latestPayment,
      latestActual,
      latestMonthStr,
      cpi: cpiVal,
      cpiMonthLabel,
      gap
    };
  }, [paymentTrackingData, sheetData]);

  // Filtered rows for the monthly payment table
  const filteredTableRows = useMemo(() => {
    return paymentTrackingData.filter(row => {
      const monthStr = row.year ? `Tháng ${row.month}/${row.year}` : row.month || '';
      const matchesSearch = searchTerm.trim() === '' || 
        monthStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(row.month).includes(searchTerm) ||
        String(row.year).includes(searchTerm);

      if (!matchesSearch) return false;

      const hasPayment = row.payment !== null && row.payment !== undefined && row.payment > 0;
      const rowCpi = (row.actual !== null && row.payment !== null && row.payment > 0) 
        ? (row.actual / row.payment) 
        : null;

      if (filterMode === 'disbursed') return hasPayment;
      if (filterMode === 'pending') return !hasPayment;
      if (filterMode === 'high_cpi') return rowCpi !== null && rowCpi >= 1.0;

      return true;
    });
  }, [paymentTrackingData, searchTerm, filterMode]);

  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit?gid=2064504389#gid=2064504389`;

  const handleOpenSheet = (e: React.MouseEvent) => {
    if (onProtectedAction) {
      onProtectedAction(e, SHEET_URL);
    } else {
      window.open(SHEET_URL, '_blank', 'noopener,noreferrer');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[450px] gap-3">
        <div className="w-10 h-10 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-medium animate-pulse">Đang tải dữ liệu tiến độ thanh toán từ Google Sheet...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-3.5 rounded-xl shadow-md text-white">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{t('payment_page')}</h2>
              <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-extrabold">
                {paymentTrackingData.length} {language === 'EN' ? 'periods' : 'kỳ theo dõi'}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {language === 'EN' 
                ? 'Track disbursement progress, cumulative payments, and Cost Performance Index (CPI)' 
                : 'Theo dõi tình hình giải ngân, lũy kế thanh toán và chỉ số hiệu quả chi phí dự án (CPI)'}
            </p>
          </div>
        </div>

        {/* Actions & Real-time Indicator */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{language === 'EN' ? 'Real-time (Live)' : 'Thời gian thực (Live)'}</span>
          </div>

          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-slate-400 font-medium">
              Google Sheet (Tab Payment)
            </p>
            <p className="text-[11px] text-slate-600 font-bold">
              {language === 'EN' ? 'Updated:' : 'Cập nhật:'} {lastUpdated}
            </p>
          </div>

          {onRefresh && (
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              title={language === 'EN' ? 'Refresh data from Google Sheets' : 'Làm mới dữ liệu từ Google Sheet'}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-60 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? (language === 'EN' ? 'Syncing...' : 'Đang tải...') : (language === 'EN' ? 'Refresh' : 'Làm mới')}</span>
            </button>
          )}

          {/* Google Sheet Action Button */}
          <button
            onClick={handleOpenSheet}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md active:scale-95 w-fit"
          >
            <ExternalLink className="w-4 h-4 text-emerald-400" />
            {language === 'EN' ? 'Open Sheet' : 'Mở Google Sheet'}
          </button>
        </div>
      </div>

      {/* KPI METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Payment Progress */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-emerald-300 transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('payment_progress')}</p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
                {metrics.latestPayment !== null ? `${metrics.latestPayment}%` : '0%'}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="text-[11px] font-medium text-slate-400">
              {language === 'EN' ? 'Latest Period:' : 'Cập nhật kỳ mới nhất:'}
            </span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
              {metrics.latestMonthStr 
                ? (language === 'EN' ? metrics.latestMonthStr.replace('Tháng ', 'Month ') : metrics.latestMonthStr) 
                : '10/2025'}
            </span>
          </div>
        </div>

        {/* KPI 2: Actual Construction Progress */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-blue-300 transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {language === 'EN' ? 'Actual Construction (EV)' : 'Thi Công Thực Tế (EV)'}
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
                {metrics.latestActual !== null ? `${metrics.latestActual}%` : '---'}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-slate-400">
              {language === 'EN' ? 'Earned Volume:' : 'Khối lượng sản lượng:'}
            </span>
            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
              {metrics.latestActual !== null 
                ? `${metrics.latestActual}% ${language === 'EN' ? 'completed' : 'hoàn thành'}` 
                : (language === 'EN' ? 'As scheduled' : 'Theo kế hoạch')}
            </span>
          </div>
        </div>

        {/* KPI 3: CPI Index */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-indigo-300 transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">CPI (Cost Index)</p>
                {metrics.cpiMonthLabel && (
                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                    {language === 'EN' ? metrics.cpiMonthLabel.replace('Tháng ', 'Month ') : metrics.cpiMonthLabel}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  metrics.cpi !== null && metrics.cpi >= 1 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {metrics.cpi !== null ? metrics.cpi.toFixed(2) : '1.00'}
                </h3>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  metrics.cpi !== null && metrics.cpi >= 1 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {metrics.cpi !== null && metrics.cpi >= 1 ? t('under_budget') : t('over_budget')}
                </span>
              </div>
            </div>
            <div className={`p-3 rounded-xl border group-hover:scale-105 transition-transform ${
              metrics.cpi !== null && metrics.cpi >= 1
                ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                : 'bg-rose-50 text-rose-600 border-rose-100'
            }`}>
              {metrics.cpi !== null && metrics.cpi >= 1 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-100">
            {metrics.cpi !== null && metrics.cpi >= 1 
              ? (language === 'EN' ? 'Cost-effective disbursement (EV ≥ AC)' : 'Tỷ lệ giải ngân hiệu quả (EV ≥ AC)') 
              : (language === 'EN' ? 'Disbursement faster than construction progress' : 'Tiến độ thanh toán nhanh hơn khối lượng thi công')}
          </p>
        </div>

        {/* KPI 4: Payment vs Construction Gap */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-amber-300 transition-all duration-200 flex flex-col justify-between group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {language === 'EN' ? 'Construction vs Payment Variance' : 'Độ Lệch Thi Công - Giải Ngân'}
              </p>
              <h3 className={`text-2xl sm:text-3xl font-black tracking-tight mt-1 ${
                metrics.gap !== null && metrics.gap >= 0 ? 'text-emerald-600' : 'text-amber-600'
              }`}>
                {metrics.gap !== null ? `${metrics.gap > 0 ? '+' : ''}${metrics.gap.toFixed(1)}%` : '0%'}
              </h3>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 group-hover:scale-105 transition-transform">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="text-[11px] font-medium text-slate-400">
              {language === 'EN' ? 'Safety status:' : 'Trạng thái an toàn:'}
            </span>
            <span className={`font-bold px-2 py-0.5 rounded border text-[11px] ${
              metrics.gap !== null && metrics.gap >= 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {metrics.gap !== null && metrics.gap >= 0 
                ? (language === 'EN' ? 'Construction leads payment' : 'Thi công vượt giải ngân') 
                : (language === 'EN' ? 'Advance payment issued' : 'Thanh toán tạm ứng trước')}
            </span>
          </div>
        </div>

      </div>

      {/* RECHARTS LINE CHART SECTION */}
      <div className="bg-white p-5 sm:p-6 md:p-8 rounded-2xl shadow-xs border border-slate-200 w-full overflow-hidden space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" /> 
              {t('payment_progress_chart')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'EN' 
                ? 'Compare actual payment progress, construction progress, and cumulative disbursement by monthly cycles' 
                : 'So sánh tiến độ thanh toán thực tế, tiến độ thi công và lũy kế giải ngân theo chu kỳ tháng'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {language === 'EN' ? 'Payment (%)' : 'Thanh toán (%)'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> {language === 'EN' ? 'Construction (%)' : 'Thi công (%)'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 font-bold">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span> {language === 'EN' ? 'Cumulative (%)' : 'Lũy kế giải ngân (%)'}
            </span>
          </div>
        </div>

        <div className="h-[380px] sm:h-[450px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={paymentTrackingData} margin={{ top: 20, bottom: 25, left: -15, right: 15 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="id" 
                tickFormatter={(val) => {
                  const d = paymentTrackingData.find(item => item.id === val);
                  return d ? (d.year ? `${d.month}/${d.year.toString().slice(2)}` : d.month) : '';
                }} 
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} 
                axisLine={false} 
                tickLine={false} 
                interval="preserveStartEnd" 
                minTickGap={35} 
              />
              <YAxis 
                type="number" 
                domain={[0, 100]} 
                tickCount={6} 
                width={40} 
                tickFormatter={(val) => `${val}%`} 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={false} 
                tickLine={false} 
              />
              <Tooltip 
                labelFormatter={(val) => {
                  const d = paymentTrackingData.find(item => item.id === val);
                  return d ? (d.year ? (language === 'EN' ? `Month ${d.month}/${d.year}` : `Tháng ${d.month}/${d.year}`) : (language === 'EN' ? `Month ${d.month}` : `Tháng ${d.month}`)) : '';
                }} 
                formatter={(value: any, name: any) => [`${value}%`, name]}
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: '1px solid #e2e8f0', 
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                  padding: '12px 16px',
                  backgroundColor: '#ffffff'
                }} 
              />
              <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }} />
              <Line 
                type="monotone" 
                dataKey="payment" 
                stroke="#10b981" 
                strokeWidth={3} 
                dot={{ r: 3, fill: '#10b981' }} 
                activeDot={{ r: 6 }} 
                name={t('payment')} 
                label={(props: any) => renderLastValueLabel(props, paymentTrackingData, 'payment', -12)} 
              />
              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke="#ef4444" 
                strokeWidth={3} 
                dot={{ r: 3, fill: '#ef4444' }} 
                activeDot={{ r: 6 }} 
                name={t('actual_progress')} 
                label={(props: any) => renderLastValueLabel(props, paymentTrackingData, 'actual', 20)} 
              />
              <Line 
                type="monotone" 
                dataKey="cumulativePayment" 
                stroke="#6366f1" 
                strokeWidth={2.5} 
                strokeDasharray="4 4" 
                dot={false} 
                name={t('cumulative_payment')} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DETAILED MONTHLY PAYMENT TABLE */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        
        {/* Table Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              {language === 'EN' ? 'Monthly Disbursement & Payment Details' : 'Chi Tiết Giải Ngân & Thanh Toán Theo Tháng'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'EN' 
                ? 'Full list of project disbursement cycles from Google Sheet' 
                : 'Danh sách toàn bộ các kỳ giải ngân dự án từ Google Sheet'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {language === 'EN' ? 'All' : 'Tất cả'} ({paymentTrackingData.length})
              </button>
              <button
                onClick={() => setFilterMode('disbursed')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterMode === 'disbursed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {language === 'EN' ? 'Disbursed' : 'Đã giải ngân'}
              </button>
              <button
                onClick={() => setFilterMode('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterMode === 'pending' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {language === 'EN' ? 'Pending' : 'Chờ giải ngân'}
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={language === 'EN' ? 'Search month/year...' : 'Tìm kiếm tháng/năm...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider">{language === 'EN' ? 'Month / Year' : 'Tháng / Năm'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">{language === 'EN' ? 'Construction (EV %)' : 'Thi công (EV %)'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">{language === 'EN' ? 'Payment (AC %)' : 'Thanh toán (AC %)'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">{language === 'EN' ? 'Variance (Gap)' : 'Chênh lệch (Gap)'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-center">{language === 'EN' ? 'CPI Index' : 'Chỉ số CPI'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-right">{language === 'EN' ? 'Cumulative' : 'Lũy kế giải ngân'}</th>
                <th className="p-3.5 font-bold text-slate-600 text-xs uppercase tracking-wider text-center">{language === 'EN' ? 'Status' : 'Trạng thái'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {filteredTableRows.length > 0 ? (
                filteredTableRows.map((row, idx) => {
                  const monthLabel = row.year 
                    ? (language === 'EN' ? `Month ${row.month}/${row.year}` : `Tháng ${row.month}/${row.year}`) 
                    : (language === 'EN' ? `Month ${row.month}` : `Tháng ${row.month}`);
                  const hasPayment = row.payment !== null && row.payment !== undefined && row.payment > 0;
                  const hasActual = row.actual !== null && row.actual !== undefined;
                  const gap = (hasActual && hasPayment) ? (row.actual - row.payment) : null;
                  const rowCpi = (hasActual && hasPayment && row.payment > 0) ? (row.actual / row.payment) : null;

                  return (
                    <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        {monthLabel}
                      </td>
                      <td className="p-3.5 text-right font-semibold text-slate-700">
                        {row.actual !== null && row.actual !== undefined ? `${row.actual}%` : '---'}
                      </td>
                      <td className="p-3.5 text-right font-bold text-emerald-600">
                        {row.payment !== null && row.payment !== undefined ? `${row.payment}%` : '---'}
                      </td>
                      <td className="p-3.5 text-right font-semibold">
                        {gap !== null ? (
                          <span className={`px-2 py-0.5 rounded font-extrabold text-[11px] ${
                            gap >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                          }`}>
                            {gap > 0 ? `+${gap.toFixed(1)}%` : `${gap.toFixed(1)}%`}
                          </span>
                        ) : '---'}
                      </td>
                      <td className="p-3.5 text-center">
                        {rowCpi !== null ? (
                          <span className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                            rowCpi >= 1.0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {rowCpi.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-bold text-indigo-600">
                        {row.cumulativePayment !== null && row.cumulativePayment !== undefined 
                          ? `${row.cumulativePayment}%` 
                          : '---'}
                      </td>
                      <td className="p-3.5 text-center">
                        {hasPayment ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {language === 'EN' ? 'Disbursed' : 'Đã giải ngân'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium text-[10px]">
                            <Clock className="w-3 h-3 text-slate-400" /> {language === 'EN' ? 'Planned' : 'Kế hoạch'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    {language === 'EN' ? 'No disbursement cycles matching filter' : 'Không tìm thấy kỳ giải ngân phù hợp với bộ lọc'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};

export default Payment;
