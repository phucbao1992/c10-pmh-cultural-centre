import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertTriangle, Clock, CheckCircle2, ExternalLink, Flag, Search, 
  Filter, MapPin, UserCheck, ShieldAlert, Calendar, Sparkles, RefreshCw, 
  Layers, ChevronRight, X
} from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { parseCSV, calculateDaysElapsed, extractSheetId, getEffectiveDefectsSheetId, fetchDefectsSheetCSV, parseDefectsFromCSV, computeDefectsSummary, FALLBACK_DEFECTS_CSV } from '../services/utils';
export { parseCSV, calculateDaysElapsed };

interface IssuesListProps {
  data?: any;
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
}

export interface DefectItem {
  id: string;
  description: string;
  location: string;
  priority: string;
  assignee: string;
  dateStr: string;
  status: string;
  isPending: boolean;
  isResolved: boolean;
  isHighPriority: boolean;
  daysElapsed: number | null;
}

const IssuesList: React.FC<IssuesListProps> = ({ language, onProtectedAction }) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;

  const [loading, setLoading] = useState(true);
  const [defects, setDefects] = useState<DefectItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'resolved' | 'high'>('pending');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const getDefectsSheetId = () => {
    return getEffectiveDefectsSheetId();
  };

  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${getDefectsSheetId()}/edit?gid=0#gid=0`;

  const loadDefectsData = async () => {
    setLoading(true);
    try {
      const sheetId = getDefectsSheetId();
      const text = await fetchDefectsSheetCSV(sheetId);
      const parsedItems = parseDefectsFromCSV(text);
      const finalItems = parsedItems.length > 0 ? parsedItems : parseDefectsFromCSV(FALLBACK_DEFECTS_CSV);
      setDefects(finalItems);
      try {
        const summary = computeDefectsSummary(finalItems);
        localStorage.setItem('c10_live_defects_summary', JSON.stringify(summary));
        window.dispatchEvent(new Event('c10-defects-updated'));
      } catch {}
    } catch (err) {
      console.error("Failed to fetch defects data from Sheet:", err);
      setDefects(parseDefectsFromCSV(FALLBACK_DEFECTS_CSV));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDefectsData();
    const handleResourceUpdated = () => loadDefectsData();
    window.addEventListener('c10-resource-updated', handleResourceUpdated);
    return () => window.removeEventListener('c10-resource-updated', handleResourceUpdated);
  }, []);

  // Compute statistics
  const stats = useMemo(() => {
    const s = computeDefectsSummary(defects);
    return {
      total: s.total,
      pending: s.pending,
      resolved: s.resolved,
      highPriority: s.highPriority,
      agingOver7Days: s.overdue7Days
    };
  }, [defects]);

  // Extract unique locations for dropdown filter
  const locationsList = useMemo(() => {
    const locs = Array.from(new Set(defects.map(d => d.location))).filter(Boolean);
    return locs.sort();
  }, [defects]);

  // Filtered defects list
  const filteredDefects = useMemo(() => {
    return defects.filter(item => {
      // Status filter
      if (statusFilter === 'pending' && !item.isPending) return false;
      if (statusFilter === 'resolved' && !item.isResolved) return false;
      if (statusFilter === 'high' && (!item.isPending || !item.isHighPriority)) return false;

      // Location filter
      if (selectedLocation !== 'all' && item.location !== selectedLocation) return false;

      // Search query
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesLoc = item.location.toLowerCase().includes(q);
        const matchesAssignee = item.assignee.toLowerCase().includes(q);
        const matchesId = item.id.toLowerCase().includes(q);
        return matchesDesc || matchesLoc || matchesAssignee || matchesId;
      }

      return true;
    });
  }, [defects, statusFilter, selectedLocation, searchTerm]);

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
        <div className="w-10 h-10 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-medium animate-pulse">{t('syncing_defects')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* HEADER BANNER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-rose-600 to-amber-600 p-3.5 rounded-xl shadow-md text-white">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{t('issues')} & NCR</h2>
              <span className="px-2.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-extrabold">
                {stats.pending} {t('unprocessed')}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {t('issues_subtitle')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={loadDefectsData}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title={t('reload_data')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleOpenSheet}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
          >
            <ExternalLink className="w-4 h-4 text-amber-400" />
            {t('open_issues_sheet')}
          </button>
        </div>
      </div>

      {/* KPI STATS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Stat 1: Pending */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-amber-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('unresolved_defects')}</p>
            <p className="text-3xl font-black text-amber-600 tracking-tight mt-1">{stats.pending}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('pending_on_site')}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100 group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 2: High Priority */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-rose-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('high_priority_l2_l3')}</p>
            <p className="text-3xl font-black text-rose-600 tracking-tight mt-1">{stats.highPriority}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('urgent_fix_required')}</p>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Stat 3: Aging > 7 days */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-red-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('aging_over_7_days')}</p>
            <p className="text-3xl font-black text-red-600 tracking-tight mt-1">{stats.agingOver7Days}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('overdue_standard_handling')}</p>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 group-hover:scale-105 transition-transform">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>
        </div>

        {/* Stat 4: Resolved */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 hover:border-emerald-300 transition-all flex items-center justify-between group">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t('resolved_completed')}</p>
            <p className="text-3xl font-black text-emerald-600 tracking-tight mt-1">{stats.resolved}</p>
            <p className="text-[11px] text-slate-400 mt-1">{t('total_recorded_defects')}: {stats.total}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 group-hover:scale-105 transition-transform">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 sm:p-5 space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl text-xs font-bold">
            <button
              onClick={() => setStatusFilter('pending')}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'pending'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              {t('unresolved_defects')} ({stats.pending})
            </button>

            <button
              onClick={() => setStatusFilter('high')}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'high'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              {t('high_priority')} ({stats.highPriority})
            </button>

            <button
              onClick={() => setStatusFilter('resolved')}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'resolved'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {t('approved')} ({stats.resolved})
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              {t('total')} ({stats.total})
            </button>
          </div>

          {/* Search & Location Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            
            {/* Location Selector */}
            {locationsList.length > 0 && (
              <div className="relative min-w-[160px]">
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-8 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                >
                  <option value="all">{language === 'EN' ? 'All Locations' : 'Tất cả vị trí'} ({locationsList.length})</option>
                  {locationsList.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>
            )}

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={language === 'EN' ? 'Search description, location, contractor...' : 'Tìm mô tả, vị trí, đội thi công...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
                title={language === 'EN' ? 'Table view' : 'Xem dạng Bảng'}
              >
                {language === 'EN' ? 'Table' : 'Bảng'}
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1.5 rounded-lg transition-all ${
                  viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                }`}
                title={language === 'EN' ? 'Card view' : 'Xem dạng Thẻ'}
              >
                {language === 'EN' ? 'Cards' : 'Thẻ'}
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* CONTENT LISTING AREA */}
      {viewMode === 'table' ? (
        
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-xs uppercase text-slate-500 font-bold">
                <tr>
                  <th className="p-3.5 text-center w-24">{t('priority')}</th>
                  <th className="p-3.5 min-w-[280px]">{t('description')}</th>
                  <th className="p-3.5 whitespace-nowrap">{t('location')}</th>
                  <th className="p-3.5 whitespace-nowrap">{language === 'EN' ? 'Contractor / Assignee' : 'Đơn vị xử lý'}</th>
                  <th className="p-3.5 whitespace-nowrap">{language === 'EN' ? 'Discovered Date' : 'Ngày phát hiện'}</th>
                  <th className="p-3.5 text-center whitespace-nowrap">{language === 'EN' ? 'Aging Days' : 'Thời gian tồn đọng'}</th>
                  <th className="p-3.5 text-center whitespace-nowrap">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredDefects.length > 0 ? (
                  filteredDefects.map((defect, idx) => {
                    const isAgingAlert = defect.isPending && defect.daysElapsed !== null && defect.daysElapsed > 7;
                    const isAgingWarn = defect.isPending && defect.daysElapsed !== null && defect.daysElapsed > 3 && defect.daysElapsed <= 7;

                    let rowBgClass = "hover:bg-slate-50/80";
                    if (isAgingAlert) rowBgClass = "bg-rose-50/40 hover:bg-rose-50/80";
                    else if (isAgingWarn) rowBgClass = "bg-amber-50/40 hover:bg-amber-50/80";

                    return (
                      <tr key={defect.id || idx} className={`transition-colors ${rowBgClass}`}>
                        
                        {/* Priority */}
                        <td className="p-3.5 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                            defect.isHighPriority 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {defect.isHighPriority ? <Flag className="w-3 h-3 text-rose-600 fill-rose-600" /> : null}
                            {defect.priority || 'Level 1'}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="p-3.5">
                          <p className="font-bold text-slate-900 leading-snug">{defect.description}</p>
                          {defect.id && (
                            <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">{defect.id}</span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="p-3.5 font-medium text-slate-700 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 border border-slate-200/60 font-semibold">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {defect.location}
                          </span>
                        </td>

                        {/* Assignee */}
                        <td className="p-3.5 font-medium text-slate-600 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            {defect.assignee}
                          </span>
                        </td>

                        {/* Date Discovered */}
                        <td className="p-3.5 text-slate-500 font-medium whitespace-nowrap">
                          {defect.dateStr || '---'}
                        </td>

                        {/* Aging Days */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {defect.daysElapsed !== null ? (
                            <span className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                              isAgingAlert 
                                ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                                : isAgingWarn 
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}>
                              {defect.daysElapsed} {t('days')}
                            </span>
                          ) : (
                            <span className="text-slate-300">---</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          {defect.isResolved ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full font-bold text-[10px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {defect.status}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-extrabold text-[10px] ${
                              defect.isHighPriority
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              <Clock className="w-3 h-3" /> {defect.status || (language === 'EN' ? 'Pending' : 'Chưa sửa')}
                            </span>
                          )}
                        </td>

                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
                      <p className="text-sm font-semibold">{language === 'EN' ? 'No defects match the search criteria' : 'Không có lỗi nào phù hợp với điều kiện tìm kiếm'}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      ) : (

        /* CARD GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDefects.length > 0 ? (
            filteredDefects.map((defect, idx) => {
              const isAgingAlert = defect.isPending && defect.daysElapsed !== null && defect.daysElapsed > 7;

              return (
                <div 
                  key={defect.id || idx}
                  className={`bg-white p-5 rounded-2xl border shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                    isAgingAlert 
                      ? 'border-rose-300 bg-gradient-to-b from-rose-50/30 to-white' 
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider ${
                        defect.isHighPriority 
                          ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {defect.priority || 'Level 1'}
                      </span>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        defect.isResolved 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {defect.status || (language === 'EN' ? 'Pending' : 'Chưa sửa')}
                      </span>
                    </div>

                    {/* Description */}
                    <h4 className="font-bold text-slate-900 text-sm leading-snug mb-3">
                      {defect.description}
                    </h4>

                    {/* Details badges */}
                    <div className="space-y-2 text-xs text-slate-600 mb-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-800">{defect.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span>{language === 'EN' ? 'Contractor:' : 'Đơn vị:'} {defect.assignee}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                    <span>{language === 'EN' ? 'Discovered:' : 'Phát hiện:'} {defect.dateStr || '---'}</span>
                    {defect.daysElapsed !== null && (
                      <span className={`font-bold ${isAgingAlert ? 'text-rose-600' : 'text-slate-600'}`}>
                        {defect.daysElapsed} {language === 'EN' ? 'days aging' : 'ngày tồn đọng'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400">
              {language === 'EN' ? 'No matching defects found' : 'Không tìm thấy lỗi phù hợp'}
            </div>
          )}
        </div>

      )}

    </div>
  );
};

export default IssuesList;
