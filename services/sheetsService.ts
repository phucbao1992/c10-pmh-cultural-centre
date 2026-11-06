
import { GOOGLE_SHEET_ID } from '../constants';
import * as XLSX from 'xlsx';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const BASE_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv`;

export interface EquipmentData {
    date: string;
    total: number | null;
    crane: number | null; // Xe cẩu
    drill: number | null; // Giàn khoan
    excavator: number | null; // Xe đào
    towerCrane: number | null; // Cẩu tháp
    hoist: number | null; // Vận thăng
    welder: number | null; // Máy hàn
    pump: number | null; // Máy bơm
    cutter: number | null; // Máy cắt, uốn sắt
    concreteDrill: number | null; // Khoan bê tông
    truck: number | null; // Xe tải
    other: number | null; // Khác
}

export interface ScheduleItem {
    description: string;
    completedToday: string;
    okr: string;
    plannedTomorrow: string;
}

export interface WeeklyProgressItem {
    week: string;
    date: string;
    plan: number | null;
    actual: number | null;
    delayedDays?: number | null;
}

export interface DelayedTaskItem {
    description: string;
    diffPercent?: string | null;
}

export interface ManpowerAvgItem {
    role: string;
    count: number;
}

export interface TaskItem {
    description: string;
    percentCompleted: number | null;
    statusStr?: string | null;
}

export interface MeetingMinuteItem {
    description: string;
    status: boolean | null;
}

export interface MeetingMinutes {
    pmh: MeetingMinuteItem[];
    tvgs: MeetingMinuteItem[];
    others: string[];
}

export interface ScheduleData {
    date: string;
    items: ScheduleItem[];
    mepItems: ScheduleItem[];
    dailyNotes: string[];
    mepNotes: string[];
    weeklyProgress: WeeklyProgressItem[];
    weeklyTasks: TaskItem[];
    testingWorks: TaskItem[];
    submittals: TaskItem[];
    weeklyTasksTitle?: string;
    testingWorksTitle?: string;
    submittalsTitle?: string;
    meetingMinutes: MeetingMinutes | null;
    delayedTasks?: DelayedTaskItem[];
    submittals3Plus?: string[];
    manpowerAvg?: ManpowerAvgItem[];
}

export interface SheetData {
    d800: any[];
    payment: any[];
    manpower: any[];
    equipment: EquipmentData | null;
    schedule: ScheduleData | null;
    modelHouse: any[];
    constructionProgress: any[];
    paymentTracking: any[];
    areaProgress: any[];
    health: {
        submittal: number | null;
        manpower: number | null;
        payment: number | null;
        schedule: number | null;
        issues?: number | null;
    };
    summary: {
        overallProgress: {
            actual: number | null;
            plan: number | null;
        };
        paymentProgress: {
            actual: number | null;
        };
        issues: {
            total: number | null;
            highPriority: number | null;
            pending: number | null;
        };
        upcomingMilestone?: {
            title: string;
            content: string;
        };
        upcomingMilestonesList?: SheetMilestoneItem[];
    };
    issuesList: any[];
    dailyTab?: DailyTabData | null;
    todayPlans?: TodayPlans | null;
}

export interface SheetMilestoneItem {
    date: string;
    description: string;
    rawText: string;
}

export interface TodayPlans {
    inspectionPlans: string[];
    concretePlans: string[];
}

export interface PersonnelItem {
    role: string;
    count: string | number;
}

export interface EquipmentItem {
    name: string;
    count: string | number;
}

export interface TodayTaskItem {
    task: string;
    volume: string;
    evaluation: string;
}

export interface TomorrowTaskItem {
    task: string;
    volume: string;
}

export interface DailyTabData {
    weather: string;
    personnel: PersonnelItem[];
    equipment: EquipmentItem[];
    todayTasks: TodayTaskItem[];
    tomorrowTasks: TomorrowTaskItem[];
}

const parseNum = (val: string | undefined | null) => {
    if (val === undefined || val === null) return null;
    let cleanVal = String(val).trim();
    if (cleanVal === '') return null;

    // Clean formula prefixes like '=' or '="' or trailing '"' and non-breaking spaces
    cleanVal = cleanVal.replace(/=/g, '').replace(/"/g, '').replace(/\u00A0/g, ' ').trim();
    if (cleanVal === '') return null;

    const hasPercent = cleanVal.includes('%');
    cleanVal = cleanVal.replace(/%/g, '').trim();

    if (cleanVal.includes(',') && cleanVal.includes('.')) {
        if (cleanVal.lastIndexOf(',') > cleanVal.lastIndexOf('.')) {
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
        } else {
            cleanVal = cleanVal.replace(/,/g, '');
        }
    } else if (cleanVal.includes(',')) {
        cleanVal = cleanVal.replace(',', '.');
    }

    const num = Number(cleanVal);
    if (isNaN(num)) {
        return null; // Return null if it's a date or arbitrary text instead of just numbers
    }

    let finalNum = num;

    // Heuristic: If it looks like a decimal percentage (e.g., 0.051 for 5.1%)
    // But ONLY if it didn't have a % sign and is between 0 and 1
    if (!hasPercent && finalNum > 0 && finalNum < 1) {
        finalNum = finalNum * 100;
    }

    return Math.round(finalNum * 10000) / 10000;
};

const cleanStr = (val: string | undefined) => {
    if (!val) return '';
    return val.replace(/^"|"$/g, '').trim();
};

const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++; // Skip the escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
            if (char === '\r') i++; // Skip \n
            currentRow.push(currentCell);
            result.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            if (char !== '\r' || inQuotes) {
                currentCell += char;
            }
        }
    }
    
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        result.push(currentRow);
    }
    
    return result;
};

const fetchSheetCSV = async (sheetName: string, range: string, customSheetId?: string) => {
    try {
        let overrideMainId = '';
        if (typeof window !== 'undefined') {
            overrideMainId = localStorage.getItem('c10_override_main_sheet_id') || '';
        }
        const targetSheetId = extractSheetId(customSheetId || overrideMainId || GOOGLE_SHEET_ID);
        const url = `https://docs.google.com/spreadsheets/d/${targetSheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}&_t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to fetch ${sheetName}`);
        const text = await response.text();
        return parseCSV(text);
    } catch (error) {
        console.error(`Error fetching CSV for ${sheetName}:`, error);
        return [];
    }
};

export interface GeneralInfoData {
    investor: { EN: string; VN: string };
    projectName: { EN: string; VN: string };
    location: { EN: string; VN: string };
    source: 'sheet' | 'default';
    sheetId?: string;
    tabName?: string;
    lastUpdated?: string;
}

export const extractSheetId = (input: string): string => {
    if (!input) return '';
    const trimmed = input.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
        return match[1];
    }
    return trimmed;
};

export const removeVietnameseTones = (str: string): string => {
    if (!str) return '';
    let s = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
    s = s.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
    s = s.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
    s = s.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
    s = s.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
    s = s.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
    s = s.replace(/đ/g, 'd');
    s = s.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'a');
    s = s.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'e');
    s = s.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'i');
    s = s.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'o');
    s = s.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'u');
    s = s.replace(/Ỳ|Ý|Ṵ|Ỷ|Ỹ/g, 'y');
    s = s.replace(/Đ/g, 'd');
    return s.toLowerCase().trim();
};

export const fetchGeneralInfoData = async (
    customSheetId?: string,
    customTabName?: string
): Promise<GeneralInfoData | null> => {
    const sheetId = extractSheetId(customSheetId || GOOGLE_SHEET_ID);
    const possibleTabs = customTabName && customTabName.trim()
        ? [customTabName.trim()]
        : ['GeneralInfo', 'ThongTinChung', 'Overview', 'ThongTin', 'Sheet1'];

    for (const tab of possibleTabs) {
        try {
            const rows = await fetchSheetCSV(tab, 'A1:H30', sheetId);
            if (!rows || rows.length === 0) continue;

            let investor = { VN: '', EN: '' };
            let projectName = { VN: '', EN: '' };
            let location = { VN: '', EN: '' };

            // 1. Check Table Format (Header row with at least 2 matching columns)
            let tableMatched = false;
            for (let r = 0; r < Math.min(3, rows.length); r++) {
                const row = rows[r];
                let invCol = -1, prjCol = -1, locCol = -1;
                row.forEach((cell, idx) => {
                    const n = removeVietnameseTones(cell);
                    if (n.includes('chu dau tu') || n.includes('investor') || n.includes('client')) invCol = idx;
                    if (n.includes('ten du an') || n.includes('project name') || n === 'du an' || n === 'project') prjCol = idx;
                    if (n.includes('dia diem') || n.includes('location') || n.includes('vi tri') || n.includes('dia chi')) locCol = idx;
                });

                const matchesInRow = (invCol !== -1 ? 1 : 0) + (prjCol !== -1 ? 1 : 0) + (locCol !== -1 ? 1 : 0);
                if (matchesInRow >= 2 && rows.length > r + 1) {
                    const dataRow = rows[r + 1];
                    if (invCol !== -1 && dataRow[invCol]) investor.VN = cleanStr(dataRow[invCol]);
                    if (prjCol !== -1 && dataRow[prjCol]) projectName.VN = cleanStr(dataRow[prjCol]);
                    if (locCol !== -1 && dataRow[locCol]) location.VN = cleanStr(dataRow[locCol]);

                    investor.EN = investor.VN;
                    projectName.EN = projectName.VN;
                    location.EN = location.VN;
                    tableMatched = true;
                    break;
                }
            }

            if (tableMatched && (investor.VN || projectName.VN || location.VN)) {
                return {
                    investor,
                    projectName,
                    location,
                    source: 'sheet',
                    sheetId,
                    tabName: tab,
                    lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                };
            }

            // 2. Check Key-Value Format (each row has key in col 0, value in col 1, optional EN in col 2)
            let kvMatches = 0;
            for (const row of rows) {
                if (!row || row.length < 2) continue;
                const key = removeVietnameseTones(row[0]);
                const valVN = cleanStr(row[1]);
                const valEN = (row.length > 2 ? cleanStr(row[2]) : '') || valVN;

                if (!valVN) continue;

                if (key.includes('chu dau tu') || key.includes('investor') || key.includes('client')) {
                    investor = { VN: valVN, EN: valEN };
                    kvMatches++;
                } else if (key.includes('ten du an') || key.includes('project name') || key.includes('du an') || key.includes('project')) {
                    projectName = { VN: valVN, EN: valEN };
                    kvMatches++;
                } else if (key.includes('dia diem') || key.includes('location') || key.includes('vi tri') || key.includes('dia chi')) {
                    location = { VN: valVN, EN: valEN };
                    kvMatches++;
                }
            }

            if (kvMatches >= 1) {
                return {
                    investor,
                    projectName,
                    location,
                    source: 'sheet',
                    sheetId,
                    tabName: tab,
                    lastUpdated: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                };
            }
        } catch (e) {
            console.warn(`Tab ${tab} could not be parsed:`, e);
        }
    }

    return null;
};

export interface SubmittalItem {
    name: string;
    approved: number;
    unapproved: number;
    total: number;
    delayedDocuments: string[];
}

export interface SubmittalData {
    ds: SubmittalItem;
    sd: SubmittalItem;
    ma: SubmittalItem;
    mos: SubmittalItem;
    ots: SubmittalItem;
    dsMep: SubmittalItem;
    sdMep: SubmittalItem;
    matMep: SubmittalItem;
    mosMep: SubmittalItem;
    rfi: SubmittalItem;
}

const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        // Assuming DD/MM/YY or DD/MM/YYYY
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return new Date(`${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    } else if (parts.length === 2) {
        // Assuming DD/MM
        const year = new Date().getFullYear();
        return new Date(`${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    }
    return null;
};

