import React, { useState, useRef, useEffect } from 'react';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
    ExternalLink, Activity, Layers, Building2, Gauge, 
    Home, Compass, Route, ShieldCheck, FileSpreadsheet, CheckCircle2, ArrowDown,
    RefreshCw, Database, Upload, X, AlertTriangle, Radio, PlusCircle,
    Send, Copy, Check, Trash2, Settings2, Code2, HelpCircle, Info, Calendar, FileText
} from 'lucide-react';
import { 
    MonitoringData, 
    MonitoringSumItem, 
    getMonitoringSourceConfig, 
    saveMonitoringSourceConfig, 
    parseMonitoringWorkbookFromBuffer,
    extractSheetId,
    CATEGORY_META_INFO,
    CustomMonitoringCycleEntry,
    getCustomMonitoringCycles,
    saveCustomMonitoringCycle,
    removeCustomMonitoringCycle,
    clearAllCustomMonitoringCycles,
    predictNextCycleName,
    formatCycleRowForClipboard,
    syncCycleToGoogleSheetViaWebhook,
    generateMonitoringAppsScriptCode,
    MONITORING_WEBHOOK_URL_KEY
} from '../services/sheetsService';
import { TRANSLATIONS, ENABLE_PASSWORD_PROTECTION } from '../constants';
import { Language } from '../types';
import PasswordProtection from './PasswordProtection';

interface MonitoringProps {
    data: MonitoringData | null;
    loading: boolean;
    error: boolean;
    language: Language;
    onRefresh?: () => Promise<void>;
    isAdmin?: boolean;
}

const colors = [
    '#dc2626', // First line is Warning (Cảnh báo), explicitly requested red
    '#2563eb', '#16a34a', '#d97706', '#9333ea', 
    '#0ea5e9', '#ec4899', '#facc15', '#14b8a6', '#6366f1'
];

