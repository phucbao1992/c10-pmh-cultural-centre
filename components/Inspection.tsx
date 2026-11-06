import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, FileText, CheckCircle, ExternalLink, ClipboardCheck, 
  Sparkles, Clock, X
} from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { fetchInspectionData, InspectionData, InspectionItem } from '../services/sheetsService';

interface InspectionProps {
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
}

interface TaggedInspectionItem extends InspectionItem {
  category: 'test' | 'construction';
  categoryLabel: string;
  originalIndex: number;
  totalCount: number;
}

const Inspection: React.FC<InspectionProps> = ({ language, onProtectedAction }) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;
  const [data, setData] = useState<InspectionData | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [searchTestReport, setSearchTestReport] = useState('');
  const [searchConstruction, setSearchConstruction] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const result = await fetchInspectionData();
      setData(result);
      setLoading(false);
    };
    loadData();
  }, []);

  // Compute 5 most recently uploaded documents from the sheet
  const latestDocuments = useMemo<TaggedInspectionItem[]>(() => {
    if (!data) return [];
    
    const testItems: TaggedInspectionItem[] = (data.testReports || []).map((item, idx) => ({
      ...item,
      category: 'test',
      categoryLabel: language === 'EN' ? 'Test Report' : 'Báo cáo thí nghiệm',
      originalIndex: idx,
      totalCount: data.testReports.length
    }));

    const constrItems: TaggedInspectionItem[] = (data.constructionInspections || []).map((item, idx) => ({
      ...item,
      category: 'construction',
      categoryLabel: language === 'EN' ? 'Construction Inspection' : 'Nghiệm thu thi công',
      originalIndex: idx,
      totalCount: data.constructionInspections.length
    }));

    const combined = [...testItems, ...constrItems];
    
    // Sort descending by relative recency score (index / totalCount)
    // higher score means uploaded closer to the end of the sheet
    return combined.sort((a, b) => {
      const scoreA = (a.originalIndex + 1) / Math.max(1, a.totalCount);
      const scoreB = (b.originalIndex + 1) / Math.max(1, b.totalCount);
      return scoreB - scoreA;
    }).slice(0, 5);
  }, [data]);

  // Filtered lists for the 2 search boxes
  const filteredTestReports = useMemo(() => {
    if (!data?.testReports) return [];
    const query = searchTestReport.trim().toLowerCase();
    if (!query) return data.testReports; // Show full list when empty
    return data.testReports.filter(item => item.name.toLowerCase().includes(query));
  }, [data, searchTestReport]);

  const filteredConstructionInspections = useMemo(() => {
    if (!data?.constructionInspections) return [];
    const query = searchConstruction.trim().toLowerCase();
    if (!query) return data.constructionInspections; // Show full list when empty
    return data.constructionInspections.filter(item => item.name.toLowerCase().includes(query));
  }, [data, searchConstruction]);

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    if (onProtectedAction) {
      onProtectedAction(e, url);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[450px] gap-3">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-slate-500 font-medium animate-pulse">
          {language === 'EN' ? 'Loading inspection records from Google Sheets...' : 'Đang tải dữ liệu hồ sơ nghiệm thu từ Google Sheet...'}
        </p>
      </div>
    );
  }

  const totalTestCount = data?.testReports.length || 0;
  const totalConstrCount = data?.constructionInspections.length || 0;
  const totalAllCount = totalTestCount + totalConstrCount;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-3.5 rounded-xl shadow-md text-white">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-900">{t('inspection')}</h2>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-extrabold">
                {totalAllCount} {language === 'EN' ? 'documents' : 'tài liệu'}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {language === 'EN' 
                ? 'Look up construction inspection records and material testing report results' 
                : 'Tra cứu biên bản nghiệm thu công việc thi công và kết quả báo cáo thí nghiệm vật liệu'}
            </p>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{language === 'EN' ? 'Testing' : 'Thí nghiệm'}</p>
            <p className="text-base font-extrabold text-blue-600">{totalTestCount}</p>
          </div>
          <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{language === 'EN' ? 'Inspection' : 'Nghiệm thu'}</p>
            <p className="text-base font-extrabold text-emerald-600">{totalConstrCount}</p>
          </div>
        </div>
      </div>

      {/* TOP SECTION: 5 TÀI LIỆU MỚI NHẤT VỪA UPLOAD TRÊN SHEET */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-lg border border-slate-700/80 space-y-4 relative overflow-hidden">
        {/* Glow backdrop accent */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Section Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3.5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {language === 'EN' ? '5 Latest Uploaded Documents' : '5 Tài Liệu Mới Nhất Vừa Upload Cập Nhật'}
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                  {language === 'EN' ? 'Latest' : 'Mới nhất'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'EN' ? 'Top 5 inspection & test records recently added to Google Sheet' : 'Top 5 hồ sơ nghiệm thu & thí nghiệm vừa được đưa lên sheet'}
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 w-fit">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            {language === 'EN' ? 'Auto-synced with Sheet' : 'Tự động đồng bộ theo Sheet'}
          </div>
        </div>

        {/* 5 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 relative z-10">
          {latestDocuments.map((item, idx) => {
            const isTest = item.category === 'test';
            return (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleLinkClick(e, item.url)}
                className="group bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-amber-400/50 p-4 rounded-xl transition-all duration-200 flex flex-col justify-between h-full shadow-sm hover:shadow-md relative"
              >
                <div>
                  {/* Category badge & index tag */}
                  <div className="flex items-center justify-between gap-1 mb-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      isTest 
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {isTest ? (language === 'EN' ? 'Testing' : 'Thí nghiệm') : (language === 'EN' ? 'Inspection' : 'Nghiệm thu')}
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Document Name */}
                  <h4 className="text-xs font-semibold text-slate-100 group-hover:text-amber-300 transition-colors line-clamp-3 leading-relaxed">
                    {item.name}
                  </h4>
                </div>

                {/* Footer action button */}
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-amber-300 transition-colors font-medium">
                  <span>{language === 'EN' ? 'Open file' : 'Mở xem file'}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* BOTTOM SECTION: 2 KHUNG TÌM KIẾM NHƯ TRƯỚC ĐÂY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* KHUNG TÌM KIẾM 1: BÁO CÁO THÍ NGHIỆM */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
          
          {/* Box Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">{t('test_report')}</h3>
                  <p className="text-[11px] text-slate-400">{language === 'EN' ? 'Material testing certificates & lab results' : 'Chứng chỉ kết quả thí nghiệm vật liệu'}</p>
                </div>
              </div>
              <span className="bg-blue-100 text-blue-700 py-1 px-3 rounded-full text-xs font-extrabold">
                {filteredTestReports.length} / {totalTestCount}
              </span>
            </div>

            {/* Search Input Box */}
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs font-medium transition-all"
                placeholder={language === 'EN' ? 'Search test report name...' : 'Tìm kiếm tên báo cáo thí nghiệm...'}
                value={searchTestReport}
                onChange={(e) => setSearchTestReport(e.target.value)}
              />
              {searchTestReport && (
                <button
                  onClick={() => setSearchTestReport('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Document List */}
          <div className="p-3 overflow-y-auto flex-1 custom-scrollbar">
            {filteredTestReports.length > 0 ? (
              <ul className="space-y-2">
                {filteredTestReports.map((item, index) => (
                  <li key={index}>
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => handleLinkClick(e, item.url)}
                      className="group flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-blue-50/60 border border-slate-100 hover:border-blue-200 transition-all duration-200"
                    >
                      <div className="mt-0.5 p-1.5 bg-white rounded-lg border border-slate-200 text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-800 font-semibold group-hover:text-blue-700 transition-colors leading-snug">
                          {item.name}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-600 opacity-60 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 py-12">
                <FileText className="w-10 h-10 opacity-20" />
                <p className="text-xs font-medium">{language === 'EN' ? 'No matching test reports found' : 'Không tìm thấy báo cáo phù hợp'}</p>
              </div>
            )}
          </div>
        </div>

        {/* KHUNG TÌM KIẾM 2: NGHIỆM THU THI CÔNG */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
          
          {/* Box Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">{t('construction_inspection')}</h3>
                  <p className="text-[11px] text-slate-400">{language === 'EN' ? 'Construction work acceptance records' : 'Biên bản nghiệm thu công việc xây dựng'}</p>
                </div>
              </div>
              <span className="bg-emerald-100 text-emerald-700 py-1 px-3 rounded-full text-xs font-extrabold">
                {filteredConstructionInspections.length} / {totalConstrCount}
              </span>
            </div>

            {/* Search Input Box */}
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-9 pr-8 py-2 border border-slate-200 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs font-medium transition-all"
                placeholder={language === 'EN' ? 'Search construction inspection name...' : 'Tìm kiếm tên biên bản nghiệm thu thi công...'}
                value={searchConstruction}
                onChange={(e) => setSearchConstruction(e.target.value)}
              />
              {searchConstruction && (
                <button
                  onClick={() => setSearchConstruction('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Document List */}
          <div className="p-3 overflow-y-auto flex-1 custom-scrollbar">
            {filteredConstructionInspections.length > 0 ? (
              <ul className="space-y-2">
                {filteredConstructionInspections.map((item, index) => (
                  <li key={index}>
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => handleLinkClick(e, item.url)}
                      className="group flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-emerald-50/60 border border-slate-100 hover:border-emerald-200 transition-all duration-200"
                    >
                      <div className="mt-0.5 p-1.5 bg-white rounded-lg border border-slate-200 text-slate-400 group-hover:text-emerald-600 group-hover:border-emerald-300 transition-colors">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-800 font-semibold group-hover:text-emerald-700 transition-colors leading-snug">
                          {item.name}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 opacity-60 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 py-12">
                <CheckCircle className="w-10 h-10 opacity-20" />
                <p className="text-xs font-medium">{language === 'EN' ? 'No matching inspection records found' : 'Không tìm thấy biên bản nghiệm thu phù hợp'}</p>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};

export default Inspection;