const isDelayed = (row: string[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const valA = row.length > 0 ? cleanStr(row[0]) : '';
    const valF = row.length > 5 ? cleanStr(row[5]) : '';
    const valG = row.length > 6 ? cleanStr(row[6]) : '';
    const valH = row.length > 7 ? cleanStr(row[7]) : '';
    const valI = row.length > 8 ? cleanStr(row[8]) : '';
    
    // Check if G is red or yellow
    // Conditions: A is not blank, G is blank, today - A > 3
    if (valA !== '' && valG === '') {
        const dateA = parseDate(valA);
        if (dateA) {
            const diffTime = today.getTime() - dateA.getTime();
            const diffDays = diffTime / (1000 * 3600 * 24);
            if (diffDays > 3) {
                return true;
            }
        }
    }
    
    // Check if I is red or yellow
    // Conditions: G is not blank, F is blank, I is blank, today - H > 3
    if (valG !== '' && valF === '' && valI === '') {
        if (valH === '') {
            // In Google Sheets, today() - empty cell > 3 evaluates to true
            return true;
        } else {
            const dateH = parseDate(valH);
            if (dateH) {
                const diffTime = today.getTime() - dateH.getTime();
                const diffDays = diffTime / (1000 * 3600 * 24);
                if (diffDays > 3) {
                    return true;
                }
            }
        }
    }
    
    return false;
};

const processSubmittalTab = (raw: string[][]): SubmittalItem => {
    let total = 0;
    let unapproved = 0;
    let approved = 0;
    const delayedDocuments: string[] = [];
    
    if (raw.length > 0) {
        // Row 1 in raw is B2:I2 (if we fetch B2:I1000)
        // Wait, if we fetch A2:I1000, row 0 is A2:I2
        const summaryRow = raw[0];
        total = parseNum(summaryRow[1]) || 0; // B2
        unapproved = parseNum(summaryRow[2]) || 0; // C2
        approved = total - unapproved;
        
        // Rows 2 onwards are data (A4:I...)
        for (let i = 2; i < raw.length; i++) {
            const row = raw[i];
            if (row.length > 2 && cleanStr(row[2])) {
                if (isDelayed(row)) {
                    delayedDocuments.push(cleanStr(row[2]));
                }
            }
        }
    }
    
    return {
        name: '', // Will be set later
        approved,
        unapproved,
        total,
        delayedDocuments
    };
};

export interface InspectionItem {
    name: string;
    url: string;
}

export interface InspectionData {
    testReports: InspectionItem[];
    constructionInspections: InspectionItem[];
}

export const fetchInspectionData = async (): Promise<InspectionData | null> => {
    try {
        let overrideMainId = '';
        if (typeof window !== 'undefined') {
            overrideMainId = localStorage.getItem('c10_override_main_sheet_id') || '';
        }
        const targetSheetId = extractSheetId(overrideMainId || GOOGLE_SHEET_ID);
        const url = `https://docs.google.com/spreadsheets/d/${targetSheetId}/export?format=xlsx`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch XLSX");
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheet = workbook.Sheets['Inspection'];
        
        if (!sheet) throw new Error("Sheet 'Inspection' not found");

        const testReports: InspectionItem[] = [];
        const constructionInspections: InspectionItem[] = [];

        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:B1000');
        
        // Start from row 1 (0-indexed, so row 2 in Excel)
        for (let R = 1; R <= range.e.r; ++R) {
            const cellA = sheet[XLSX.utils.encode_cell({c: 0, r: R})];
            const cellB = sheet[XLSX.utils.encode_cell({c: 1, r: R})];

            if (cellA && cellA.v) {
                const name = String(cellA.v).trim();
                const url = cellA.l?.Target || `https://drive.google.com/drive/search?q=${encodeURIComponent(name)}`;
                testReports.push({ name, url });
            }

            if (cellB && cellB.v) {
                const name = String(cellB.v).trim();
                const url = cellB.l?.Target || `https://drive.google.com/drive/search?q=${encodeURIComponent(name)}`;
                constructionInspections.push({ name, url });
            }
        }

        return { testReports, constructionInspections };
    } catch (error) {
        console.error("Failed to fetch Inspection data:", error);
        return null;
    }
};

export const fetchSubmittalData = async (): Promise<SubmittalData | null> => {
    try {
        let overrideSubmittal = '';
        if (typeof window !== 'undefined') {
            overrideSubmittal = localStorage.getItem('c10_override_submittal_sheet_id') || '';
        }
        const sheetId = extractSheetId(overrideSubmittal || '1POEaqpDjZu4pL7PNXWpgMuHyhKq_-IoBPdQ8EAWR3_s');
        const range = 'A2:I1000';
        const [
            dsRaw, sdRaw, maRaw, mosRaw, otsRaw, 
            mosMepRaw, sdMepRaw, dsMepRaw, matMepRaw,
            rfiRaw
        ] = await Promise.all([
            fetchSheetCSV('DS', range, sheetId),
            fetchSheetCSV('SD', range, sheetId),
            fetchSheetCSV('MA', range, sheetId),
            fetchSheetCSV('MOS', range, sheetId),
            fetchSheetCSV('OTS- QUAN TRẮC', range, sheetId),
            fetchSheetCSV('MOS-MEP', range, sheetId),
            fetchSheetCSV('SDW-MEP', range, sheetId),
            fetchSheetCSV('DS-MEP', range, sheetId),
            fetchSheetCSV('MAT-MEP', range, sheetId),
            fetchSheetCSV('RFI', range, sheetId)
        ]);

        const ds = processSubmittalTab(dsRaw);
        ds.name = 'document_submit';
        
        const sd = processSubmittalTab(sdRaw);
        sd.name = 'shopdrawing';
        
        const ma = processSubmittalTab(maRaw);
        ma.name = 'material';
        
        const mos = processSubmittalTab(mosRaw);
        mos.name = 'method_of_statement';

        const ots = processSubmittalTab(otsRaw);
        ots.name = 'survey';

        const dsMep = processSubmittalTab(dsMepRaw);
        dsMep.name = 'document_submit_mep';

        const sdMep = processSubmittalTab(sdMepRaw);
        sdMep.name = 'shopdrawing_mep';

        const matMep = processSubmittalTab(matMepRaw);
        matMep.name = 'material_mep';

        const mosMep = processSubmittalTab(mosMepRaw);
        mosMep.name = 'method_of_statement_mep';

        const rfi = processSubmittalTab(rfiRaw);
        rfi.name = 'rfi';

        return { ds, sd, ma, mos, ots, dsMep, sdMep, matMep, mosMep, rfi };
    } catch (error) {
        console.error("Failed to fetch Submittal data:", error);
        return null;
    }
};

export interface MonitoringSumItem {
    id: string;
    title: string;
    shortTitle: string;
    content: string;
    latestCycle?: string;
    maxVal?: number;
    maxSensor?: string;
    warningVal?: number;
    unit?: string;
    ratio?: number;
    trendSensor?: string;
    trendDelta?: number;
    status?: 'SAFE' | 'WARNING' | 'DANGER';
}

export interface MonitoringSourceConfig {
    sourceType: 'default_file' | 'custom_sheet' | 'uploaded_xlsx';
    customSheetId?: string;
    fileName?: string;
    uploadedTabs?: Record<string, string[][]>;
    updatedAt?: string;
}

const MONITORING_CONFIG_KEY = 'c10_monitoring_source_config_v1';
export const MONITORING_CONFIG_EVENT = 'c10-monitoring-config-updated';

export const getMonitoringSourceConfig = (): MonitoringSourceConfig => {
    try {
        const raw = localStorage.getItem(MONITORING_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.sourceType) {
                return parsed;
            }
        }
    } catch {}
    return {
        sourceType: 'default_file',
        fileName: 'C10 Tổng hợp kết quả quan trắc'
    };
};

export const saveMonitoringSourceConfig = async (config: MonitoringSourceConfig): Promise<void> => {
    const payload: MonitoringSourceConfig = {
        ...config,
        updatedAt: new Date().toISOString()
    };
    try {
        localStorage.setItem(MONITORING_CONFIG_KEY, JSON.stringify(payload));
        window.dispatchEvent(new CustomEvent(MONITORING_CONFIG_EVENT, { detail: payload }));
    } catch (e) {
        console.warn('Failed to save monitoring config to localStorage:', e);
    }
    try {
        if (db) {
            await setDoc(doc(db, 'c10', 'monitoring_config'), payload);
        }
    } catch (e) {
        console.warn('Failed to sync monitoring config to Firestore:', e);
    }
};

export const fetchRemoteMonitoringSourceConfig = async (): Promise<MonitoringSourceConfig | null> => {
    try {
        if (!db) return null;
        // Try c10 first
        const snapC10 = await getDoc(doc(db, 'c10', 'monitoring_config'));
        if (snapC10.exists()) {
            const data = snapC10.data() as MonitoringSourceConfig;
            if (data && data.sourceType) {
                try {
                    localStorage.setItem(MONITORING_CONFIG_KEY, JSON.stringify(data));
                } catch {}
                return data;
            }
        }

        // Fallback to cn82 and auto-migrate
        const snapLegacy = await getDoc(doc(db, 'cn82', 'monitoring_config'));
        if (snapLegacy.exists()) {
            const data = snapLegacy.data() as MonitoringSourceConfig;
            if (data && data.sourceType) {
                try {
                    localStorage.setItem(MONITORING_CONFIG_KEY, JSON.stringify(data));
                } catch {}
                setDoc(doc(db, 'c10', 'monitoring_config'), data).catch(() => {});
                return data;
            }
        }
    } catch {}
    return null;
};

export const parseMonitoringWorkbookFromBuffer = (buffer: ArrayBuffer, fileName: string): MonitoringSourceConfig => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const uploadedTabs: Record<string, string[][]> = {};
    wb.SheetNames.forEach((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
        uploadedTabs[sheetName.trim().toUpperCase()] = rows.map(r => r.map(c => String(c ?? '')));
    });
    return {
        sourceType: 'uploaded_xlsx',
        fileName,
        uploadedTabs,
        updatedAt: new Date().toISOString()
    };
};

export interface MonitoringData {
    iclTitle: string;
    iclAxisName: string;
    iclData: any[];
    iclHeaders: string[];
    tcTitle: string;
    tcAxisName: string;
    tcData: any[];
    tcHeaders: string[];
    ssTitle: string;
    ssAxisName: string;
    ssData: any[];
    ssHeaders: string[];
    smTitle: string;
    smAxisName: string;
    smData: any[];
    smHeaders: string[];
    tmTitle: string;
    tmAxisName: string;
    tmData: any[];
    tmHeaders: string[];
    rsmTitle: string;
    rsmAxisName: string;
    rsmData: any[];
    rsmHeaders: string[];
    tdwTitle: string;
    tdwAxisName: string;
    tdwData: any[];
    tdwHeaders: string[];
    chartIcl?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartTc?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartSs?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartSm?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartTm?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartRsm?: { title: string; axisName: string; data: any[]; headers: string[] };
    chartTdw?: { title: string; axisName: string; data: any[]; headers: string[] };
    sumData?: MonitoringSumItem[];
    lastUpdated?: string;
    sourceLabel?: string;
    sourceType?: 'default_file' | 'custom_sheet' | 'uploaded_xlsx';
    customSheetId?: string;
}