// Helper to map category id to icon and scroll target
const getCategoryMeta = (id: string) => {
    switch (id) {
        case 'icl':
            return { icon: Layers, color: 'text-blue-600 bg-blue-50 border-blue-200', targetId: 'chart-icl' };
        case 'tc':
            return { icon: Building2, color: 'text-indigo-600 bg-indigo-50 border-indigo-200', targetId: 'chart-tc' };
        case 'ss':
            return { icon: Gauge, color: 'text-amber-600 bg-amber-50 border-amber-200', targetId: 'chart-ss' };
        case 'sm':
            return { icon: Home, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', targetId: 'chart-sm' };
        case 'tm':
            return { icon: Compass, color: 'text-purple-600 bg-purple-50 border-purple-200', targetId: 'chart-tm' };
        case 'rsm':
            return { icon: Route, color: 'text-rose-600 bg-rose-50 border-rose-200', targetId: 'chart-rsm' };
        case 'tdw':
            return { icon: ShieldCheck, color: 'text-cyan-600 bg-cyan-50 border-cyan-200', targetId: 'chart-tdw' };
        default:
            return { icon: Activity, color: 'text-blue-600 bg-blue-50 border-blue-200', targetId: '' };
    }
};

type MonitoringCatKey = 'ICL' | 'TC' | 'SS' | 'SM' | 'TM' | 'RSM' | 'TDW';

const Monitoring: React.FC<MonitoringProps> = ({ data, loading, error, language, onRefresh, isAdmin }) => {
    const t = (key: string) => TRANSLATIONS[language][key] || key;
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    const [sheetInput, setSheetInput] = useState(() => getMonitoringSourceConfig().customSheetId || '');
    const [sourceNotice, setSourceNotice] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Two-Way Sync Modal states
    const [isAddCycleModalOpen, setIsAddCycleModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState<'form' | 'list' | 'webhook'>('form');
    const [selectedCat, setSelectedCat] = useState<MonitoringCatKey>('ICL');
    const [cycleNameInput, setCycleNameInput] = useState('CK 11');
    const [cycleDateInput, setCycleDateInput] = useState('');
    const [sensorMeasurements, setSensorMeasurements] = useState<Record<string, string>>({});
    const [cycleNoteInput, setCycleNoteInput] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
    const [clipboardCopied, setClipboardCopied] = useState(false);
    const [webhookUrlInput, setWebhookUrlInput] = useState(() => {
        try {
            return localStorage.getItem(MONITORING_WEBHOOK_URL_KEY) || localStorage.getItem('c10_daily_report_webhook_url') || '';
        } catch {
            return '';
        }
    });

    // Listen to monitoring custom data changes
    useEffect(() => {
        const handleDataChanged = () => {
            if (onRefresh) onRefresh();
        };
        window.addEventListener('c10-monitoring-data-changed', handleDataChanged);
        return () => window.removeEventListener('c10-monitoring-data-changed', handleDataChanged);
    }, [onRefresh]);

    const handleGoToClick = () => {
        if (!ENABLE_PASSWORD_PROTECTION) {
            window.open('https://drive.google.com/drive/folders/1jBXd3QDYnCmCWHjys2Wt-uqg57r3n6Ba', '_blank', 'noopener,noreferrer');
        } else {
            setIsPasswordModalOpen(true);
        }
    };

    const handlePasswordSuccess = () => {
        setIsPasswordModalOpen(false);
        window.open('https://drive.google.com/drive/folders/1jBXd3QDYnCmCWHjys2Wt-uqg57r3n6Ba', '_blank', 'noopener,noreferrer');
    };

    const handleManualRefresh = async () => {
        if (!onRefresh || isRefreshing) return;
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setTimeout(() => setIsRefreshing(false), 400);
        }
    };

    const handleSaveSheetLink = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = sheetInput.trim();
        if (!trimmed) {
            await saveMonitoringSourceConfig({
                sourceType: 'default_file',
                fileName: 'C10 Tổng hợp kết quả quan trắc'
            });
            setSourceNotice('Đã chuyển về file C10 Tổng hợp kết quả quan trắc mặc định.');
        } else {
            const extracted = extractSheetId(trimmed);
            await saveMonitoringSourceConfig({
                sourceType: 'custom_sheet',
                customSheetId: extracted,
                fileName: 'Google Sheet Quan Trắc C10'
            });
            setSourceNotice('Đã kết nối Google Sheet thời gian thực cho toàn bộ biểu đồ và tổng hợp quan trắc!');
        }
        if (onRefresh) await onRefresh();
        setTimeout(() => {
            setSourceNotice(null);
            setIsSourceModalOpen(false);
        }, 1000);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const newConfig = parseMonitoringWorkbookFromBuffer(buffer, file.name);
            await saveMonitoringSourceConfig(newConfig);
            setSourceNotice(`Đã đồng bộ thời gian thực từ file "${file.name}" cho toàn bộ biểu đồ & tổng hợp!`);
            if (onRefresh) await onRefresh();
            setTimeout(() => {
                setSourceNotice(null);
                setIsSourceModalOpen(false);
            }, 1000);
        } catch (err) {
            setSourceNotice('Không thể đọc file. Vui lòng chọn file Excel (.xlsx) hoặc CSV hợp lệ.');
        }
    };

    const handleResetSource = async () => {
        setSheetInput('');
        await saveMonitoringSourceConfig({
            sourceType: 'default_file',
            fileName: 'C10 Tổng hợp kết quả quan trắc'
        });
        setSourceNotice('Đã đặt lại về nguồn file C10 Tổng hợp kết quả quan trắc mới nhất.');
        if (onRefresh) await onRefresh();
        setTimeout(() => {
            setSourceNotice(null);
            setIsSourceModalOpen(false);
        }, 900);
    };

    const scrollToChart = (targetId: string) => {
        if (!targetId) return;
        const el = document.getElementById(targetId);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Helper functions for Two-Way Monitoring Sync
    const getCategoryChartData = (cat: MonitoringCatKey) => {
        if (!data) return null;
        switch (cat) {
            case 'ICL': return data.chartIcl;
            case 'TC': return data.chartTc;
            case 'SS': return data.chartSs;
            case 'SM': return data.chartSm;
            case 'TM': return data.chartTm;
            case 'RSM': return data.chartRsm;
            case 'TDW': return data.chartTdw;
            default: return null;
        }
    };

    const getCategorySensors = (cat: MonitoringCatKey): string[] => {
        const chart = getCategoryChartData(cat);
        if (chart && chart.headers && chart.headers.length > 0) {
            const filtered = chart.headers.filter((h: string) => 
                h && 
                !h.toLowerCase().includes('cảnh báo') && 
                !h.toLowerCase().includes('warning') && 
                !h.startsWith('-') && 
                !h.toLowerCase().includes('ngày') && 
                !h.toLowerCase().includes('date') &&
                !h.toLowerCase().includes('ck') && 
                !h.toLowerCase().includes('chu kỳ')
            );
            if (filtered.length > 0) return filtered;
        }
        return CATEGORY_META_INFO[cat]?.defaultSensors || [];
    };

    const getCategoryCycles = (cat: MonitoringCatKey): string[] => {
        const chart = getCategoryChartData(cat);
        return (chart?.data || []).map((d: any) => String(d.name || '').trim());
    };

    const openAddCycleModal = (cat?: MonitoringCatKey) => {
        const targetCat = cat || selectedCat || 'ICL';
        setSelectedCat(targetCat);
        const cycles = getCategoryCycles(targetCat);
        const predicted = predictNextCycleName(cycles);
        setCycleNameInput(predicted);

        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        setCycleDateInput(`${d}/${m}/${y}`);

        const sensors = getCategorySensors(targetCat);
        const initialMeas: Record<string, string> = {};
        sensors.forEach(s => { initialMeas[s] = ''; });
        setSensorMeasurements(initialMeas);
        setCycleNoteInput('');
        setSyncNotice(null);
        setModalTab('form');
        setIsAddCycleModalOpen(true);
    };

    const handleSwitchCategory = (cat: MonitoringCatKey) => {
        setSelectedCat(cat);
        const cycles = getCategoryCycles(cat);
        setCycleNameInput(predictNextCycleName(cycles));
        const sensors = getCategorySensors(cat);
        const nextMeas: Record<string, string> = {};
        sensors.forEach(s => {
            nextMeas[s] = sensorMeasurements[s] || '';
        });
        setSensorMeasurements(nextMeas);
    };

    const handleSaveLocalCycle = async () => {
        if (!cycleNameInput.trim()) {
            setSyncNotice({ type: 'error', text: 'Vui lòng nhập tên chu kỳ (ví dụ: CK 11).' });
            return;
        }

        const numericMeas: Record<string, number> = {};
        let hasValue = false;
        Object.entries(sensorMeasurements).forEach(([k, v]) => {
            const trimmed = String(v || '').trim().replace(',', '.');
            if (trimmed !== '' && !isNaN(Number(trimmed))) {
                numericMeas[k] = parseFloat(trimmed);
                hasValue = true;
            }
        });

        if (!hasValue) {
            setSyncNotice({ type: 'error', text: 'Vui lòng nhập ít nhất một số liệu đo của cảm biến.' });
            return;
        }

        const entry: CustomMonitoringCycleEntry = {
            category: selectedCat,
            cycle: cycleNameInput.trim(),
            date: cycleDateInput.trim(),
            measurements: numericMeas,
            note: cycleNoteInput.trim(),
            createdAt: new Date().toISOString()
        };

        saveCustomMonitoringCycle(entry);
        setSyncNotice({
            type: 'success',
            text: `Đã lưu chu kỳ ${entry.cycle} thành công! Biểu đồ và thông số tổng hợp đã được cập nhật tức thì trên Web App.`
        });

        if (onRefresh) {
            await onRefresh();
        }
    };

    const handleSyncWebhook = async () => {
        setIsSyncing(true);
        setSyncNotice(null);
        try {
            const numericMeas: Record<string, number> = {};
            Object.entries(sensorMeasurements).forEach(([k, v]) => {
                const trimmed = String(v || '').trim().replace(',', '.');
                if (trimmed !== '' && !isNaN(Number(trimmed))) {
                    numericMeas[k] = parseFloat(trimmed);
                }
            });

            const entry: CustomMonitoringCycleEntry = {
                category: selectedCat,
                cycle: cycleNameInput.trim() || 'CK 11',
                date: cycleDateInput.trim(),
                measurements: numericMeas,
                note: cycleNoteInput.trim(),
                createdAt: new Date().toISOString()
            };

            // Save locally so the chart renders the new point immediately
            saveCustomMonitoringCycle(entry);

            const chart = getCategoryChartData(selectedCat);
            const headers = chart?.headers && chart.headers.length > 0 
                ? chart.headers 
                : ['CK', 'Ngày', ...Object.keys(numericMeas)];

            const result = await syncCycleToGoogleSheetViaWebhook(entry, headers, webhookUrlInput);

            if (result.success) {
                setSyncNotice({ type: 'success', text: result.message });
            } else {
                setSyncNotice({ type: 'info', text: result.message });
            }

            if (onRefresh) await onRefresh();
        } catch (err: any) {
            setSyncNotice({ type: 'error', text: `Lỗi kết nối Webhook: ${err.message || 'Không thể gửi'}` });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCopyTsvRow = () => {
        const numericMeas: Record<string, number> = {};
        Object.entries(sensorMeasurements).forEach(([k, v]) => {
            const trimmed = String(v || '').trim().replace(',', '.');
            if (trimmed !== '' && !isNaN(Number(trimmed))) {
                numericMeas[k] = parseFloat(trimmed);
            }
        });

        const entry: CustomMonitoringCycleEntry = {
            category: selectedCat,
            cycle: cycleNameInput.trim() || 'CK 11',
            date: cycleDateInput.trim(),
            measurements: numericMeas,
            note: cycleNoteInput.trim(),
            createdAt: new Date().toISOString()
        };

        const chart = getCategoryChartData(selectedCat);
        const headers = chart?.headers && chart.headers.length > 0 
            ? chart.headers 
            : ['CK', 'Ngày', ...Object.keys(numericMeas)];

        const tsv = formatCycleRowForClipboard(entry, headers);

        navigator.clipboard.writeText(tsv).then(() => {
            setClipboardCopied(true);
            setSyncNotice({
                type: 'success',
                text: `Đã sao chép dòng số liệu ${entry.cycle}! Bạn chỉ cần mở tab ${selectedCat} trên Google Sheet, chọn dòng trống tiếp theo và nhấn Ctrl + V để dán.`
            });
            setTimeout(() => setClipboardCopied(false), 3500);
        }).catch(() => {
            setSyncNotice({ type: 'error', text: 'Không thể truy cập Clipboard trình duyệt.' });
        });
    };

    const handleSaveWebhookSettings = (e: React.FormEvent) => {
        e.preventDefault();
        try {
            localStorage.setItem(MONITORING_WEBHOOK_URL_KEY, webhookUrlInput.trim());
            setSyncNotice({ type: 'success', text: 'Đã lưu URL Webhook Google Apps Script thành công!' });
        } catch (err) {
            setSyncNotice({ type: 'error', text: 'Không thể lưu URL Webhook.' });
        }
    };

    const handleCopyAppsScriptCode = () => {
        const code = generateMonitoringAppsScriptCode();
        navigator.clipboard.writeText(code).then(() => {
            setSyncNotice({ type: 'success', text: 'Đã sao chép mã nguồn Google Apps Script vào bộ nhớ tạm!' });
        }).catch(() => {
            setSyncNotice({ type: 'error', text: 'Không thể sao chép mã nguồn.' });
        });
    };

    const handleDeleteCustomCycle = async (category: string, cycle: string) => {
        removeCustomMonitoringCycle(category, cycle);
        setSyncNotice({ type: 'info', text: `Đã gỡ chu kỳ ${cycle} khỏi bộ nhớ tạm Web App.` });
        if (onRefresh) await onRefresh();
    };

    const handleClearAllCustom = async () => {
        clearAllCustomMonitoringCycles();
        setSyncNotice({ type: 'info', text: 'Đã xóa toàn bộ chu kỳ tùy chỉnh trên máy.' });
        if (onRefresh) await onRefresh();
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-medium">{t('updating_data')}</p>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="flex items-center justify-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
                <p className="text-red-500 font-medium">{t('failed_to_load')}</p>
            </div>
        );
    }

    const getSumItemById = (catId: string): MonitoringSumItem | undefined => {
        return data.sumData?.find(s => s.id === catId);
    };

    const translateMonitoringTitle = (title: string, id: string) => {
        if (language !== 'EN') return title;
        switch (id) {
            case 'icl': return 'Diaphragm Wall Displacement';
            case 'tc': return 'Tower Crane Foundation Displacement';
            case 'ss': return 'Strut Stress Monitoring';
            case 'sm': return 'Adjacent Settlement Monitoring';
            case 'tm': return 'Adjacent Tilt Monitoring';
            case 'rsm': return 'Road Settlement Monitoring';
            case 'tdw': return 'Diaphragm Wall Top Monitoring';
            default: return title;
        }
    };

    const translateSensorLabel = (sensor?: string) => {
        if (language !== 'EN' || !sensor) return sensor || '';
        return sensor
            .replace(/Giá trị lớn nhất/gi, 'Max value')
            .replace(/Vị trí/gi, 'Position');
    };

    const renderStatusBadge = (status?: 'SAFE' | 'WARNING' | 'DANGER') => {
        if (status === 'DANGER') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                    <AlertTriangle className="w-3 h-3" />
                    {language === 'EN' ? 'Exceeded' : 'Vượt ngưỡng'}
                </span>
            );
        }
        if (status === 'WARNING') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3 h-3" />
                    {language === 'EN' ? 'Warning' : 'Cận cảnh báo'}
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />
                {language === 'EN' ? 'Safe' : 'An toàn'}
            </span>
        );
    };

    const customCyclesList = getCustomMonitoringCycles();

    const renderChart = (
        id: string,
        catId: string,
        categoryKey: MonitoringCatKey,
        title: string,
        axisName: string,
        chartData: any[],
        headers: string[],
        unit: string = 'mm(±)',
        unitDesc: string = 'mm'
    ) => {
        if (!chartData || chartData.length === 0) return null;
        const summaryItem = getSumItemById(catId);

        return (
            <div id={id} className="bg-white p-3 sm:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col scroll-mt-6">
                <div className="mb-4 sm:mb-6 px-1 sm:px-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-base sm:text-lg">{title}</h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                {categoryKey}
                            </span>
                        </div>
                        {summaryItem && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                {language === 'EN' ? 'Latest update cycle:' : 'Chu kỳ cập nhật mới nhất:'} <span className="font-bold text-blue-600">{summaryItem.latestCycle}</span>
                                {' • '}
                                {language === 'EN' ? 'Max value:' : 'Giá trị lớn nhất:'} <span className="font-bold text-slate-800">{summaryItem.maxVal} {unitDesc}</span> ({translateSensorLabel(summaryItem.maxSensor)})
                                {' • '}
                                {language === 'EN' ? 'Warning threshold:' : 'Ngưỡng cảnh báo:'} <span className="font-semibold text-red-600">{summaryItem.warningVal} {unitDesc}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                            onClick={() => openAddCycleModal(categoryKey)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                            title={`Nhập chu kỳ mới cho ${categoryKey}`}
                        >
                            <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>+ Nhập {categoryKey}</span>
                        </button>
                        {summaryItem && (
                            <>
                                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                                    {summaryItem.latestCycle}: {summaryItem.maxVal}/{summaryItem.warningVal} {unitDesc} ({summaryItem.ratio}%)
                                </span>
                                {renderStatusBadge(summaryItem.status)}
                            </>
                        )}
                    </div>
                </div>
                <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 40, right: 10, left: -5, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="name" 
                                stroke="#64748b"
                                fontSize={12}
                                tickMargin={10}
                                label={{ value: axisName, position: 'insideBottomRight', offset: -10, fill: '#64748b', fontSize: 12 }}
                            />
                            <YAxis 
                                stroke="#64748b"
                                fontSize={12}
                                width={40}
                                tickFormatter={(val) => `${val}`}
                                label={{ value: unit, position: 'top', offset: 15, fill: '#64748b', fontSize: 12 }}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number) => [`${value} ${unitDesc}`, '']}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            {headers.map((header, index) => {
                                const isWarning = header.toLowerCase().includes('cảnh báo') || header.toLowerCase().includes('warning');
                                const isNegativeWarning = header.startsWith('-');
                                return (
                                    <Line 
                                        key={header}
                                        type="monotone" 
                                        dataKey={header} 
                                        stroke={isWarning ? '#dc2626' : colors[(index + 1) % colors.length] || colors[1]}
                                        strokeWidth={isWarning ? 2 : 1.5}
                                        strokeDasharray={isWarning ? "5 5" : undefined}
                                        dot={isWarning ? false : { r: 3, strokeWidth: 1 }}
                                        activeDot={{ r: 5 }}
                                        legendType={isNegativeWarning ? "none" : undefined}
                                    />
                                );
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    };

    return (
        <div className="p-3 sm:p-6 space-y-6">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{t('monitoring')}</h2>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                {language === 'EN' ? 'Real-time (Live Two-Way Sync)' : 'Đồng bộ 2 chiều thời gian thực (Live)'}
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">{t('monitoring_desc')}</p>
                        {data.sourceLabel && (
                            <p className="text-[11px] text-slate-400 font-medium mt-1 flex items-center gap-2">
                                <Radio className="w-3.5 h-3.5 text-blue-500" />
                                <span>{language === 'EN' ? 'Source:' : 'Nguồn:'} <strong className="text-slate-600">{data.sourceLabel}</strong></span>
                                {data.lastUpdated && (
                                    <span>• {language === 'EN' ? 'Updated at:' : 'Cập nhật lúc:'} <strong className="text-slate-600">{data.lastUpdated}</strong></span>
                                )}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                    {/* Two-Way Sync Entry Button */}
                    <button
                        onClick={() => openAddCycleModal()}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs transition-colors text-xs sm:text-sm"
                        title={language === 'EN' ? 'Add new cycle (Two-way sync Sheet & App)' : 'Nhập chu kỳ mới (Đồng bộ 2 chiều Sheet & App)'}
                    >
                        <PlusCircle className="w-4 h-4" />
                        <span>{language === 'EN' ? '+ Add New Cycle' : '+ Nhập Chu Kỳ Mới'}</span>
                    </button>

                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors text-xs sm:text-sm"
                        title={language === 'EN' ? 'Refresh real-time data' : 'Làm mới số liệu thời gian thực'}
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
                        <span>{language === 'EN' ? 'Refresh' : 'Làm mới'}</span>
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setIsSourceModalOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl font-semibold hover:bg-indigo-100 transition-colors text-xs sm:text-sm"
                        >
                            <Database className="w-4 h-4" />
                            <span>{language === 'EN' ? 'File Source / Sheet Link' : 'Nguồn file / Link Sheet'}</span>
                        </button>
                    )}
                    <button 
                        onClick={handleGoToClick}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl font-semibold hover:bg-blue-100 transition-colors text-xs sm:text-sm"
                    >
                        {t('go_to')}
                        <ExternalLink className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Khung Tổng hợp quan trắc (Tính toán & đồng bộ thời gian thực từ dữ liệu 7 biểu đồ) */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                                {language === 'EN' ? 'Comprehensive Geotechnical Monitoring Summary' : 'Tổng Hợp Kết Quả Quan Trắc Địa Kỹ Thuật'}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {language === 'EN' 
                                    ? 'Auto-computed from 7 monitoring categories (Real-time Sheet & App sync)' 
                                    : 'Tự động tính toán & phân tích xu hướng trực tiếp từ số liệu 7 biểu đồ quan trắc (Đồng bộ 2 chiều)'}
                            </p>
                        </div>
                    </div>
                    {data.sumData && data.sumData.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
                                {language === 'EN' ? `${data.sumData.length} Categories` : `Đang theo dõi ${data.sumData.length} hạng mục`}
                            </span>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(data.sumData || []).map((item) => {
                        const meta = getCategoryMeta(item.id);
                        const Icon = meta.icon;

                        return (
                            <div 
                                key={item.id} 
                                onClick={() => scrollToChart(meta.targetId)}
                                className="group relative flex flex-col justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all duration-200 cursor-pointer"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2 mb-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`p-1.5 rounded-lg border ${meta.color} shrink-0`}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <h4 className="font-bold text-xs sm:text-sm text-slate-800 truncate group-hover:text-blue-600 transition-colors" title={item.title}>
                                                {translateMonitoringTitle(item.title, item.id)}
                                            </h4>
                                        </div>
                                        {renderStatusBadge(item.status)}
                                    </div>

                                    {item.latestCycle && (
                                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 text-[11px]">
                                            <span className="font-semibold text-slate-400">
                                                {language === 'EN' ? 'Cycle:' : 'Chu kỳ:'}
                                            </span>
                                            <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                {item.latestCycle}
                                            </span>
                                            {item.maxVal !== undefined && (
                                                <span className="text-slate-600 ml-auto font-medium">
                                                    Max: <strong className="text-slate-800">{item.maxVal} {item.unit}</strong>
                                                    {item.maxSensor ? ` (${translateSensorLabel(item.maxSensor)})` : ''}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="text-xs text-slate-600 leading-relaxed font-normal whitespace-pre-line">
                                        {item.content}
                                    </div>
                                </div>

                                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-blue-600 transition-colors">
                                    <span className="font-medium">
                                        {language === 'EN' ? 'Click to view chart' : 'Xem biểu đồ chi tiết'}
                                    </span>
                                    <ArrowDown className="w-3.5 h-3.5 transform group-hover:translate-y-0.5 transition-transform" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 7 Biểu đồ quan trắc chi tiết */}
            <div className="grid grid-cols-1 gap-6">
                {renderChart(
                    'chart-icl',
                    'icl',
                    'ICL',
                    translateMonitoringTitle(data.chartIcl.title, 'icl'),
                    data.chartIcl.axisName,
                    data.chartIcl.data,
                    data.chartIcl.headers,
                    'mm(±)',
                    'mm'
                )}

                {renderChart(
                    'chart-tc',
                    'tc',
                    'TC',
                    translateMonitoringTitle(data.chartTc.title, 'tc'),
                    data.chartTc.axisName,
                    data.chartTc.data,
                    data.chartTc.headers,
                    'mm(±)',
                    'mm'
                )}

                {renderChart(
                    'chart-ss',
                    'ss',
                    'SS',
                    translateMonitoringTitle(data.chartSs.title, 'ss'),
                    data.chartSs.axisName,
                    data.chartSs.data,
                    data.chartSs.headers,
                    'kN',
                    'kN'
                )}

                {renderChart(
                    'chart-sm',
                    'sm',
                    'SM',
                    translateMonitoringTitle(data.chartSm.title, 'sm'),
                    data.chartSm.axisName,
                    data.chartSm.data,
                    data.chartSm.headers,
                    'mm(±)',
                    'mm'
                )}

                {renderChart(
                    'chart-tm',
                    'tm',
                    'TM',
                    translateMonitoringTitle(data.chartTm.title, 'tm'),
                    data.chartTm.axisName,
                    data.chartTm.data,
                    data.chartTm.headers,
                    'mm(±)',
                    'mm'
                )}

                {renderChart(
                    'chart-rsm',
                    'rsm',
                    'RSM',
                    translateMonitoringTitle(data.chartRsm.title, 'rsm'),
                    data.chartRsm.axisName,
                    data.chartRsm.data,
                    data.chartRsm.headers,
                    'mm(-)',
                    'mm'
                )}

                {renderChart(
                    'chart-tdw',
                    'tdw',
                    'TDW',
                    translateMonitoringTitle(data.chartTdw.title, 'tdw'),
                    data.chartTdw.axisName,
                    data.chartTdw.data,
                    data.chartTdw.headers,
                    'mm(±)',
                    'mm'
                )}
            </div>

            {/* Modal: Nhập Chu Kỳ Mới & Đồng Bộ 2 Chiều */}
            {isAddCycleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                                    <PlusCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                                        Đồng Bộ Chu Kỳ Quan Trắc 2 Chiều
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        Cập nhật tức thì biểu đồ Web App và tự động đẩy số liệu vào Google Sheet
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAddCycleModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Navigation Tabs */}
                        <div className="flex border-b border-slate-200 px-5 bg-white text-xs font-semibold gap-4">
                            <button
                                onClick={() => setModalTab('form')}
                                className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                                    modalTab === 'form' 
                                        ? 'border-emerald-600 text-emerald-700 font-bold' 
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <FileText className="w-4 h-4" />
                                Nhập số liệu chu kỳ
                            </button>
                            <button
                                onClick={() => setModalTab('list')}
                                className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                                    modalTab === 'list' 
                                        ? 'border-emerald-600 text-emerald-700 font-bold' 
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                Chu kỳ đã lưu trên máy ({customCyclesList.length})
                            </button>
                            <button
                                onClick={() => setModalTab('webhook')}
                                className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                                    modalTab === 'webhook' 
                                        ? 'border-emerald-600 text-emerald-700 font-bold' 
                                        : 'border-transparent text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Settings2 className="w-4 h-4" />
                                Cấu hình Webhook Google Sheet
                            </button>
                        </div>

                        {/* Notice Banner */}
                        {syncNotice && (
                            <div className={`mx-5 mt-4 p-3 rounded-xl text-xs flex items-start gap-2 ${
                                syncNotice.type === 'success' 
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                                    : syncNotice.type === 'error'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}>
                                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                                <div className="leading-relaxed">{syncNotice.text}</div>
                            </div>
                        )}

                        {/* Modal Body */}
                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {modalTab === 'form' && (
                                <>
                                    {/* Select Category */}
                                    <div>
                                        <label className="block text-slate-700 font-bold mb-2">
                                            1. Chọn hạng mục quan trắc:
                                        </label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(['ICL', 'TC', 'SS', 'SM', 'TM', 'RSM', 'TDW'] as MonitoringCatKey[]).map(catKey => {
                                                const meta = CATEGORY_META_INFO[catKey];
                                                const isSelected = selectedCat === catKey;
                                                return (
                                                    <button
                                                        key={catKey}
                                                        type="button"
                                                        onClick={() => handleSwitchCategory(catKey)}
                                                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                            isSelected
                                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        {catKey} - {meta?.shortName || catKey} ({meta?.unit})
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Cycle info row */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
                                        <div>
                                            <label className="block text-slate-700 font-bold mb-1">
                                                Tên chu kỳ đo:
                                            </label>
                                            <input
                                                type="text"
                                                value={cycleNameInput}
                                                onChange={(e) => setCycleNameInput(e.target.value)}
                                                placeholder="VD: CK 11"
                                                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                Tự động gợi ý chu kỳ tiếp theo dựa trên dữ liệu hiện tại
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-slate-700 font-bold mb-1">
                                                Ngày đo (DD/MM/YYYY):
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={cycleDateInput}
                                                    onChange={(e) => setCycleDateInput(e.target.value)}
                                                    placeholder="02/11/2026"
                                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                                />
                                                <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                Ngày quan trắc thực tế tại hiện trường
                                            </p>
                                        </div>
                                    </div>

                                    {/* Sensor inputs grid */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-slate-700 font-bold">
                                                2. Nhập số liệu các vị trí đo ({CATEGORY_META_INFO[selectedCat]?.unit}):
                                            </label>
                                            <span className="text-[11px] text-slate-500">
                                                Đơn vị: <strong>{CATEGORY_META_INFO[selectedCat]?.unit}</strong>
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-52 overflow-y-auto p-1">
                                            {getCategorySensors(selectedCat).map(sensorKey => (
                                                <div key={sensorKey} className="bg-white p-2 rounded-xl border border-slate-200 hover:border-slate-300">
                                                    <span className="text-[11px] font-bold text-slate-700 block mb-1">
                                                        {sensorKey}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        value={sensorMeasurements[sensorKey] !== undefined ? sensorMeasurements[sensorKey] : ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setSensorMeasurements(prev => ({
                                                                ...prev,
                                                                [sensorKey]: val
                                                            }));
                                                        }}
                                                        placeholder="0.00"
                                                        className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Note input */}
                                    <div>
                                        <label className="block text-slate-700 font-bold mb-1">
                                            Ghi chú / Nhận xét (tùy chọn):
                                        </label>
                                        <input
                                            type="text"
                                            value={cycleNoteInput}
                                            onChange={(e) => setCycleNoteInput(e.target.value)}
                                            placeholder="Ghi chú điều kiện thi công, thời tiết hoặc trạng thái đo..."
                                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                                        />
                                    </div>

                                    {/* Actions */}
                                    <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                                        <button
                                            type="button"
                                            onClick={handleCopyTsvRow}
                                            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors"
                                            title="Sao chép dòng dữ liệu định dạng Sheet để dán trực tiếp vào Google Sheet"
                                        >
                                            {clipboardCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                                            <span>{clipboardCopied ? 'Đã sao chép dòng Sheet!' : 'Sao chép dòng dán vào Sheet'}</span>
                                        </button>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSyncWebhook}
                                                disabled={isSyncing}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-50"
                                            >
                                                <Send className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                                <span>Đồng bộ lên Google Sheet</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={handleSaveLocalCycle}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Lưu & Xem Biểu Đồ Ngay</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {modalTab === 'list' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-slate-600 font-medium">
                                            Danh sách các chu kỳ đã nhập từ Web App đang được lưu trong trình duyệt:
                                        </p>
                                        {customCyclesList.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleClearAllCustom}
                                                className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg font-bold transition-colors"
                                            >
                                                Xóa tất cả
                                            </button>
                                        )}
                                    </div>

                                    {customCyclesList.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                                            <p className="text-slate-500">Chưa có chu kỳ nào được nhập tùy chỉnh trên máy.</p>
                                            <button
                                                type="button"
                                                onClick={() => setModalTab('form')}
                                                className="mt-3 px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold"
                                            >
                                                + Nhập chu kỳ đầu tiên
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                                            {customCyclesList.map((entry, idx) => (
                                                <div key={idx} className="p-3 bg-white flex items-center justify-between gap-3 hover:bg-slate-50">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-800">{entry.cycle}</span>
                                                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px]">
                                                                {entry.category}
                                                            </span>
                                                            <span className="text-slate-400 text-[11px]">{entry.date}</span>
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                                            {Object.entries(entry.measurements).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteCustomCycle(entry.category, entry.cycle)}
                                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                        title="Gỡ chu kỳ này"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {modalTab === 'webhook' && (
                                <div className="space-y-4">
                                    <form onSubmit={handleSaveWebhookSettings} className="space-y-3">
                                        <div>
                                            <label className="block text-slate-700 font-bold mb-1">
                                                URL Webhook Google Apps Script:
                                            </label>
                                            <input
                                                type="text"
                                                value={webhookUrlInput}
                                                onChange={(e) => setWebhookUrlInput(e.target.value)}
                                                placeholder="https://script.google.com/macros/s/.../exec"
                                                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                                            />
                                            <p className="text-[11px] text-slate-500 mt-1">
                                                Khi đã cấu hình Webhook, nút <strong>&quot;Đồng bộ lên Google Sheet&quot;</strong> sẽ tự động nối dòng mới vào đúng tab trên file Google Sheet của bạn.
                                            </p>
                                        </div>

                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
                                            >
                                                Lưu URL Webhook
                                            </button>
                                        </div>
                                    </form>

                                    {/* Instructions and Apps Script Generator */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                                                <Code2 className="w-4 h-4 text-indigo-600" />
                                                Hướng dẫn thiết lập Webhook tự động ghi Google Sheet
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={handleCopyAppsScriptCode}
                                                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-bold text-indigo-600 transition-colors flex items-center gap-1"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Sao chép mã Apps Script
                                            </button>
                                        </div>

                                        <ol className="list-decimal list-inside space-y-1 text-slate-600 leading-relaxed">
                                            <li>Mở Google Sheet Quan Trắc C10 của bạn.</li>
                                            <li>Chọn menu <strong>Tiện ích mở rộng (Extensions)</strong> &rarr; <strong>Apps Script</strong>.</li>
                                            <li>Dán mã script bên dưới vào file <code>Code.gs</code> và nhấn <strong>Lưu (Save)</strong>.</li>
                                            <li>Bấm <strong>Triển khai (Deploy)</strong> &rarr; <strong>Triển khai mới (New deployment)</strong>.</li>
                                            <li>Chọn loại: <strong>Ứng dụng web (Web app)</strong>. Thiết lập:
                                                <ul className="list-disc list-inside ml-4 mt-0.5 text-slate-500">
                                                    <li>Thực thi dưới dạng: <strong>Tôi (Me)</strong></li>
                                                    <li>Ai có quyền truy cập: <strong>Bất kỳ ai (Anyone)</strong></li>
                                                </ul>
                                            </li>
                                            <li>Bấm Triển khai, sao chép URL dạng <code>https://script.google.com/macros/s/.../exec</code> và dán vào ô bên trên.</li>
                                        </ol>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsAddCycleModalOpen(false)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-xs"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Quản lý nguồn file / Sheet Link của Admin */}
            {isSourceModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <Database className="w-5 h-5 text-indigo-600" />
                                <h3 className="font-bold text-slate-800 text-base">
                                    Nguồn Dữ Liệu Quan Trắc C10
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsSourceModalOpen(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            {sourceNotice && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 font-medium">
                                    {sourceNotice}
                                </div>
                            )}

                            {/* Option 1: Upload latest Excel / CSV file */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                                <label className="block text-xs font-bold text-slate-700">
                                    Cách 1: Tải lên file Excel tổng hợp quan trắc (.xlsx / .csv) mới nhất
                                </label>
                                <p className="text-[11px] text-slate-500">
                                    Tự động đọc các sheet: ICL, TC, SS, SM, TM, RSM, TDW và cập nhật biểu đồ tức thì.
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-colors"
                                >
                                    <Upload className="w-4 h-4" />
                                    Chọn file &quot;C10 Tổng hợp kết quả quan trắc&quot; (.xlsx / .csv)
                                </button>
                            </div>

                            {/* Option 2: Connect live Google Sheet URL / ID */}
                            <form onSubmit={handleSaveSheetLink} className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">
                                        Cách 2: Dán đường dẫn (Link) Google Sheet Quan trắc để tự động đồng bộ 15 giây/lần
                                    </label>
                                    <input
                                        type="text"
                                        value={sheetInput}
                                        onChange={(e) => setSheetInput(e.target.value)}
                                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                        className="w-full px-3.5 py-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">
                                        Khi kết nối link Google Sheet (chế độ xem công khai), mọi chỉnh sửa số liệu trong các tab ICL, TC, SS, SM, TM, RSM, TDW sẽ tự động cập nhật trực tiếp lên biểu đồ và báo cáo tổng hợp.
                                    </p>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={handleResetSource}
                                        className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                    >
                                        Dùng file mặc định mới nhất
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsSourceModalOpen(false)}
                                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                        >
                                            Đóng
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors"
                                        >
                                            Lưu &amp; Đồng bộ ngay
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            <PasswordProtection
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                onSuccess={handlePasswordSuccess}
                language={language}
            />
        </div>
    );
};

export default Monitoring;