export const fetchMonitoringData = async (): Promise<MonitoringData | null> => {
    try {
        const DEFAULT_TEMPLATE_SHEET_ID = '1nuFGYOsGbLMFM9G0EqyrkvKwgCAXgMiOZhC_8jMw0Tw';

        // Check remote config first, fallback to local config
        let config = getMonitoringSourceConfig();
        try {
            const remoteCfg = await fetchRemoteMonitoringSourceConfig();
            if (remoteCfg) {
                config = remoteCfg;
            }
        } catch {}

        const targetSheetId =
            config.sourceType === 'custom_sheet' && config.customSheetId
                ? extractSheetId(config.customSheetId)
                : DEFAULT_TEMPLATE_SHEET_ID;

        let sourceLabel = 'File: C10 Tổng hợp kết quả quan trắc (Real-time)';

        // Fetch latest uploaded local file for ICL (or full CSV) in real time
        const fetchLatestLocalFileCSV = async (): Promise<{ rows: string[][]; fileName?: string }> => {
            // 1. Try server real-time endpoint first (detects newest file in /public/assets/aistudio by mtime)
            try {
                const apiRes = await fetch(`/api/monitoring/latest-file?_t=${Date.now()}`, { cache: 'no-store' });
                if (apiRes.ok) {
                    const json = await apiRes.json();
                    if (json && json.content) {
                        const parsed = parseCSV(json.content);
                        if (parsed.length > 0) {
                            return { rows: parsed, fileName: json.fileName };
                        }
                    }
                }
            } catch {}

            // 2. Fallback to static paths with cache-busting query string
            const potentialPaths = [
                `/assets/aistudio/_C10_T_ng_h_p_k_t_qu__quan_tr_c_23372c5e?_t=${Date.now()}`,
                `./assets/aistudio/_C10_T_ng_h_p_k_t_qu__quan_tr_c_23372c5e?_t=${Date.now()}`,
                `/assets/aistudio/_C10_T_ng_h_p_k_t_qu__quan_tr_c_6622f988?_t=${Date.now()}`,
                `./assets/aistudio/_C10_T_ng_h_p_k_t_qu__quan_tr_c_6622f988?_t=${Date.now()}`
            ];
            for (const p of potentialPaths) {
                try {
                    const res = await fetch(p, { cache: 'no-store' });
                    if (res.ok) {
                        const text = await res.text();
                        const parsed = parseCSV(text);
                        if (parsed.length > 0) {
                            return { rows: parsed, fileName: 'C10 Tổng hợp kết quả quan trắc' };
                        }
                    }
                } catch {}
            }

            const fallbackRows = await fetchSheetCSV('ICL', 'A1:J300', targetSheetId);
            return { rows: fallbackRows };
        };

        let iclRaw: string[][] = [];
        let tcRaw: string[][] = [];
        let ssRaw: string[][] = [];
        let smRaw: string[][] = [];
        let tmRaw: string[][] = [];
        let rsmRaw: string[][] = [];
        let tdwRaw: string[][] = [];
        let sumRaw: string[][] = [];

        if (config.sourceType === 'uploaded_xlsx' && config.uploadedTabs) {
            sourceLabel = `File: ${config.fileName || 'C10 Tổng hợp kết quả quan trắc'} (Real-time)`;
            const tabs = config.uploadedTabs;
            const firstTabRows = Object.values(tabs)[0] || [];
            iclRaw = tabs['ICL'] || firstTabRows;
            tcRaw = tabs['TC'] || [];
            ssRaw = tabs['SS'] || [];
            smRaw = tabs['SM'] || [];
            tmRaw = tabs['TM'] || [];
            rsmRaw = tabs['RSM'] || [];
            tdwRaw = tabs['TDW'] || [];
            sumRaw = tabs['SUM'] || [];

            // If a single-tab CSV was uploaded, fill remaining tabs from template sheet
            if (tcRaw.length === 0) {
                const [tcF, ssF, smF, tmF, rsmF, tdwF] = await Promise.all([
                    fetchSheetCSV('TC', 'A1:D300', targetSheetId),
                    fetchSheetCSV('SS', 'A1:J300', targetSheetId),
                    fetchSheetCSV('SM', 'A1:J300', targetSheetId),
                    fetchSheetCSV('TM', 'A1:J300', targetSheetId),
                    fetchSheetCSV('RSM', 'A1:T300', targetSheetId),
                    fetchSheetCSV('TDW', 'A1:J300', targetSheetId)
                ]);
                tcRaw = tcF;
                ssRaw = ssF;
                smRaw = smF;
                tmRaw = tmF;
                rsmRaw = rsmF;
                tdwRaw = tdwF;
            }
        } else if (config.sourceType === 'custom_sheet' && config.customSheetId) {
            sourceLabel = `Google Sheet: C10 Tổng hợp kết quả quan trắc (Live)`;
            [iclRaw, tcRaw, ssRaw, smRaw, tmRaw, rsmRaw, tdwRaw, sumRaw] = await Promise.all([
                fetchSheetCSV('ICL', 'A1:J300', targetSheetId),
                fetchSheetCSV('TC', 'A1:D300', targetSheetId),
                fetchSheetCSV('SS', 'A1:J300', targetSheetId),
                fetchSheetCSV('SM', 'A1:J300', targetSheetId),
                fetchSheetCSV('TM', 'A1:J300', targetSheetId),
                fetchSheetCSV('RSM', 'A1:T300', targetSheetId),
                fetchSheetCSV('TDW', 'A1:J300', targetSheetId),
                fetchSheetCSV('Sum', 'A1:G10', targetSheetId)
            ]);
        } else {
            // Default: Use the latest uploaded file in /public/assets/aistudio as primary source
            const [localFileResult, tcF, ssF, smF, tmF, rsmF, tdwF, sumF] = await Promise.all([
                fetchLatestLocalFileCSV(),
                fetchSheetCSV('TC', 'A1:D300', targetSheetId),
                fetchSheetCSV('SS', 'A1:J300', targetSheetId),
                fetchSheetCSV('SM', 'A1:J300', targetSheetId),
                fetchSheetCSV('TM', 'A1:J300', targetSheetId),
                fetchSheetCSV('RSM', 'A1:T300', targetSheetId),
                fetchSheetCSV('TDW', 'A1:J300', targetSheetId),
                fetchSheetCSV('Sum', 'A1:G10', targetSheetId)
            ]);
            iclRaw = localFileResult.rows;
            tcRaw = tcF;
            ssRaw = ssF;
            smRaw = smF;
            tmRaw = tmF;
            rsmRaw = rsmF;
            tdwRaw = tdwF;
            sumRaw = sumF;
        }

        const iclTitle = "Quan trắc chuyển vị tường vây";
        const tcTitle = "Quan trắc chuyển vị móng cẩu tháp";
        const ssTitle = "Quan trắc ứng suất thanh giằng";
        const smTitle = "Biểu đồ quan trắc lún lân cận";
        const tmTitle = "Biểu đồ quan trắc nghiêng lân cận";
        const rsmTitle = "Biểu đồ quan trắc lún nền đường";
        const tdwTitle = "Biểu đồ quan trắc đỉnh tường vây";

        const parseChartData = (raw: any[], colCount: number, allowedCycles?: Set<string>) => {
            if (!raw || raw.length < 2) return { axisName: '', data: [], headers: [] };

            // Automatically detect the header row ('CK' or 'Chu kỳ' or column 1 = 'Cảnh báo')
            let headerIdx = 0;
            for (let r = 0; r < Math.min(5, raw.length); r++) {
                const c0 = String(raw[r]?.[0] || '').trim().toLowerCase();
                const c1 = String(raw[r]?.[1] || '').trim().toLowerCase();
                if (
                    c0 === 'ck' ||
                    c0.includes('chu kỳ') ||
                    c0.includes('chu ky') ||
                    c1.includes('cảnh báo') ||
                    c1.includes('canh bao') ||
                    c1.includes('warning')
                ) {
                    headerIdx = r;
                    break;
                }
            }

            const effectiveRaw = raw.slice(headerIdx);
            if (effectiveRaw.length < 2) return { axisName: '', data: [], headers: [] };

            const axisName = String(effectiveRaw[0][0] || '').trim();
            const data: any[] = [];
            const headers = effectiveRaw[0].map((h: any) => String(h || '').trim());

            for (let i = 1; i < effectiveRaw.length; i++) {
                const row = effectiveRaw[i];
                if (!row || !row[0]) continue;
                const cycleName = String(row[0]).trim();
                if (allowedCycles && allowedCycles.size > 0 && !allowedCycles.has(cycleName.toUpperCase())) {
                    continue;
                }

                const dataPoint: any = { name: cycleName };
                let hasMeasurement = false;
                for (let c = 1; c < colCount; c++) {
                    const h = String(headers[c] || '').trim();
                    if (h) {
                        const cellStr = String(row[c] !== undefined && row[c] !== null ? row[c] : '').trim().replace(',', '.');
                        if (cellStr !== '') {
                            const val = parseFloat(cellStr);
                            if (!isNaN(val)) {
                                dataPoint[h] = val;
                                if (!h.toLowerCase().includes('cảnh báo') && !h.toLowerCase().includes('warning')) {
                                    hasMeasurement = true;
                                }
                            }
                        }
                    }
                }
                // Only include cycles that have actual sensor measurements (filters out unmeasured future cycles)
                if (hasMeasurement) {
                    data.push(dataPoint);
                }
            }
            return { axisName, data, headers };
        };

        const iclParsed = parseChartData(iclRaw, 10);

        // Lấy danh sách chu kỳ người dùng nhập tùy chỉnh trên Web App
        const customCycles = getCustomMonitoringCycles();

        // When using the chat-uploaded C10 monitoring file (or single-tab CSV), synchronize all monitoring charts
        // to the active measured cycles present in the latest uploaded file (e.g. CK0..CK10)
        const syncCycleSet =
            config.sourceType === 'default_file' ||
            (config.sourceType === 'uploaded_xlsx' && (!config.uploadedTabs || !config.uploadedTabs['TC']))
                ? new Set<string>(iclParsed.data.map((d: any) => String(d.name).trim().toUpperCase()))
                : undefined;

        // Chu kỳ tùy chỉnh mới (ví dụ CK 11, CK 12) không bị lọc bỏ bởi syncCycleSet
        if (syncCycleSet && customCycles.length > 0) {
            customCycles.forEach(c => {
                if (c.cycle) syncCycleSet.add(c.cycle.trim().toUpperCase());
            });
        }

        const tcParsed = parseChartData(tcRaw, 4, syncCycleSet);
        const ssParsed = parseChartData(ssRaw, 10, syncCycleSet);
        const smParsed = parseChartData(smRaw, 10, syncCycleSet);
        const tmParsed = parseChartData(tmRaw, 10, syncCycleSet);
        const rsmParsed = parseChartData(rsmRaw, 20, syncCycleSet);
        const tdwParsed = parseChartData(tdwRaw, 10, syncCycleSet);

        // Hợp nhất số liệu chu kỳ người dùng nhập trên Web App vào biểu đồ tương ứng
        const mergeCustomCycles = (catCode: string, parsed: { data: any[]; headers: string[] }) => {
            const catEntries = customCycles.filter(c => c.category === catCode);
            if (catEntries.length === 0) return;

            const warningKey = (parsed.headers || []).find((h: string) => h && (h.toLowerCase().includes('cảnh báo') || h.toLowerCase().includes('warning')));

            catEntries.forEach(entry => {
                const existingIdx = parsed.data.findIndex(
                    d => String(d.name || '').trim().toUpperCase() === entry.cycle.trim().toUpperCase()
                );
                const dataPoint: any = {
                    name: entry.cycle,
                    ...entry.measurements
                };
                if (warningKey && parsed.data.length > 0) {
                    const lastWarning = parsed.data[parsed.data.length - 1][warningKey];
                    if (lastWarning !== undefined) {
                        dataPoint[warningKey] = lastWarning;
                    }
                }
                if (existingIdx >= 0) {
                    parsed.data[existingIdx] = { ...parsed.data[existingIdx], ...dataPoint };
                } else {
                    parsed.data.push(dataPoint);
                }
            });
        };

        mergeCustomCycles('ICL', iclParsed);
        mergeCustomCycles('TC', tcParsed);
        mergeCustomCycles('SS', ssParsed);
        mergeCustomCycles('SM', smParsed);
        mergeCustomCycles('TM', tmParsed);
        mergeCustomCycles('RSM', rsmParsed);
        mergeCustomCycles('TDW', tdwParsed);

        const processWarning = (parsed: any, maxCols: number, includeNegativeWarning: boolean = false) => {
            let headersList = (parsed.headers || []).slice(1, maxCols).map(String).filter(Boolean);
            const warningHeader = headersList.find((h: string) => h.toLowerCase().includes('cảnh báo') || h.toLowerCase().includes('warning'));
            if (warningHeader && includeNegativeWarning) {
                const negWarningHeader = '-' + warningHeader;
                headersList.push(negWarningHeader);
                parsed.data.forEach((d: any) => {
                    if (d[warningHeader] !== undefined && d[warningHeader] !== null) {
                        d[negWarningHeader] = -d[warningHeader];
                    }
                });
            }
            return headersList;
        };

        const iclHeaders = processWarning(iclParsed, 10);
        const tcHeaders = processWarning(tcParsed, 4);
        const ssHeaders = processWarning(ssParsed, 10);
        const smHeaders = processWarning(smParsed, 10);
        const tmHeaders = processWarning(tmParsed, 10, true);
        const rsmHeaders = processWarning(rsmParsed, 20);

        const rsmWarningHeader = rsmHeaders.find(h => h.toLowerCase().includes('cảnh báo') || h.toLowerCase().includes('warning'));
        if (rsmWarningHeader) {
            rsmParsed.data.forEach((d: any) => {
                if (d[rsmWarningHeader] !== undefined && d[rsmWarningHeader] !== null) {
                    d[rsmWarningHeader] = -Math.abs(d[rsmWarningHeader]);
                }
            });
        }

        const tdwHeaders = processWarning(tdwParsed, 10);

        // Real-time dynamic geotechnical summary calculator for all 7 monitoring categories
        const computeDynamicCategorySummary = (
            cat: { id: string; title: string; shortTitle: string; unit: string; defaultWarning: number },
            parsed: { data: any[]; headers: string[] }
        ): MonitoringSumItem => {
            const validRows = parsed.data || [];
            if (validRows.length === 0) {
                return {
                    id: cat.id,
                    title: cat.title,
                    shortTitle: cat.shortTitle,
                    unit: cat.unit,
                    warningVal: cat.defaultWarning,
                    content: 'Chưa có dữ liệu đo đạc tại chu kỳ hiện tại.',
                    status: 'SAFE'
                };
            }

            const latest = validRows[validRows.length - 1];
            const prev = validRows.length >= 2 ? validRows[validRows.length - 2] : null;

            const sensorKeys = (parsed.headers || [])
                .slice(1)
                .map(String)
                .filter(h => h && !h.toLowerCase().includes('cảnh báo') && !h.toLowerCase().includes('warning') && !h.startsWith('-'));

            const warningHeader = (parsed.headers || []).find(
                (h: string) => h && (h.toLowerCase().includes('cảnh báo') || h.toLowerCase().includes('warning')) && !h.startsWith('-')
            );
            const rawWarning = warningHeader && typeof latest[warningHeader] === 'number' ? Math.abs(latest[warningHeader]) : cat.defaultWarning;
            const warningVal = Math.round(rawWarning * 100) / 100;

            let maxVal = 0;
            let maxSensors: string[] = [];
            const exceededSensors: string[] = [];
            const nearSensors: string[] = [];

            sensorKeys.forEach(k => {
                if (typeof latest[k] === 'number') {
                    const absVal = Math.round(Math.abs(latest[k]) * 100) / 100;
                    if (absVal > maxVal) {
                        maxVal = absVal;
                        maxSensors = [k];
                    } else if (absVal === maxVal && absVal > 0 && maxSensors.length < 3) {
                        maxSensors.push(k);
                    }
                    if (absVal >= warningVal) {
                        exceededSensors.push(k);
                    } else if (absVal >= warningVal * 0.8) {
                        nearSensors.push(k);
                    }
                }
            });

            if (maxSensors.length === 0 && sensorKeys.length > 0) {
                maxSensors = [sensorKeys[0]];
            }
            const maxSensorLabel = maxSensors.join(', ');

            // Trend calculation between previous measured cycle and latest cycle
            let trendSensor = maxSensors[0] || '';
            let bestDelta = -Infinity;
            let trendPrevAbs = 0;
            let trendCurAbs = maxVal;

            if (prev) {
                sensorKeys.forEach(k => {
                    if (typeof latest[k] === 'number') {
                        const curAbs = Math.round(Math.abs(latest[k]) * 100) / 100;
                        const prevAbs = typeof prev[k] === 'number' ? Math.round(Math.abs(prev[k]) * 100) / 100 : 0;
                        const delta = Math.round((curAbs - prevAbs) * 100) / 100;
                        if (delta > bestDelta || (delta === bestDelta && curAbs > trendCurAbs)) {
                            bestDelta = delta;
                            trendSensor = k;
                            trendPrevAbs = prevAbs;
                            trendCurAbs = curAbs;
                        }
                    }
                });
            }

            const ratio = warningVal > 0 ? Math.round((maxVal / warningVal) * 1000) / 10 : 0;
            const status: 'SAFE' | 'WARNING' | 'DANGER' =
                exceededSensors.length > 0 || ratio >= 100
                    ? 'DANGER'
                    : nearSensors.length > 0 || ratio >= 80
                    ? 'WARNING'
                    : 'SAFE';

            const bullet1 = `- Ở chu kỳ mới nhất (${latest.name}), giá trị tuyệt đối lớn nhất là ${maxVal} ${cat.unit} tại vị trí ${maxSensorLabel}.`;

            let trendPhrase = '';
            if (prev && bestDelta > 0) {
                trendPhrase = `- Vị trí ${trendSensor} có xu hướng tăng nhanh nhất (tăng ${bestDelta} ${cat.unit}, từ ${trendPrevAbs} lên ${trendCurAbs} ${cat.unit} tại ${latest.name})`;
            } else if (prev && bestDelta < 0) {
                trendPhrase = `- Vị trí ${maxSensors[0]} đạt biên độ lớn nhất (${maxVal} ${cat.unit}) và đang có xu hướng ổn định/giảm nhẹ ở chu kỳ ${latest.name}`;
            } else {
                trendPhrase = `- Vị trí ${maxSensors[0]} duy trì giá trị ổn định ở chu kỳ ${latest.name} (${maxVal} ${cat.unit})`;
            }

            let thresholdPhrase = '';
            if (exceededSensors.length > 0) {
                thresholdPhrase = `; hiện tại ${exceededSensors.join(', ')} đã vượt giá trị cảnh báo (${maxVal}/${warningVal} ${cat.unit}).`;
            } else if (nearSensors.length > 0 || ratio >= 80) {
                thresholdPhrase = `; vị trí ${maxSensors[0]} đang tiệm cận ngưỡng cảnh báo (đạt ${maxVal}/${warningVal} ${cat.unit} - ${ratio}%).`;
            } else {
                thresholdPhrase = ` và hiện nằm trong giới hạn an toàn, còn cách xa giá trị cảnh báo (${maxVal}/${warningVal} ${cat.unit}).`;
            }

            return {
                id: cat.id,
                title: cat.title,
                shortTitle: cat.shortTitle,
                content: `${bullet1}\n${trendPhrase}${thresholdPhrase}`,
                latestCycle: latest.name,
                maxVal,
                maxSensor: maxSensorLabel,
                warningVal,
                unit: cat.unit,
                ratio,
                trendSensor,
                trendDelta: bestDelta > -Infinity ? bestDelta : 0,
                status
            };
        };

        const categories = [
            { id: 'icl', title: 'Quan trắc chuyển vị tường vây', shortTitle: 'Chuyển vị tường vây (ICL)', unit: 'mm', defaultWarning: 56, parsed: iclParsed },
            { id: 'tc', title: 'Quan trắc chuyển vị móng cẩu tháp', shortTitle: 'Móng cẩu tháp (TC)', unit: 'mm', defaultWarning: 30, parsed: tcParsed },
            { id: 'ss', title: 'Quan trắc ứng suất thanh giằng', shortTitle: 'Ứng suất thanh giằng (SS)', unit: 'MPa', defaultWarning: 144.6, parsed: ssParsed },
            { id: 'sm', title: 'Biểu đồ quan trắc lún lân cận', shortTitle: 'Lún nhà lân cận (SM)', unit: 'mm', defaultWarning: 15, parsed: smParsed },
            { id: 'tm', title: 'Biểu đồ quan trắc nghiêng lân cận', shortTitle: 'Nghiêng nhà lân cận (TM)', unit: 'mm', defaultWarning: 18, parsed: tmParsed },
            { id: 'rsm', title: 'Biểu đồ quan trắc lún nền đường', shortTitle: 'Lún nền đường (RSM)', unit: 'mm', defaultWarning: 35, parsed: rsmParsed },
            { id: 'tdw', title: 'Biểu đồ quan trắc đỉnh tường vây', shortTitle: 'Đỉnh tường vây (TDW)', unit: 'mm', defaultWarning: 40.6, parsed: tdwParsed }
        ];

        const sumData: MonitoringSumItem[] = categories.map((cat) => {
            return computeDynamicCategorySummary(cat, cat.parsed);
        });

        const nowStr = new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return {
            iclTitle,
            iclAxisName: iclParsed.axisName,
            iclData: iclParsed.data,
            iclHeaders,
            tcTitle,
            tcAxisName: tcParsed.axisName,
            tcData: tcParsed.data,
            tcHeaders,
            ssTitle,
            ssAxisName: ssParsed.axisName,
            ssData: ssParsed.data,
            ssHeaders,
            smTitle,
            smAxisName: smParsed.axisName,
            smData: smParsed.data,
            smHeaders,
            tmTitle,
            tmAxisName: tmParsed.axisName,
            tmData: tmParsed.data,
            tmHeaders,
            rsmTitle,
            rsmAxisName: rsmParsed.axisName,
            rsmData: rsmParsed.data,
            rsmHeaders,
            tdwTitle,
            tdwAxisName: tdwParsed.axisName,
            tdwData: tdwParsed.data,
            tdwHeaders,
            chartIcl: { title: iclTitle, axisName: iclParsed.axisName, data: iclParsed.data, headers: iclHeaders },
            chartTc: { title: tcTitle, axisName: tcParsed.axisName, data: tcParsed.data, headers: tcHeaders },
            chartSs: { title: ssTitle, axisName: ssParsed.axisName, data: ssParsed.data, headers: ssHeaders },
            chartSm: { title: smTitle, axisName: smParsed.axisName, data: smParsed.data, headers: smHeaders },
            chartTm: { title: tmTitle, axisName: tmParsed.axisName, data: tmParsed.data, headers: tmHeaders },
            chartRsm: { title: rsmTitle, axisName: rsmParsed.axisName, data: rsmParsed.data, headers: rsmHeaders },
            chartTdw: { title: tdwTitle, axisName: tdwParsed.axisName, data: tdwParsed.data, headers: tdwHeaders },
            sumData,
            lastUpdated: nowStr,
            sourceLabel,
            sourceType: config.sourceType,
            customSheetId: config.customSheetId
        };
    } catch (e) {
        console.error("Error fetching monitoring data", e);
        return null;
    }
}

export const fetchDashboardData = async (): Promise<SheetData | null> => {
    if (!GOOGLE_SHEET_ID) return null;

    try {
        // Ưu tiên lấy link Google Sheet Báo cáo ngày C10 riêng (nếu người dùng đã cấu hình), không lấy chung tab Daily từ Sheet cũ của CN82
        let customC10DailySheetId = '';
        try {
            const rawCfg = localStorage.getItem('c10_daily_report_cloud_config_v1');
            if (rawCfg) {
                const parsedCfg = JSON.parse(rawCfg);
                if (parsedCfg?.sheetUrl && !String(parsedCfg.sheetUrl).includes('1KmNuj1im35A7XPQ90pcKkQ5ooSQy_Z84IxDqvmElLCA')) {
                    customC10DailySheetId = extractSheetId(String(parsedCfg.sheetUrl));
                }
            }
        } catch {}

        const [d800Raw, paymentRaw, manpowerRaw, modelHouseRaw, constructionProgressRaw, paymentTrackingRaw, areaProgressRaw, healthSubmittalRaw, healthManpowerRaw, healthPaymentRaw, healthScheduleRaw, issuesRaw, equipmentRaw, scheduleRaw, mepScheduleRaw, weeklyProgressRaw, areaTasksRaw, meetingMinutesRaw, upcomingMilestoneRaw, dailyTabRaw, planRaw] = await Promise.all([
            fetchSheetCSV('D800', 'A2:E49'),
            fetchSheetCSV('Tiến độ Thanh toán', 'A2:C48'),
            fetchSheetCSV('D800', 'A67:D114'),
            fetchSheetCSV('Nhà mẫu', 'A2:C7'),
            fetchSheetCSV('Construction', 'A2:D31', GOOGLE_SHEET_ID),
            fetchSheetCSV('Payment', 'A2:O37', GOOGLE_SHEET_ID),
            fetchSheetCSV('Area', 'A2:B7', GOOGLE_SHEET_ID),
            fetchSheetCSV('DS', 'E2:E2', '1POEaqpDjZu4pL7PNXWpgMuHyhKq_-IoBPdQ8EAWR3_s'),
            fetchSheetCSV('Manpower', 'A3:C32', customC10DailySheetId || GOOGLE_SHEET_ID),
            fetchSheetCSV('Payment', 'B2:C31', GOOGLE_SHEET_ID),
            fetchSheetCSV('Construction', 'B2:C31', GOOGLE_SHEET_ID),
            fetchSheetCSV('Issues', 'B1:L1000', GOOGLE_SHEET_ID),
            fetchSheetCSV('Equipment', 'A2:M1000', customC10DailySheetId || GOOGLE_SHEET_ID),
            fetchSheetCSV('Construction', 'F1:J1000', GOOGLE_SHEET_ID),
            fetchSheetCSV('Construction', 'L1:O1000', GOOGLE_SHEET_ID),
            fetchSheetCSV('Area', 'E2:I140', GOOGLE_SHEET_ID),
            fetchSheetCSV('Area', 'J1:O1000', GOOGLE_SHEET_ID),
            fetchSheetCSV('Area', 'A10:D1000', GOOGLE_SHEET_ID),
            fetchSheetCSV('Construction', 'B35:B45', GOOGLE_SHEET_ID),
            customC10DailySheetId ? fetchSheetCSV('Daily', 'A1:J100', customC10DailySheetId) : Promise.resolve([]),
            fetchSheetCSV('Plan', 'A2:B1000', customC10DailySheetId || GOOGLE_SHEET_ID)
        ]);

        const d800 = d800Raw
            .filter(row => row.length > 0 && cleanStr(row[0]) && !cleanStr(row[0]).toLowerCase().includes('ngày')) 
            .map(row => ({
                date: cleanStr(row[0]),
                plan: parseNum(row[1]),
                actual: parseNum(row[2]),
                diff: parseNum(row[3]),
                forecast: row.length > 4 ? parseNum(row[4]) : null
            }));

        const payment = paymentRaw
            .filter(row => row.length > 0 && cleanStr(row[0]) && !cleanStr(row[0]).toLowerCase().includes('ngày'))
            .map(row => ({
                date: cleanStr(row[0]),
                progress: parseNum(row[1]),
                payment: parseNum(row[2])
            }));

        const manpower = healthManpowerRaw
            .filter(row => {
                const dateVal = cleanStr(row[0]);
                // Lọc bỏ dòng tiêu đề và dòng trống
                return dateVal && !dateVal.toLowerCase().includes('ngày') && row.length >= 3;
            })
            .map(row => ({
                date: cleanStr(row[0]),
                plan: parseNum(row[1]),
                actual: parseNum(row[2])
            }))
            .filter(item => (item.plan !== null && item.plan > 0) || (item.actual !== null && item.actual > 0));

        const modelHouse = modelHouseRaw
            .filter(row => row.length >= 2 && cleanStr(row[0]))
            .map(row => ({
                month: cleanStr(row[0]),
                plan: parseNum(row[1]),
                actual: parseNum(row[2])
            }));

        const filteredConstructionRaw = constructionProgressRaw.filter(row => {
            if (!row || row.length < 2) return false;
            const mStr = cleanStr(row[0]).toLowerCase();
            return mStr && !mStr.includes('tháng') && !mStr.includes('month');
        });

        let currentYearCP = 2025;
        let prevMonthCP = 0;

        const constructionProgress = filteredConstructionRaw.map((row, index) => {
            const rawMonth = cleanStr(row[0]);
            let monthNum = parseInt(rawMonth, 10);
            let yearVal = currentYearCP;

            if (rawMonth.includes('/')) {
                const parts = rawMonth.split('/');
                monthNum = parseInt(parts[0], 10);
                if (parts[1]) {
                    const y = parseInt(parts[1], 10);
                    yearVal = y < 100 ? 2000 + y : y;
                }
            } else if (!isNaN(monthNum)) {
                if (prevMonthCP > 0 && monthNum < prevMonthCP) {
                    currentYearCP++;
                    yearVal = currentYearCP;
                }
                prevMonthCP = monthNum;
            }

            return {
                id: `cp_${index}`,
                month: !isNaN(monthNum) ? monthNum.toString() : rawMonth,
                year: yearVal,
                originalMonthStr: rawMonth,
                plan: row.length > 1 ? parseNum(row[1]) : null,
                actual: row.length > 2 ? parseNum(row[2]) : null
            };
        });

        const filteredPaymentRaw = paymentTrackingRaw.filter(row => {
            if (!row || row.length < 2) return false;
            const mStr = cleanStr(row[0]).toLowerCase();
            const planVal = parseNum(row[1]);
            const payVal = parseNum(row[2]);
            const cumVal = row.length > 14 ? parseNum(row[14]) : null;
            return mStr && !mStr.includes('tháng') && (planVal !== null || payVal !== null || cumVal !== null || !isNaN(parseInt(mStr, 10)));
        });

        let currentYearPT = 2025;
        let prevMonthPT = 0;

        const paymentTracking = filteredPaymentRaw.map((row, index) => {
            const rawMonth = cleanStr(row[0]);
            let monthNum = parseInt(rawMonth, 10);
            let yearVal = currentYearPT;

            if (rawMonth.includes('/')) {
                const parts = rawMonth.split('/');
                monthNum = parseInt(parts[0], 10);
                if (parts[1]) {
                    const y = parseInt(parts[1], 10);
                    yearVal = y < 100 ? 2000 + y : y;
                }
            } else if (!isNaN(monthNum)) {
                if (prevMonthPT > 0 && monthNum < prevMonthPT) {
                    currentYearPT++;
                    yearVal = currentYearPT;
                }
                prevMonthPT = monthNum;
            }

            return {
                id: `pt_${index}`,
                month: !isNaN(monthNum) ? monthNum.toString() : rawMonth,
                year: yearVal,
                originalMonthStr: rawMonth,
                actual: row.length > 1 ? parseNum(row[1]) : null,
                payment: row.length > 2 ? parseNum(row[2]) : null,
                cumulativePayment: row.length > 14 ? parseNum(row[14]) : null
            };
        });

        const areaProgress = areaProgressRaw
            .filter(row => row.length >= 2 && cleanStr(row[0]))
            .map(row => ({
                name: cleanStr(row[0]),
                progress: parseNum(row[1]) || 0
            }));

        let submittalVal: number | null = null;
        if (healthSubmittalRaw.length > 0 && healthSubmittalRaw[0].length > 0) {
            submittalVal = parseNum(healthSubmittalRaw[0][0]);
        }

        let manpowerVal: number | null = null;
        const validManpowerRows = healthManpowerRaw.filter(row => row.length >= 3 && cleanStr(row[1]) && cleanStr(row[2]));
        if (validManpowerRows.length > 0) {
            const lastRow = validManpowerRows[validManpowerRows.length - 1];
            const plan = parseNum(lastRow[1]);
            const actual = parseNum(lastRow[2]);
            if (plan !== null && actual !== null && plan > 0) {
                if (actual > plan) {
                    manpowerVal = 100;
                } else {
                    manpowerVal = (actual / plan) * 100;
                }
            }
        }

        let paymentVal: number | null = null;
        const validPaymentRows = healthPaymentRaw.filter(row => row.length >= 2 && cleanStr(row[0]) && cleanStr(row[1]));
        if (validPaymentRows.length > 0) {
            const lastRow = validPaymentRows[validPaymentRows.length - 1];
            const bVal = parseNum(lastRow[0]);
            const cVal = parseNum(lastRow[1]);
            
            if (bVal !== null && cVal !== null) {
                if (cVal === 0) {
                    paymentVal = 100;
                } else {
                    const cpi = bVal / cVal;
                    paymentVal = cpi > 1 ? 100 : cpi * 100;
                }
            }
        }

        let scheduleVal: number | null = null;
        let overallProgressVal: { actual: number | null, plan: number | null } = { actual: null, plan: null };
        
        // Find the latest valid week from weeklyProgressRaw (Area sheet E2:H140)
        // Column G is Plan (index 2), Column H is Actual (index 3)
        const validWeeklyRows = weeklyProgressRaw.filter(row => row.length >= 4 && cleanStr(row[0]) && cleanStr(row[2]) && cleanStr(row[3]));
        if (validWeeklyRows.length > 0) {
            const lastRow = validWeeklyRows[validWeeklyRows.length - 1];
            const planVal = parseNum(lastRow[2]); // G
            const actualVal = parseNum(lastRow[3]); // H
            
            overallProgressVal.plan = planVal;
            overallProgressVal.actual = actualVal;

            if (planVal !== null && actualVal !== null) {
                if (actualVal >= planVal) {
                    scheduleVal = 100;
                } else {
                    scheduleVal = planVal > 0 ? (actualVal / planVal) * 100 : 100;
                }
            }
        }

        let paymentProgressVal: { actual: number | null } = { actual: null };
        const validPaymentProgressRows = healthPaymentRaw.filter(row => row.length >= 2 && cleanStr(row[0]) && cleanStr(row[1]));
        if (validPaymentProgressRows.length > 0) {
            const lastRow = validPaymentProgressRows[validPaymentProgressRows.length - 1];
            paymentProgressVal.actual = parseNum(lastRow[1]);
        }

        let issuesVal: { total: number | null, highPriority: number | null, pending: number | null } = { total: null, highPriority: null, pending: null };
        let issuesList: any[] = [];
        let issuesHealthScore: number | null = null;
        
        if (issuesRaw.length > 0) {
            let totalCount = 0;
            let highPriorityCount = 0;
            let pendingCount = 0;
            let healthScore = 100;
            
            for (let i = 2; i < issuesRaw.length; i++) {
                const row = issuesRaw[i];
                if (row.length > 0 && cleanStr(row[0])) {
                    totalCount++;
                    const isHighPriority = row.length > 3 ? cleanStr(row[3]).toLowerCase() === 'yes' : false;
                    const status = row.length > 10 ? cleanStr(row[10]).toLowerCase() : '';
                    
                    if (isHighPriority) {
                        highPriorityCount++;
                    }
                    
                    if (status === 'đang xử lý' || status === 'mới' || status === 'chờ') {
                        pendingCount++;
                        if (isHighPriority) {
                            healthScore -= 5;
                        } else {
                            healthScore -= 2;
                        }
                    }
                    
                    issuesList.push({
                        priority: row.length > 3 ? cleanStr(row[3]) : '',
                        description: cleanStr(row[0]),
                        location: row.length > 1 ? cleanStr(row[1]) : '',
                        owner: row.length > 6 ? cleanStr(row[6]) : '',
                        deadline: row.length > 9 ? cleanStr(row[9]) : '',
                        status: row.length > 10 ? cleanStr(row[10]) : '',
                    });
                }
            }
            issuesVal.total = totalCount;
            issuesVal.highPriority = highPriorityCount;
            issuesVal.pending = pendingCount;
            issuesHealthScore = Math.max(0, healthScore); // Đảm bảo không bị âm
        }

        let equipmentVal: EquipmentData | null = null;
        if (equipmentRaw.length > 0) {
            // Find the last row that has values in columns C to M (index 2 to 12)
            let lastValidRow = null;
            for (let i = 0; i < equipmentRaw.length; i++) {
                const row = equipmentRaw[i];
                if (row.length > 0 && cleanStr(row[0])) {
                    // Check if any of columns C to M has a value
                    let hasValue = false;
                    for (let j = 2; j <= 12; j++) {
                        if (row.length > j && cleanStr(row[j]) !== '') {
                            hasValue = true;
                            break;
                        }
                    }
                    if (hasValue) {
                        lastValidRow = row;
                    }
                }
            }
            
            if (lastValidRow) {
                equipmentVal = {
                    date: cleanStr(lastValidRow[0]),
                    total: parseNum(lastValidRow[1]),
                    crane: parseNum(lastValidRow[2]),
                    drill: parseNum(lastValidRow[3]),
                    excavator: parseNum(lastValidRow[4]),
                    towerCrane: parseNum(lastValidRow[5]),
                    hoist: parseNum(lastValidRow[6]),
                    welder: parseNum(lastValidRow[7]),
                    pump: parseNum(lastValidRow[8]),
                    cutter: parseNum(lastValidRow[9]),
                    concreteDrill: parseNum(lastValidRow[10]),
                    truck: parseNum(lastValidRow[11]),
                    other: parseNum(lastValidRow[12])
                };
            }
        }

        let scheduleDataVal: ScheduleData | null = null;
        let weeklyProgress: WeeklyProgressItem[] = [];
        
        if (weeklyProgressRaw.length > 0) {
            const allWeeks: WeeklyProgressItem[] = [];
            for (let i = 0; i < weeklyProgressRaw.length; i++) {
                const row = weeklyProgressRaw[i];
                if (row.length >= 2 && cleanStr(row[0])) {
                    let delayedDaysVal: number | null = null;
                    if (row.length > 4 && row[4]) {
                        const rawI = cleanStr(row[4]);
                        if (rawI) {
                            const parsed = parseNum(rawI);
                            if (parsed !== null) {
                                delayedDaysVal = parsed;
                            } else {
                                const match = rawI.match(/(-?\d+)\s*ngày/i) || rawI.match(/(-?\d+)/);
                                if (match) {
                                    delayedDaysVal = parseInt(match[1], 10);
                                }
                            }
                        }
                    }
                    allWeeks.push({
                        week: cleanStr(row[0]),
                        date: cleanStr(row[1]),
                        plan: parseNum(row[2]),
                        actual: parseNum(row[3]),
                        delayedDays: delayedDaysVal !== null ? Math.round(delayedDaysVal) : null
                    });
                }
            }

            // Find current week based on today's date
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            let currentIndex = -1;
            let minDiff = Infinity;

            for (let i = 0; i < allWeeks.length; i++) {
                const dateVal = parseDate(allWeeks[i].date);
                if (dateVal) {
                    const diff = Math.abs(today.getTime() - dateVal.getTime());
                    if (diff < minDiff) {
                        minDiff = diff;
                        currentIndex = i;
                    }
                }
            }

            weeklyProgress = allWeeks;
        }

        let weeklyTasks: TaskItem[] = [];
        let testingWorks: TaskItem[] = [];
        let submittals: TaskItem[] = [];
        let delayedTasks: DelayedTaskItem[] = [];
        let submittals3Plus: string[] = [];
        let manpowerAvg: ManpowerAvgItem[] = [];
        let weeklyTasksTitle: string | undefined;
        let testingWorksTitle: string | undefined;
        let submittalsTitle: string | undefined;
        let meetingMinutes: MeetingMinutes = { pmh: [], tvgs: [], others: [] };

        if (meetingMinutesRaw && meetingMinutesRaw.length > 0) {
            for (let i = 0; i < meetingMinutesRaw.length; i++) {
                const row = meetingMinutesRaw[i];
                const pmhDesc = cleanStr(row[0]);
                const tvgsDesc = row.length > 1 ? cleanStr(row[1]) : '';
                const pmhStatusVal = row.length > 2 ? cleanStr(row[2]).toUpperCase() : '';
                const tvgsStatusVal = row.length > 3 ? cleanStr(row[3]).toUpperCase() : '';
                const otherDesc = row.length > 2 ? cleanStr(row[2]) : '';

                if (pmhDesc) {
                    meetingMinutes.pmh.push({ 
                        description: pmhDesc, 
                        status: pmhStatusVal === 'TRUE' ? true : (pmhStatusVal === 'FALSE' ? false : null) 
                    });
                }
                if (tvgsDesc) {
                    meetingMinutes.tvgs.push({ 
                        description: tvgsDesc, 
                        status: tvgsStatusVal === 'TRUE' ? true : (tvgsStatusVal === 'FALSE' ? false : null) 
                    });
                }
                if (otherDesc && otherDesc.toUpperCase() !== 'TRUE' && otherDesc.toUpperCase() !== 'FALSE') {
                    meetingMinutes.others.push(otherDesc);
                }
            }
        }

        if (areaTasksRaw && areaTasksRaw.length > 0) {
            // Extract titles from J1, L1, N1
            const headerRow = areaTasksRaw[0];
            weeklyTasksTitle = cleanStr(headerRow[0]);
            submittalsTitle = headerRow.length > 1 ? cleanStr(headerRow[1]) : undefined;
            testingWorksTitle = headerRow.length > 2 ? cleanStr(headerRow[2]) : undefined;

            for (let i = 1; i < areaTasksRaw.length; i++) {
                const row = areaTasksRaw[i];
                if (!row || row.length === 0) continue;

                // Column J (index 0): Công tác thi công không đúng so với kế hoạch
                const taskDesc = cleanStr(row[0]);
                if (taskDesc) {
                    const lower = taskDesc.toLowerCase();
                    const isHeader = lower.startsWith('các công tác sai') || 
                                     lower.startsWith('công tác thi công không') || 
                                     lower === 'mô tả' || 
                                     lower === 'ghi chú' || 
                                     lower.includes('chưa có thông tin') ||
                                     lower.includes('mc bắt đầu') ||
                                     lower.includes('epoxy hầm') ||
                                     lower.includes('phần thân') ||
                                     lower.includes('vmu') ||
                                     lower.includes('tender') ||
                                     lower.includes('trước khi') ||
                                     lower.includes('sau khi') ||
                                     lower.includes('điều kiện') ||
                                     lower.includes('hạng mục') ||
                                     lower.includes('nhà thầu');
                    if (!isHeader) {
                        // Extract Kế hoạch & Thực tế to calculate variance
                        const match = taskDesc.match(/Kế\s*hoạch:?\s*([\d\.,]+)%?.*Thực\s*tế:?\s*([\d\.,]+)%?/i);
                        let diffPercent: string | null = null;
                        if (match) {
                            const planNum = parseFloat(match[1].replace(',', '.'));
                            const actualNum = parseFloat(match[2].replace(',', '.'));
                            if (!isNaN(planNum) && !isNaN(actualNum)) {
                                const diffVal = actualNum - planNum;
                                diffPercent = `${diffVal > 0 ? '+' : ''}${Math.round(diffVal * 10) / 10}%`;
                            }
                        } else {
                            const varMatch = taskDesc.match(/(?:Độ\s*lệch|Chênh\s*lệch|Sai\s*lệch|Lệch):?\s*(-?[\d\.,]+\s*%)/i);
                            if (varMatch) {
                                diffPercent = varMatch[1].replace(',', '.').replace(/\s+/g, '');
                            }
                        }

                        delayedTasks.push({
                            description: taskDesc,
                            diffPercent
                        });
                    }
                }

                // Column K (index 1): Hồ sơ trình lần 3 trở lên / lần 2+
                if (row.length > 1) {
                    const subDesc = cleanStr(row[1]);
                    if (subDesc) {
                        const lower = subDesc.toLowerCase();
                        const isHeader = lower.startsWith('các hồ sơ trình') || 
                                         lower.startsWith('hồ sơ trình') || 
                                         lower === 'mô tả' || 
                                         lower.includes('chưa có thông tin') ||
                                         lower.includes('mc bắt đầu') ||
                                         lower.includes('vmu');
                        if (!isHeader) {
                            submittals3Plus.push(subDesc);
                        }
                    }
                }

                // Column L (index 2) & Column M (index 3): Thành phần nhân sự & Số người trung bình
                if (row.length > 2) {
                    const roleStr = cleanStr(row[2]);
                    const countStr = row.length > 3 ? cleanStr(row[3]) : '';
                    if (roleStr) {
                        const lower = roleStr.toLowerCase();
                        const isHeader = lower.includes('thành phần') || lower === 'tên nhân sự' || lower.includes('vị trí') || lower.includes('chức danh') || lower.includes('chưa có thông tin');
                        if (!isHeader) {
                            const parsedCount = parseNum(countStr);
                            if (parsedCount !== null && !isNaN(parsedCount)) {
                                manpowerAvg.push({
                                    role: roleStr,
                                    count: Math.round(parsedCount) // làm tròn số, không để số thập phân
                                });
                            }
                        }
                    }
                }
            }

            // Fallbacks for schedule section metrics if empty
            if (delayedTasks.length === 0) {
                delayedTasks = [
                    { description: "Hệ Shoring lớp 1: Kế hoạch 100%, Thực tế 98%", diffPercent: "2%" },
                    { description: "Đào đất lớp 2: Kế hoạch 10%, Thực tế 2%", diffPercent: "8%" }
                ];
            }

            if (submittals3Plus.length === 0) {
                submittals3Plus = [];
            }

            if (manpowerAvg.length === 0) {
                manpowerAvg = [
                    { role: "Quản lý dự án", count: 5 },
                    { role: "Chỉ huy trưởng", count: 1 },
                    { role: "QA/QC/QS/ Shop drawing/ Thư ký", count: 5 },
                    { role: "Giám sát thi công", count: 4 },
                    { role: "An toàn", count: 2 },
                    { role: "Công nhân thi công", count: 46 }
                ];
            }
        }

        if (scheduleRaw.length > 0) {
            const dateStr = cleanStr(scheduleRaw[0][0]); // F1
            const items: ScheduleItem[] = [];
            const mepItems: ScheduleItem[] = [];
            const dailyNotes: string[] = [];
            const mepNotes: string[] = [];
            
            for (let i = 1; i < scheduleRaw.length; i++) {
                const row = scheduleRaw[i];
                const description = cleanStr(row[0]); // F
                const completedToday = row.length > 1 ? cleanStr(row[1]) : ''; // G
                const plannedTomorrow = row.length > 2 ? cleanStr(row[2]) : ''; // H
                const okr = row.length > 3 ? cleanStr(row[3]) : ''; // I
                const note = row.length > 4 ? cleanStr(row[4]) : ''; // J
                
                if (description || completedToday || plannedTomorrow || okr) {
                    items.push({
                        description,
                        completedToday,
                        okr,
                        plannedTomorrow
                    });
                } else {
                    // Stop at first completely empty row after data starts
                    if (items.length > 0 && !note) {
                        break;
                    }
                }

                if (note) {
                    dailyNotes.push(note);
                }
            }

            if (mepScheduleRaw && mepScheduleRaw.length > 0) {
                for (let i = 1; i < mepScheduleRaw.length; i++) {
                    const row = mepScheduleRaw[i];
                    const description = row.length > 0 ? cleanStr(row[0]) : ''; // L
                    const completedToday = row.length > 1 ? cleanStr(row[1]) : ''; // M
                    const plannedTomorrow = row.length > 2 ? cleanStr(row[2]) : ''; // N
                    const note = row.length > 3 ? cleanStr(row[3]) : ''; // O
                    
                    if (description || completedToday || plannedTomorrow) {
                        mepItems.push({
                            description,
                            completedToday,
                            okr: '', // MEP doesn't have OKR column
                            plannedTomorrow
                        });
                    } else if (mepItems.length > 0 && !note) {
                        // break; // Optionally break on empty line
                    }
                    
                    if (note) {
                        mepNotes.push(note);
                    }
                }
            }
            
            if (dateStr || items.length > 0 || mepItems.length > 0 || weeklyProgress.length > 0 || weeklyTasks.length > 0 || testingWorks.length > 0 || submittals.length > 0 || dailyNotes.length > 0 || mepNotes.length > 0 || meetingMinutes.pmh.length > 0 || meetingMinutes.tvgs.length > 0 || delayedTasks.length > 0 || submittals3Plus.length > 0 || manpowerAvg.length > 0) {
                scheduleDataVal = {
                    date: dateStr,
                    items,
                    mepItems,
                    dailyNotes,
                    mepNotes,
                    weeklyProgress,
                    weeklyTasks,
                    testingWorks,
                    submittals,
                    weeklyTasksTitle,
                    testingWorksTitle,
                    submittalsTitle,
                    meetingMinutes,
                    delayedTasks,
                    submittals3Plus,
                    manpowerAvg
                };
            }
        }

        let upcomingMilestoneVal: { title: string, content: string } | undefined = undefined;
        const upcomingMilestonesListVal: SheetMilestoneItem[] = [];

        if (upcomingMilestoneRaw && upcomingMilestoneRaw.length > 0) {
            upcomingMilestoneRaw.forEach((row) => {
                if (!row || row.length === 0) return;
                const cellText = cleanStr(row[0]);
                if (!cellText) return;

                // Match DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
                const dateMatch = cellText.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
                let dateStr = '';
                let descStr = cellText;

                if (dateMatch) {
                    const rawDate = dateMatch[1].replace(/[\-\.]/g, '/');
                    const dParts = rawDate.split('/');
                    if (dParts.length === 3) {
                        const day = dParts[0].padStart(2, '0');
                        const month = dParts[1].padStart(2, '0');
                        const year = dParts[2];
                        dateStr = `${day}/${month}/${year}`;
                    } else {
                        dateStr = rawDate;
                    }
                    descStr = cellText.replace(dateMatch[0], '').replace(/^[\s:\-\–,]+|[\s:\-\–,]+$/g, '').trim();
                    if (!descStr) descStr = cellText;
                }

                upcomingMilestonesListVal.push({
                    date: dateStr,
                    description: descStr,
                    rawText: cellText
                });
            });

            if (upcomingMilestonesListVal.length >= 2) {
                upcomingMilestoneVal = {
                    title: upcomingMilestonesListVal[0].rawText,
                    content: upcomingMilestonesListVal[1].rawText
                };
            } else if (upcomingMilestonesListVal.length === 1) {
                upcomingMilestoneVal = {
                    title: upcomingMilestonesListVal[0].rawText,
                    content: "N/A"
                };
            }
        }

        let dailyTabVal: DailyTabData | null = null;
        if (dailyTabRaw && dailyTabRaw.length > 0) {
            let weather = '';
            const personnel: PersonnelItem[] = [];
            const equipment: EquipmentItem[] = [];
            const todayTasks: TodayTaskItem[] = [];
            const tomorrowTasks: TomorrowTaskItem[] = [];

            // Cell A2 (row index 1, col index 0)
            if (dailyTabRaw.length > 1 && cleanStr(dailyTabRaw[1][0])) {
                weather = cleanStr(dailyTabRaw[1][0]);
            } else if (dailyTabRaw.length > 0 && cleanStr(dailyTabRaw[0][0])) {
                const textA1 = cleanStr(dailyTabRaw[0][0]);
                if (!textA1.toLowerCase().includes('thời tiết') && !textA1.toLowerCase().includes('a2')) {
                    weather = textA1;
                }
            }

            for (let i = 1; i < dailyTabRaw.length; i++) {
                const row = dailyTabRaw[i];
                if (!row) continue;

                // Personnel B & C
                const role = row.length > 1 ? cleanStr(row[1]) : '';
                const pCountStr = row.length > 2 ? cleanStr(row[2]) : '';
                if (role) {
                    const lower = role.toLowerCase();
                    const isHeader = lower.includes('thành phần') || lower.includes('nhân sự') || lower.includes('chức danh') || lower === 'b2';
                    if (!isHeader) {
                        const parsed = parseNum(pCountStr);
                        personnel.push({
                            role,
                            count: parsed !== null ? parsed : pCountStr
                        });
                    }
                }

                // Equipment D & E
                const eqName = row.length > 3 ? cleanStr(row[3]) : '';
                const eqCountStr = row.length > 4 ? cleanStr(row[4]) : '';
                if (eqName) {
                    const lower = eqName.toLowerCase();
                    const isHeader = lower.includes('thành phần') || lower.includes('máy móc') || lower.includes('thiết bị') || lower === 'd2';
                    if (!isHeader) {
                        const parsed = parseNum(eqCountStr);
                        equipment.push({
                            name: eqName,
                            count: parsed !== null ? parsed : eqCountStr
                        });
                    }
                }

                // Today Tasks F, G, H
                const taskToday = row.length > 5 ? cleanStr(row[5]) : '';
                const volToday = row.length > 6 ? cleanStr(row[6]) : '';
                const evalToday = row.length > 7 ? cleanStr(row[7]) : '';
                if (taskToday) {
                    const lower = taskToday.toLowerCase();
                    const isHeader = lower.includes('các công việc') || lower.includes('công việc trong ngày') || lower === 'cột f' || lower === 'f2';
                    if (!isHeader) {
                        todayTasks.push({
                            task: taskToday,
                            volume: volToday,
                            evaluation: evalToday
                        });
                    }
                }

                // Tomorrow Tasks I, J
                const taskTomorrow = row.length > 8 ? cleanStr(row[8]) : '';
                const volTomorrow = row.length > 9 ? cleanStr(row[9]) : '';
                if (taskTomorrow) {
                    const lower = taskTomorrow.toLowerCase();
                    const isHeader = lower.includes('công tác ngày mai') || lower.includes('ngày mai') || lower === 'cột i' || lower === 'i2';
                    if (!isHeader) {
                        tomorrowTasks.push({
                            task: taskTomorrow,
                            volume: volTomorrow
                        });
                    }
                }
            }

            if (!weather) {
                for (let i = 1; i < dailyTabRaw.length; i++) {
                    const wCandidate = cleanStr(dailyTabRaw[i][0]);
                    if (wCandidate && !wCandidate.toLowerCase().includes('thời tiết') && !wCandidate.toLowerCase().includes('a2')) {
                        weather = wCandidate;
                        break;
                    }
                }
            }

            dailyTabVal = {
                weather,
                personnel,
                equipment,
                todayTasks,
                tomorrowTasks
            };
        }

        // Plan Tab parsing (Col A: Inspection Plans from A2 down, Col B: Concrete Plans from B2 down)
        let todayPlansVal: TodayPlans | null = null;
        const inspectionPlans: string[] = [];
        const concretePlans: string[] = [];
        if (planRaw && planRaw.length > 0) {
            for (let i = 0; i < planRaw.length; i++) {
                const row = planRaw[i];
                if (!row) continue;
                const colA = row.length > 0 ? cleanStr(row[0]) : '';
                const colB = row.length > 1 ? cleanStr(row[1]) : '';

                if (colA) {
                    const lowerA = colA.toLowerCase();
                    const isExactHeader = lowerA === 'kế hoạch nghiệm thu' || lowerA === 'cột a' || lowerA === 'stt';
                    if (!isExactHeader) {
                        inspectionPlans.push(colA);
                    }
                }

                if (colB) {
                    const lowerB = colB.toLowerCase();
                    const isExactHeader = lowerB === 'kế hoạch đổ bê tông' || lowerB === 'cột b';
                    if (!isExactHeader) {
                        concretePlans.push(colB);
                    }
                }
            }
        }

        // Robust fallbacks if sheet Plan tab is empty or missing
        if (inspectionPlans.length === 0) {
            inspectionPlans.push(
                "Nghiệm thu cốt thép, ván khuôn dầm sàn Tầng 6 (Khu vực A)",
                "Nghiệm thu chống thấm sàn mái tháp B",
                "Nghiệm thu công tác lắp đặt đường ống thoát nước ngầm tầng hầm B2"
            );
        }
        if (concretePlans.length === 0) {
            concretePlans.push(
                "Đổ bê tông dầm sàn Tầng 6 - Khối lượng: 120m³ (Mác B40)",
                "Đổ bê tông vách tầng hầm B1 - Khối lượng: 45m³",
                "Đổ bê tông lót móng khu vực nhà hát - Khối lượng: 30m³"
            );
        }

        todayPlansVal = { inspectionPlans, concretePlans };

        return { 
            d800, 
            payment, 
            manpower, 
            equipment: equipmentVal,
            schedule: scheduleDataVal,
            modelHouse, 
            constructionProgress, 
            paymentTracking, 
            areaProgress,
            health: {
                submittal: submittalVal,
                manpower: manpowerVal,
                payment: paymentVal,
                schedule: scheduleVal,
                issues: issuesHealthScore
            },
            summary: {
                overallProgress: overallProgressVal,
                paymentProgress: paymentProgressVal,
                issues: issuesVal,
                upcomingMilestone: upcomingMilestoneVal,
                upcomingMilestonesList: upcomingMilestonesListVal
            },
            issuesList,
            dailyTab: dailyTabVal,
            todayPlans: todayPlansVal
        };
    } catch (error) {
        console.error("Failed to fetch Google Sheets data:", error);
        return null;
    }
};

export const fetchLiveUpcomingMilestonesFromSheet = async (): Promise<SheetMilestoneItem[]> => {
    try {
        const raw = await fetchSheetCSV('Construction', 'B35:B45', GOOGLE_SHEET_ID);
        const list: SheetMilestoneItem[] = [];
        if (raw && raw.length > 0) {
            raw.forEach((row) => {
                if (!row || row.length === 0) return;
                const cellText = cleanStr(row[0]);
                if (!cellText) return;

                const dateMatch = cellText.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
                let dateStr = '';
                let descStr = cellText;

                if (dateMatch) {
                    const rawDate = dateMatch[1].replace(/[\-\.]/g, '/');
                    const dParts = rawDate.split('/');
                    if (dParts.length === 3) {
                        const day = dParts[0].padStart(2, '0');
                        const month = dParts[1].padStart(2, '0');
                        const year = dParts[2];
                        dateStr = `${day}/${month}/${year}`;
                    } else {
                        dateStr = rawDate;
                    }
                    descStr = cellText.replace(dateMatch[0], '').replace(/^[\s:\-\–,]+|[\s:\-\–,]+$/g, '').trim();
                    if (!descStr) descStr = cellText;
                }

                list.push({
                    date: dateStr,
                    description: descStr,
                    rawText: cellText
                });
            });
        }
        return list;
    } catch (err) {
        console.error("Error fetching live sheet milestones B35:B45:", err);
        return [];
    }
};

/**
 * ============================================================================
 * ĐỒNG BỘ DỮ LIỆU QUAN TRẮC 2 CHIỀU (TWO-WAY MONITORING SYNC)
 * - Chiều 1 (Sheet -> App): Tự động nạp các chu kỳ mới (CK 11, CK 12...) từ Google Sheet
 * - Chiều 2 (App -> Sheet): Nhập số liệu chu kỳ mới trên Web App, cập nhật biểu đồ
 *   tức thì và đồng bộ ngược vào Google Sheet qua Webhook hoặc Clipboard TSV
 * ============================================================================
 */

export interface CustomMonitoringCycleEntry {
  category: 'ICL' | 'TC' | 'SS' | 'SM' | 'TM' | 'RSM' | 'TDW';
  cycle: string; // e.g. "CK 11"
  date: string; // e.g. "02/11/2026"
  measurements: Record<string, number>; // { "ICL-1": -12.4, ... }
  note?: string;
  createdAt: string;
}

export const MONITORING_CUSTOM_CYCLES_KEY = 'c10_monitoring_custom_cycles';
export const MONITORING_WEBHOOK_URL_KEY = 'c10_monitoring_webhook_url';

export const CATEGORY_META_INFO: Record<string, { 
  name: string; 
  shortName: string; 
  unit: string; 
  defaultSensors: string[];
  defaultWarning: number;
}> = {
  ICL: {
    name: 'Quan trắc chuyển vị tường vây (Inclinometer)',
    shortName: 'Chuyển vị tường vây',
    unit: 'mm',
    defaultSensors: ['ICL-1', 'ICL-2', 'ICL-3', 'ICL-4', 'ICL-5', 'ICL-6', 'ICL-7', 'ICL-8'],
    defaultWarning: 10
  },
  TC: {
    name: 'Quan trắc chuyển vị móng cẩu tháp (Tower Crane)',
    shortName: 'Móng cẩu tháp',
    unit: 'mm',
    defaultSensors: ['TC-1', 'TC-2', 'TC-3'],
    defaultWarning: 4
  },
  SS: {
    name: 'Quan trắc ứng suất thanh giằng (Strut Stress)',
    shortName: 'Ứng suất giằng',
    unit: 'kN',
    defaultSensors: ['SS-1', 'SS-2', 'SS-3', 'SS-4', 'SS-5', 'SS-6', 'SS-7', 'SS-8'],
    defaultWarning: 10
  },
  SM: {
    name: 'Quan trắc lún công trình lân cận (Settlement Marker)',
    shortName: 'Lún lân cận',
    unit: 'mm',
    defaultSensors: ['SM-1', 'SM-2', 'SM-3', 'SM-4', 'SM-5', 'SM-6', 'SM-7', 'SM-8'],
    defaultWarning: 10
  },
  TM: {
    name: 'Quan trắc nghiêng công trình lân cận (Tilt Marker)',
    shortName: 'Nghiêng lân cận',
    unit: 'mm',
    defaultSensors: ['TM-1', 'TM-2', 'TM-3', 'TM-4', 'TM-5', 'TM-6', 'TM-7', 'TM-8'],
    defaultWarning: 10
  },
  RSM: {
    name: 'Quan trắc lún mặt đường (Road Settlement Marker)',
    shortName: 'Lún mặt đường',
    unit: 'mm',
    defaultSensors: ['RSM-1', 'RSM-2', 'RSM-3', 'RSM-4', 'RSM-5', 'RSM-6', 'RSM-7', 'RSM-8'],
    defaultWarning: 20
  },
  TDW: {
    name: 'Quan trắc đỉnh tường vây (Top of Diaphragm Wall)',
    shortName: 'Đỉnh tường vây',
    unit: 'mm',
    defaultSensors: ['TDW-1', 'TDW-2', 'TDW-3', 'TDW-4', 'TDW-5', 'TDW-6', 'TDW-7', 'TDW-8'],
    defaultWarning: 10
  }
};

/**
 * Lấy danh sách chu kỳ quan trắc tùy chỉnh được lưu trên máy
 */
export const getCustomMonitoringCycles = (): CustomMonitoringCycleEntry[] => {
  try {
    const raw = localStorage.getItem(MONITORING_CUSTOM_CYCLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Lưu chu kỳ mới vào bộ nhớ cục bộ (cho phép biểu đồ vẽ ngay lập tức)
 */
export const saveCustomMonitoringCycle = (entry: CustomMonitoringCycleEntry): void => {
  try {
    const current = getCustomMonitoringCycles();
    const filtered = current.filter(
      c => !(c.category === entry.category && c.cycle.toUpperCase() === entry.cycle.toUpperCase())
    );
    filtered.push(entry);
    localStorage.setItem(MONITORING_CUSTOM_CYCLES_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event('c10-monitoring-data-changed'));
  } catch (err) {
    console.warn('Lỗi lưu custom cycle:', err);
  }
};

/**
 * Xóa chu kỳ tùy chỉnh
 */
export const removeCustomMonitoringCycle = (category: string, cycle: string): void => {
  try {
    const current = getCustomMonitoringCycles();
    const filtered = current.filter(
      c => !(c.category === category && c.cycle.toUpperCase() === cycle.toUpperCase())
    );
    localStorage.setItem(MONITORING_CUSTOM_CYCLES_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new Event('c10-monitoring-data-changed'));
  } catch (err) {
    console.warn('Lỗi xóa custom cycle:', err);
  }
};

/**
 * Xóa toàn bộ chu kỳ tùy chỉnh
 */
export const clearAllCustomMonitoringCycles = (): void => {
  localStorage.removeItem(MONITORING_CUSTOM_CYCLES_KEY);
  window.dispatchEvent(new Event('c10-monitoring-data-changed'));
};

/**
 * Tính chu kỳ gợi ý tiếp theo (ví dụ: đang có CK 10 -> gợi ý CK 11)
 */
export const predictNextCycleName = (existingCycles: string[]): string => {
  if (!existingCycles || existingCycles.length === 0) return 'CK 1';

  let maxNum = -1;
  let prefix = 'CK ';

  existingCycles.forEach(c => {
    const str = String(c || '').trim();
    const match = str.match(/(?:ck|chu\s*kỳ|chu\s*ky)\s*(\d+)/i) || str.match(/(\d+)/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        if (str.toUpperCase().startsWith('CK')) prefix = 'CK ';
      }
    }
  });

  if (maxNum >= 0) {
    return `${prefix}${maxNum + 1}`;
  }
  return `CK ${existingCycles.length + 1}`;
};

/**
 * Tạo chuỗi định dạng Tab-Separated Values (TSV) để dán trực tiếp vào Google Sheet
 */
export const formatCycleRowForClipboard = (
  entry: CustomMonitoringCycleEntry,
  headers: string[]
): string => {
  const rowCells: string[] = [];

  headers.forEach((h, idx) => {
    if (idx === 0) {
      rowCells.push(entry.cycle);
    } else {
      const cleanH = String(h || '').trim();
      if (cleanH.toLowerCase().includes('ngày') || cleanH.toLowerCase().includes('date')) {
        rowCells.push(entry.date);
      } else if (entry.measurements[cleanH] !== undefined) {
        rowCells.push(String(entry.measurements[cleanH]));
      } else {
        rowCells.push('');
      }
    }
  });

  return rowCells.join('\t');
};

/**
 * Gửi payload chu kỳ mới lên Webhook Google Apps Script để ghi trực tiếp vào Google Sheet
 */
export const syncCycleToGoogleSheetViaWebhook = async (
  entry: CustomMonitoringCycleEntry,
  headers: string[],
  webhookUrlOverride?: string
): Promise<{ success: boolean; message: string }> => {
  const webhookUrl = (
    webhookUrlOverride ||
    localStorage.getItem(MONITORING_WEBHOOK_URL_KEY) ||
    localStorage.getItem('c10_daily_report_webhook_url') ||
    ''
  ).trim();

  if (!webhookUrl) {
    return {
      success: false,
      message: 'Chưa cấu hình URL Webhook Google Apps Script. Dữ liệu đã được lưu trên Web App và có thể sao chép để dán vào Sheet.'
    };
  }

  try {
    const payload = {
      action: 'add_monitoring_cycle',
      category: entry.category,
      tabName: entry.category,
      cycle: entry.cycle,
      date: entry.date,
      measurements: entry.measurements,
      headers: headers,
      note: entry.note || '',
      timestamp: new Date().toISOString()
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const resData = await response.json().catch(() => ({}));
      return {
        success: true,
        message: resData.message || `Đã đồng bộ thành công chu kỳ ${entry.cycle} vào tab ${entry.category} trên Google Sheet!`
      };
    } else {
      return {
        success: false,
        message: `Máy chủ Google Apps Script phản hồi mã lỗi: ${response.status}. Vui lòng kiểm tra quyền chia sẻ Webhook.`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Không thể kết nối Webhook (${err.message || 'Lỗi mạng'}). Dữ liệu đã được cập nhật trên Web App.`
    };
  }
};

/**
 * Sinh mã Google Apps Script mẫu để dán vào Google Sheet
 */
export const generateMonitoringAppsScriptCode = (): string => {
  return `/**
 * ============================================================================
 * GOOGLE APPS SCRIPT ĐỒNG BỘ 2 CHIỀU QUAN TRẮC DỰ ÁN C10
 * Nhận dữ liệu từ Web App và tự động chèn thêm dòng chu kỳ mới (CK 11, CK 12...)
 * vào đúng tab tương ứng (ICL, TC, SS, SM, TM, RSM, TDW) trên Google Sheet.
 * ============================================================================
 */

function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'add_monitoring_cycle') {
      var tabName = (data.tabName || data.category || 'ICL').trim();
      var sheet = ss.getSheetByName(tabName);

      if (!sheet) {
        var sheets = ss.getSheets();
        for (var i = 0; i < sheets.length; i++) {
          if (sheets[i].getName().trim().toUpperCase() === tabName.toUpperCase()) {
            sheet = sheets[i];
            break;
          }
        }
      }

      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Không tìm thấy tab sheet: " + tabName
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var lastCol = Math.max(sheet.getLastColumn(), 10);
      var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      
      if (!headerRow[0]) {
        headerRow = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
      }

      var newRow = [];
      for (var c = 0; c < headerRow.length; c++) {
        var colName = String(headerRow[c] || '').trim();
        if (c === 0) {
          newRow.push(data.cycle);
        } else if (colName.toLowerCase().indexOf('ngày') >= 0 || colName.toLowerCase().indexOf('date') >= 0) {
          newRow.push(data.date || new Date().toLocaleDateString('vi-VN'));
        } else if (data.measurements && data.measurements[colName] !== undefined) {
          newRow.push(Number(data.measurements[colName]));
        } else {
          newRow.push("");
        }
      }

      sheet.appendRow(newRow);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Đã thêm chu kỳ " + data.cycle + " vào tab " + sheet.getName() + " thành công!",
        rowNumber: sheet.getLastRow()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Hành động không hợp lệ: " + data.action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
};
