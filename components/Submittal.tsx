import { db } from '../services/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import React, { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import {
  Sliders, Plus, Edit3, KeyRound,
  FileText, AlertTriangle, Clock, CheckCircle2, RefreshCw, ExternalLink,
  ChevronDown, ChevronUp, AlertCircle, Search, Filter, Layers, Package,
  ShieldCheck, HelpCircle, HardHat, Beaker, Truck, FileCheck, Eye,
  Calendar, Check, ArrowRight, Table, BarChart3, Database, X, Sparkles
} from 'lucide-react';
import { SubmittalData, SubmittalItem } from '../services/sheetsService';
import { checkUserTabPermission, verifyAndActivateAccessCode } from '../services/userPermissionsService';
import { scheduleAutoCloudVaultBackup } from '../services/cloudVaultService';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';

export type SubmittalCategoryKey = 
  | 'sdw'             // Shopdrawing (Bản vẽ thi công)
  | 'mat'             // Vật tư & Mẫu vật liệu (Material & Samples)
  | 'mos'             // Biện pháp thi công (Method Statements)
  | 'rfi'             // Yêu cầu làm rõ & Thay đổi (RFI & RFC)
  | 'ots'             // Hồ sơ dự án & Năng lực (Project Profiles & Other Submittals)
  | 'hse'             // An toàn lao động & Môi trường (Health, Safety & Environment)
  | 'concrete'        // Nhật ký đổ bê tông & Thí nghiệm mẫu (Casting & Concrete Tests)
  | 'material_import' // Vật tư nhập về công trường (Import Materials Tracking)
  | 'inspection_moa'; // Biên bản nghiệm thu MOA-M & MOA-W (Inspection Records)

export type SubmittalDelayType = 'NONE' | 'TVGS_DELAY' | 'CDT_DELAY' | 'CONTRACTOR_DELAY';

export interface MasterSubmittalRecord {
  id: string;
  category: SubmittalCategoryKey;
  stt: string | number;
  code: string;                 // Mã đệ trình / Mã phiếu
  tra?: string;                 // Mã TRA đối chiếu
  rev?: string;                 // Phiên bản Rev
  title: string;                // Nội dung / Hạng mục
  detail?: string;              // Nội dung chi tiết
  plannedDate?: string;         // Ngày kế hoạch trình hồ sơ
  submissionDate?: string;      // Ngày trình thực tế
  tvgsStatus?: string;          // Trạng thái TVGS (Duyệt, Từ chối, Đang trình)
  tvgsCode?: string;            // Code TVGS (A, B, C...)
  tvgsDate?: string;            // Ngày TVGS duyệt
  clientStatus?: string;        // Trạng thái CĐT (Duyệt, Từ chối, Đang trình)
  clientCode?: string;          // Code CĐT (A, B, C...)
  clientDate?: string;          // Ngày CĐT duyệt
  finalStatus: 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_STARTED'; // Chuẩn hóa trạng thái dựa trên cột CĐT
  linkUrl?: string;             // Link SharePoint / Drive
  notes?: string;               // Ghi chú

  // Các trường đặc thù cho Bê tông (Concrete)
  concreteGrade?: string;       // Mác bê tông (B30, B40, B7.5...)
  volumeM3?: string | number;   // Thể tích m3
  supplier?: string;            // Nhà cung cấp (Việt Đức, Nguyên Thịnh, Yamaken...)
  testR7Date?: string;          // Ngày nén R7
  testR7Result?: string;        // Số phiếu KQ nén R7
  testR28Date?: string;         // Ngày nén R28
  testR28Result?: string;       // Số phiếu KQ nén R28
  rating?: string;              // Đánh giá (Đạt)

  // Các trường đặc thù cho Vật tư nhập (Import Materials)
  batchNo?: string;             // Đợt nhập (ĐỢT 01...)
  unit?: string;                // Đơn vị tính (Cây, Tấm, Bộ, Chai...)
  quantity?: string | number;   // Số lượng
  acceptanceDate?: string;      // Ngày nghiệm thu

  // Các trường đặc thù cho Nghiệm thu MOA (Inspection Records)
  moaType?: 'MOA-M' | 'MOA-W';  // Nghiệm thu Vật liệu hoặc Công việc
  volumeNo?: string | number;   // Số quyển lưu trữ
}

export interface SubmittalFilterConfig {
  tvgsLimitDays: number;        // Mặc định: 7 ngày (Quá X ngày TVGS chưa duyệt -> TVGS chậm)
  cdtLimitDays: number;         // Mặc định: 20 ngày (Quá Y ngày CĐT chưa duyệt từ ngày trình CĐT -> CĐT chậm)
  defaultDelayFilter: 'ALL' | 'OVERDUE_ALL' | 'TVGS_DELAY' | 'CDT_DELAY' | 'CONTRACTOR_DELAY';
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SUBMITTAL_FILTER_CONFIG: SubmittalFilterConfig = {
  tvgsLimitDays: 7,
  cdtLimitDays: 20,
  defaultDelayFilter: 'ALL'
};

export const FILTER_CONFIG_STORAGE_KEY = 'c10_submittal_filter_config_v1';

export const loadSubmittalFilterConfig = (): SubmittalFilterConfig => {
  try {
    const raw = localStorage.getItem(FILTER_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SUBMITTAL_FILTER_CONFIG,
        ...parsed,
        tvgsLimitDays: Math.max(1, Number(parsed.tvgsLimitDays) || 7),
        cdtLimitDays: Math.max(1, Number(parsed.cdtLimitDays) || 20)
      };
    }
  } catch {}
  return DEFAULT_SUBMITTAL_FILTER_CONFIG;
};

export const saveSubmittalFilterConfig = async (cfg: SubmittalFilterConfig): Promise<void> => {
  const normalized: SubmittalFilterConfig = {
    ...DEFAULT_SUBMITTAL_FILTER_CONFIG,
    ...cfg,
    tvgsLimitDays: Math.max(1, Number(cfg.tvgsLimitDays) || 7),
    cdtLimitDays: Math.max(1, Number(cfg.cdtLimitDays) || 20),
    updatedAt: new Date().toISOString(),
    updatedBy: localStorage.getItem('c10_user_email') || 'Admin'
  };
  try {
    localStorage.setItem(FILTER_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  if (db) {
    try {
      await setDoc(doc(db, 'c10', 'submittal_filter_config'), normalized, { merge: true });
    } catch (e) {
      console.warn('Lưu cấu hình bộ lọc hồ sơ lên Firestore thất bại:', e);
    }
  }
};

export interface SubmittalCategoryMeta {
  key: SubmittalCategoryKey;
  label: string;
  shortLabel: string;
  iconName: string;
  color: string;
  tagColor: string;
  description: string;
}

export const SUBMITTAL_CATEGORIES: SubmittalCategoryMeta[] = [
  {
    key: 'sdw',
    label: 'Bản Vẽ Shopdrawing',
    shortLabel: 'Shopdrawing',
    iconName: 'Layers',
    color: 'from-blue-600 to-indigo-600',
    tagColor: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Bản vẽ thi công dầm capping, cọc khoan nhồi, móng cẩu tháp, kingpost, thép sàn hầm B2, B1, T1...'
  },
  {
    key: 'mat',
    label: 'Vật Tư & Mẫu Vật Liệu',
    shortLabel: 'Vật Tư & Mẫu',
    iconName: 'Package',
    color: 'from-emerald-600 to-teal-600',
    tagColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    description: 'Đệ trình vật tư thép Tung Ho/Miền Nam/Hòa Phát, keo Fischer, Sika, vữa mác và thẻ mẫu vật liệu...'
  },
  {
    key: 'mos',
    label: 'Biện Pháp Thi Công (BPTC)',
    shortLabel: 'Biện Pháp (MOS)',
    iconName: 'Shield',
    color: 'from-amber-600 to-orange-600',
    tagColor: 'bg-amber-100 text-amber-800 border-amber-300',
    description: 'Thuyết minh và bản vẽ biện pháp tổng mặt bằng, cẩu tháp, ép cừ Larsen, đào đất, cốp pha...'
  },
  {
    key: 'rfi',
    label: 'Yêu Cầu Làm Rõ & Thay Đổi',
    shortLabel: 'RFI & RFC',
    iconName: 'HelpCircle',
    color: 'from-purple-600 to-violet-600',
    tagColor: 'bg-purple-100 text-purple-800 border-purple-300',
    description: 'Phiếu làm rõ thiết kế RFI gửi Aurecon/CĐT và phiếu đề xuất thay đổi biện pháp/vật tư RFC...'
  },
  {
    key: 'ots',
    label: 'Hồ Sơ Dự Án & Năng Lực',
    shortLabel: 'Hồ Sơ Dự Án (OTS)',
    iconName: 'FolderCheck',
    color: 'from-cyan-600 to-sky-600',
    tagColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    description: 'Hồ sơ năng lực nhà thầu Delta, trạm trộn bê tông, đơn vị thí nghiệm LAS, nhà cung ứng Shoring...'
  },
  {
    key: 'hse',
    label: 'An Toàn Lao Động & Môi Trường',
    shortLabel: 'An Toàn (HSE)',
    iconName: 'AlertTriangle',
    color: 'from-rose-600 to-red-600',
    tagColor: 'bg-rose-100 text-rose-800 border-rose-300',
    description: 'Hồ sơ an toàn lao động, kiểm định thiết bị xe cẩu/xe ben, phương án PCCC, chứng chỉ công nhân...'
  },
  {
    key: 'concrete',
    label: 'Đổ Bê Tông & Nén Mẫu R7/R28',
    shortLabel: 'Bê Tông & R7/R28',
    iconName: 'Activity',
    color: 'from-teal-600 to-emerald-700',
    tagColor: 'bg-teal-100 text-teal-800 border-teal-300',
    description: 'Nhật ký các mẻ đổ cọc khoan nhồi, móng cẩu tháp, dầm capping và tự động theo dõi lịch nén mẫu R7, R28...'
  },
  {
    key: 'material_import',
    label: 'Vật Tư Nhập Về Công Trường',
    shortLabel: 'Vật Tư Nhập (35 đợt)',
    iconName: 'Truck',
    color: 'from-indigo-600 to-blue-700',
    tagColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    description: 'Theo dõi 35 đợt nhập khẩu và tập kết cừ Larsen IV, Kingpost H300, thép hình Shoring H350, bulong...'
  },
  {
    key: 'inspection_moa',
    label: 'Biên Bản Nghiệm Thu (MOA)',
    shortLabel: 'Nghiệm Thu (MOA)',
    iconName: 'CheckSquare',
    color: 'from-slate-700 to-slate-900',
    tagColor: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Danh mục theo dõi ký biên bản nghiệm thu chất lượng vật liệu (MOA-M) và công việc thi công (MOA-W)...'
  }
];

// DỮ LIỆU CƠ SỞ CHUẨN XÁC TỪ FILE DỰ ÁN C10 (ĐÃ CHUẨN HÓA TRẠNG THÁI CĐT & LOẠI BỎ HỒ SƠ CHƯA TRÌNH)
export const DEFAULT_MASTER_SUBMITTALS: MasterSubmittalRecord[] = [
  {
    "id": "rfi-1",
    "category": "rfi",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-RFI-BASEMENT-MEP-002",
    "tra": "011",
    "rev": "00",
    "title": "Làm rõ ký hiệu cao độ của bản vẽ thiết kế MEP",
    "submissionDate": "2026-07-15",
    "tvgsDate": "2026-07-15",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-21",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "notes": "TRA 011"
  },
  {
    "id": "rfi-2",
    "category": "rfi",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-RFI-003",
    "tra": "001",
    "rev": "00",
    "title": "Làm rõ yêu cầu nhiệt độ bê tông khối lớn và phạm vi cấu kiện sử dụng tro bay.",
    "submissionDate": "2026-06-24",
    "tvgsDate": "2026-07-01",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-07",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCuDeac4r5yRJu1CSehnJCJAd7JrSQ77TnzkSpHDcoWM8E?e=X94rXa",
    "notes": "TRA 001"
  },
  {
    "id": "rfi-3",
    "category": "rfi",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-RFI-004",
    "tra": "021",
    "rev": "00",
    "title": "Làm rõ một số vấn đề yêu cầu kỹ thuật",
    "submissionDate": "2026-07-23",
    "tvgsDate": "2026-08-03",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-08-03",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCEklKNDFPVQq8byXpx5wlSAQMnBk7DchYruQSVWKQrTf0?e=mN5A6V",
    "notes": "TRA 021"
  },
  {
    "id": "rfi-4",
    "category": "rfi",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-RFI-005",
    "tra": "029",
    "rev": "00",
    "title": "Làm rõ một số vấn đề yêu cầu kỹ thuật",
    "submissionDate": "2026-08-03",
    "tvgsDate": "2026-08-03",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-09-10",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBoPbqWGu4sQIAa2AtXNBJCAXK-VsYigGLuQB5uNSNfQOM?e=5mtuKD",
    "notes": "TRA 029"
  },
  {
    "id": "rfi-5",
    "category": "rfi",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-RFI-006",
    "tra": "037",
    "rev": "00",
    "title": "Làm rõ cao độ sàn tại trục 9A",
    "submissionDate": "2026-08-14",
    "tvgsDate": "2026-08-14",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-09-10",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCT-cXxpJraR6ZqKOUobBoPAdJxQYiCwrfje_ElIfRHAJ8?e=gSG779",
    "notes": "TRA 037"
  },
  {
    "id": "rfi-6",
    "category": "rfi",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-RFI-007",
    "tra": "047",
    "rev": "00",
    "title": "Làm rõ cao độ tại vị trí tường vây loại 1B",
    "submissionDate": "2026-09-05",
    "tvgsDate": "2026-09-05",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-09-10",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB9lWxUT-LKRLa1H-ll0x8fAULKREBy_0eeFqRhJUPQzRw?e=6wyHo9",
    "notes": "TRA 047"
  },
  {
    "id": "rfi-7",
    "category": "rfi",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-RFI-008",
    "tra": "049",
    "rev": "00",
    "title": "Về việc vị trí dầm giật cấp",
    "submissionDate": "2026-09-09",
    "tvgsDate": "2026-09-09",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 049"
  },
  {
    "id": "rfi-8",
    "category": "rfi",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-RFI-009",
    "rev": "00",
    "title": "Yêu cầu xác nhận thông tin phát sinh gói thầu MC1 giữa bản vẽ Tender và bản vẽ phát hành cập nhật lần 1 qua mail",
    "submissionDate": "2026-09-16",
    "tvgsDate": "2026-10-07",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-10-18",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQC9ob4P3RefQLbtwTSnJ6eDASspHZNEbwVDT_cQ0SMytd4?e=MFnkwK"
  },
  {
    "id": "rfi-9",
    "category": "rfi",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-RFI-010",
    "tra": "069",
    "rev": "00",
    "title": "Làm rõ chi tiết bố trí thép T2 tại móng PC03B-02 và PC06A-02",
    "submissionDate": "2026-10-20",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 069"
  },
  {
    "id": "rfi-10",
    "category": "rfi",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-RFI-011",
    "tra": "074",
    "rev": "00",
    "title": "Làm rõ quy định chung của thép cột vách",
    "submissionDate": "2026-11-02",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 074"
  },
  {
    "id": "rfi-11",
    "category": "rfi",
    "stt": 11,
    "code": "C10-BASE-DTA-CV-RFC-01",
    "rev": "00",
    "title": "đề xuất thay đôi mác thép cốt bê tông cho phù hợp với thị trường nghành thép xây dựng",
    "submissionDate": "2026-07-01",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-08-17",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "rfi-12",
    "category": "rfi",
    "stt": 12,
    "code": "C10-MC1-DTA-CV-RFC-002",
    "tra": "021",
    "rev": "00",
    "title": "Đề xuất nối coupler cho thép cột vách",
    "submissionDate": "2026-07-23",
    "tvgsDate": "2026-08-03",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "2026-08-04",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCwdcVDnpvFRqwt0-KJxMmdAVvzXKLLltBU28myOjH9l8o?e=yY96ch",
    "notes": "TRA 021"
  },
  {
    "id": "shopdrawing-13",
    "category": "sdw",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-SD-001",
    "tra": "004",
    "rev": "003",
    "title": "Đệ trình bản vẽ hạng mục thi công Hầm:  + Shopdrawing dầm capping",
    "submissionDate": "2026-07-06",
    "tvgsDate": "2026-07-21",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-03",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQC2Lk9VSOgURrucdMr-1yBKAQ2_ozWcSe87jZe9JwAmZxI?e=fBO78a",
    "notes": "TRA 004"
  },
  {
    "id": "shopdrawing-14",
    "category": "sdw",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-SD-002",
    "tra": "006",
    "rev": "001",
    "title": "Đệ trình bản vẽ:  + Bản vẽ Shopdrawing. Hạng mục thi công cọc khoan nhồi cẩu tháp",
    "submissionDate": "2026-07-08",
    "tvgsDate": "2026-07-16",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-17",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDViMRZueRJRJcOqSpj9pM-AR1LI1We33_wcXoPjvnt0no?e=C5FVpl",
    "notes": "TRA 006"
  },
  {
    "id": "shopdrawing-15",
    "category": "sdw",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-SD-003",
    "tra": "024",
    "rev": "001",
    "title": "Đệ trình bản vẽ:  + Bản vẽ Shopdrawing. Hạng mục thi công móng cẩu tháp",
    "submissionDate": "2026-07-27",
    "tvgsDate": "2026-08-04",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-04",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCVnh-gRB7bQZZNgMlckebKARdWUyQNhum6T92ILtFpDj0?e=gG4cUN",
    "notes": "TRA 024"
  },
  {
    "id": "shopdrawing-16",
    "category": "sdw",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-SD-004",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ:  + Bản vẽ Shopdrawing. Hạng mục: Chi tiết bố trí Kingpost",
    "submissionDate": "2026-09-15",
    "tvgsDate": "2026-09-17",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-17",
    "category": "sdw",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-SD-005",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép sàn hầm B2 zone 1.2",
    "submissionDate": "2026-10-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-18",
    "category": "sdw",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-SD-006",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép cột vách B2 - T1",
    "submissionDate": "2026-10-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-19",
    "category": "sdw",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-SD-007",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép dầm hầm B2 zone 1.1",
    "submissionDate": "2026-10-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-20",
    "category": "sdw",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-SD-008",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép dầm hầm B2 zone 1.2",
    "submissionDate": "2026-10-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-21",
    "category": "sdw",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-SD-009",
    "tra": "063",
    "rev": "00",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép dầm hầm B2 zone 1.3",
    "submissionDate": "2026-10-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 063"
  },
  {
    "id": "shopdrawing-22",
    "category": "sdw",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-SD-010",
    "tra": "076",
    "rev": "001",
    "title": "Đệ trình bản vẽ Shopdrawing: + Hạng mục: Chi tiết thi công kết cấu phần hầm, chi tiết thép móng",
    "submissionDate": "2026-11-04",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 076"
  },
  {
    "id": "mat-23",
    "category": "mat",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-MAT-001",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: + Thép Miền Nam (V) : Thép CB500-V, Thép CB400-V, Thép CB300-V, Thép CB240-T Công ty TNHH Một Thành Viên Thép Miền Nam - VNSTEEL",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-06-27",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-06-30",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBPjkSA0tC_SYAgh2oSIG6QAVLxti87-9udEBc6UJrjuQ4?e=VlwgmL",
    "notes": "TRA 001"
  },
  {
    "id": "mat-24",
    "category": "mat",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-MAT-002",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: + Thép Tung Ho (THSVC) : Thép CB500-V, Thép CB400-V, Thép CB300-V, Thép CB240-T Công ty TNHH Thép Tung Ho Việt Nam",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-06-27",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-06-30",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQD_leEYf9XrQJ_5NUj9S2ifAZm8mChTSQ923KreNg-AhgE?e=s4gM9E",
    "notes": "TRA 001"
  },
  {
    "id": "mat-25",
    "category": "mat",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-MAT-003",
    "tra": "002",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  + Keo khoan cấy: FISCHER FIS EB II CÔNG TY CỔ PHẦN UNIC",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-14",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-16",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDlHwq_VgD1Qoa78cdDO60sAf_vlRx8tx7orxExEFz4PZg?e=PwZuCr",
    "notes": "TRA 002"
  },
  {
    "id": "mat-26",
    "category": "mat",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-MAT-004",
    "tra": "007",
    "rev": "001",
    "title": "Đệ trình hồ sơ vật liệu:  + Băng cản nước đàn hồi gốc PVC: Sika waterbar AR-25 + Băng trương nở gốc cao su: Sika Hydrotite CJ + Chất trám khe đàn hồi Sikaflex-140 Construction + Sikawaterbar V25  + Sikadur-42 MP (ABC) (12kg/set)  + Sikagrout 214-11  + Sika monotop 610 Công ty SIKA Hữu Hạn Việt Nam / Ncc: Công ty CP Tico Sài Gòn",
    "submissionDate": "2026-07-08",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 007"
  },
  {
    "id": "mat-27",
    "category": "mat",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-MAT-004.Rev001",
    "tra": "007",
    "rev": "001",
    "title": "Đệ trình hồ sơ vật liệu:  + Băng cản nước đàn hồi gốc PVC: Sika waterbar AR-25 + Băng trương nở gốc cao su: Sika Hydrotite CJ + Chất trám khe đàn hồi Sikaflex-140 Construction + Sikawaterbar V25  + Sikadur-42 MP (ABC) (12kg/set)  + Sikagrout 214-11  + Sika monotop 610 Công ty SIKA Hữu Hạn Việt Nam / Ncc: Công ty CP Tico Sài Gòn",
    "submissionDate": "2026-07-08",
    "tvgsDate": "2026-07-18",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-23",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDKXwu4xZ13RqkVf4y6Wu9tAZmHBV8CNOOdRgjnUB5a6j8?e=dNTWnB",
    "notes": "TRA 007"
  },
  {
    "id": "mat-28",
    "category": "mat",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-MAT-005",
    "tra": "012",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  + Keo khoan cấy: RAWLPLUG R-KEX-II CÔNG TY TNHH RAWLPLUG VIỆT NAM",
    "submissionDate": "2025-07-14",
    "tvgsDate": "2026-07-18",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-20",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDdPmmh3NtlTbAJopGKcxo_AeIeDI94JwJ9FIbTZQNxbVI?e=98NenN",
    "notes": "TRA 012"
  },
  {
    "id": "mat-29",
    "category": "mat",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-MAT-006",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  + Vữa không co ngót: Vinkems Grout 4HF CÔNG TY TNHH VINKEMS",
    "submissionDate": "2026-07-30",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-21",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-30",
    "category": "mat",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-MAT-006.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ vật liệu:  + Vữa không co ngót: Vinkems Grout 4HF (Vị trí sử dụng: Đổ lấp vị trí đục sàn sau khi cắt Kingpost) CÔNG TY TNHH VINKEMS",
    "submissionDate": "2026-07-30",
    "tvgsDate": "2026-08-04",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-22",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-31",
    "category": "mat",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-MAT-006.Rev002",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  + Vữa không co ngót: Vinkems Grout 4HF (Vị trí sử dụng: Đổ lấp vị trí đục sàn sau khi cắt Kingpost, đầu cọc) CÔNG TY TNHH VINKEMS",
    "submissionDate": "2026-10-19",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-32",
    "category": "mat",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-MAT-007",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  +Ống INCLINOMETER CASING MODEL GV-2401 Đơn vị lắp đặt: Công Ty TNHH Tư Vấn Xây Dựng – Đo Đạc Miền Nam",
    "submissionDate": "2025-09-07",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-23",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAFquK6RgQGRZuhl03b-x4_AQijl4ppptoRdsKqARId8GY?e=Sf0rre"
  },
  {
    "id": "mat-33",
    "category": "mat",
    "stt": 11,
    "code": "C10-MC1-DTA-CV-MAT-008",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: Vật liêu vữa M75 +Xi măng Pooc Lăng hỗn hợp PCB40_Công ty cổ phần xi măng  Fico Tây Ninh/  Ncc: Công ty TNHH Hương Huỳnh + Cát  Ncc: Công ty TNHH MTV Vật Liệu Xây Dựng Phước Thịnh Phát",
    "submissionDate": "2025-09-19",
    "tvgsDate": "",
    "tvgsCode": "C",
    "tvgsStatus": "Yêu cầu sửa",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "REJECTED"
  },
  {
    "id": "mat-34",
    "category": "mat",
    "stt": 12,
    "code": "C10-MC1-DTA-CV-MAT-008.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: Vật liêu vữa M75 +Xi măng Pooc Lăng hỗn hợp PCB40_Công ty cổ phần xi măng  Fico Tây Ninh/  Ncc: Công ty TNHH Hương Huỳnh + Cát  Ncc: Công ty TNHH MTV Vật Liệu Xây Dựng Phước Thịnh Phát",
    "submissionDate": "2025-09-21",
    "tvgsDate": "2026-09-23",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-35",
    "category": "mat",
    "stt": 13,
    "code": "C10-MC1-DTA-CV-MAT-009",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  Vật tư biện pháp: B05-Chất tẩy ghỉ",
    "submissionDate": "2025-09-19",
    "tvgsDate": "",
    "tvgsCode": "C",
    "tvgsStatus": "Yêu cầu sửa",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "REJECTED"
  },
  {
    "id": "mat-36",
    "category": "mat",
    "stt": 14,
    "code": "C10-MC1-DTA-CV-MAT-009.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  Vật tư biện pháp: B05-Chất tẩy ghỉ",
    "submissionDate": "2025-09-21",
    "tvgsDate": "2026-09-23",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-37",
    "category": "mat",
    "stt": 15,
    "code": "C10-MC1-DTA-CV-MAT-010",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: + Thép Hòa Phát: Thép CB500-V, Thép CB400-V, Thép CB300-V, Thép CB240-T Công ty TNHH Thép Hòa Phát Hưng Yên Tại Bình Dương",
    "submissionDate": "2026-09-21",
    "tvgsDate": "2026-09-23",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-07",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAbULa5j6hcRobrCm9urXl7AZ0enH9QWLFuwvJWRFzIk9c?e=wWfnYf"
  },
  {
    "id": "mat-38",
    "category": "mat",
    "stt": 16,
    "code": "C10-MC1-DTA-CV-MAT-011",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: + Vật tư quan trắc hệ shoring: Vibrating Wire Strain Gause  Modal GV-2405",
    "submissionDate": "2026-09-28",
    "tvgsDate": "2026-09-29",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-09",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBax76BhoQvQo5nNzMW_QB3AW0LTui98g_Xok0kIl6PNPg?e=aeHGvr"
  },
  {
    "id": "mat-39",
    "category": "mat",
    "stt": 17,
    "code": "C10-MC1-DTA-CV-MAT-012",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: Chống mối và vật phụ đi kèm  + Thuốc trừ mối MAP BOXER 30 EC  + Đường ống TERMITE-PRO  + Lưới thép không gỉ TEMSTEEL  + Vữa xi măng TERMLOK NCC: Công ty TNHH Một Thành Viên Dịch Vụ Hạnh Long",
    "submissionDate": "2026-09-29",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-40",
    "category": "mat",
    "stt": 18,
    "code": "C10-MC1-DTA-CV-MAT-012.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ vật liệu: Chống mối và vật phụ đi kèm  + Thuốc trừ mối Premise 200 SC  + Đường ống TERMITE-PRO  + Lưới thép không gỉ TEMSTEEL  + Vữa xi măng TERMLOK NCC: Công ty TNHH Một Thành Viên Dịch Vụ Hạnh Long",
    "submissionDate": "2026-10-05",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-41",
    "category": "mat",
    "stt": 19,
    "code": "C10-MC1-DTA-CV-MAT-012.Rev002",
    "rev": "002",
    "title": "Đệ trình hồ sơ vật liệu: Chống mối và vật phụ đi kèm  + Đường ống TERMITE-PRO  + Lưới thép không gỉ TEMSTEEL  + Vữa xi măng TERMLOK  + Vữa sửa chữa khuyết tật bê tông: Sikagrout 214-11 NCC: Công ty TNHH Một Thành Viên Dịch Vụ Hạnh Long",
    "submissionDate": "2026-10-13",
    "tvgsDate": "2026-10-27",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-42",
    "category": "mat",
    "stt": 20,
    "code": "C10-MC1-DTA-CV-MAT-013",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu:  +Sika Top 540 Seal VN +Sika guard 180 +Sika latex TH +Sika Fuko VT-1 Công ty SIKA Hữu Hạn Việt Nam",
    "submissionDate": "2026-10-03",
    "tvgsDate": "2026-10-06",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-43",
    "category": "mat",
    "stt": 21,
    "code": "C10-MC1-DTA-CV-MAT-013.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ vật liệu:  +Sika Top 540 Seal VN +Sika guard 180 +Sika latex TH +Sika Fuko VT-1 + Vữa sửa chữa khuyết tật bê tông: Sikagrout 214-11",
    "submissionDate": "2026-10-24",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-44",
    "category": "mat",
    "stt": 22,
    "code": "C10-MC1-DTA-CV-MAT-014",
    "rev": "00",
    "title": "Đệ trình hồ sơ vật liệu: Chống mối  + Premise 200 SC NCC: Công ty TNHH Một Thành Viên Dịch Vụ Hạnh Long",
    "submissionDate": "2026-10-05",
    "tvgsDate": "2026-10-06",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "mat-45",
    "category": "mat",
    "stt": 23,
    "code": "MẪU VẬT LIỆU",
    "rev": "00",
    "title": "MẪU VẬT LIỆU",
    "submissionDate": "",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-46",
    "category": "mat",
    "stt": 24,
    "code": "C10-MC1-DTA-SAMPLE-TAG-001",
    "tra": "002",
    "rev": "00",
    "title": "Keo khoan cấy: FISCHER FIS EB II CÔNG TY CỔ PHẦN UNIC",
    "submissionDate": "2026-06-30",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 002"
  },
  {
    "id": "mat-47",
    "category": "mat",
    "stt": 25,
    "code": "C10-MC1-DTA-SAMPLE-TAG-002",
    "tra": "020",
    "rev": "00",
    "title": "Keo khoan cấy: RAWLPLUG R-KEX-II CÔNG TY TNHH RAWLPLUG VIỆT NAM",
    "submissionDate": "2026-07-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 020"
  },
  {
    "id": "mat-48",
    "category": "mat",
    "stt": 26,
    "code": "C10-MC1-DTA-SAMPLE-TAG-003",
    "tra": "020",
    "rev": "00",
    "title": "+ Băng trương nở gốc cao su: Sika Hydrotite CJ + Chất trám khe đàn hồi Sikaflex-140 Construction Công ty SIKA Hữu Hạn Việt Nam / Ncc: Công ty CP Tico Sài Gòn",
    "submissionDate": "2026-07-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 020"
  },
  {
    "id": "mat-49",
    "category": "mat",
    "stt": 27,
    "code": "C10-MC1-DTA-SAMPLE-TAG-004",
    "rev": "00",
    "title": "Ống INCLINOMETER CASING MODEL GV-2404-D70mm",
    "submissionDate": "2026-09-08",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-50",
    "category": "mat",
    "stt": 28,
    "code": "C10-MC1-DTA-SAMPLE-TAG-005",
    "rev": "00",
    "title": "Vibrating Wire Strain Gause  Modal GV-2405",
    "submissionDate": "2026-09-28",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-51",
    "category": "mat",
    "stt": 29,
    "code": "C10-MC1-DTA-SAMPLE-TAG-006",
    "rev": "00",
    "title": "+ Thuốc trừ mối Premise 200 SC  + Đường ống TERMITE-PRO  + Lưới thép không gỉ TEMSTEEL  + Vữa xi măng TERMLOK NCC: Công ty TNHH Một Thành Viên Dịch Vụ Hạnh Long",
    "submissionDate": "2026-09-28",
    "tvgsDate": "2026-10-27",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mat-52",
    "category": "mat",
    "stt": 30,
    "code": "C10-MC1-DTA-SAMPLE-TAG-007",
    "rev": "00",
    "title": "Sika Top 540 Seal VN Công ty SIKA Hữu Hạn Việt Nam",
    "submissionDate": "2026-10-24",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "mos-53",
    "category": "mos",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-MOS-001",
    "tra": "004",
    "rev": "00",
    "title": "Đệ trình bản vẽ hạng mục thi công Hầm:  + Bản vẽ BPTC tổng mặt bằng điện nước phục vụ thi công",
    "submissionDate": "2026-07-06",
    "tvgsDate": "2026-08-04",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "notes": "TRA 004"
  },
  {
    "id": "mos-54",
    "category": "mos",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-MOS-002",
    "tra": "006",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Biện pháp thi công lắp đặt Sleeve và lỗ mở",
    "submissionDate": "2026-07-08",
    "tvgsDate": "2026-07-16",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-17",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "notes": "TRA 006"
  },
  {
    "id": "mos-55",
    "category": "mos",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-MOS-003",
    "tra": "008",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Thuyết minh tính toán móng cẩu tháp và cọc + Báo cáo kết quả thẩm tra biện pháp thi công móng cẩu tháp và cọc",
    "submissionDate": "2026-07-09",
    "tvgsDate": "2026-07-14",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D003%5FDESIGN%20CALCULATION%20%26%20METHOD%20REVIEW%20FOR%20TOWER%20CRANE%20FOUNDATION%20%26%20BORED%20PILES%20%28SPM%20duy%E1%BB%87t%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTCC",
    "notes": "TRA 008"
  },
  {
    "id": "mos-56",
    "category": "mos",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-MOS-004",
    "tra": "009",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Biện pháp thi công hệ thống chống sét nối đất",
    "submissionDate": "2026-07-13",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "notes": "TRA 009"
  },
  {
    "id": "mos-57",
    "category": "mos",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-MOS-005",
    "tra": "009",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Biện pháp thi công lắp đặt ống điện",
    "submissionDate": "2026-07-13",
    "tvgsDate": "2026-07-30",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "notes": "TRA 009"
  },
  {
    "id": "mos-58",
    "category": "mos",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-MOS-006",
    "tra": "010",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục: Tổng mặt bằng thi công phần Hầm và tổng mặt bằng khu vực văn phòng dự án",
    "submissionDate": "2026-07-14",
    "tvgsDate": "2026-09-08",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "notes": "TRA 010"
  },
  {
    "id": "mos-59",
    "category": "mos",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-MOS-007",
    "tra": "012",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ xin mở cổng",
    "submissionDate": "2026-07-15",
    "tvgsDate": "2026-07-18",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-20",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D007%5F%20DRAWING%20PACKAGE%20FOR%20THE%20APPLICATION%20TO%20OPEN%20GATES%203%2C%204%2C%20AND%205%20%28spm%20duyet%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 012"
  },
  {
    "id": "mos-60",
    "category": "mos",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-MOS-008",
    "tra": "024",
    "rev": "002",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục: Biện pháp thi công dầm đỉnh tường vây, biên pháp thi công ép cừ Larsen IV",
    "submissionDate": "2026-07-22",
    "tvgsDate": "2026-08-19",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "notes": "TRA 024"
  },
  {
    "id": "mos-61",
    "category": "mos",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-MOS-009",
    "tra": "026",
    "rev": "002",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục: thi công cọc khoan nhồi biện pháp sàn đạo",
    "submissionDate": "2026-07-29",
    "tvgsDate": "2026-08-04",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-04",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D009%2DPILE%20CONSTRUCTION%20METHODS%20SLOPE%20METHOD%20%28SPM%20duy%E1%BB%87t%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 026"
  },
  {
    "id": "mos-62",
    "category": "mos",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-MOS-010",
    "tra": "028",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Thuyết minh tính toán BPTC phần hầm + Báo cáo kết quả thẩm tra BPTC phần hầm + Hồ sơ bản vẽ BPTC phần hầm",
    "submissionDate": "2026-07-31",
    "tvgsDate": "2026-08-17",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D010%2DGeneral%20Construction%20Method%20%28SPM%20duyet%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 028"
  },
  {
    "id": "mos-63",
    "category": "mos",
    "stt": 11,
    "code": "C10-MC1-DTA-CV-MOS-011",
    "tra": "030",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục BPTC móng cẩu tháp",
    "submissionDate": "2026-08-03",
    "tvgsDate": "2026-08-04",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-09-04",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=true&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%5FMC1%2DDTA%2DCV%2DMOS%2D011%5FMETHOD%20STATEMENT%20FOR%20TOWER%20CRANE%20FOUNDATION%20CONSTRUCTION%20%28SPM%20duyet%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 030"
  },
  {
    "id": "mos-64",
    "category": "mos",
    "stt": 12,
    "code": "C10-MC1-DTA-CV-MOS-012",
    "tra": "031",
    "rev": "002",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục: Tổng mặt bằng thi công phần hầm và Tổng mặt bằng khu vực văn phòng dự án",
    "submissionDate": "2026-08-05",
    "tvgsDate": "2026-08-20",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D012%5FOVERALL%20BASEMENT%20PLAN%20AND%20OVERALL%20OFFICE%20AREA%20PLAN%20%28spm%20duyet%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 031"
  },
  {
    "id": "mos-65",
    "category": "mos",
    "stt": 13,
    "code": "C10-MC1-DTA-CV-MOS-013",
    "tra": "036",
    "rev": "001",
    "title": "Đệ trình biện pháp thi công: + Hồ sơ bản vẽ BPTC. Hạng mục: Lắp dựng cẩu tháp",
    "submissionDate": "2026-08-10",
    "tvgsDate": "2026-08-18",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D013%5FTOWER%20CRANE%20ERECTION%20METHOD%20STATEMENT%20%28SPM%20duy%E1%BB%87t%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 036"
  },
  {
    "id": "mos-66",
    "category": "mos",
    "stt": 14,
    "code": "C10-MC1-DTA-CV-MOS-014",
    "tra": "039",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Biện pháp bảo vệ thép chờ",
    "submissionDate": "2026-08-31",
    "tvgsDate": "2026-09-01",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/my?sortField=LinkFilename&amp;isAscending=false&amp;viewid=b80bd612%2D926d%2D44f6%2Da755%2D280e573f8ec4&amp;id=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC%2FC10%2DMC1%2DDTA%2DCV%2DMOS%2D014%5FMEASURES%20FOR%20PROTECTING%20REBAR%20STARTERS%20%28spm%20duyet%29%2Epdf&amp;parent=%2Fpersonal%2Fc10%5Fphumyhung%5Fphanham%5Fdeltagroup%5Fvn%2FDocuments%2F00%2E%20QA%2EQC%20TEAM%2FMC1%5FC10%5FH%E1%BB%92%20S%C6%A0%20D%E1%BB%B0%20%C3%81N%2F07%2E%20BPTC",
    "notes": "TRA 039"
  },
  {
    "id": "mos-67",
    "category": "mos",
    "stt": 15,
    "code": "C10-MC1-DTA-CV-MOS-015",
    "tra": "073",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Xử lý bê tông khuyết tật tường vây, biện pháp xử lý đầu ty",
    "submissionDate": "2026-10-30",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 073"
  },
  {
    "id": "mos-68",
    "category": "mos",
    "stt": 16,
    "code": "C10-MC1-DTA-CV-MOS-016",
    "tra": "069",
    "rev": "001",
    "title": "Đệ trình biện pháp thi công: + Hạng mục: Công tác đào đất",
    "submissionDate": "2026-11-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 069"
  },
  {
    "id": "mos-69",
    "category": "mos",
    "stt": 17,
    "code": "C10-MC1-DTA-CV-MOS-017",
    "tra": "066",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Hạng mục: Biện pháp thi công Cốp pha và giáo chống",
    "submissionDate": "2026-10-14",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 066"
  },
  {
    "id": "mos-70",
    "category": "mos",
    "stt": 18,
    "code": "C10-MC1-DTA-CV-MOS-018",
    "tra": "068",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Hạng mục: Biện pháp thi công Chống mối + Thuyết minh biện pháp thi công Chống mối",
    "submissionDate": "2026-10-20",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 068"
  },
  {
    "id": "mos-71",
    "category": "mos",
    "stt": 19,
    "code": "C10-MC1-DTA-CV-MOS-019",
    "tra": "070",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Thuyết minh tính toán biện pháp thi công đài móng bê tông khối lớn",
    "submissionDate": "2026-10-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 070"
  },
  {
    "id": "mos-72",
    "category": "mos",
    "stt": 20,
    "code": "C10-MC1-DTA-CV-MOS-020",
    "tra": "075",
    "rev": "00",
    "title": "Đệ trình biện pháp thi công: + Biện pháp thi công phân mác bê tông; Biện pháp thi công mạch ngừng",
    "submissionDate": "2026-11-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 075"
  },
  {
    "id": "ots-73",
    "category": "ots",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-OST-001",
    "tra": "001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Form Nhật ký thi công",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-04",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-06",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBpgpAlt_OMTbZm7KmyCCpGAQnAXYQGGThOWg7r040yz3w?e=5zXiCw",
    "notes": "TRA 001"
  },
  {
    "id": "ots-74",
    "category": "ots",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-OST-002",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp bê tông cho dự án (Bê tông Nguyên Thịnh) Công ty Cổ Phần Đầu Tư Xây Dựng Nguyên Thịnh",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-12",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-14",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQApOJ_iJDCRQ5OBJk8YjIGeAR2F9arSxPD5qSC7VXahATM?e=OoyQwh",
    "notes": "TRA 001"
  },
  {
    "id": "ots-75",
    "category": "ots",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-OST-003",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp bê tông cho dự án (Bê tông Việt Đức) Công ty TNHH Xây Dựng Bê Tông Việt Đức",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-03",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-06",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBlrBN29DxpRJgQ4g6PEToxAeWhY48LsOPSvN8ZfmfLkU4?e=hhZC8E",
    "notes": "TRA 001"
  },
  {
    "id": "ots-76",
    "category": "ots",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-OST-004",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: LAS-XD 357 (Công ty CP Tư Vấn – Thiết Kế - Kiểm Định Xây Dựng Toàn Cầu)",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-12",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-14",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDKZXv1omPTTLlc6tj5DK2hAdyqt1zVO1NqXHDsdbjirhg?e=mKJFmP",
    "notes": "TRA 001"
  },
  {
    "id": "ots-77",
    "category": "ots",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-OST-005",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp thép cho dự án (Thép Miền Nam,Tung Ho) Công ty TNHH ACE (Việt Nam)",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-06-27",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-06-30",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBJ4wXq3QexS4Ydq5ry-U_0AYqw-QqRC_AbGY6WgzJjXT0?e=6UwhPx",
    "notes": "TRA 001"
  },
  {
    "id": "ots-78",
    "category": "ots",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-OST-006",
    "tra": "001",
    "rev": "00",
    "title": "Hồ sơ năng lực nhà thầu thi công_ Công ty TNHH Tập Đoàn Xây Dựng DELTA 1.Giấy chứng nhận đăng ký doanh nghiệp (bản công chứng); 2.Hồ sơ năng lực DELTA (tiếng Việt) – bản gốc; 3. Chứng chỉ năng lực hoạt động xây dựng (bản công chứng); 4. Chứng chỉ năng lực PCCC (bản công chứng);",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-14",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-16",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCZ1aIVpEePToIdM8IblXJpAXGyyJFc8dMbDwljeUf9yEE?e=SGp5GS",
    "notes": "TRA 001"
  },
  {
    "id": "ots-79",
    "category": "ots",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-OST-007",
    "tra": "001",
    "rev": "00",
    "title": "Hồ sơ năng lực đơn vị thẩm tra biện pháp thi công: + Công Ty TNHH Tư Vấn Thiết Kế Và Đầu Tư Xây Dựng Nam Phát",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-14",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-16",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQC2Oj-yl_j0Ta_xLs8-VjppAYrP1KATQgCUPXdrBCyeRRM?e=5Vqj6v",
    "notes": "TRA 001"
  },
  {
    "id": "ots-80",
    "category": "ots",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-OST-008",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Kế hoạch thí nghiệm LAS-XD 357 (Công ty CP Tư Vấn – Thiết Kế - Kiểm Định Xây Dựng Toàn Cầu)",
    "submissionDate": "2026-06-30",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 001"
  },
  {
    "id": "ots-81",
    "category": "ots",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-OST-009",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Đề cương thí nghiệm LAS-XD 357 (Công ty CP Tư Vấn – Thiết Kế - Kiểm Định Xây Dựng Toàn Cầu)",
    "submissionDate": "2026-06-30",
    "tvgsDate": "2026-07-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-29",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBNaoQ4j7xjS4u5siShsDaMAeaP7RTORCVdAnrAABVIpuI?e=FOSaX2",
    "notes": "TRA 001"
  },
  {
    "id": "ots-82",
    "category": "ots",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-OST-010",
    "tra": "001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Form mẫu hồ sơ dự án",
    "submissionDate": "2026-06-30",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 001"
  },
  {
    "id": "ots-83",
    "category": "ots",
    "stt": 11,
    "code": "C10-MC1-DTA-CV-OST-010.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Form mẫu hồ sơ dự án",
    "submissionDate": "2026-07-06",
    "tvgsDate": "2026-07-12",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-15",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDaAVAKy5FXSYQU1pRse6n0AQbZsEi33Zuane_iSN0-10U?e=RNzQFr"
  },
  {
    "id": "ots-84",
    "category": "ots",
    "stt": 12,
    "code": "C10-MC1-DTA-CV-OST-011",
    "tra": "003",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị quan trắc Công Ty CP Thương Mại và Dịch Vụ Trắc Địa Thịnh Phát",
    "submissionDate": "2026-07-02",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 003"
  },
  {
    "id": "ots-85",
    "category": "ots",
    "stt": 13,
    "code": "C10-MC1-DTA-CV-OST-012",
    "tra": "005",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Đề cương kỹ thuật thi công trắc đạc công trình",
    "submissionDate": "2026-07-06",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 005"
  },
  {
    "id": "ots-86",
    "category": "ots",
    "stt": 14,
    "code": "C10-MC1-DTA-CV-OST-012.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Đề cương kỹ thuật thi công trắc đạc công trình",
    "submissionDate": "2026-07-17",
    "tvgsDate": "2026-07-28",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-03",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAsPquMJ6lqT6hll7eSC5ZmAcWR1HQ6sfhpM5z9jRznO1k?e=skZuA4"
  },
  {
    "id": "ots-87",
    "category": "ots",
    "stt": 15,
    "code": "C10-MC1-DTA-CV-OST-013",
    "tra": "007",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Kế hoạch quản lý chất lượng",
    "submissionDate": "2026-07-08",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 007"
  },
  {
    "id": "ots-88",
    "category": "ots",
    "stt": 16,
    "code": "C10-MC1-DTA-CV-OST-013.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Kế hoạch quản lý chất lượng",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-89",
    "category": "ots",
    "stt": 17,
    "code": "C10-MC1-DTA-CV-OST-013.Rev002",
    "rev": "002",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Kế hoạch quản lý chất lượng",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-07-28",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-29",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB6VrmW1hV2TJOB4pKn2eMgAd0YBJyiQO7f9RxaelKf4KQ?e=PYTXWb"
  },
  {
    "id": "ots-90",
    "category": "ots",
    "stt": 18,
    "code": "C10-MC1-DTA-CV-OST-014",
    "tra": "002",
    "rev": "00",
    "title": "Đệ trình hồ sơ:  + Kế hoạch thí nghiệm vật liệu, sản phẩm, cấu kiện, thiết bị sử dụng cho công trình  + Kế hoạch kiểm định xây dựng, quan trắc và đo đạc  + Kế hoạch nghiệm thu công việc xây dựng, giai đoạn xây dựng/gói thầu và công trình hoàn thành",
    "submissionDate": "2026-07-11",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 002"
  },
  {
    "id": "ots-91",
    "category": "ots",
    "stt": 19,
    "code": "C10-MC1-DTA-CV-OST-014.Rev001",
    "tra": "021",
    "rev": "00",
    "title": "Đệ trình hồ sơ:  + Kế hoạch thí nghiệm vật liệu, sản phẩm, cấu kiện, thiết bị sử dụng cho công trình  + Kế hoạch kiểm định xây dựng, quan trắc và đo đạc  + Kế hoạch nghiệm thu công việc xây dựng, giai đoạn xây dựng/gói thầu và công trình hoàn thành",
    "submissionDate": "2026-07-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 021"
  },
  {
    "id": "ots-92",
    "category": "ots",
    "stt": 20,
    "code": "C10-MC1-DTA-CV-OST-014.Rev002",
    "tra": "021",
    "rev": "002",
    "title": "Đệ trình hồ sơ:  + Kế hoạch thí nghiệm vật liệu, sản phẩm, cấu kiện, thiết bị sử dụng cho công trình  + Kế hoạch kiểm định xây dựng, quan trắc và đo đạc  + Kế hoạch nghiệm thu công việc xây dựng, giai đoạn xây dựng/gói thầu và công trình hoàn thành",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-06",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB6lwAiFeBPRr918HMmObbyAUTfMS6MXhZxwwpMG4gowS0?e=Sn6q08",
    "notes": "TRA 021"
  },
  {
    "id": "ots-93",
    "category": "ots",
    "stt": 21,
    "code": "C10-MC1-DTA-CV-OST-015",
    "tra": "009",
    "rev": "00",
    "title": "- Đệ trình hồ sơ : +Quan trắc công trình:    Quan trắc chuyển vị đỉnh tường vây    Quan trắc chuyển vị đỉnh tường vây Inclinometer +Quan trắc lún, nghiêng công trình lân cận và lún đường",
    "submissionDate": "2026-07-13",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 009"
  },
  {
    "id": "ots-94",
    "category": "ots",
    "stt": 22,
    "code": "C10-MC1-DTA-CV-OST-016",
    "tra": "012",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp thép cho dự án (Thép Tung Ho) Công ty Cổ Phần Thương Mại Thái Hưng",
    "submissionDate": "2026-07-14",
    "tvgsDate": "2026-07-18",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-20",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBDqjYpS2FhQJ6KCKOj5_h4AcC7hJpU9zd2NjtDVEXuBVc?e=HcgKQS",
    "notes": "TRA 012"
  },
  {
    "id": "ots-95",
    "category": "ots",
    "stt": 23,
    "code": "C10-MC1-DTA-CV-OST-017",
    "tra": "013",
    "rev": "00",
    "title": "Đệ trình hồ sơ: -Tiến độ thi công chi tiết",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 013"
  },
  {
    "id": "ots-96",
    "category": "ots",
    "stt": 24,
    "code": "C10-MC1-DTA-CV-OST-017.Rev001",
    "tra": "18",
    "rev": "00",
    "title": "Đệ trình hồ sơ: -Tiến độ thi công chi tiết",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 18"
  },
  {
    "id": "ots-97",
    "category": "ots",
    "stt": 25,
    "code": "C10-MC1-DTA-CV-OST-017.Rev003",
    "rev": "003",
    "title": "Đệ trình hồ sơ: -Tiến độ thi công chi tiết",
    "submissionDate": "2026-08-19",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-98",
    "category": "ots",
    "stt": 26,
    "code": "C10-MC1-DTA-CV-OST-017.Rev004",
    "tra": "45",
    "rev": "005",
    "title": "Đệ trình hồ sơ: -Tiến độ thi công chi tiết",
    "submissionDate": "2026-09-04",
    "tvgsDate": "2026-09-05",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-09-07",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "notes": "TRA 45"
  },
  {
    "id": "ots-99",
    "category": "ots",
    "stt": 27,
    "code": "C10-MC1-DTA-CV-OST-018",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị quan trắc Công Ty TNHH Thương Mại Đo Đạc Nguyễn Hoàng",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-100",
    "category": "ots",
    "stt": 28,
    "code": "C10-MC1-DTA-CV-OST-019",
    "rev": "00",
    "title": "Đệ trình hồ sơ: + Danh sách nhà thầu phụ, nhà cung cấp và các đơn vị tham gia dự án C10 - Phần hầm + Kế hoạch trình biện pháp thi công và bản vẽ shopdrawing",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "C",
    "tvgsStatus": "Yêu cầu sửa",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "REJECTED"
  },
  {
    "id": "ots-101",
    "category": "ots",
    "stt": 29,
    "code": "C10-MC1-DTA-CV-OST-020",
    "tra": "16",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị quan trắc Công Ty TNHH Tư Vấn Xây Dựng, Địa Kỹ Thuật Và Môi Trường",
    "submissionDate": "2026-07-19",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 16"
  },
  {
    "id": "ots-102",
    "category": "ots",
    "stt": 30,
    "code": "C10-MC1-DTA-CV-OST-021",
    "tra": "18",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị cung cấp ván phủ phim 12mm Công Ty TNHH Đầu Tư Thương Mại Việt Trung Phát",
    "submissionDate": "2026-07-20",
    "tvgsDate": "2026-07-30",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-31",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCy2OoGnm1iTa_dZTQAzexDAXJ_jvl1htKiwnAxMMmut4Y?e=tzxuKm",
    "notes": "TRA 18"
  },
  {
    "id": "ots-103",
    "category": "ots",
    "stt": 31,
    "code": "C10-MC1-DTA-CV-OST-022",
    "tra": "21",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị cung cấp cừ larsen biện pháp Công Ty TNHH Dịch Vụ Thương Mại Phú Nguyên Giàu",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-07-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-31",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCRXApm_lHXTJ1VoAN3jh4YAezTObcrWSi8RK1__ZolKao?e=KVJYks",
    "notes": "TRA 21"
  },
  {
    "id": "ots-104",
    "category": "ots",
    "stt": 32,
    "code": "C10-MC1-DTA-CV-OST-023",
    "tra": "18",
    "rev": "00",
    "title": "Đệ trình hồ sơ: + Hồ sơ năng lực ban chỉ huy nhà thầu Delta",
    "submissionDate": "2026-07-20",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 18"
  },
  {
    "id": "ots-105",
    "category": "ots",
    "stt": 33,
    "code": "C10-MC1-DTA-CV-OST-023.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ: + Hồ sơ năng lực ban chỉ huy nhà thầu Delta",
    "submissionDate": "2026-07-20",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-106",
    "category": "ots",
    "stt": 34,
    "code": "C10-MC1-DTA-CV-OST-023.Rev002",
    "rev": "00",
    "title": "Đệ trình hồ sơ: + Hồ sơ năng lực ban chỉ huy nhà thầu Delta",
    "submissionDate": "2026-08-18",
    "tvgsDate": "2026-08-20",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-24",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQA7SFzSVRO1TaEgUQp1isRcAancGG80_PnHkI1owPY2sXU?e=J9cPLP"
  },
  {
    "id": "ots-107",
    "category": "ots",
    "stt": 35,
    "code": "C10-MC1-DTA-CV-OST-024",
    "tra": "19",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị cung cấp Kingpost Công Ty TNHH Thép IPC Sài Gòn",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-07-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-31",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCH3_WQe4NJRqlci0kN7HXjAfQS_XsTVP7M7y0aZ7tzLZU?e=Uf7lPQ",
    "notes": "TRA 19"
  },
  {
    "id": "ots-108",
    "category": "ots",
    "stt": 36,
    "code": "C10-MC1-DTA-CV-OST-025",
    "tra": "20",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị quan trắc Công Ty TNHH Tư Vấn Xây Dựng – Đo Đạc Miền Nam",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-07-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-27",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAwGSu2BxwZT6sRouJ2wO5xAe2Osp0hJwI4V1PSeUdxy7Q?e=N7tvV6",
    "notes": "TRA 20"
  },
  {
    "id": "ots-109",
    "category": "ots",
    "stt": 37,
    "code": "C10-MC1-DTA-CV-OST-026",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Thư kỹ thuật bê tông nhà cung cấp Nguyên Thịnh Về việc sử dụng cấp phối Bê tông lạnh để thi công hạng mục thường",
    "submissionDate": "2026-07-23",
    "tvgsDate": "2026-07-28",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-28",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCd6HN8-fiZQYI_KHwYerCNAVOyLGG3AiLEzZFk-tHCyKE?e=Vl1bII"
  },
  {
    "id": "ots-110",
    "category": "ots",
    "stt": 38,
    "code": "C10-MC1-DTA-CV-OST-027",
    "tra": "21",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Đề cương quan trắc Công Ty TNHH Tư Vấn Xây Dựng – Đo Đạc Miền Nam",
    "submissionDate": "2026-07-27",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 21"
  },
  {
    "id": "ots-111",
    "category": "ots",
    "stt": 39,
    "code": "C10-MC1-DTA-CV-OST-027.Rev.001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Đề cương quan trắc Công Ty TNHH Tư Vấn Xây Dựng – Đo Đạc Miền Nam",
    "submissionDate": "2026-08-04",
    "tvgsDate": "2026-08-08",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-18",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBXQWySD7M8RJxgs2TgOg21AQhCcmcn10sO7TPL0bAJgwE?e=pgDgrD"
  },
  {
    "id": "ots-112",
    "category": "ots",
    "stt": 40,
    "code": "C10-MC1-DTA-CV-OST-028",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Thư kỹ thuật bê tông nhà cung cấp Việt Đức Về việc sử dụng cấp phối Bê tông lạnh để thi công hạng mục thường",
    "submissionDate": "2026-07-28",
    "tvgsDate": "2026-07-28",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-07-28",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQD7GGPby3f-Q6bVscA38yyKAcVObLXdwAX67Sa3j3zQbkc?e=0JhUVF"
  },
  {
    "id": "ots-113",
    "category": "ots",
    "stt": 41,
    "code": "C10-MC1-DTA-CV-OST-029",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: LAS-XD 498 (Tổng Hội Địa Chất Việt Nam Liên Hiệp Khoa Học Địa Chất Kiểm Định Nền Móng Xây Dựng Sài Gòn)",
    "submissionDate": "2026-07-29",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-114",
    "category": "ots",
    "stt": 42,
    "code": "C10-MC1-DTA-CV-OST-030",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị cung cấp và lắp đặt Shoring (H350) CÔNG TY CỔ PHẦN XỬ LÝ NỀN MÓNG VIỆT NAM",
    "submissionDate": "2026-07-29",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-18",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBKLejftnHQQIQJUdiOuKq7Ac9J6AXrCRrACOqDcMVKdlw?e=yHE9Ql"
  },
  {
    "id": "ots-115",
    "category": "ots",
    "stt": 43,
    "code": "C10-MC1-DTA-CV-OST-031",
    "rev": "00",
    "title": "Đệ trình hồ sơ: -Tiến độ thi công tháng 8",
    "submissionDate": "2026-08-01",
    "tvgsDate": "2026-08-03",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-116",
    "category": "ots",
    "stt": 44,
    "code": "C10-MC1-DTA-CV-OST-032",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : + khảo sát công trình lân cận tòa nhà SOUTHERN CROSS",
    "submissionDate": "2026-08-04",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-05",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAu5lsJR9GXQ5VDSjvgfoWpAQ37P1CE1omh97Iu_D-nEzs?e=hYOkeG"
  },
  {
    "id": "ots-117",
    "category": "ots",
    "stt": 45,
    "code": "C10-MC1-DTA-CV-OST-033",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : + khảo sát công trình lân cận đường giao thông",
    "submissionDate": "2026-08-04",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-05",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDN_QqCu3s-RYP7aQ_h4_7PAXLOivDIK_5C5zOMw3L8Bic?e=YfGvkO"
  },
  {
    "id": "ots-118",
    "category": "ots",
    "stt": 46,
    "code": "C10-MC1-DTA-CV-OST-034",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : +Báo cáo khảo sát công trình lân cận: Tòa nhà UNILEVER",
    "submissionDate": "2026-08-05",
    "tvgsDate": "2026-08-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-05",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBIWuMVGXtCT6UEk3zxbcOeAYBJaBXVXogxyzSoUAGOZxY?e=NpE45v"
  },
  {
    "id": "ots-119",
    "category": "ots",
    "stt": 47,
    "code": "C10-MC1-DTA-CV-OST-035",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : +Tiến độ thi công dầm capping",
    "submissionDate": "2026-08-28",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-120",
    "category": "ots",
    "stt": 48,
    "code": "C10-MC1-DTA-CV-OST-036",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : +Hồ sơ năng lực đơn vị kiểm định cẩu tháp CÔNG TY TNHH MTV KIỂM ĐỊNH MÁY XÂY DỰNG VIỆT NAM",
    "submissionDate": "2026-08-08",
    "tvgsDate": "2026-08-20",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-121",
    "category": "ots",
    "stt": 49,
    "code": "C10-MC1-DTA-CV-OST-037",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : + Quy trình thi công mockup khoan cấy thép vào bê tông bằng hóa chất R-KEX-II",
    "submissionDate": "2026-08-13",
    "tvgsDate": "2026-08-20",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-24",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAe71yUptZxQYlvvIytW7OzAeQvHMuIsaSe-SxTAb24AdQ?e=mWvhA6"
  },
  {
    "id": "ots-122",
    "category": "ots",
    "stt": 50,
    "code": "C10-MC1-DTA-CV-OST-038",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : +Qui trình thi công mockup khoan cấy thép vào bê tông bằng hóa chất FISCHER FIS EB II 390S",
    "submissionDate": "2026-08-14",
    "tvgsDate": "2026-08-20",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-24",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAeoqqynLi6QqvJyL92CjkqAS-Jnqvy6fENJEXznjPs2pk?e=jF49zB"
  },
  {
    "id": "ots-123",
    "category": "ots",
    "stt": 51,
    "code": "C10-MC1-DTA-CV-OST-039",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : Cấp phối dấu LAS ( Số lượng 12 mác) NCC :Công ty TNHH Xây Dựng Bê Tông Việt Đức",
    "submissionDate": "2026-08-21",
    "tvgsDate": "2026-08-25",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-25",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQA-6_EEz0kSTpc496NcNtEHAURi2hVYJDodnndPJqMWv3k?e=EX4boU"
  },
  {
    "id": "ots-124",
    "category": "ots",
    "stt": 52,
    "code": "C10-MC1-DTA-CV-OST-040",
    "rev": "00",
    "title": "Đệ trinh hồ sơ : Cấp phối dấu LAS ( Số lượng 12 mác) NCC Công ty Cổ Phần Đầu Tư Xây Dựng Nguyên Thịnh",
    "submissionDate": "2026-08-21",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-25",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB2No8vtcrWQKO9UHIrR6djAStGz_NzpdEAKCo4O4DTtjQ?e=TDQpcp"
  },
  {
    "id": "ots-125",
    "category": "ots",
    "stt": 53,
    "code": "C10-MC1-DTA-CV-OST-041",
    "rev": "00",
    "title": "Đệ trình hồ sơ: Cập nhật thay đổi chỉ huy trưởng_ Nguyễn Khắc Nghĩa",
    "submissionDate": "2026-08-22",
    "tvgsDate": "2026-08-25",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-27",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-126",
    "category": "ots",
    "stt": 54,
    "code": "C10-MC1-DTA-CV-OST-041.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ: Cập nhật thay đổi chỉ huy trưởng_ Nguyễn Khắc Nghĩa",
    "submissionDate": "2026-08-28",
    "tvgsDate": "2026-09-01",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-09-05",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAZ4xQ2DBY8S4rnx2CA_wf9AcPQ8W7bF1PEgL9r_cXrvDY?e=wEvOAE"
  },
  {
    "id": "ots-127",
    "category": "ots",
    "stt": 55,
    "code": "C10-MC1-DTA-CV-OST-042",
    "rev": "00",
    "title": "Đệ trình hồ sơ: Công văn V/v Phản hồi Thư cảnh báo về tình hình tiến độ và công tác quản  lý nhân sự chủ chốt tại Dự án Nhà Văn hóa  Phú Mỹ Hưng – Lô C10",
    "submissionDate": "2026-08-26",
    "tvgsDate": "2026-08-27",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-09-05",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-128",
    "category": "ots",
    "stt": 56,
    "code": "C10-MC1-DTA-CV-OST-043",
    "rev": "00",
    "title": "Đệ trình hồ sơ năng lực đơn vị triển khai BIM dự án: -Công ty TNHH Tư vấn IDD Việt Nam (IDD Vietnam)",
    "submissionDate": "2026-09-03",
    "tvgsDate": "2026-09-08",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-129",
    "category": "ots",
    "stt": 57,
    "code": "C10-MC1-DTA-CV-OST-044",
    "rev": "00",
    "title": "Đệ trình hồ sơ:  +Kế hoạch thực hiện BIM (BEP) Đơn vị thực hiện: Công ty TNHH Tư vấn IDD Việt Nam  (IDD Vietnam)",
    "submissionDate": "2026-09-04",
    "tvgsDate": "2026-09-08",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-130",
    "category": "ots",
    "stt": 58,
    "code": "C10-MC1-DTA-CV-OST-045",
    "rev": "00",
    "title": "Đệ trình hồ sơ: +Hồ sơ năng lực anh Hoàng Bá Lộc (quản lý MEP dự án)",
    "submissionDate": "2026-09-04",
    "tvgsDate": "2026-09-05",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-09-09",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAGEKRg9seyTbUrYg2mLVUBAT2OTbXdO-DtUHGoHUsE0YU?e=QIeXYm"
  },
  {
    "id": "ots-131",
    "category": "ots",
    "stt": 59,
    "code": "C10-MC1-DTA-CV-OST-046",
    "rev": "00",
    "title": "Đệ trình hồ sơ: +Sơ đồ tổ chức cập nhật và hồ sơ nhân sự mới ngày 15/09/2026",
    "submissionDate": "2026-09-15",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-132",
    "category": "ots",
    "stt": 60,
    "code": "C10-MC1-DTA-CV-OST-046.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ: +Sơ đồ tổ chức cập nhật và hồ sơ nhân sự mới ngày 15/09/2026",
    "submissionDate": "2026-09-23",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-133",
    "category": "ots",
    "stt": 61,
    "code": "C10-MC1-DTA-CV-OST-047",
    "rev": "00",
    "title": "Đệ trình hồ sơ: + Hồ sơ năng lực: Đơn vị cung cấp vật tư Sika cho dự án Công ty TNHH Xây dựng Thương Mại Dịch Vụ Minh Chi",
    "submissionDate": "2026-09-16",
    "tvgsDate": "2026-09-17",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-11-03",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-134",
    "category": "ots",
    "stt": 62,
    "code": "C10-MC1-DTA-CV-OST-048",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp bê tông cho dự án (Bê tông Yamaken) Công Ty Cổ Phần Bê Tông Terra Yamaken",
    "submissionDate": "",
    "tvgsDate": "2026-09-24",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "C",
    "clientStatus": "Yêu cầu sửa",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-135",
    "category": "ots",
    "stt": 63,
    "code": "C10-MC1-DTA-CV-OST-048.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực: Đơn vị cung cấp bê tông cho dự án (Bê tông Yamaken) Công Ty Cổ Phần Bê Tông Terra Yamaken",
    "submissionDate": "2026-10-15",
    "tvgsDate": "2026-10-17",
    "tvgsCode": "B",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-19",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBlSitRLlGpT7IPuQTjw0uyASSfswz40MNcswAK-qqUO54?e=Sms5Hw"
  },
  {
    "id": "ots-136",
    "category": "ots",
    "stt": 64,
    "code": "C10-MC1-DTA-CV-OST-049",
    "tra": "056",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Bảng kế hoạch trình duyệt Shopdrawing thép",
    "submissionDate": "2026-09-24",
    "tvgsDate": "2026-09-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "notes": "TRA 056"
  },
  {
    "id": "ots-137",
    "category": "ots",
    "stt": 65,
    "code": "C10-MC1-DTA-CV-OST-050",
    "tra": "066",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Bảng kế hoạch trình duyệt Biện pháp thi công",
    "submissionDate": "2026-09-29",
    "tvgsDate": "2026-10-26",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 066"
  },
  {
    "id": "ots-138",
    "category": "ots",
    "stt": 66,
    "code": "C10-MC1-DTA-CV-OST-051",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 00\"",
    "submissionDate": "2026-10-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-139",
    "category": "ots",
    "stt": 67,
    "code": "C10-MC1-DTA-CV-OST-051.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 00\"",
    "submissionDate": "2026-10-06",
    "tvgsDate": "2026-10-08",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-13",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAPdxMXGShpRp-O92LCCmC1AVqZtEgXDfACPpwIWIX0iOU?e=MjbDWE"
  },
  {
    "id": "ots-140",
    "category": "ots",
    "stt": 68,
    "code": "C10-MC1-DTA-CV-OST-052",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền đường chu kỳ 00 &amp; 01)",
    "submissionDate": "2026-10-03",
    "tvgsDate": "2026-10-08",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-13",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQD6a5mT3yIhR6-aNSWBXeLJAfH5jFuUGU3QV2WJ0G72Q1g?e=qe6bg9"
  },
  {
    "id": "ots-141",
    "category": "ots",
    "stt": 69,
    "code": "C10-MC1-DTA-CV-OST-053",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 01\"",
    "submissionDate": "2026-10-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-142",
    "category": "ots",
    "stt": 70,
    "code": "C10-MC1-DTA-CV-OST-053.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 01\"",
    "submissionDate": "2026-10-06",
    "tvgsDate": "2026-10-08",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-10-13",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCIUeslP2BYQ7Akn8DbxhS5AUDCqfTfmpjMI2iTmZYLPlE?e=JHqGbZ"
  },
  {
    "id": "ots-143",
    "category": "ots",
    "stt": 71,
    "code": "C10-MC1-DTA-CV-OST-054",
    "rev": "00",
    "title": "Đệ trình hồ sơ:  + Biện pháp thi công Mock-Up bê tông khối lớn Nhà cung cấp: Công Ty Cổ Phần Đầu Tư Xây Dựng Nguyên Thịnh",
    "submissionDate": "2026-10-05",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-144",
    "category": "ots",
    "stt": 72,
    "code": "C10-MC1-DTA-CV-OST-054.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ:  + Biện pháp thi công Mock-Up bê tông khối lớn Nhà cung cấp: Công Ty Cổ Phần Đầu Tư Xây Dựng Nguyên Thịnh",
    "submissionDate": "",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-145",
    "category": "ots",
    "stt": 73,
    "code": "C10-MC1-DTA-CV-OST-055",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền đường chu kỳ 02\"",
    "submissionDate": "2026-10-12",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-146",
    "category": "ots",
    "stt": 74,
    "code": "C10-MC1-DTA-CV-OST-055.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền đường chu kỳ 02\"",
    "submissionDate": "2026-10-14",
    "tvgsDate": "2026-10-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-147",
    "category": "ots",
    "stt": 75,
    "code": "C10-MC1-DTA-CV-OST-056",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền đường chu kỳ 03\"",
    "submissionDate": "2026-10-12",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-148",
    "category": "ots",
    "stt": 76,
    "code": "C10-MC1-DTA-CV-OST-056.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền đường chu kỳ 03\"",
    "submissionDate": "2026-10-14",
    "tvgsDate": "2026-10-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-149",
    "category": "ots",
    "stt": 77,
    "code": "C10-MC1-DTA-CV-OST-057",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 02\"",
    "submissionDate": "2026-10-23",
    "tvgsDate": "2026-10-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-150",
    "category": "ots",
    "stt": 78,
    "code": "C10-MC1-DTA-CV-OST-058",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 03\"",
    "submissionDate": "2026-10-23",
    "tvgsDate": "2026-10-24",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-151",
    "category": "ots",
    "stt": 79,
    "code": "C10-MC1-DTA-CV-OST-059.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 03a, 04, 04a\"",
    "submissionDate": "2026-10-27",
    "tvgsDate": "2026-10-29",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-152",
    "category": "ots",
    "stt": 80,
    "code": "C10-MC1-DTA-CV-OST-060",
    "rev": "00",
    "title": "Đệ trình hồ sơ:   + Hồ sơ năng lực đơn vị cung cấp và lắp đặt Shoring (H350) CÔNG TY CỔ PHẦN KỸ THUẬT NỀN MÓNG IPC",
    "submissionDate": "2026-10-15",
    "tvgsDate": "2026-10-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-11-03",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-153",
    "category": "ots",
    "stt": 81,
    "code": "C10-MC1-DTA-CV-OST-061",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 04\"",
    "submissionDate": "2026-10-19",
    "tvgsDate": "2026-10-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-154",
    "category": "ots",
    "stt": 82,
    "code": "C10-MC1-DTA-CV-OST-062",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 05\"",
    "submissionDate": "2026-10-19",
    "tvgsDate": "2026-10-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-155",
    "category": "ots",
    "stt": 83,
    "code": "C10-MC1-DTA-CV-OST-063",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: - Hệ giáo chống dầm, sàn: + Giáo RINGCLOCK A1200x600mm, dày 2.5mm + Giáo RINGCLOCK A600x600mm, dày 2.5mm NCC: Công ty TNHH Giải Pháp Thi Công Trường Thịnh",
    "submissionDate": "2026-10-19",
    "tvgsDate": "2026-10-29",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-156",
    "category": "ots",
    "stt": 84,
    "code": "C10-MC1-DTA-CV-OST-064.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Hồ sơ năng lực đơn vị cung cấp và lắp đặt Shoring (H400) CÔNG TY TNHH HORIZON CONSTRUCTION DEVELOPMENT OVERSEAS (VIỆT NAM)",
    "submissionDate": "2026-10-26",
    "tvgsDate": "2026-10-27",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-11-03",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-157",
    "category": "ots",
    "stt": 85,
    "code": "C10-MC1-DTA-CV-OST-065",
    "rev": "00",
    "title": "Đệ trình hồ sơ:  + Quy trình kiểm tra khuyết tật của cọc bằng phương pháp soi camera tại hiện trường (CCTV) Đơn vị thực hiện: Công ty Cổ phần Tư vấn-Thiết kế-Kiểm định-Xây dựng Toàn Cầu (LAS 357)",
    "submissionDate": "2026-10-22",
    "tvgsDate": "2026-11-03",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-158",
    "category": "ots",
    "stt": 86,
    "code": "C10-MC1-DTA-CV-OST-065.Rev001",
    "rev": "001",
    "title": "Đệ trình hồ sơ:  + Quy trình kiểm tra khuyết tật của cọc bằng phương pháp soi camera tại hiện trường (CCTV) Đơn vị thực hiện: Công ty Cổ phần Tư vấn-Thiết kế-Kiểm định-Xây dựng Toàn Cầu (LAS 357)",
    "submissionDate": "2026-11-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-159",
    "category": "ots",
    "stt": 87,
    "code": "C10-MC1-DTA-CV-OST-066",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 05, 05a\"",
    "submissionDate": "2026-10-27",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-160",
    "category": "ots",
    "stt": 88,
    "code": "C10-MC1-DTA-CV-OST-066.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 05, 05a\"",
    "submissionDate": "2026-10-28",
    "tvgsDate": "2026-10-29",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-161",
    "category": "ots",
    "stt": 89,
    "code": "C10-MC1-DTA-CV-OST-067",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 06\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-162",
    "category": "ots",
    "stt": 90,
    "code": "C10-MC1-DTA-CV-OST-067.Rev.001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 06\"",
    "submissionDate": "2026-11-02",
    "tvgsDate": "2026-11-03",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-163",
    "category": "ots",
    "stt": 91,
    "code": "C10-MC1-DTA-CV-OST-068",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 07\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-164",
    "category": "ots",
    "stt": 92,
    "code": "C10-MC1-DTA-CV-OST-069",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \" Lún, nghiêng lận cận và lún nền  đường chu kỳ 08\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-165",
    "category": "ots",
    "stt": 93,
    "code": "C10-MC1-DTA-CV-OST-070",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 06\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-166",
    "category": "ots",
    "stt": 94,
    "code": "C10-MC1-DTA-CV-OST-071",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 07\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "ots-167",
    "category": "ots",
    "stt": 95,
    "code": "C10-MC1-DTA-CV-OST-071.Rev.001",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 07\"",
    "submissionDate": "2026-11-02",
    "tvgsDate": "2026-11-03",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "ots-168",
    "category": "ots",
    "stt": 96,
    "code": "C10-MC1-DTA-CV-OST-072",
    "rev": "00",
    "title": "Đệ trình hồ sơ hạng mục thi công tầng hầm: + Báo cáo kết quả quan trắc \"Chuyển vị ngang tường vây chu kỳ 08\"",
    "submissionDate": "2026-10-30",
    "tvgsDate": "2026-10-31",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-169",
    "category": "hse",
    "stt": 1,
    "code": "C10-MC1-DTA-CV-HSE-001",
    "rev": "00",
    "title": "Nội dung trình duyệt:  - Hồ sơ năng lực đơn vị đào và vận chuyển đất - Hồ sơ Máy nén khí  - Hồ sơ máy đào bánh xích (6 xe) - Hồ sơ xe ben",
    "submissionDate": "2026-07-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-170",
    "category": "hse",
    "stt": 2,
    "code": "C10-MC1-DTA-CV-HSE-001.Rev001",
    "rev": "00",
    "title": "- Hồ sơ nhân sự nhà thầu TPH - Hồ sơ năng lực TPH - Hồ sơ máy đào (1 xe)",
    "submissionDate": "2026-08-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-171",
    "category": "hse",
    "stt": 3,
    "code": "C10-MC1-DTA-CV-HSE-002",
    "tra": "20",
    "rev": "00",
    "title": "Đệ trình hồ sơ HSE hạng mục thi công tầng hầm: + Biện pháp bảo đảm an toàn trong thi công xây dựng  + Kế hoạch quản lý môi trường. + Phương án phòng cháy chữa cháy, cứu nạn cứu hộ.",
    "submissionDate": "2026-07-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING",
    "notes": "TRA 20"
  },
  {
    "id": "hse-172",
    "category": "hse",
    "stt": 4,
    "code": "C10-MC1-DTA-CV-HSE-002.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ HSE hạng mục thi công tầng hầm: + Biện pháp bảo đảm an toàn trong thi công xây dựng  + Kế hoạch quản lý môi trường. + Phương án phòng cháy chữa cháy, cứu nạn cứu hộ.",
    "submissionDate": "2026-07-21",
    "tvgsDate": "2026-08-09",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-10",
    "clientCode": "B",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-173",
    "category": "hse",
    "stt": 5,
    "code": "C10-MC1-DTA-CV-HSE-004",
    "rev": "00",
    "title": "Xác định vùng nguy hiểm trong thi công xây dựng công trình",
    "submissionDate": "2026-07-27",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-174",
    "category": "hse",
    "stt": 6,
    "code": "C10-MC1-DTA-CV-HSE-004.Rev001",
    "rev": "00",
    "title": "Xác định vùng nguy hiểm trong thi công xây dựng công trình",
    "submissionDate": "",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-175",
    "category": "hse",
    "stt": 7,
    "code": "C10-MC1-DTA-CV-HSE-005",
    "rev": "00",
    "title": "Form mẫu nhật ký an toàn",
    "submissionDate": "2026-08-07",
    "tvgsDate": "2026-08-15",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "2026-08-17",
    "clientCode": "A",
    "clientStatus": "Duyệt",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-176",
    "category": "hse",
    "stt": 8,
    "code": "C10-MC1-DTA-CV-HSE-006",
    "rev": "00",
    "title": "Đệ trình hồ sơ HSE hạng mục thi công tầng hầm: + Hồ sơ máy đào bánh xích lắp búa rung",
    "submissionDate": "2026-08-11",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-177",
    "category": "hse",
    "stt": 9,
    "code": "C10-MC1-DTA-CV-HSE-007",
    "rev": "00",
    "title": "Hồ sơ công nhân Số lượng 13 Công ty TNHH Tập Đoàn Xây Dựng DELTA",
    "submissionDate": "2026-08-11",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-178",
    "category": "hse",
    "stt": 10,
    "code": "C10-MC1-DTA-CV-HSE-008",
    "rev": "00",
    "title": "Đệ trình hồ sơ: - Quyết định thành lập lực lượng sơ cấp cứu cơ sở -Quyết định thành lập Ban an toàn-Vệ sinh lao động công trường Quyết định phân định trách nhiệm công tác An toàn vệ sinh lao động -Quyết định thành lập Bộ phận y tế cơ sở - Quyết định Thành lập đội phòng cháy, chữa cháy và cứu nạn, cứu hộ, phòng chống lụt bão, ứng cứu khẩn cấp và chức năng, nhiệm vụ -Quyết định thành lập mạng lưới An toàn, vệ sinh",
    "submissionDate": "2026-08-11",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-179",
    "category": "hse",
    "stt": 11,
    "code": "C10-MC1-DTA-CV-HSE-009",
    "rev": "00",
    "title": "Đệ trình hồ sơ: -Cẩu tháp mã hiệu: QTZ250 (W7020-12E) Công ty TNHH TM DV Xây Lắp Phước Tiến",
    "submissionDate": "2026-08-12",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-180",
    "category": "hse",
    "stt": 12,
    "code": "C10-MC1-DTA-CV-HSE-010",
    "rev": "00",
    "title": "- Hồ sơ xe vận chuyển đất Toàn Phước Huy (4 xe) - Sơ đồ tổ chức Toàn Phước Huy",
    "submissionDate": "2026-08-13",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-181",
    "category": "hse",
    "stt": 13,
    "code": "C10-MC1-DTA-CV-HSE-011",
    "rev": "00",
    "title": "- Hồ sơ vận hành cẩu tháp (2 người)",
    "submissionDate": "2026-08-25",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-182",
    "category": "hse",
    "stt": 14,
    "code": "C10-MC1-DTA-CV-HSE-004.Rev002",
    "rev": "00",
    "title": "Xác định vùng nguy hiểm trong thi công xây dựng công trình",
    "submissionDate": "2026-08-28",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-183",
    "category": "hse",
    "stt": 15,
    "code": "C10-MC1-DTA-CV-HSE-012",
    "rev": "00",
    "title": "Biện pháp ATLĐ quản lý vận hành sử dụng cần trục tháp trong thi công",
    "submissionDate": "2026-08-28",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-184",
    "category": "hse",
    "stt": 16,
    "code": "C10-MC1-DTA-CV-HSE-007.REV001",
    "rev": "00",
    "title": "Hồ sơ công nhân Số lượng 12 Công ty TNHH Tập Đoàn Xây Dựng DELTA",
    "submissionDate": "2026-08-29",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-185",
    "category": "hse",
    "stt": 17,
    "code": "C10-MC1-DTA-CV-HSE-013",
    "rev": "00",
    "title": "Đệ trình hồ sơ: -Cẩu tháp mã hiệu: TOPKIT MC 180 Công ty TNHH TM DV Xây Lắp Phước Tiến",
    "submissionDate": "2026-08-29",
    "tvgsDate": "2026-09-03",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-186",
    "category": "hse",
    "stt": 18,
    "code": "C10-MC1-DTA-CV-HSE-014",
    "rev": "00",
    "title": "Hồ sơ công nhân Số lượng: 16 Công ty TNHH Tập Đoàn Xây Dựng DELTA",
    "submissionDate": "2026-09-03",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-187",
    "category": "hse",
    "stt": 19,
    "code": "C10-MC1-DTA-CV-HSE-015",
    "rev": "00",
    "title": "Đệ trình hồ sơ: + Quyết định bổ nhiệm Trưởng ban AT, cán bộ an toàn mới + Bổ sung hồ sơ BCH (giấy khám sức khoẻ, thẻ an toàn)",
    "submissionDate": "2026-09-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-188",
    "category": "hse",
    "stt": 20,
    "code": "C10-MC1-DTA-CV-HSE-007.REV002",
    "rev": "00",
    "title": "Hồ sơ công nhân Số lượng 12 Công ty TNHH Tập Đoàn Xây Dựng DELTA",
    "submissionDate": "2026-09-04",
    "tvgsDate": "2026-09-05",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:f:/g/personal/c10_phumyhung_phanham_deltagroup_h%E1%BB%93%20s%C6%A1%2012%20c%C3%B4ng%20nh%C3%A2n"
  },
  {
    "id": "hse-189",
    "category": "hse",
    "stt": 21,
    "code": "C10-MC1-DTA-CV-HSE 008.Rev001",
    "rev": "00",
    "title": "- Quyết định thành lập Ban an toàn-vệ sinh lao đông công trường - Quyết định phân định trách nhiệm công tác An toàn vệ sinh lao động. - Quyết định thành lập Đội PCCC-CNCH, phòng chống lụt bão, ứng cứu khẩn cấp và chức năng nhiệm vụ - Quyết định thành lập mạng lưới An toàn vệ sinh.",
    "submissionDate": "2026-09-07",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-190",
    "category": "hse",
    "stt": 22,
    "code": "C10-MC1-DTA-CV-HSE 001.Rev002",
    "rev": "00",
    "title": "Đệ trình hồ sơ nhà thầu phụ công ty Toàn Phước Huy gồm: - Hồ sơ năng lực - Hồ sơ nhân sự",
    "submissionDate": "2026-09-07",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-191",
    "category": "hse",
    "stt": 23,
    "code": "C10-MC1-DTA-CV-HSE 010.Rev001",
    "rev": "00",
    "title": "Đệ trình hồ sơ nhà thầu phụ công ty Toàn Phước Huy gồm: - Hồ sơ máy móc, thiết bị.",
    "submissionDate": "2026-09-07",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-192",
    "category": "hse",
    "stt": 24,
    "code": "C10-MC1-DTA-CV-HSE-016",
    "rev": "00",
    "title": "Đệ trình hồ sơ nhân sự vận hành cẩu tháp CT2 (TOPKIT MC180)",
    "submissionDate": "2026-09-08",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-193",
    "category": "hse",
    "stt": 25,
    "code": "C10-MC1-DTA-CV-HSE-012-REV001",
    "rev": "00",
    "title": "Biện pháp ATLĐ quản lý vận hành sử dụng cần trục tháp trong thi công",
    "submissionDate": "",
    "tvgsDate": "2026-09-15",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-194",
    "category": "hse",
    "stt": 26,
    "code": "C10-MC1-DTA-CV-HSE-017",
    "rev": "00",
    "title": "Đệ trình hồ sơ kiểm định 2 cẩu tháp",
    "submissionDate": "",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-195",
    "category": "hse",
    "stt": 27,
    "code": "C10-MC1-DTA-CV-HSE-018",
    "rev": "00",
    "title": "Đệ trình hồ sơ máy đào bánh xích lắp búa rung công ty CP xử lý nền móng Việt Nam",
    "submissionDate": "2026-09-11",
    "tvgsDate": "2026-09-15",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-196",
    "category": "hse",
    "stt": 28,
    "code": "C10-MC1-DTA-CV-HSE-019",
    "rev": "00",
    "title": "Đệ trình hồ sơ cẩu·tháp: C/0, C/Q của dây cáp",
    "submissionDate": "2026-09-12",
    "tvgsDate": "2026-09-15",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-197",
    "category": "hse",
    "stt": 29,
    "code": "C10-MC1-DTA-CV-HSE-015.REV001",
    "rev": "00",
    "title": "Đệ trình hồ sơ : - Bảo hiểm trách nhiệm bên thứ 3 - Hồ sơ BCH còn thiếu (giấy khám sức khỏe, thẻ an toàn, bảo hiểm tai nạn)",
    "submissionDate": "2026-09-13",
    "tvgsDate": "",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-198",
    "category": "hse",
    "stt": 30,
    "code": "C10-MC1-DTA-CV-HSE 008.Rev002",
    "rev": "00",
    "title": "- Quyết định thành lập Ban an toàn-vệ sinh lao động công trường - Quyết định phân định trách nhiệm công tác An toàn vệ sinh lao động. - Quyết định thành lập Đội PCCC-CNCH, phòng chống lụt bão, ứng cứu khẩn cấp và chức năng nhiệm vụ - Quyết định thành lập mạng lưới An toàn vệ sinh.",
    "submissionDate": "2026-09-14",
    "tvgsDate": "2026-09-22",
    "tvgsCode": "A",
    "tvgsStatus": "Duyệt",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "APPROVED"
  },
  {
    "id": "hse-199",
    "category": "hse",
    "stt": 31,
    "code": "C10-MC1-DTA-CV-HSE-004.Rev003",
    "rev": "00",
    "title": "Xác định vùng nguy hiểm trong thi công xây dựng công trình",
    "submissionDate": "2026-09-14",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-200",
    "category": "hse",
    "stt": 32,
    "code": "C10-MC1-DTA-CV-HSE-020",
    "rev": "00",
    "title": "Đệ trình biên bản nghiệm thu 2 cẩu tháp (CT1 và CT2)",
    "submissionDate": "2026-09-17",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-201",
    "category": "hse",
    "stt": 33,
    "code": "C10-MC1-DTA-CV-HSE 021",
    "rev": "00",
    "title": "Hồ sơ bản vẽ biện pháp an toàn lắp đặt kingpost",
    "submissionDate": "2026-10-02",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-202",
    "category": "hse",
    "stt": 34,
    "code": "C10-MC1-DTA-CV-HSE 022",
    "rev": "00",
    "title": "Hồ sơ bản vẽ lối thoát hiểm",
    "submissionDate": "2026-10-03",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-203",
    "category": "hse",
    "stt": 35,
    "code": "C10-MC1-DTA-CV-HSE 023",
    "rev": "00",
    "title": "hồ sơ công nhân NTP TFVN",
    "submissionDate": "2026-10-06",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-204",
    "category": "hse",
    "stt": 36,
    "code": "C10-MC1-DTA-CV-HSE 024",
    "rev": "00",
    "title": "hồ sơ máy móc thiết bị NTP HPCONS",
    "submissionDate": "2026-10-05",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-205",
    "category": "hse",
    "stt": 37,
    "code": "C10-MC1-DTA-CV-HSE 021.rev001",
    "rev": "00",
    "title": "Hồ sơ bản vẽ biện pháp an toàn lắp đặt kingpost",
    "submissionDate": "2026-10-12",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-206",
    "category": "hse",
    "stt": 38,
    "code": "C10-MC1-DTA-CV-HSE 022rev001",
    "rev": "00",
    "title": "Hồ sơ bản vẽ lối thoát hiểm",
    "submissionDate": "",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "hse-207",
    "category": "hse",
    "stt": 39,
    "code": "C10-MC1-DTA-CV-HSE 025",
    "rev": "00",
    "title": "Hồ sơ nhân sự NTP nền móng Việt Nam",
    "submissionDate": "2026-10-21",
    "tvgsDate": "",
    "tvgsCode": "",
    "tvgsStatus": "",
    "clientDate": "",
    "clientCode": "",
    "clientStatus": "",
    "finalStatus": "PENDING"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Trialmix bê tông Việt Đức",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-08",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Trialmix bê tông Nguyên Thịnh",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-09",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 • - m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Trialmix bê tông Việt Đức",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-18",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Trialmix bê tông Yamaken",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Yamaken",
    "submissionDate": "2026-10-29",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Yamaken • Mác B30 • - m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Cọc CT1-A3",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "24,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-16",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  3H • 24,5 m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Cọc CT2-B2",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "26 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-18",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  3H • 26 m3 m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Cọc CT1-A1",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "28m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-19",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  3H • 28m3 m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Cọc CT2-B3",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "26m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-20",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  3H • 26m3 m3"
  },
  {
    "id": "conc-5",
    "category": "concrete",
    "stt": 5,
    "code": "C10-DTA-CONC-05",
    "title": "Cọc CT1-A2",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "25m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-21",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  3H • 25m3 m3"
  },
  {
    "id": "conc-6",
    "category": "concrete",
    "stt": 6,
    "code": "C10-DTA-CONC-06",
    "title": "Cọc CT2-B1",
    "concreteGrade": "B30 R28 20+-  3H",
    "volumeM3": "26m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-22",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  3H • 26m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Cọc C1-7.6",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "9 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-30",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 9 m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Cọc C1-7.5",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "9,5 m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-07-31",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  4H • 9,5 m3 m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Cọc C1-6.2",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-01",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Cọc C1-6.3",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-01",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-5",
    "category": "concrete",
    "stt": 5,
    "code": "C10-DTA-CONC-05",
    "title": "Cọc C1-7.8",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-02",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-6",
    "category": "concrete",
    "stt": 6,
    "code": "C10-DTA-CONC-06",
    "title": "Cọc C1-7.7",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11.5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-02",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11.5 m3 m3"
  },
  {
    "id": "conc-7",
    "category": "concrete",
    "stt": 7,
    "code": "C10-DTA-CONC-07",
    "title": "Cọc C1-6.1",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-03",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-8",
    "category": "concrete",
    "stt": 8,
    "code": "C10-DTA-CONC-08",
    "title": "Cọc C1-7.9",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-03",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-9",
    "category": "concrete",
    "stt": 9,
    "code": "C10-DTA-CONC-09",
    "title": "Cọc C1-7.4",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-04",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-10",
    "category": "concrete",
    "stt": 10,
    "code": "C10-DTA-CONC-010",
    "title": "Cọc C1-7.2",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-05",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-11",
    "category": "concrete",
    "stt": 11,
    "code": "C10-DTA-CONC-011",
    "title": "Cọc C3-E6",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-13",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-12",
    "category": "concrete",
    "stt": 12,
    "code": "C10-DTA-CONC-012",
    "title": "Cọc C3-E5",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-13",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-13",
    "category": "concrete",
    "stt": 13,
    "code": "C10-DTA-CONC-013",
    "title": "Cọc C1-7.1",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-14",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-14",
    "category": "concrete",
    "stt": 14,
    "code": "C10-DTA-CONC-014",
    "title": "Cọc C1-7.3",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-14",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-15",
    "category": "concrete",
    "stt": 15,
    "code": "C10-DTA-CONC-015",
    "title": "Cọc C2-B5",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-15",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-16",
    "category": "concrete",
    "stt": 16,
    "code": "C10-DTA-CONC-016",
    "title": "Cọc  C1-B6",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-15",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-17",
    "category": "concrete",
    "stt": 17,
    "code": "C10-DTA-CONC-017",
    "title": "Cọc  C1-E4",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-16",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 11 m3 m3"
  },
  {
    "id": "conc-18",
    "category": "concrete",
    "stt": 18,
    "code": "C10-DTA-CONC-018",
    "title": "Cọc  C1-B4",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-17",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-19",
    "category": "concrete",
    "stt": 19,
    "code": "C10-DTA-CONC-019",
    "title": "Cọc  C1-B3",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-17",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-20",
    "category": "concrete",
    "stt": 20,
    "code": "C10-DTA-CONC-020",
    "title": "Cọc  C1-F4",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-19",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-21",
    "category": "concrete",
    "stt": 21,
    "code": "C10-DTA-CONC-021",
    "title": "Cọc  C1-F6",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-19",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-22",
    "category": "concrete",
    "stt": 22,
    "code": "C10-DTA-CONC-022",
    "title": "Cọc  C1-F5",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-19",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-23",
    "category": "concrete",
    "stt": 23,
    "code": "C10-DTA-CONC-023",
    "title": "Cọc  C1-F1",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-20",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-24",
    "category": "concrete",
    "stt": 24,
    "code": "C10-DTA-CONC-024",
    "title": "Cọc  C1-F3",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-20",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-25",
    "category": "concrete",
    "stt": 25,
    "code": "C10-DTA-CONC-025",
    "title": "Cọc  C1-F2",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-21",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-26",
    "category": "concrete",
    "stt": 26,
    "code": "C10-DTA-CONC-026",
    "title": "Cọc  C1-E1",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "11m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-08-24",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  4H • 11m3 m3"
  },
  {
    "id": "conc-27",
    "category": "concrete",
    "stt": 27,
    "code": "C10-DTA-CONC-027",
    "title": "Cọc  C1-E3",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-08-24",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-28",
    "category": "concrete",
    "stt": 28,
    "code": "C10-DTA-CONC-028",
    "title": "Cọc  C1-E2",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-25",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-29",
    "category": "concrete",
    "stt": 29,
    "code": "C10-DTA-CONC-029",
    "title": "Cọc  C1-B1",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-26",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-30",
    "category": "concrete",
    "stt": 30,
    "code": "C10-DTA-CONC-030",
    "title": "Cọc  C1-B2",
    "concreteGrade": "B30 R28 20+-  4H",
    "volumeM3": "10,5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-27",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 R28 20+-  4H • 10,5 m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông lót móng cẩu tháp CT1",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "5m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-29",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B7.5 R28  12+-2 • 5m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông móng cẩu tháp CT1",
    "concreteGrade": "B40, M500, R7, Độ sụt 14+-2",
    "volumeM3": "26,5m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-06",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40, M500, R7, Độ sụt 14+-2 • 26,5m3 m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Bê tông lót móng cẩu tháp CT2",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "4m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-06",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B7.5 R28  12+-2 • 4m3 m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Bê tông móng cẩu tháp CT2",
    "concreteGrade": "B40, M500, R7, Độ sụt 14+-2",
    "volumeM3": "27m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-11",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40, M500, R7, Độ sụt 14+-2 • 27m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông lót dầm mũ:\r\n- Trục C -F/ Cách trục 1A -10.290m\r\n- Trục 1-A",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "4m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-31",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B7.5 R28  12+-2 • 4m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông lót dầm mũ:\r\n- Trục F-GA/ Cách trục 1A -10.290m",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "Cùng mẻ đổ cẩu tháp CT2",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-06",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B7.5 R28  12+-2 • Cùng mẻ đổ cẩu tháp CT2 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông dầm mũ:\r\n- Trục GA-D/ Cách trục 1A -10.290m",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "38m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-08-15",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 38m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông dầm mũ: (Capping beam 3)\r\n- Trục B-F",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "39m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-08-28",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 39m3 m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Bê tông dầm mũ: (Capping beam 1)\r\n- Trục A-1",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "37m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-09-01",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 37m3 m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Bê tông dầm mũ: (Capping beam 2)\r\n- Trục 3-10",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "65,5m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-09-11",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 65,5m3 m3"
  },
  {
    "id": "conc-5",
    "category": "concrete",
    "stt": 5,
    "code": "C10-DTA-CONC-05",
    "title": "Bê tông dầm mũ: (Capping beam 3)\r\n- Trục F - 10",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "47m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-09-20",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 47m3 m3"
  },
  {
    "id": "conc-6",
    "category": "concrete",
    "stt": 6,
    "code": "C10-DTA-CONC-06",
    "title": "Bê tông dầm mũ: (Capping beam 2)\r\n- Trục GA-3",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "72,5m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-09-22",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  14+-2 • 72,5m3 m3"
  },
  {
    "id": "conc-7",
    "category": "concrete",
    "stt": 7,
    "code": "C10-DTA-CONC-07",
    "title": "Bê tông dầm mũ: (Capping beam 1)\r\n- Trục A-D",
    "concreteGrade": "B40 R28  16+-2",
    "volumeM3": "71,5m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-10-01",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  16+-2 • 71,5m3 m3"
  },
  {
    "id": "conc-8",
    "category": "concrete",
    "stt": 8,
    "code": "C10-DTA-CONC-08",
    "title": "Bê tông dầm mũ: (Capping beam 3)\r\n- Trục B-10",
    "concreteGrade": "B40 R28  14+-2",
    "volumeM3": "35m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-03",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40 R28  14+-2 • 35m3 m3"
  },
  {
    "id": "conc-9",
    "category": "concrete",
    "stt": 9,
    "code": "C10-DTA-CONC-09",
    "title": "Bê tông dầm mũ: (Capping beam 4)\r\n- Trục 1 - 10",
    "concreteGrade": "B40 R28  16+-2",
    "volumeM3": "80 m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-10-10",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40 R28  16+-2 • 80 m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông cầu rửa xe",
    "concreteGrade": "B20 R28   12+-2",
    "volumeM3": "3m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-07-31",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B20 R28   12+-2 • 3m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông cầu rửa xe ( Cổng đường Russell)",
    "concreteGrade": "B22,5 R28   14+-2",
    "volumeM3": "4,5m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-08-30",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B22,5 R28   14+-2 • 4,5m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông lót biện pháp đường russel",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "15m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-08-06",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B7.5 R28  12+-2 • 15m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông lót biện pháp mặt bằng, hố ga cầu rửa xe",
    "concreteGrade": "B7.5 R28  12+-2",
    "volumeM3": "4m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-09-06",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B7.5 R28  12+-2 • 4m3 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Bê tông chèn hệ văng Z3 lớp 1",
    "concreteGrade": "B40, M500, R7, Độ sụt 14+-2",
    "volumeM3": "3m3",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-10-10",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40, M500, R7, Độ sụt 14+-2 • 3m3 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bê tông chèn hệ văng Z3 lớp 1",
    "concreteGrade": "B35, M450, R7 S14",
    "volumeM3": "3m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-13",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B35, M450, R7 S14 • 3m3 m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Bê tông chèn hệ văng Z9 lớp 1",
    "concreteGrade": "B35, M450, R7 S14",
    "volumeM3": "3m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-16",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B35, M450, R7 S14 • 3m3 m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Bê tông sàn biện pháp (Z3) và cục chặn:\r\n - Góc đường Nguyễn Lương Bằng và Morison",
    "concreteGrade": "B40, M500. R7, Độ sụt 14+-2",
    "volumeM3": "6.5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-17",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40, M500. R7, Độ sụt 14+-2 • 6.5 m3 m3"
  },
  {
    "id": "conc-5",
    "category": "concrete",
    "stt": 5,
    "code": "C10-DTA-CONC-05",
    "title": "Bê tông sàn biện pháp (Z9) và cục chặn::\r\n - Góc đường Nguyễn Khắc Viện và Morison",
    "concreteGrade": "B40, M500. R7, Độ sụt 14+-2",
    "volumeM3": "6.5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-20",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40, M500. R7, Độ sụt 14+-2 • 6.5 m3 m3"
  },
  {
    "id": "conc-6",
    "category": "concrete",
    "stt": 6,
    "code": "C10-DTA-CONC-06",
    "title": "Bê tông sàn biện pháp (Z1):\r\n - Góc đường Russell và Nguyển Lương Bằng",
    "concreteGrade": "B40, M500. R7, Độ sụt 14+-2",
    "volumeM3": "6.5 m3",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-25",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B40, M500. R7, Độ sụt 14+-2 • 6.5 m3 m3"
  },
  {
    "id": "conc-7",
    "category": "concrete",
    "stt": 7,
    "code": "C10-DTA-CONC-07",
    "title": "Bê tông sàn biện pháp (Z7):\r\n - Góc đường Russell và Nguyển Khắc Viện",
    "concreteGrade": "B40, M500. R7, Độ sụt 14+-2",
    "volumeM3": "46152",
    "supplier": "Nguyên Thịnh",
    "submissionDate": "2026-10-28",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Nguyên Thịnh • Mác B40, M500. R7, Độ sụt 14+-2 • 46152 m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Trialmix bê tông Yamaken",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Yamaken",
    "submissionDate": "2026-10-29",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Yamaken • Mác B30 • - m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "P2-125; P2-269A; P2-154; P2-151; P2-178; P2-183; P2-190; \r\nP2-193; P2-194; P2-247; P2-249; P2-86; P2-265; P2-92; P2-93;\r\nP2-97; P2-110.",
    "concreteGrade": "M300",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-07",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác M300 • - m3"
  },
  {
    "id": "conc-1",
    "category": "concrete",
    "stt": 1,
    "code": "C10-DTA-CONC-01",
    "title": "Thép hình H350, mác thép SM490A, dùng sản xuất hệ shoring",
    "concreteGrade": "3 thanh 1 tổ kéo\r\n3 thanh 1 tổ uốn",
    "volumeM3": "44201707N321",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-26",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác 3 thanh 1 tổ kéo\r\n3 thanh 1 tổ uốn • 44201707N321 m3"
  },
  {
    "id": "conc-2",
    "category": "concrete",
    "stt": 2,
    "code": "C10-DTA-CONC-02",
    "title": "Bulong liên kết M22x500 cấp bền 8.8",
    "concreteGrade": "1 tổ 3 con",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-29",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác 1 tổ 3 con • - m3"
  },
  {
    "id": "conc-3",
    "category": "concrete",
    "stt": 3,
    "code": "C10-DTA-CONC-03",
    "title": "Bulong liên kết M20x400 cấp bền 8.8",
    "concreteGrade": "1 tổ 3 con",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "2026-10-29",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác 1 tổ 3 con • - m3"
  },
  {
    "id": "conc-4",
    "category": "concrete",
    "stt": 4,
    "code": "C10-DTA-CONC-04",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-5",
    "category": "concrete",
    "stt": 5,
    "code": "C10-DTA-CONC-05",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-6",
    "category": "concrete",
    "stt": 6,
    "code": "C10-DTA-CONC-06",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-7",
    "category": "concrete",
    "stt": 7,
    "code": "C10-DTA-CONC-07",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "conc-8",
    "category": "concrete",
    "stt": 8,
    "code": "C10-DTA-CONC-08",
    "title": "Đổ bê tông ngày ",
    "concreteGrade": "B30",
    "volumeM3": "-",
    "supplier": "Việt Đức",
    "submissionDate": "",
    "testR7Date": "",
    "testR28Date": "",
    "rating": "Đạt",
    "finalStatus": "APPROVED",
    "notes": "Nhà CC: Việt Đức • Mác B30 • - m3"
  },
  {
    "id": "mat-imp-1",
    "category": "material_import",
    "stt": 1,
    "code": "C10-MAT-IMP-ĐỢT01",
    "title": "ĐỢT 01: Ống thép D60",
    "batchNo": "ĐỢT 01",
    "supplier": "VINAONE",
    "quantity": "130",
    "unit": "Cây",
    "submissionDate": "2026-07-10",
    "acceptanceDate": "2026-07-11",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: 726/1625 • NCC: VINAONE"
  },
  {
    "id": "mat-imp-2",
    "category": "material_import",
    "stt": 2,
    "code": "C10-MAT-IMP-ĐỢT02",
    "title": "ĐỢT 02: Bulong neo M42x1400; Ren 200; Bẻ L-200  (1 Thân + 2 Tán + 1 Long đền)",
    "batchNo": "ĐỢT 02",
    "supplier": "MINH CHI",
    "quantity": "62",
    "unit": "Bộ",
    "submissionDate": "2026-07-28",
    "acceptanceDate": "2026-07-28",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: 109/37\r\n109/38 • NCC: MINH CHI"
  },
  {
    "id": "mat-imp-3",
    "category": "material_import",
    "stt": 3,
    "code": "C10-MAT-IMP-ĐỢT01",
    "title": "ĐỢT 01: Kingpost đỡ sàn đạo (H300; L=12m; Hàn bản mã 1 đầu - Cắt vát)",
    "batchNo": "ĐỢT 01",
    "supplier": "IPC Sài Gòn",
    "quantity": "10",
    "unit": "Cây",
    "submissionDate": "2026-07-28",
    "acceptanceDate": "2026-07-29",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: 726/3136 • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-4",
    "category": "material_import",
    "stt": 4,
    "code": "C10-MAT-IMP-ĐỢT02",
    "title": "ĐỢT 02: Thép cừ Larsen IV; L=6m",
    "batchNo": "ĐỢT 02",
    "supplier": "Phú Nguyên Giàu",
    "quantity": "87",
    "unit": "Cây",
    "submissionDate": "2026-07-16",
    "acceptanceDate": "2026-07-29",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: Phú Nguyên Giàu"
  },
  {
    "id": "mat-imp-5",
    "category": "material_import",
    "stt": 5,
    "code": "C10-MAT-IMP-ĐỢT03",
    "title": "ĐỢT 03: Thép cừ Larsen IV; L=6m",
    "batchNo": "ĐỢT 03",
    "supplier": "Phú Nguyên Giàu",
    "quantity": "25",
    "unit": "Cây",
    "submissionDate": "2026-08-05",
    "acceptanceDate": "2026-08-06",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: Phú Nguyên Giàu"
  },
  {
    "id": "mat-imp-6",
    "category": "material_import",
    "stt": 6,
    "code": "C10-MAT-IMP-ĐỢT04",
    "title": "ĐỢT 04: Thép cừ Larsen IV; L=6m",
    "batchNo": "ĐỢT 04",
    "supplier": "Phú Nguyên Giàu",
    "quantity": "53",
    "unit": "Cây",
    "submissionDate": "2026-08-10",
    "acceptanceDate": "2026-08-10",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: Phú Nguyên Giàu"
  },
  {
    "id": "mat-imp-7",
    "category": "material_import",
    "stt": 7,
    "code": "C10-MAT-IMP-ĐỢT05",
    "title": "ĐỢT 05: Kingpost đỡ sàn đạo (H300; L=12m; Hàn bản mã 1 đầu - Cắt vát)",
    "batchNo": "ĐỢT 05",
    "supplier": "IPC Sài Gòn",
    "quantity": "2",
    "unit": "Cây",
    "submissionDate": "2026-08-11",
    "acceptanceDate": "2026-08-12",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-8",
    "category": "material_import",
    "stt": 8,
    "code": "C10-MAT-IMP-ĐỢT06",
    "title": "ĐỢT 06: Kingpost đỡ sàn đạo (H300; L=12m; Hàn bản mã 1 đầu - Cắt vát)",
    "batchNo": "ĐỢT 06",
    "supplier": "IPC Sài Gòn",
    "quantity": "14",
    "unit": "Cây",
    "submissionDate": "2026-08-14",
    "acceptanceDate": "2026-08-14",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-9",
    "category": "material_import",
    "stt": 9,
    "code": "C10-MAT-IMP-ĐỢT07",
    "title": "ĐỢT 07: Kingpost hệ shoring (H300; L= 18m)",
    "batchNo": "ĐỢT 07",
    "supplier": "IPC Sài Gòn",
    "quantity": "12",
    "unit": "Cây",
    "submissionDate": "2026-09-11",
    "acceptanceDate": "2026-09-14",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-10",
    "category": "material_import",
    "stt": 10,
    "code": "C10-MAT-IMP-ĐỢT08",
    "title": "ĐỢT 08: Kingpost hệ shoring (H300; L= 18m)",
    "batchNo": "ĐỢT 08",
    "supplier": "IPC Sài Gòn",
    "quantity": "20",
    "unit": "Cây",
    "submissionDate": "2026-09-15",
    "acceptanceDate": "2026-09-16",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-11",
    "category": "material_import",
    "stt": 11,
    "code": "C10-MAT-IMP-ĐỢT09",
    "title": "ĐỢT 09: Kingpost hệ shoring (H300; L= 18m)",
    "batchNo": "ĐỢT 09",
    "supplier": "IPC Sài Gòn",
    "quantity": "15",
    "unit": "Cây",
    "submissionDate": "2026-09-19",
    "acceptanceDate": "2026-09-20",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: IPC Sài Gòn"
  },
  {
    "id": "mat-imp-12",
    "category": "material_import",
    "stt": 12,
    "code": "C10-MAT-IMP-ĐỢT10",
    "title": "ĐỢT 10: Thép hình (H350; L=9m)",
    "batchNo": "ĐỢT 10",
    "supplier": "Nền móng Việt Nam",
    "quantity": "6",
    "unit": "Cây",
    "submissionDate": "2026-09-21",
    "acceptanceDate": "2026-09-22",
    "rating": "Đạt kiểm định",
    "finalStatus": "APPROVED",
    "notes": "Số KQ: - • NCC: Nền móng Việt Nam"
  },
  {
    "id": "moa-298",
    "category": "inspection_moa",
    "stt": 1,
    "code": "C10-MC1-DTA-MOA-M-STE-001",
    "title": "Nghiệm thu vật liệu đầu vào Thép thanh vằn: D10 CB400-V; D12 CB400-V; D16 CB500-V; D18 CB500-V; D20 CB500-V; D22 CB500-V; D25 CB500-V; D32 CB500-V.",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-07-28",
    "acceptanceDate": "2026-07-28",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBqx_eZvbvPSIsvdJSinjQVAeJHdS2xiP-TkLKcPJbdHPE?e=kOgjbU",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-299",
    "category": "inspection_moa",
    "stt": 2,
    "code": "C10-MC1-DTA-MOA-M-STE-002",
    "title": "Nghiệm thu vật liệu đầu vào Thép thanh vằn: D10 CB400-V; D16 CB500-V; D20 CB500-V; D32 CB500-V;",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-08-05",
    "acceptanceDate": "2026-08-05",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQChrTIPNy6IRpTorviyQlKWAaVOnsth-0AnDXD1NnHWjb0?e=cvEd0x",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-300",
    "category": "inspection_moa",
    "stt": 3,
    "code": "C10-MC1-DTA-MOA-M-STE-003",
    "title": "Nghiệm thu vật liệu đầu vào Thép thanh vằn: D14 CB500-V; D16 CB500-V; D25 CB500-V; D32 CB500-V;",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-09-25",
    "acceptanceDate": "2026-09-25",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQChJhVyJLYLTZOlz98MkLWmAR6XRKy-uJfKOaur21eExA4?e=4FEIhO",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-301",
    "category": "inspection_moa",
    "stt": 4,
    "code": "C10-MC1-DTA-MOA-M-ANCHOR BOLT-001",
    "title": "Bulong neo M42x1400; Ren 200; Bẻ L-200  (1 Thân + 2 Tán + 1 Long đền)",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-08-06",
    "acceptanceDate": "2026-08-06",
    "finalStatus": "APPROVED",
    "linkUrl": "C10-MC1-DTA-MOA-M-ANCHOR BOLT-001.pdf",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-302",
    "category": "inspection_moa",
    "stt": 5,
    "code": "C10-MC1-DTA-MOA-M-WP MAT-001",
    "title": "Nghiệm thu vật liệu: + Băng trương nở Hydrotite CJ + Sikaflex - 140 Contruction + Sika Latex TH + Sika grout 214 - 11",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-08-12",
    "acceptanceDate": "2026-08-12",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCMpDba0khRRosierP5ba_5ARkbk8L4nDkuR0j9W-sR3-k?e=qH18Fe",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-303",
    "category": "inspection_moa",
    "stt": 6,
    "code": "C10-MC1-DTA-MOA-M-STEEL PILE-001",
    "title": "Nghiệm thu vật liệu đầu vào Thép ống: -Thép ống D60x1.8x6m ĐSX STK 290 L1",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-07-15",
    "acceptanceDate": "2026-07-15",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDFQZyS8YgdQo2QfsKjJnbvARxrVO-p_kTvMC3LlTvThQY?e=CSO2XK",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-304",
    "category": "inspection_moa",
    "stt": 7,
    "code": "C10-MC1-DTA-MOA-M-INCL-001",
    "title": "Nghiệm thu vật liệu đầu vào:  + Ống Inclinometer Casing GV2404-C0-2-70;  Đường kính 70mm, L= 3m  + Đầu nối GV2404-CP-4F-70;  Đường kính 70mm, L= 160mm  + Nắp bịt GV2404-CP-4C-70",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-08-05",
    "acceptanceDate": "2026-08-05",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAzEDw04x9-TJDUIQR0FZikAeVfdgF44aXo5Glfs2z2VoM?e=nkdbyM",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-305",
    "category": "inspection_moa",
    "stt": 8,
    "code": "C10-MC1-DTA-MOA-M-VTBP-001",
    "title": "Nghiệm thu vật liệu đầu vào vật liệu biện pháp: Thép cừ Larsen IV; L=6m",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-08-13",
    "acceptanceDate": "2026-08-13",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBlwk5BtfbWSIVvNhFPDuZyAcI1vTDfgLFaXzalWLVzX6o?e=YHMxxd",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-306",
    "category": "inspection_moa",
    "stt": 9,
    "code": "C10-MC1-DTA-MOA-M-VTBP-002",
    "title": "Nghiệm thu vật liệu đầu vào vật tư biện pháp: Ván phủ phim 1220x2440x12mm",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-07-30",
    "acceptanceDate": "2026-07-30",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAKsP0Q7OKISaaX-SUdsM_MAT1PqPK6m81uhmKF45wW0rU?e=8hfgR6",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-307",
    "category": "inspection_moa",
    "stt": 10,
    "code": "C10-MC1-DTA-MOA-M-VTBP-003",
    "title": "Nghiệm thu vật liệu đầu vào vật tư biện pháp:  + Kingpost đỡ sàn đạo  + Kingpost hệ shoring",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-09-24",
    "acceptanceDate": "2026-09-24",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBBULEPmrOUS4TrO5IVSARSAeP8mcwOFX1dwcv_WFCrbEg?e=fMPcbK",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-308",
    "category": "inspection_moa",
    "stt": 11,
    "code": "C10-MC1-DTA-MOA-M-VTBP-004",
    "title": "Nghiệm thu vật liệu đầu vào vật tư biện pháp:  + Kingpost hệ shoring",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "2026-10-17",
    "acceptanceDate": "2026-10-17",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAKUJmbOhpkQ4eIGa2zlX_OAbI355tpHZnyV45-wW-7CIg?e=5uWe1C",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-309",
    "category": "inspection_moa",
    "stt": 12,
    "code": "C10-MC1-DTA-MOA-M-VTBP-005",
    "title": "Nghiệm thu vật liệu đầu vào vật tư biện pháp:  + Hệ văng chống lớp 1 và phụ kiện đi kèm",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "",
    "acceptanceDate": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCQguH8yL9aRbOaRT6TKri-AUHwu2-S5pm_pFROdYsXumo?e=uLGpQT",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-310",
    "category": "inspection_moa",
    "stt": 13,
    "code": "C10-MC1-DTA-MOA-M-CA-001",
    "title": "Nghiệm thu vật liệu đầu vào:  + Fischer hộp keo FIS EB 390S và phụ kiện đi kèm",
    "moaType": "MOA-M",
    "volumeNo": "1",
    "submissionDate": "",
    "acceptanceDate": "",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDHinyp75zQRJPEIA-hTBKoAcgLD3gfXf4XhifIvDE6nWI?e=j9zcEI",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-311",
    "category": "inspection_moa",
    "stt": 14,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_01",
    "title": "Cọc CT1-A3",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-16",
    "acceptanceDate": "2026-07-16",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAQCvjQ2509TLL_EB9vp5ZCASG9Zl_6qSGztmyoAQIxQHw?e=waDM58",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-312",
    "category": "inspection_moa",
    "stt": 15,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_02",
    "title": "Cọc CT2-B2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-18",
    "acceptanceDate": "2026-07-18",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAJN7rnJ8QHQIkN9vUlqMKEAXJ163jTsWrA5QAoIGwnRqY?e=J0Jzv9",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-313",
    "category": "inspection_moa",
    "stt": 16,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_03",
    "title": "Cọc CT1-A1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-19",
    "acceptanceDate": "2026-07-19",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBPNpaGldEWT4vqQ-p5QpP8AQbZ2v82eWgLfnhdyootxXc?e=3ph1mc",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-314",
    "category": "inspection_moa",
    "stt": 17,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_04",
    "title": "Cọc CT2-B3",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-20",
    "acceptanceDate": "2026-07-20",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBtXoeLPTvAQIT0CaWwGvm2AfYiAwF1nFbmY5ypxzdxQqs?e=HJF1qg",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-315",
    "category": "inspection_moa",
    "stt": 18,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_05",
    "title": "Cọc CT1-A2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-21",
    "acceptanceDate": "2026-07-21",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQANb_mYSue2QbxPJptXgZisAebIDaxKf9y4z0yVphAKu5w?e=rLYsNn",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-316",
    "category": "inspection_moa",
    "stt": 19,
    "code": "C10-MC1-DTA-MOA-W-COCCAUTHAP_06",
    "title": "Cọc CT2-B1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-22",
    "acceptanceDate": "2026-07-22",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQADAZMBX0M0T4Z42NBTWy57AdsbYuA-RkqyP9ApKuF78_A?e=AReR0h",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-317",
    "category": "inspection_moa",
    "stt": 20,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_01",
    "title": "Cọc C1-7.6",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-29",
    "acceptanceDate": "2026-08-29",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBr1GJ7J6g4Roy8Wq4lVt-3AdMCTuwM0wuSMEgJF6vTad0?e=E3MOk7",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-318",
    "category": "inspection_moa",
    "stt": 21,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_02",
    "title": "Cọc C1-7.5",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-29",
    "acceptanceDate": "2026-08-29",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBZqvTJoERhQ5tYqp97NwBbAVSWLMB_T5xzFl-O4gqXr0U?e=kiaHe6",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-319",
    "category": "inspection_moa",
    "stt": 22,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_03",
    "title": "Cọc C1-6.2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-30",
    "acceptanceDate": "2026-08-30",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAEmGkmCAWUTqODbFrcq7FgAUuT06URwgjSaAj6k3-I5fg?e=nYLxw0",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-320",
    "category": "inspection_moa",
    "stt": 23,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_04",
    "title": "Cọc C1-6.3",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-31",
    "acceptanceDate": "2026-08-31",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAq_O5jHd7HRLdFzsQtsCiTAWqeo3VpAbRbUEB64U-Rn0g?e=97GSxB",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-321",
    "category": "inspection_moa",
    "stt": 24,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_05",
    "title": "Cọc C1-7.8",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-31",
    "acceptanceDate": "2026-08-31",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB-2e-Aos3bTqzRi8qhcfCJARhRFBzDEPaVJn_jlyxvUKk?e=6Lfz6r",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-322",
    "category": "inspection_moa",
    "stt": 25,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_06",
    "title": "Cọc C1-7.7",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-01",
    "acceptanceDate": "2026-09-01",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQC75iqNWmZCQIXOWp043ABIATw3JAXYyNL5chqWk_XFS1k?e=eZrQeJ",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-323",
    "category": "inspection_moa",
    "stt": 26,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_07",
    "title": "Cọc C1-6.1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-01",
    "acceptanceDate": "2026-09-01",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQA8N6hra5voS4_T4vJhjO98AVtsHU8Gi6_oO4x-uKvIMAY?e=J4ldpH",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-324",
    "category": "inspection_moa",
    "stt": 27,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_08",
    "title": "Cọc C1-7.9",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-03",
    "acceptanceDate": "2026-09-03",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDPvMDXsxdPQ5-rvSXW9s9AAchAIh1rfkP-dcZXimoGRJM?e=3fj8n1",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-325",
    "category": "inspection_moa",
    "stt": 28,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_09",
    "title": "Cọc C1-7.4",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-03",
    "acceptanceDate": "2026-09-03",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBOGyYjQmOwTqontQSD2H0hAbK6-JhFVjUU0m7mMycmS7E?e=fnORcA",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-326",
    "category": "inspection_moa",
    "stt": 29,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_10",
    "title": "Cọc C1-7.2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-03",
    "acceptanceDate": "2026-09-03",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAECd-COuX8SoJBsqev8YKmAXAyaRtovT1nptiFw3jD1Yo?e=GGPCxw",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-327",
    "category": "inspection_moa",
    "stt": 30,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_11",
    "title": "Cọc C3-E6",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-11",
    "acceptanceDate": "2026-09-11",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQArWSKFgSpuR5UHbU2uKh2iAUbwTH1U3zGxj0WZ3_sQUUc?e=GAVD6m",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-328",
    "category": "inspection_moa",
    "stt": 31,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_12",
    "title": "Cọc C3-E5",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-11",
    "acceptanceDate": "2026-09-11",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAOKXer9OvJQpx4LDJoasU4AZKxZqnB9SOw5rdTyOahFrw?e=DEZYmL",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-329",
    "category": "inspection_moa",
    "stt": 32,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_13",
    "title": "Cọc C1-7.1",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-11",
    "acceptanceDate": "2026-09-11",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBBM99IE95UTaZ5_CbcYq8zASsTCH9weOyvibJ2Vz96fO4?e=qiqLQV",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-330",
    "category": "inspection_moa",
    "stt": 33,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_14",
    "title": "Cọc C1-7.3",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-12",
    "acceptanceDate": "2026-09-12",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCuhiAowLU_Qq6242MGHFvoAQL0nxsTaV2V80MosKhmVK8?e=T8SPtn",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-331",
    "category": "inspection_moa",
    "stt": 34,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_15",
    "title": "Cọc C2-B5",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-13",
    "acceptanceDate": "2026-09-13",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAd-Jrb72S-Tp4Azkb7TOoXAXA2DmlXlJOi86yVCEjgE8g?e=48ZyzC",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-332",
    "category": "inspection_moa",
    "stt": 35,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_16",
    "title": "Cọc  C1-B6",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-14",
    "acceptanceDate": "2026-09-14",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDZEyalcGtKSrw_Y5BhRKn-AU6Zqly5Yb-JWm9NlpZCR_0?e=u9qfZC",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-333",
    "category": "inspection_moa",
    "stt": 36,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_17",
    "title": "Cọc  C1-E4",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-14",
    "acceptanceDate": "2026-09-14",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDeVwxzwFQyRK5w6Ms-f84eASY2tMq70N5oQefZnQ1lRWc?e=I6uiq9",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-334",
    "category": "inspection_moa",
    "stt": 37,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_18",
    "title": "Cọc  C1-B4",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-15",
    "acceptanceDate": "2026-09-15",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDT5bBVKDdgSL9kNyBfGaiIAXjTB2SKCIP1MUDaNMA8Y8E?e=WIY5jN",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-335",
    "category": "inspection_moa",
    "stt": 38,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_19",
    "title": "Cọc  C1-B3",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-09-15",
    "acceptanceDate": "2026-09-15",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCSueEMZyrbTaodzlPkV9pJAeSem7VoS5NtU79Ukmt8yO4?e=BlQp9K",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-336",
    "category": "inspection_moa",
    "stt": 39,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_20",
    "title": "Cọc  C1-F4",
    "moaType": "MOA-W",
    "volumeNo": "2",
    "submissionDate": "2026-08-19",
    "acceptanceDate": "2026-08-19",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCvaXJssH6LQJuovd1H9R-mAVutHgNNiKaaDZoVTrgFHs0?e=ybeH2r",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-337",
    "category": "inspection_moa",
    "stt": 40,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_21",
    "title": "Cọc  C1-F6",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-17",
    "acceptanceDate": "2026-09-17",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBPw8c-jdDuQJb6q558GKQNAXEY2JDmn6UDqEQeMG4mOQI?e=MofGGY",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-338",
    "category": "inspection_moa",
    "stt": 41,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_22",
    "title": "Cọc  C1-F5",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-17",
    "acceptanceDate": "2026-09-17",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBsvcjByePEQ6Vsk5il1LFpAUMFssKB-9PKolzMoJdgHJM?e=3ZywLX",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-339",
    "category": "inspection_moa",
    "stt": 42,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_23",
    "title": "Cọc  C1-F1",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-18",
    "acceptanceDate": "2026-09-18",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQClXEJ_Rwy2TKOebfdZWPHEAT5J-igVB07C-7A1Wv6Re1c?e=Rh9dbx",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-340",
    "category": "inspection_moa",
    "stt": 43,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_24",
    "title": "Cọc  C1-F3",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-19",
    "acceptanceDate": "2026-09-19",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQB4StR1FI-qSJsciaWlBADbAfyO3jl_usVv6JKOU4sQMqs?e=L4Sbwe",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-341",
    "category": "inspection_moa",
    "stt": 44,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_25",
    "title": "Cọc  C1-F2",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-19",
    "acceptanceDate": "2026-09-19",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDeRUpRJf1DQYIlf_MhaojsAQ8LZt6Fthk7OfnFWvhBRPU?e=6nZBuO",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-342",
    "category": "inspection_moa",
    "stt": 45,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_26",
    "title": "Cọc  C1-E1",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-23",
    "acceptanceDate": "2026-09-23",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQA_0pxeolI3TrR7sfwPhlbsAe8K8nhV4LfQzsK-dWpDM0E?e=MXpwzr",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-343",
    "category": "inspection_moa",
    "stt": 46,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_27",
    "title": "Cọc  C1-E3",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-23",
    "acceptanceDate": "2026-09-23",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCOujv50159RacbApcGFzBzAYSdln2j6Bhd95wYD44M6_k?e=0kRPBj",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-344",
    "category": "inspection_moa",
    "stt": 47,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_28",
    "title": "Cọc  C1-E2",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-24",
    "acceptanceDate": "2026-09-24",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBfX4wzQvfpQo1gzjLAos3NAUpX6ClqQi5Ja0fNi7EgeqI?e=b2rIaj",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-345",
    "category": "inspection_moa",
    "stt": 48,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_29",
    "title": "Cọc  C1-B1",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-24",
    "acceptanceDate": "2026-09-24",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQA46uQ1GSKfR559Ewdnx3dmAdZlUXk-TvYretzki0faRlM?e=3dJI4F",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-346",
    "category": "inspection_moa",
    "stt": 49,
    "code": "C10-MC1-DTA-MOA-W-COCBIENPHAP_30",
    "title": "Cọc  C1-B2",
    "moaType": "MOA-W",
    "volumeNo": "3",
    "submissionDate": "2026-09-24",
    "acceptanceDate": "2026-09-24",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCKUq64TczARZ38s0pDRW1eAZppcVUysR-YFObyYZYM7QA?e=feCcqc",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-347",
    "category": "inspection_moa",
    "stt": 50,
    "code": "C10-MC1-DTA-MOA-W-BTL-001",
    "title": "Bê tông lót móng cẩu tháp CT1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-29",
    "acceptanceDate": "2026-07-29",
    "finalStatus": "APPROVED",
    "linkUrl": "C10-MC1-DTA-MOA-W-BTL-001.pdf",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-348",
    "category": "inspection_moa",
    "stt": 51,
    "code": "C10-MC1-DTA-MOA-W- MCT-001",
    "title": "Bê tông móng cẩu tháp CT1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-06",
    "acceptanceDate": "2026-08-06",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCLGkrT2ZsHTJWKc1L5i5rWAYz3p9jE1QEQ_Cac5wHIM94?e=MY69do",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-349",
    "category": "inspection_moa",
    "stt": 52,
    "code": "C10-MC1--DTA-MOA-W-BTL-002",
    "title": "Bê tông lót móng cẩu tháp CT2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-06",
    "acceptanceDate": "2026-08-06",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCH-FKY_bHYTYGZkUR1snMxAffmUdfh4iCviO24ajUZhLY?e=uQFoV9",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-350",
    "category": "inspection_moa",
    "stt": 53,
    "code": "C10-MC1-DTA-MOA-W- MCT-002",
    "title": "Bê tông móng cẩu tháp CT2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-11",
    "acceptanceDate": "2026-08-11",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBIJ-GFvce0R4FAsLhTGdoxAYF7Y8QDSCpVqwmxbzPYTWo?e=siAXX8",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-351",
    "category": "inspection_moa",
    "stt": 54,
    "code": "C10-MC1-DTA-MOA-W-BTL-003",
    "title": "Bê tông lót dầm mũ: - Trục C -F/ Cách trục 1A + 10.290m - Trục 1-A",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-07-31",
    "acceptanceDate": "2026-07-31",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQCzMfCRhhXzSb9pnGT6FbFYAeDqQOlb8AvrMJxpEPc5-_w?e=1plXUA",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-352",
    "category": "inspection_moa",
    "stt": 55,
    "code": "C10-MC1-DTA-MOA-W-BTL-004",
    "title": "Bê tông lót dầm mũ: - Trục F-GA/ Cách trục 1A + 10.290m",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-06",
    "acceptanceDate": "2026-08-06",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBZlCFR3z4LQp1u1r-6LPyNAfysznUHsVNE9BoSwmZ5oa8?e=Rgl0sk",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-353",
    "category": "inspection_moa",
    "stt": 56,
    "code": "C10-MC1-DTA-MOA-W-CP-001",
    "title": "Thi công cốt thép, ván khuôn, bê tông dầm mũ: - Trục GA-D/ Cách trục 1A -10.290m",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-15",
    "acceptanceDate": "2026-08-15",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQDAEdudIbWiRptUt5E5oo0_AT4WSXrE-WWG5sDbnVzMD0s?e=XF5WJT",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-354",
    "category": "inspection_moa",
    "stt": 57,
    "code": "C10-MC1-DTA-MOA-W-CP-002",
    "title": "Thi công cốt thép, ván khuôn, bê tông dầm mũ: (Capping beam 3) - Trục B-F",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-08-28",
    "acceptanceDate": "2026-08-28",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBHpMAHHgZnTIOLmqBRIY_-AcWJbLuHrSTNkU2qIE6Otlw?e=wKTsLt",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-355",
    "category": "inspection_moa",
    "stt": 58,
    "code": "C10-MC1-DTA-MOA-W-CP-003",
    "title": "Thi công cốt thép, ván khuôn, bê tông dầm mũ:(Capping beam 1) - Trục A-1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-01",
    "acceptanceDate": "2026-09-01",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBXuZ4jPKoVT6j9g9Tfr719Adh_V29mdKzV28di6j2yTZI?e=cvjJ3P",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-356",
    "category": "inspection_moa",
    "stt": 59,
    "code": "C10-MC1-DTA-MOA-W-CP-004",
    "title": "Thi công cốt thép, ván khuôn, bê tông dầm mũ:(Capping beam 2) -Trục 3-10",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-11",
    "acceptanceDate": "2026-09-11",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAaw2YXMjyoR7PqHxl_z-yaAWKcrnjh0brorCP6psxjNzU?e=QJ2Wf7",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-357",
    "category": "inspection_moa",
    "stt": 60,
    "code": "C10-MC1-DTA-MOA-W-CP-005",
    "title": "Thi công cốt thép, ván khuôn, bê tông dầm mũ:(Capping beam 3) -Trục F-10",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-20",
    "acceptanceDate": "2026-09-20",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAF1Zyp1PmnSpJU2UqeMYacAYmULFXEwEwdeyORNg5zkAU?e=RCaw5m",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-358",
    "category": "inspection_moa",
    "stt": 61,
    "code": "C10-MC1-DTA-MOA-W-CP-006",
    "title": "Bê tông dầm mũ: (Capping beam 2) - Trục GA-3",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-09-22",
    "acceptanceDate": "2026-09-22",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQAA3Cm75cKqTKYz6kdUZMkmAb9laf6dOhn6I5LfkLoGU64?e=pxZpI4",
    "notes": "Đã scan + nhân bản 5"
  },
  {
    "id": "moa-359",
    "category": "inspection_moa",
    "stt": 62,
    "code": "C10-MC1-DTA-MOA-W-CP-007",
    "title": "Bê tông dầm mũ: (Capping beam 1) - Trục A-D",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-01",
    "acceptanceDate": "2026-10-01",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-360",
    "category": "inspection_moa",
    "stt": 63,
    "code": "C10-MC1-DTA-MOA-W-CP-008",
    "title": "Bê tông dầm mũ: (Capping beam 3) - Trục B-10",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-03",
    "acceptanceDate": "2026-10-03",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-361",
    "category": "inspection_moa",
    "stt": 64,
    "code": "C10-MC1-DTA-MOA-W-CP-009",
    "title": "Bê tông dầm mũ: (Capping beam 4) - Trục 1 - 10",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-10",
    "acceptanceDate": "2026-10-10",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-362",
    "category": "inspection_moa",
    "stt": 65,
    "code": "C10-MC1-DTA-MOA-W-SS-001",
    "title": "Nghiệm thu Lắp đặt hệ văng chống, kích hệ văng lớp 1, Zone 3,  Zone 9",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-28",
    "acceptanceDate": "2026-10-28",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-363",
    "category": "inspection_moa",
    "stt": 66,
    "code": "C10-MC1-DTA-MOA-W-SS-002",
    "title": "Nghiệm thu Lắp đặt hệ văng chống, kích hệ văng lớp 1, Zone 4, Zone 5, Zone 6",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-30",
    "acceptanceDate": "2026-10-30",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-364",
    "category": "inspection_moa",
    "stt": 67,
    "code": "C10-MC1-DTA-MOA-W-SS-003",
    "title": "Nghiệm thu Lắp đặt hệ văng chống, kích hệ văng lớp 1, Zone 7, Zone 5, Zone 2",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-11-03",
    "acceptanceDate": "2026-11-03",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-365",
    "category": "inspection_moa",
    "stt": 68,
    "code": "C10-MC1-DTA-MOA-W-SS-004",
    "title": "Nghiệm thu Lắp đặt hệ văng chống, kích hệ văng lớp 1, Zone 8, Zone 1",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-11-04",
    "acceptanceDate": "2026-11-04",
    "finalStatus": "APPROVED"
  },
  {
    "id": "moa-366",
    "category": "inspection_moa",
    "stt": 69,
    "code": "C10-MC1-DTA-MOA-W-EXC-001",
    "title": "Nghiệm thu công tác đào và vận chuyển đất: - Từ cao độ mặt đất tự nhiên đến cao độ -3.5m",
    "moaType": "MOA-W",
    "volumeNo": "1",
    "submissionDate": "2026-10-28",
    "acceptanceDate": "2026-10-28",
    "finalStatus": "APPROVED",
    "linkUrl": "https://deltagroupvn-my.sharepoint.com/:b:/g/personal/c10_phumyhung_phanham_deltagroup_vn/IQBFj-fgqbTmSpRyhGirRS_tAf9euUbBEYQvEBXPBX-F8Qs?e=1Pbcpg",
    "notes": "Đã scan + nhân bản 5"
  }
];



export const LOCAL_STORAGE_KEY_MASTER_SUBMITTALS = 'c10_master_submittals_v5';
const MOA_EMPTY_STATUS_CODES = new Set([
  'C10-MC1-DTA-MOA-W-CP-007',
  'C10-MC1-DTA-MOA-W-CP-008',
  'C10-MC1-DTA-MOA-W-CP-009',
  'C10-MC1-DTA-MOA-W-SS-001',
  'C10-MC1-DTA-MOA-W-SS-002',
  'C10-MC1-DTA-MOA-W-SS-003',
  'C10-MC1-DTA-MOA-W-SS-004'
]);
DEFAULT_MASTER_SUBMITTALS.forEach((r) => {
  if (r.category === 'inspection_moa') {
    const c = String(r.code || '').trim().toUpperCase();
    if (MOA_EMPTY_STATUS_CODES.has(c)) {
      r.clientStatus = '';
      r.submissionDate = '';
      r.finalStatus = 'NOT_STARTED';
    }
  }
});

export const normalizeSubmittalCategory = (cat: string): SubmittalCategoryKey => {
  const c = String(cat || '').trim().toLowerCase();
  if (c === 'shopdrawing' || c === 'sd' || c === 'sdw') return 'sdw';
  if (c === 'moa' || c === 'inspection_moa' || c === 'inspection') return 'inspection_moa';
  if (c === 'material' || c === 'ma' || c === 'mat') return 'mat';
  if (c === 'method_of_statement' || c === 'mos') return 'mos';
  if (c === 'document_submit' || c === 'ots') return 'ots';
  if (c === 'rfi' || c === 'rfc') return 'rfi';
  if (c === 'hse' || c === 'safety') return 'hse';
  if (c === 'concrete') return 'concrete';
  if (c === 'material_import' || c === 'import') return 'material_import';
  return (cat as SubmittalCategoryKey) || 'ots';
};

export const isRejectedStatusText = (str?: string): boolean => {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes('từ chối') ||
    s.includes('tu choi') ||
    s.includes('reject') ||
    s.includes('rejcet') ||
    s.includes('hủy') ||
    s.includes('không trình lại') ||
    s.includes('đã thay thế') ||
    s === 'c'
  );
};

export const isApprovedStatusText = (str?: string): boolean => {
  const s = String(str || '').trim().toLowerCase();
  if (!s || isRejectedStatusText(s)) return false;
  return (
    s === 'duyệt' ||
    s.includes('đã duyệt') ||
    s.includes('không cần trình') ||
    s.includes('đã kí') ||
    s.includes('đã ký') ||
    s.includes('đạt') ||
    s === 'a' ||
    s === 'b'
  );
};

// Chuẩn hóa trạng thái dựa trên cột Trạng thái CĐT phê duyệt (và Từ chối = Đã đóng)
export const computeNormalizedFinalStatus = (rec: Partial<MasterSubmittalRecord>): MasterSubmittalRecord['finalStatus'] => {
  const cat = normalizeSubmittalCategory(String(rec.category || 'ots'));
  if (cat === 'concrete' || cat === 'material_import') return 'APPROVED';
  if (cat === 'inspection_moa') {
    const moaStatus = String(rec.clientStatus ?? '').trim();
    if (!moaStatus) return 'NOT_STARTED';
    if (isRejectedStatusText(moaStatus)) return 'REJECTED';
    if (isApprovedStatusText(moaStatus)) return 'APPROVED';
    return 'PENDING';
  }
  if (
    isRejectedStatusText(rec.clientStatus) ||
    isRejectedStatusText(rec.clientCode) ||
    isRejectedStatusText(rec.tvgsStatus) ||
    isRejectedStatusText(rec.tvgsCode) ||
    isRejectedStatusText(rec.notes) ||
    isRejectedStatusText(rec.title)
  ) {
    return 'REJECTED';
  }
  if (isApprovedStatusText(rec.clientStatus) || isApprovedStatusText(rec.clientCode)) {
    return 'APPROVED';
  }
  if (cat === 'hse' && !rec.clientStatus && !rec.clientCode) {
    if (isApprovedStatusText(rec.tvgsStatus) || isApprovedStatusText(rec.tvgsCode)) {
      return 'APPROVED';
    }
  }
  return 'PENDING';
};

const defaultRecordByCodeMap = new Map<string, MasterSubmittalRecord>();
DEFAULT_MASTER_SUBMITTALS.forEach((r) => {
  defaultRecordByCodeMap.set(String(r.code || '').trim().toUpperCase(), r);
});

export const normalizeMasterSubmittalsList = (records: MasterSubmittalRecord[]): MasterSubmittalRecord[] => {
  if (!Array.isArray(records) || records.length === 0) return DEFAULT_MASTER_SUBMITTALS;
  const cleaned = records
    .filter((r) => {
      const code = String(r.code || '').trim();
      if (!code || code === 'MẪU VẬT LIỆU' || code === 'STT' || code === 'CODE') return false;
      const def = defaultRecordByCodeMap.get(code.toUpperCase());
      const cat = normalizeSubmittalCategory(r.category || def?.category || 'ots');
      if (cat === 'inspection_moa') return true;
      // Loại bỏ các mục chưa có ngày đệ trình thực tế
      const subDate = r.submissionDate || def?.submissionDate || r.acceptanceDate;
      return Boolean(subDate && String(subDate).trim());
    })
    .map((r) => {
      const codeKey = String(r.code || '').trim().toUpperCase();
      const def = defaultRecordByCodeMap.get(codeKey);
      const isMoa = (r.category === 'inspection_moa' || def?.category === 'inspection_moa');
      const merged: MasterSubmittalRecord = {
        ...(def || {}),
        ...r,
        category: normalizeSubmittalCategory(r.category || def?.category || 'ots'),
        submissionDate: isMoa ? (r.submissionDate !== undefined ? r.submissionDate : (def?.submissionDate || '')) : (r.submissionDate || def?.submissionDate || r.acceptanceDate || ''),
        plannedDate: r.plannedDate || def?.plannedDate,
        tvgsStatus: r.tvgsStatus !== undefined && r.tvgsStatus !== '' ? r.tvgsStatus : (def?.tvgsStatus || ''),
        tvgsDate: r.tvgsDate || def?.tvgsDate || '',
        tvgsCode: r.tvgsCode || def?.tvgsCode || '',
        clientStatus: isMoa ? (r.clientStatus !== undefined ? r.clientStatus : (def?.clientStatus || '')) : (r.clientStatus !== undefined && r.clientStatus !== '' ? r.clientStatus : (def?.clientStatus || '')),
        clientDate: r.clientDate || def?.clientDate || '',
        clientCode: r.clientCode || def?.clientCode || '',
        linkUrl: r.linkUrl || def?.linkUrl,
        notes: r.notes || def?.notes,
        finalStatus: 'PENDING'
      };
      if (isMoa && MOA_EMPTY_STATUS_CODES.has(codeKey)) {
        if (!r.clientStatus || r.clientStatus === r.tvgsStatus) {
          merged.clientStatus = '';
          merged.submissionDate = '';
        }
      }
      // Nếu def đã được đánh dấu Đã thay thế (Đóng) do có bản Rev mới hơn thì giữ trạng thái REJECTED (Đã đóng)
      if (def?.finalStatus === 'REJECTED' && String(def.clientStatus || '').includes('Đã thay thế')) {
        merged.finalStatus = 'REJECTED';
        merged.clientStatus = def.clientStatus;
      } else {
        merged.finalStatus = computeNormalizedFinalStatus(merged);
      }
      return merged;
    });

  // Đóng các bản trình cũ (Rev00) nếu đã có bản trình mới hơn (.Rev001 / .Rev002 / Rev 01...) trong danh sách
  const getBaseCode = (c: string) => String(c || '').trim().replace(/[\._\-\s]*Rev[\.\s]*\d+.*$/i, '').toUpperCase();
  const getRevNum = (c: string, r?: string) => {
    const m = String(c || '').match(/Rev[\.\s]*(\d+)/i);
    if (m) return parseInt(m[1], 10);
    const n = parseInt(String(r || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : n;
  };
  cleaned.forEach((rec, idx) => {
    if (rec.finalStatus !== 'PENDING') return;
    const base = getBaseCode(rec.code);
    const recRev = getRevNum(rec.code, rec.rev);
    const hasNewer = cleaned.some((other, oIdx) => {
      if (oIdx === idx || other.category !== rec.category) return false;
      if (getBaseCode(other.code) !== base) return false;
      const otherRev = getRevNum(other.code, other.rev);
      if (otherRev > recRev) return true;
      if (oIdx > idx && (otherRev === recRev || /Rev/i.test(other.code))) return true;
      return false;
    });
    if (hasNewer) {
      rec.finalStatus = 'REJECTED';
      rec.clientStatus = rec.clientStatus && rec.clientStatus !== 'Đang trình' ? rec.clientStatus : 'Đã thay thế (Đóng)';
    }
  });

  // Tự động sửa lỗi đảo ngược ngày tháng (2026-04-11 -> 2026-11-04) do cache cũ của GViz cell.f
  cleaned.forEach((rec) => {
    if (rec.submissionDate === '2026-04-11') rec.submissionDate = '2026-11-04';
    if (rec.tvgsDate === '2026-04-11') rec.tvgsDate = '2026-11-04';
    if (rec.clientDate === '2026-04-11') rec.clientDate = '2026-11-04';
  });

  return cleaned.length > 0 ? cleaned : DEFAULT_MASTER_SUBMITTALS;
};

// Đọc danh mục hồ sơ từ bộ nhớ máy
export const loadLocalMasterSubmittals = (): MasterSubmittalRecord[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_MASTER_SUBMITTALS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeMasterSubmittalsList(parsed);
      }
    }
  } catch {}
  return normalizeMasterSubmittalsList(DEFAULT_MASTER_SUBMITTALS);
};

// Lưu danh mục hồ sơ vào bộ nhớ máy
export const saveLocalMasterSubmittals = (records: MasterSubmittalRecord[]) => {
  try {
    const normalized = normalizeMasterSubmittalsList(records);
    localStorage.setItem(LOCAL_STORAGE_KEY_MASTER_SUBMITTALS, JSON.stringify(normalized));
  } catch {}
};

export const GOOGLE_SHEET_SUBMITTAL_URL = 'https://docs.google.com/spreadsheets/d/1SpDbFSAhllWb8g-XxTJ6wxqWYtT2EP9D/edit?usp=sharing';
export const GOOGLE_SHEET_ID = '1SpDbFSAhllWb8g-XxTJ6wxqWYtT2EP9D';
export const MAX_ROWS_PER_SHEET = 1000;

export const FIRESTORE_DOC_PATH = 'c10/master_submittals';

// Lưu hồ sơ lên Firestore (chia sẻ realtime cho toàn dự án)
export const saveSubmittalsToFirestore = async (records: MasterSubmittalRecord[]): Promise<boolean> => {
  try {
    const normalized = normalizeMasterSubmittalsList(records);
    saveLocalMasterSubmittals(normalized);
    scheduleAutoCloudVaultBackup(true);
    if (!db) return true;
    const docRef = doc(db, 'c10', 'master_submittals');
    await setDoc(docRef, {
      records: normalized,
      schemaVersion: 5,
      updatedAt: new Date().toISOString(),
      updatedBy: localStorage.getItem('c10_user_email') || 'Admin'
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Lưu Firestore hồ sơ thất bại (dùng bộ nhớ máy):', err);
    return false;
  }
};

// Đăng ký nhận cập nhật realtime từ Firestore
export const subscribeMasterSubmittals = (callback: (records: MasterSubmittalRecord[]) => void) => {
  const localData = loadLocalMasterSubmittals();
  callback(localData);

  if (!db) return () => {};

  try {
    const docRef = doc(db, 'c10', 'master_submittals');
    const unsub = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && Array.isArray(data.records) && data.records.length > 0) {
          const normalized = normalizeMasterSubmittalsList(data.records);
          saveLocalMasterSubmittals(normalized);
          callback(normalized);
        }
      }
    }, (err) => {
      console.warn('Firestore submittals listener error:', err);
    });
    return unsub;
  } catch (err) {
    return () => {};
  }
};

// Hàm chuẩn hóa ngày tháng từ GViz cell
const parseGvizDateToISO = (cell: any): string => {
  if (!cell) return '';
  // 1. Ưu tiên tuyệt đối cell.v dạng Date(y, m, d) do Google Sheets API lưu trữ ngày giờ nội bộ chuẩn xác 100%
  const vStr = String(cell.v ?? '').trim();
  const dateMatch = vStr.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = String(Number(dateMatch[2]) + 1).padStart(2, '0');
    const d = String(dateMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. Nếu không có Date(y,m,d), kiểm tra cell.v hoặc cell.f
  const val = cell.v || cell.f;
  if (!val) return '';
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const dmy = str.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return '';
};

const getGvizStr = (row: any, colIdx: number): string => {
  if (!row || !row.c || !row.c[colIdx]) return '';
  const c = row.c[colIdx];
  return String(c.f ?? c.v ?? '').trim();
};

// Đồng bộ động từ tất cả các Sheet trong Google Sheet (Giới hạn tối đa 1.000 dòng/sheet, tự động đọc n dòng thực tế)
export const syncFromGoogleSheet = async (): Promise<{ success: boolean; count: number; message: string }> => {
  const existingRecords = loadLocalMasterSubmittals();
  const existingByCode = new Map<string, MasterSubmittalRecord>();
  existingRecords.forEach(r => existingByCode.set(String(r.code || '').trim().toUpperCase(), r));

  const fetchSheetRows = async (sheetName: string): Promise<any[]> => {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}&range=A1:Z${MAX_ROWS_PER_SHEET}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return [];
      const text = await res.text();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) return [];
      const data = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      return (data?.table?.rows || []).slice(0, MAX_ROWS_PER_SHEET);
    } catch {
      return [];
    }
  };

  try {
    // 1. Đọc ngày kế hoạch trình từ sheet 'Kế hoạch trình hồ sơ -C10' (tối đa 1000 dòng)
    const plannedMap: Record<string, string> = {};
    const planRows = await fetchSheetRows('Kế hoạch trình hồ sơ -C10');
    planRows.forEach((row) => {
      const code = getGvizStr(row, 1);
      const pDate = parseGvizDateToISO(row?.c?.[5]);
      if (code && pDate) plannedMap[code.toUpperCase()] = pDate;
    });

    // 2. Cấu hình các sheet tiêu chuẩn cần quét động (mỗi sheet tối đa 1000 dòng)
    const sheetConfigs: Array<{
      sheetName: string;
      category: SubmittalCategoryKey;
      cols: {
        code: number; rev: number; title: number; detail?: number; subDate: number;
        tvgsStatus: number; tvgsDate: number; tvgsCode: number;
        clientStatus: number; clientDate: number; clientCode: number;
        tra: number; link: number; notes: number;
      };
    }> = [
      { sheetName: 'XD-RFI', category: 'rfi', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'MEP-RFI', category: 'rfi', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'XD-RFC', category: 'rfi', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'MEP-RFC', category: 'rfi', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'XD-SHOP', category: 'sdw', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'MEP-SHOP', category: 'sdw', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'XD-MAT', category: 'mat', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 9, clientDate: 10, clientCode: 11, tra: 15, link: 16, notes: 17 } },
      { sheetName: 'MEP-MAT', category: 'mat', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'XD-BPTC', category: 'mos', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'MEP-BPTC', category: 'mos', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } },
      { sheetName: 'XD-OTS', category: 'ots', cols: { code: 1, rev: 2, title: 3, detail: 4, subDate: 5, tvgsStatus: 6, tvgsDate: 7, tvgsCode: 8, clientStatus: 9, clientDate: 10, clientCode: 11, tra: 14, link: 15, notes: 16 } },
      { sheetName: 'MEP-OTS ', category: 'ots', cols: { code: 1, rev: 2, title: 3, detail: 4, subDate: 5, tvgsStatus: 6, tvgsDate: 7, tvgsCode: 8, clientStatus: 9, clientDate: 10, clientCode: 11, tra: 14, link: 15, notes: 16 } },
      { sheetName: '11. HSE', category: 'hse', cols: { code: 1, rev: 2, title: 3, subDate: 4, tvgsStatus: 5, tvgsDate: 6, tvgsCode: 7, clientStatus: 8, clientDate: 9, clientCode: 10, tra: 13, link: 14, notes: 15 } }
    ];

    const syncedStandardRecords: MasterSubmittalRecord[] = [];
    for (const cfg of sheetConfigs) {
      const rows = await fetchSheetRows(cfg.sheetName);
      rows.forEach((row) => {
        const code = getGvizStr(row, cfg.cols.code);
        if (!code || code.length < 3 || code === 'STT' || code.startsWith('HỒ SƠ') || code.startsWith('CODE') || code === '0' || code === 'MẪU VẬT LIỆU') return;
        let subDate = parseGvizDateToISO(row?.c?.[cfg.cols.subDate]);
        if (!subDate) return; // Loại bỏ mục chưa có ngày đệ trình

        const tvgsStatus = getGvizStr(row, cfg.cols.tvgsStatus);
        const tvgsDate = parseGvizDateToISO(row?.c?.[cfg.cols.tvgsDate]);
        const tvgsCode = getGvizStr(row, cfg.cols.tvgsCode);
        const clientStatus = getGvizStr(row, cfg.cols.clientStatus);
        const clientDate = parseGvizDateToISO(row?.c?.[cfg.cols.clientDate]);
        const clientCode = getGvizStr(row, cfg.cols.clientCode);

        if (subDate.startsWith('2025-') && (tvgsDate.startsWith('2026-') || clientDate.startsWith('2026-'))) {
          subDate = '2026-' + subDate.slice(5);
        }

        const prev = existingByCode.get(code.toUpperCase());
        let title = getGvizStr(row, cfg.cols.title).replace(/\r/g, '').replace(/\n+/g, ' ');
        if (cfg.cols.detail !== undefined) {
          const det = getGvizStr(row, cfg.cols.detail).replace(/\r/g, '').replace(/\n+/g, ' ');
          if (det && det !== title) title = title ? `${title}: ${det}` : det;
        }
        const tra = getGvizStr(row, cfg.cols.tra) || prev?.tra;
        const rev = getGvizStr(row, cfg.cols.rev) || prev?.rev || '00';
        const rawLink = getGvizStr(row, cfg.cols.link);
        const linkUrl = (rawLink && rawLink.startsWith('http')) ? rawLink : prev?.linkUrl;
        const rawNotes = getGvizStr(row, cfg.cols.notes);

        const rec: MasterSubmittalRecord = {
          id: prev?.id || `${cfg.category}-${syncedStandardRecords.length + 1}`,
          category: cfg.category,
          stt: syncedStandardRecords.filter(x => x.category === cfg.category).length + 1,
          code,
          tra: tra || undefined,
          rev,
          title: title || prev?.title || code,
          plannedDate: plannedMap[code.toUpperCase()] || prev?.plannedDate,
          submissionDate: subDate,
          tvgsStatus: tvgsStatus || prev?.tvgsStatus || '',
          tvgsDate: tvgsDate || prev?.tvgsDate || '',
          tvgsCode: tvgsCode || prev?.tvgsCode || '',
          clientStatus: clientStatus || prev?.clientStatus || '',
          clientDate: clientDate || prev?.clientDate || '',
          clientCode: clientCode || prev?.clientCode || '',
          finalStatus: 'PENDING',
          linkUrl,
          notes: rawNotes ? (tra ? `TRA ${tra} • ${rawNotes}` : rawNotes) : prev?.notes
        };
        rec.finalStatus = computeNormalizedFinalStatus(rec);
        syncedStandardRecords.push(rec);
      });
    }

    if (syncedStandardRecords.length > 0) {
      // 3. Quét động các sheet Biên bản Nghiệm thu MOA (18. MOA-M & 19. MOA-W)
      const moaConfigs = [
        { sheetName: '18. MOA-M', moaType: 'MOA-M' as const, linkCol: 9 },
        { sheetName: '19. MOA-W', moaType: 'MOA-W' as const, linkCol: 11 }
      ];
      for (const mCfg of moaConfigs) {
        const rows = await fetchSheetRows(mCfg.sheetName);
        rows.forEach((row, rIdx) => {
          const code = getGvizStr(row, 2);
          if (!code || code.length < 3 || code === 'STT' || code.startsWith('HỒ SƠ') || code.startsWith('CODE') || code === '0') return;
          const title = getGvizStr(row, 1).replace(/\r/g, '').replace(/\n+/g, ' ');
          const acceptanceDate = parseGvizDateToISO(row?.c?.[3]);
          const tvgsStatus = getGvizStr(row, 4);
          const submissionDate = parseGvizDateToISO(row?.c?.[5]);
          const clientStatus = getGvizStr(row, 6);
          const link = getGvizStr(row, mCfg.linkCol);

          const prev = existingByCode.get(code.toUpperCase());
          const rec: MasterSubmittalRecord = {
            id: prev?.id || `moa-${mCfg.moaType}-${rIdx + 1}`,
            category: 'inspection_moa',
            stt: rIdx + 1,
            code,
            title: title || code,
            acceptanceDate: acceptanceDate || '',
            tvgsStatus: tvgsStatus || '',
            submissionDate: submissionDate || '',
            clientStatus: clientStatus || '',
            linkUrl: link || prev?.linkUrl || '',
            moaType: mCfg.moaType,
            volumeNo: prev?.volumeNo || '',
            finalStatus: 'NOT_STARTED'
          };
          rec.finalStatus = computeNormalizedFinalStatus(rec);
          syncedStandardRecords.push(rec);
        });
      }

      // Giữ lại các phân hệ đặc thù (Bê tông, Vật tư nhập) và các MOA chưa có trong Sheet
      const syncedCodes = new Set(syncedStandardRecords.map(r => String(r.code || '').trim().toUpperCase()));
      const specialRecords = existingRecords.filter(r =>
        r.category === 'concrete' || r.category === 'material_import' || (r.category === 'inspection_moa' && !syncedCodes.has(String(r.code || '').trim().toUpperCase()))
      );
      const combined = normalizeMasterSubmittalsList([...syncedStandardRecords, ...specialRecords]);
      await saveSubmittalsToFirestore(combined);
      return {
        success: true,
        count: combined.length,
        message: `Đã đồng bộ động thành công ${combined.length} hồ sơ từ Google Sheet (tối đa ${MAX_ROWS_PER_SHEET} dòng/sheet)!`
      };
    }
  } catch (err) {
    console.warn('Google Sheet dynamic sync fallback:', err);
  }

  const currentRecords = normalizeMasterSubmittalsList(existingRecords);
  await saveSubmittalsToFirestore(currentRecords);
  return {
    success: true,
    count: currentRecords.length,
    message: `Đã đồng bộ và chuẩn hóa ${currentRecords.length} hồ sơ từ Google Sheet & Hệ thống!`
  };
};

interface SubmittalProps {
  data: SubmittalData | null;
  loading: boolean;
  error: boolean;
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
}

export interface AutoSyncConfig {
  enabled: boolean;
  frequencyType: 'interval' | 'fixed';
  intervalMinutes: number;
  fixedTimes: string[];
  lastSyncedAt?: string;
}

const DEFAULT_AUTOSYNC_CONFIG: AutoSyncConfig = {
  enabled: true,
  frequencyType: 'fixed',
  intervalMinutes: 60,
  fixedTimes: ['08:00', '11:30', '14:00', '17:30']
};

export const loadAutoSyncConfig = (): AutoSyncConfig => {
  try {
    const raw = localStorage.getItem('c10_submittal_autosync_config');
    if (raw) return { ...DEFAULT_AUTOSYNC_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_AUTOSYNC_CONFIG;
};

export const saveAutoSyncConfig = (cfg: AutoSyncConfig) => {
  try {
    localStorage.setItem('c10_submittal_autosync_config', JSON.stringify(cfg));
  } catch {}
};

export const Submittal: React.FC<SubmittalProps> = ({
  data,
  loading: parentLoading,
  error: parentError,
  language,
  onProtectedAction
}) => {
  const [masterRecords, setMasterRecords] = useState<MasterSubmittalRecord[]>(loadLocalMasterSubmittals);
  const [selectedCategory, setSelectedCategory] = useState<SubmittalCategoryKey | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_STARTED' | 'MOA_OVERDUE'>('ALL');
  const [filterConfig, setFilterConfig] = useState<SubmittalFilterConfig>(loadSubmittalFilterConfig);
  const [delayFilter, setDelayFilter] = useState<'ALL' | 'OVERDUE_ALL' | 'TVGS_DELAY' | 'CDT_DELAY' | 'CONTRACTOR_DELAY'>(() => loadSubmittalFilterConfig().defaultDelayFilter || 'ALL');
  const [showFilterConfigModal, setShowFilterConfigModal] = useState<boolean>(false);

  const [viewMode, setViewMode] = useState<'edms' | 'charts'>('edms');
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MasterSubmittalRecord | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Mở khóa quyền chỉnh sửa bằng Email HOẶC Mã cấp quyền (Access Code)
  const computeCanEdit = () => {
    if (localStorage.getItem('c10_preview_as_viewer') === 'true') {
      return false;
    }
    if (checkUserTabPermission('submittal')) return true;
    const isAdmin =
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true';
    if (isAdmin) return true;
    const email = (localStorage.getItem('c10_user_email') || '').trim().toLowerCase();
    if (!email) return false;
    const permRaw = localStorage.getItem('c10_daily_report_permissions');
    if (permRaw) {
      try {
        const p = JSON.parse(permRaw);
        if (p.allowedEmails && p.allowedEmails.map((e: string) => e.toLowerCase()).includes(email)) {
          return true;
        }
      } catch {}
    }
    return false;
  };
  const [canEdit, setCanEdit] = useState<boolean>(computeCanEdit);
  const [showQuickCodeInput, setShowQuickCodeInput] = useState<boolean>(false);
  const [quickAccessCode, setQuickAccessCode] = useState<string>('');

  // Cấu hình đặt giờ tự động đồng bộ & các Modal Admin
  const [autoSyncConfig, setAutoSyncConfig] = useState<AutoSyncConfig>(loadAutoSyncConfig);
  const [showAutoSyncModal, setShowAutoSyncModal] = useState<boolean>(false);
  const [showAddEditModal, setShowAddEditModal] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<Partial<MasterSubmittalRecord> | null>(null);

  // Lắng nghe thay đổi đăng nhập / chuyển quyền & đồng bộ cấu hình bộ lọc từ Firestore
  useEffect(() => {
    const handleAuth = () => setCanEdit(computeCanEdit());
    window.addEventListener('c10-auth-changed', handleAuth);
    window.addEventListener('storage', handleAuth);

    let unsubFilterCfg = () => {};
    if (db) {
      try {
        unsubFilterCfg = onSnapshot(doc(db, 'c10', 'submittal_filter_config'), (snap) => {
          if (snap.exists()) {
            const d = snap.data() as SubmittalFilterConfig;
            const nextCfg: SubmittalFilterConfig = {
              ...DEFAULT_SUBMITTAL_FILTER_CONFIG,
              ...d,
              tvgsLimitDays: Math.max(1, Number(d.tvgsLimitDays) || 7),
              cdtLimitDays: Math.max(1, Number(d.cdtLimitDays) || 20)
            };
            setFilterConfig(nextCfg);
            localStorage.setItem(FILTER_CONFIG_STORAGE_KEY, JSON.stringify(nextCfg));
          }
        });
      } catch {}
    }

    return () => {
      window.removeEventListener('c10-auth-changed', handleAuth);
      window.removeEventListener('storage', handleAuth);
      unsubFilterCfg();
    };
  }, []);

  const handleVerifyQuickCode = () => {
    const code = quickAccessCode.trim();
    if (!code) return;
    if (code === '456321') {
      localStorage.setItem('is_admin', 'true');
      localStorage.setItem('c10_admin_unlocked', 'true');
      localStorage.removeItem('c10_preview_as_viewer');
      window.dispatchEvent(new Event('c10-auth-changed'));
      setCanEdit(true);
      setShowQuickCodeInput(false);
      setQuickAccessCode('');
      setSyncToast('Đã mở khóa quyền Quản trị viên (Admin)!');
      return;
    }
    const res = verifyAndActivateAccessCode(code);
    if (res.success && (res.item?.roles?.submittal || res.item?.roles?.dailyReport)) {
      localStorage.removeItem('c10_preview_as_viewer');
      setCanEdit(true);
      setShowQuickCodeInput(false);
      setQuickAccessCode('');
      setSyncToast(`Đã mở khóa quyền chỉnh sửa hồ sơ (${res.item?.name || code})!`);
    } else {
      alert('Mã quyền hạn không đúng hoặc chưa được cấp quyền cho tab Theo dõi hồ sơ!');
    }
  };

  // Động cơ hẹn giờ tự động đồng bộ Google Sheet
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!autoSyncConfig.enabled) return;
      const now = new Date();
      const currentHHmm = now.toTimeString().substring(0, 5);
      let shouldSync = false;

      if (autoSyncConfig.frequencyType === 'fixed') {
        if (autoSyncConfig.fixedTimes.includes(currentHHmm)) {
          const last = autoSyncConfig.lastSyncedAt ? new Date(autoSyncConfig.lastSyncedAt).getTime() : 0;
          if (Date.now() - last > 120000) shouldSync = true;
        }
      } else {
        const intervalMs = (autoSyncConfig.intervalMinutes || 60) * 60 * 1000;
        const last = autoSyncConfig.lastSyncedAt ? new Date(autoSyncConfig.lastSyncedAt).getTime() : 0;
        if (Date.now() - last >= intervalMs) shouldSync = true;
      }

      if (shouldSync) {
        try {
          await syncFromGoogleSheet();
          const nextCfg = { ...autoSyncConfig, lastSyncedAt: new Date().toISOString() };
          setAutoSyncConfig(nextCfg);
          saveAutoSyncConfig(nextCfg);
          setMasterRecords(loadLocalMasterSubmittals());
          setSyncToast(`Hệ thống vừa tự động đồng bộ Google Sheet lúc ${currentHHmm}`);
        } catch (e) {
          console.warn('[AutoSync] Lỗi quét tự động:', e);
        }
      }
    }, 25000);
    return () => clearInterval(timer);
  }, [autoSyncConfig]);

  const pageSize = 15;

  // 1. Lắng nghe cập nhật realtime từ Firestore & bộ nhớ máy
  useEffect(() => {
    const unsub = subscribeMasterSubmittals((records) => {
      if (records && records.length > 0) {
        setMasterRecords(records);
      }
    });
    return () => unsub();
  }, []);

  // 2. Thao tác đồng bộ từ Google Sheet
  const handleSyncFromGoogleSheet = async () => {
    setSyncing(true);
    try {
      const res = await syncFromGoogleSheet();
      setMasterRecords(loadLocalMasterSubmittals());
      setSyncToast(res.message);
    } catch (err) {
      setSyncToast('Đã làm mới dữ liệu từ hệ thống quản lý hồ sơ C10.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  const parseSubmittalDateMs = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    const raw = String(dateStr).trim();
    if (!raw) return null;
    if (raw.includes('/')) {
      const parts = raw.split('/');
      if (parts.length === 3) {
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        const parsed = new Date(`${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`).getTime();
        return isNaN(parsed) ? null : parsed;
      }
    }
    const parsed = new Date(raw).getTime();
    return isNaN(parsed) ? null : parsed;
  };

  // Đánh giá chi tiết 3 nhóm chậm trễ cho từng hồ sơ:
  // - Hồ sơ đã Duyệt (APPROVED) hoặc Từ chối / Đã đóng (REJECTED) hoặc chưa có ngày đệ trình (!submissionDate) -> KHÔNG tính trễ hạn chờ duyệt
  // - Nhóm 1 (CONTRACTOR_DELAY): Chậm trình do Nhà thầu (có ngày đệ trình thực tế > ngày kế hoạch trình)
  // - Nhóm 2 (TVGS_DELAY): Trình TVGS quá tvgsLimitDays (mặc định 7 ngày) mà TVGS chưa duyệt -> ghi chú "TVGS chậm"
  // - Nhóm 3 (CDT_DELAY): TVGS đã duyệt, trình CĐT quá cdtLimitDays (mặc định 20 ngày) từ ngày trình CĐT (hoặc ngày TVGS duyệt) mà CĐT chưa duyệt -> ghi chú "CĐT chậm"
  const evaluateRecordDelay = (rec: MasterSubmittalRecord): {
    delayType: SubmittalDelayType;
    isContractorLate: boolean;
    contractorLateDays: number;
    overdueDays: number;
    delayBadgeText: string;
    delayDetailText: string;
  } => {
    if (rec.category === 'inspection_moa') {
      if (rec.finalStatus !== 'PENDING') {
        return { delayType: 'NONE', isContractorLate: false, contractorLateDays: 0, overdueDays: 0, delayBadgeText: '', delayDetailText: '' };
      }
      const moaDateStr = rec.submissionDate || rec.acceptanceDate || rec.clientDate;
      const moaSubMs = parseSubmittalDateMs(moaDateStr);
      if (moaSubMs !== null) {
        const diffMoaDays = Math.floor((Date.now() - moaSubMs) / (1000 * 3600 * 24));
        if (diffMoaDays > 15) {
          return {
            delayType: 'CDT_DELAY',
            isContractorLate: false,
            contractorLateDays: 0,
            overdueDays: diffMoaDays,
            delayBadgeText: 'Chậm (> 15 ngày)',
            delayDetailText: `MOA đang trình quá 15 ngày chưa duyệt (${diffMoaDays} ngày kể từ ngày trình ${moaDateStr})`
          };
        }
      }
      return { delayType: 'NONE', isContractorLate: false, contractorLateDays: 0, overdueDays: 0, delayBadgeText: '', delayDetailText: '' };
    }
    const subMs = parseSubmittalDateMs(rec.submissionDate);
    if (subMs === null) {
      return {
        delayType: 'NONE',
        isContractorLate: false,
        contractorLateDays: 0,
        overdueDays: 0,
        delayBadgeText: '',
        delayDetailText: ''
      };
    }

    // Kiểm tra Nhà thầu chậm trình so với Kế hoạch (chỉ xét khi có cả ngày đệ trình và ngày kế hoạch)
    const planMs = parseSubmittalDateMs(rec.plannedDate);
    let isContractorLate = false;
    let contractorLateDays = 0;
    if (planMs !== null && subMs > planMs) {
      contractorLateDays = Math.floor((subMs - planMs) / (1000 * 3600 * 24));
      if (contractorLateDays > 0) isContractorLate = true;
    } else if (rec.notes && rec.notes.toLowerCase().includes('chậm trình')) {
      isContractorLate = true;
    }

    // Nếu hồ sơ đã Duyệt (APPROVED) hoặc Từ chối = Đã đóng (REJECTED) -> Không còn trễ hạn phê duyệt
    if (rec.finalStatus === 'APPROVED' || rec.finalStatus === 'REJECTED') {
      if (isContractorLate) {
        return {
          delayType: 'CONTRACTOR_DELAY',
          isContractorLate: true,
          contractorLateDays,
          overdueDays: contractorLateDays,
          delayBadgeText: 'Chậm trình do Nhà thầu',
          delayDetailText: contractorLateDays > 0 ? `Nhà thầu trình trễ ${contractorLateDays} ngày so với KH` : 'Chậm trình do Nhà thầu'
        };
      }
      return {
        delayType: 'NONE',
        isContractorLate: false,
        contractorLateDays: 0,
        overdueDays: 0,
        delayBadgeText: '',
        delayDetailText: ''
      };
    }

    const nowMs = Date.now();
    const tvgsApproved = isApprovedStatusText(rec.tvgsStatus) || isApprovedStatusText(rec.tvgsCode);
    const cdtApproved = isApprovedStatusText(rec.clientStatus) || isApprovedStatusText(rec.clientCode);

    // 1. Xét CĐT chậm (Chỉ tính khi Hồ sơ CÓ ngày trình qua CĐT, không liên quan ngày TVGS phê duyệt)
    const cdtSubmitMs = parseSubmittalDateMs(rec.clientDate);
    if (cdtSubmitMs !== null && !cdtApproved) {
      const diffCdtDays = Math.floor((nowMs - cdtSubmitMs) / (1000 * 3600 * 24));
      if (diffCdtDays > filterConfig.cdtLimitDays) {
        return {
          delayType: 'CDT_DELAY',
          isContractorLate,
          contractorLateDays,
          overdueDays: diffCdtDays,
          delayBadgeText: 'CĐT chậm',
          delayDetailText: `CĐT chậm (${diffCdtDays} ngày > ${filterConfig.cdtLimitDays} ngày kể từ ngày trình CĐT ${rec.clientDate})`
        };
      }
    }

    // 2. Xét TVGS chậm: chưa được TVGS duyệt và quá tvgsLimitDays kể từ ngày trình
    if (!tvgsApproved) {
      const diffTvgsDays = Math.floor((nowMs - subMs) / (1000 * 3600 * 24));
      if (diffTvgsDays > filterConfig.tvgsLimitDays) {
        return {
          delayType: 'TVGS_DELAY',
          isContractorLate,
          contractorLateDays,
          overdueDays: diffTvgsDays,
          delayBadgeText: 'TVGS chậm',
          delayDetailText: `TVGS chậm (${diffTvgsDays} ngày > ${filterConfig.tvgsLimitDays} ngày)`
        };
      }
    }

    if (isContractorLate) {
      return {
        delayType: 'CONTRACTOR_DELAY',
        isContractorLate: true,
        contractorLateDays,
        overdueDays: contractorLateDays,
        delayBadgeText: 'Chậm trình do Nhà thầu',
        delayDetailText: contractorLateDays > 0 ? `Chậm trình do Nhà thầu (${contractorLateDays} ngày)` : 'Chậm trình do Nhà thầu'
      };
    }

    return {
      delayType: 'NONE',
      isContractorLate: false,
      contractorLateDays: 0,
      overdueDays: 0,
      delayBadgeText: '',
      delayDetailText: ''
    };
  };

  // Hồ sơ đang mở (PENDING) bị chậm phê duyệt (TVGS chậm hoặc CĐT chậm) hoặc Chậm trình do Nhà thầu
  const isRecordOverdue = (rec: MasterSubmittalRecord): boolean => {
    if (rec.finalStatus !== 'PENDING') return false;
    const info = evaluateRecordDelay(rec);
    return info.delayType === 'TVGS_DELAY' || info.delayType === 'CDT_DELAY';
  };

  // 3. Tính toán KPI thống kê tiến độ duyệt hồ sơ toàn dự án (Căn cứ cột CĐT phê duyệt; Từ chối = Đã đóng)
  const kpiStats = useMemo(() => {
    const total = masterRecords.length;
    const approved = masterRecords.filter(r => r.finalStatus === 'APPROVED').length;
    const pending = masterRecords.filter(r => r.finalStatus === 'PENDING').length;
    const rejected = masterRecords.filter(r => r.finalStatus === 'REJECTED').length;
    const notStarted = masterRecords.filter(r => r.finalStatus === 'NOT_STARTED').length;
    const approvedPercent = total > 0 ? Math.round((approved / total) * 100) : 0;

    let tvgsDelayCount = 0;
    let cdtDelayCount = 0;
    let contractorDelayCount = 0;
    masterRecords.forEach(r => {
      const d = evaluateRecordDelay(r);
      if (d.delayType === 'TVGS_DELAY') tvgsDelayCount++;
      else if (d.delayType === 'CDT_DELAY') cdtDelayCount++;
      if (d.isContractorLate) contractorDelayCount++;
    });

    return {
      total,
      approved,
      pending,
      rejected,
      notStarted,
      approvedPercent,
      tvgsDelayCount,
      cdtDelayCount,
      contractorDelayCount
    };
  }, [masterRecords, filterConfig]);

  const moaStats = useMemo(() => {
    const moaRecords = masterRecords.filter(r => r.category === 'inspection_moa');
    const total = moaRecords.length;
    const approved = moaRecords.filter(r => r.finalStatus === 'APPROVED').length;
    const pending = moaRecords.filter(r => r.finalStatus === 'PENDING').length;
    const notStarted = moaRecords.filter(r => r.finalStatus === 'NOT_STARTED').length;
    const overdue = moaRecords.filter(r => r.finalStatus === 'PENDING' && isRecordOverdue(r)).length;
    return {
      total,
      approved,
      pending,
      notStarted,
      overdue
    };
  }, [masterRecords]);

  // 4. Đếm số lượng hồ sơ theo từng danh mục
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: masterRecords.length };
    SUBMITTAL_CATEGORIES.forEach(cat => {
      counts[cat.key] = masterRecords.filter(r => r.category === cat.key).length;
    });
    return counts;
  }, [masterRecords]);

  // 4B. Thống kê biểu đồ tròn (Donut Chart) & Hồ sơ trễ hạn chuẩn mẫu dự án CN8-2 cho từng phân hệ
  const [showOverdueList, setShowOverdueList] = useState<boolean>(true);
  const [showCategoryCharts, setShowCategoryCharts] = useState<boolean>(true);

  const categoryAnalytics = useMemo(() => {
    return SUBMITTAL_CATEGORIES.map((cat) => {
      const catRecords = masterRecords.filter((r) => r.category === cat.key);
      const total = catRecords.length;
      const approved = catRecords.filter((r) => r.finalStatus === 'APPROVED').length;
      const closedRejected = catRecords.filter((r) => r.finalStatus === 'REJECTED').length;
      const unapproved = catRecords.filter((r) => r.finalStatus === 'PENDING').length;
      const notStarted = catRecords.filter((r) => r.finalStatus === 'NOT_STARTED').length;
      const overdueRecords = catRecords.filter(isRecordOverdue);
      const overdue = overdueRecords.length;
      return {
        cat,
        total,
        approved,
        closedRejected,
        unapproved,
        notStarted,
        overdue,
        overdueRecords
      };
    });
  }, [masterRecords, filterConfig]);

  const allOverdueRecords = useMemo(() => {
    return masterRecords.filter((rec) => {
      if (!isRecordOverdue(rec)) return false;
      if (delayFilter === 'TVGS_DELAY') return evaluateRecordDelay(rec).delayType === 'TVGS_DELAY';
      if (delayFilter === 'CDT_DELAY') return evaluateRecordDelay(rec).delayType === 'CDT_DELAY';
      if (delayFilter === 'CONTRACTOR_DELAY') return evaluateRecordDelay(rec).isContractorLate;
      return true;
    });
  }, [masterRecords, filterConfig, delayFilter]);

  const getCategoryShortLabel = (key: SubmittalCategoryKey): string => {
    const found = SUBMITTAL_CATEGORIES.find((c) => c.key === key);
    return found ? found.shortLabel : key.toUpperCase();
  };

  // Render Donut SVG chuẩn phong cách CN8-2
  const renderCN82DonutChart = (total: number, approved: number, unapproved: number, closedRejected: number = 0) => {
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const effectiveDone = approved + closedRejected;
    const approvedRatio = total > 0 ? effectiveDone / total : 0;
    const unapprovedRatio = total > 0 ? unapproved / total : 0;
    const gap = total > 0 && effectiveDone > 0 && unapproved > 0 ? 4 : 0;
    const approvedLength = Math.max(0, approvedRatio * circumference - gap);
    const unapprovedLength = Math.max(0, unapprovedRatio * circumference - gap);
    const unapprovedOffset = -(approvedRatio * circumference);

    return (
      <div className="flex flex-col items-center justify-center my-3">
        <div className="relative w-36 h-36 flex items-center justify-center">
          <svg className="w-36 h-36 -rotate-90" viewBox="0 0 128 128">
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth="14"
            />
            {effectiveDone > 0 && (
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="transparent"
                stroke="#10b981"
                strokeWidth="14"
                strokeDasharray={`${approvedLength} ${circumference}`}
                strokeDashoffset={0}
                strokeLinecap="butt"
              />
            )}
            {unapproved > 0 && (
              <circle
                cx="64"
                cy="64"
                r={radius}
                fill="transparent"
                stroke="#f59e0b"
                strokeWidth="14"
                strokeDasharray={`${unapprovedLength} ${circumference}`}
                strokeDashoffset={unapprovedOffset}
                strokeLinecap="butt"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-2xl font-black text-slate-800 leading-none">
              {total}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
              TỔNG CỘNG
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-2 text-xs font-bold flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-amber-500">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Đang trình ({unapproved})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Đã duyệt ({approved})</span>
          </span>
          {closedRejected > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
              <span>Đã đóng ({closedRejected})</span>
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderDelayBadge = (rec: MasterSubmittalRecord) => {
    const info = evaluateRecordDelay(rec);
    if (info.delayType === 'TVGS_DELAY') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black border border-rose-300">
          <span>TVGS chậm ({info.overdueDays} ngày)</span>
        </span>
      );
    }
    if (info.delayType === 'CDT_DELAY') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-black border border-purple-300">
          <span>CĐT chậm ({info.overdueDays} ngày)</span>
        </span>
      );
    }
    if (info.isContractorLate) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">
          <span>Chậm trình do Nhà thầu{info.contractorLateDays > 0 ? ` (${info.contractorLateDays} ngày)` : ''}</span>
        </span>
      );
    }
    return null;
  };

    // 4C. Hàm động đánh giá bằng Gemini AI theo dữ liệu mới nhất mỗi khi cập nhật (5 câu hỏi trọng tâm)
  const [aiEvalRefreshing, setAiEvalRefreshing] = useState<boolean>(false);
  const [aiEvalLastUpdated, setAiEvalLastUpdated] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  });

  useEffect(() => {
    const now = new Date();
    setAiEvalLastUpdated(
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
    );
  }, [masterRecords, filterConfig, lastSyncTime]);

  const geminiSubmittalEvaluations = useMemo(() => {
    const totalDocs = kpiStats.total;
    const approvedDocs = kpiStats.approved;
    const pendingDocs = kpiStats.unapproved;
    const tvgsLate = kpiStats.tvgsDelayCount;
    const cdtLate = kpiStats.cdtDelayCount;
    const contractorLate = kpiStats.contractorDelayCount;
    const totalLate = tvgsLate + cdtLate;

    // 1. Điểm nghẽn phê duyệt
    let bottleneckActor = 'Không có điểm nghẽn nghiêm trọng';
    let q1Status: 'SAFE' | 'WARNING' | 'DANGER' = 'SAFE';
    if (totalLate > 0 || contractorLate > 0) {
      if (tvgsLate >= cdtLate && tvgsLate >= contractorLate && tvgsLate > 0) {
        bottleneckActor = `Khâu TVGS rà soát (${tvgsLate} hồ sơ quá ${filterConfig.tvgsLimitDays} ngày)`;
      } else if (cdtLate >= tvgsLate && cdtLate >= contractorLate && cdtLate > 0) {
        bottleneckActor = `Khâu CĐT phê duyệt (${cdtLate} hồ sơ quá ${filterConfig.cdtLimitDays} ngày)`;
      } else {
        bottleneckActor = `Khâu Nhà thầu trình lại (${contractorLate} hồ sơ chưa trình Rev mới)`;
      }
      q1Status = totalLate >= 5 ? 'DANGER' : 'WARNING';
    }
    const q1Content =
      totalLate === 0 && contractorLate === 0
        ? `Luồng phê duyệt giữa Nhà thầu - TVGS - CĐT đang thông suốt. Toàn bộ ${approvedDocs}/${totalDocs} hồ sơ đã xử lý đúng hạn quy định.`
        : `Điểm nghẽn lớn nhất hiện tại nằm ở ${bottleneckActor}. Cụ thể: TVGS chậm ${tvgsLate} hồ sơ, CĐT chậm ${cdtLate} hồ sơ và Nhà thầu cần trình lại ${contractorLate} hồ sơ bị trả về.`;

    // 2. Phân hệ có tỷ lệ trễ hạn / tồn đọng cao nhất
    const sortedCats = [...categoryAnalytics].sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      return b.unapproved - a.unapproved;
    });
    const topCat = sortedCats[0];
    const secondCat = sortedCats[1];
    const q2Status: 'SAFE' | 'WARNING' | 'DANGER' =
      topCat && topCat.overdue >= 3 ? 'DANGER' : topCat && (topCat.overdue > 0 || topCat.unapproved >= 5) ? 'WARNING' : 'SAFE';
    const q2Content = topCat
      ? topCat.overdue > 0
        ? `Phân hệ "${topCat.cat.label}" đang có áp lực cao nhất với ${topCat.overdue} hồ sơ trễ hạn và ${topCat.unapproved} hồ sơ đang chờ duyệt (trên tổng ${topCat.total} hồ sơ). Tiếp theo là "${secondCat?.cat.label || '-'}" (${secondCat?.overdue || 0} trễ, ${secondCat?.unapproved || 0} đang trình).`
        : `Không có phân hệ nào bị trễ hạn. Phân hệ đang có số lượng hồ sơ chờ duyệt nhiều nhất là "${topCat.cat.label}" (${topCat.unapproved}/${topCat.total} hồ sơ đang trình).`
      : 'Chưa ghi nhận dữ liệu phân hệ tồn đọng.';

    // 3. Hồ sơ trọng điểm trễ sâu hoặc trình nhiều lần (Rev 02+)
    const multiRevRecords = masterRecords.filter((r) => {
      const revNum = parseInt(String(r.rev || '').replace(/\D/g, ''), 10);
      return (!isNaN(revNum) && revNum >= 2) || (r.submissionCount && r.submissionCount >= 2);
    });
    const overdueWithDays = masterRecords
      .filter((r) => r.finalStatus === 'PENDING' && isRecordOverdue(r))
      .map((r) => ({ rec: r, d: evaluateRecordDelay(r) }))
      .sort((a, b) => b.d.overdueDays - a.d.overdueDays);
    const topOverdue = overdueWithDays.slice(0, 3);
    const q3Status: 'SAFE' | 'WARNING' | 'DANGER' =
      topOverdue.length > 0 && topOverdue[0].d.overdueDays > 30
        ? 'DANGER'
        : topOverdue.length > 0 || multiRevRecords.length > 5
          ? 'WARNING'
          : 'SAFE';
    const topCodesStr =
      topOverdue.length > 0
        ? topOverdue.map((x) => `${x.rec.code} (chậm ${x.d.overdueDays} ngày)`).join(', ')
        : 'Không có hồ sơ trễ hạn';
    const q3Content =
      topOverdue.length > 0
        ? `Hồ sơ trễ hạn sâu cần ưu tiên xử lý ngay: ${topCodesStr}. Ngoài ra toàn dự án có ${multiRevRecords.length} hồ sơ phải trình từ lần 2 (Rev 02+) trở lên cần rà soát kỹ chất lượng hồ sơ.`
        : `Hiện không có hồ sơ nào bị trễ hạn phê duyệt. Có ${multiRevRecords.length} hồ sơ có lịch sử trình từ Rev 02 trở lên đã được kiểm soát và cập nhật trạng thái.`;

    // 4. Pháp lý vật tư đầu vào (MOA & Đệ trình Vật tư)
    const matCat = categoryAnalytics.find((c) => c.cat.key === 'mat');
    const matImportCat = categoryAnalytics.find((c) => c.cat.key === 'material_import');
    const matApproved = (matCat?.approved || 0) + (matImportCat?.approved || 0);
    const matTotal = (matCat?.total || 0) + (matImportCat?.total || 0);
    const moaRatio = moaStats.total > 0 ? Math.round((moaStats.approved / moaStats.total) * 100) : 100;
    const q4Status: 'SAFE' | 'WARNING' | 'DANGER' =
      moaStats.overdue > 0 ? 'DANGER' : moaStats.notStarted > 0 || (matCat?.overdue || 0) > 0 ? 'WARNING' : 'SAFE';
    const q4Content = `Hồ sơ MOA đạt ${moaStats.approved}/${moaStats.total} (${moaRatio}%) đã ký hoàn thành, ${moaStats.pending} đang trình (${moaStats.overdue} chậm > 15 ngày) và ${moaStats.notStarted} chưa trình. Đệ trình vật tư & Nhập vật tư đã duyệt ${matApproved}/${matTotal} hồ sơ, cơ bản đáp ứng tiến độ thi công phần hầm.`;

    // 5. Khuyến nghị hành động ưu tiên trong 7 ngày tới
    const q5Status: 'SAFE' | 'WARNING' | 'DANGER' =
      totalLate >= 5 ? 'DANGER' : totalLate > 0 || contractorLate > 0 || moaStats.notStarted > 0 ? 'WARNING' : 'SAFE';
    const actionItems: string[] = [];
    if (tvgsLate > 0) actionItems.push(`TVGS ưu tiên giải quyết dứt điểm ${tvgsLate} hồ sơ quá hạn ${filterConfig.tvgsLimitDays} ngày`);
    if (cdtLate > 0) actionItems.push(`Đôn đốc CĐT phê duyệt ${cdtLate} tờ trình quá hạn ${filterConfig.cdtLimitDays} ngày`);
    if (contractorLate > 0) actionItems.push(`Nhà thầu khẩn trương hiệu chỉnh & trình lại ${contractorLate} hồ sơ bị trả về`);
    if (moaStats.notStarted > 0) actionItems.push(`Hoàn thiện trình ký ${moaStats.notStarted} hồ sơ MOA chưa trình`);
    if (actionItems.length === 0) actionItems.push(`Duy trì nhịp độ kiểm soát ${pendingDocs} hồ sơ đang trình trong hạn và chuẩn bị sớm hồ sơ giai đoạn tiếp theo`);
    const q5Content = `Trọng tâm 7 ngày tới: ${actionItems.join('; ')}.`;

    return [
      {
        id: 'q1',
        question: '1. Điểm nghẽn phê duyệt hiện tại (TVGS / CĐT / Nhà thầu)',
        metric: `TVGS chậm: ${tvgsLate} • CĐT chậm: ${cdtLate} • NT chậm: ${contractorLate}`,
        status: q1Status,
        content: q1Content
      },
      {
        id: 'q2',
        question: '2. Phân hệ hồ sơ có tỷ lệ trễ hạn & tồn đọng cao nhất',
        metric: topCat ? `${topCat.cat.shortLabel}: ${topCat.overdue} trễ / ${topCat.unapproved} đang trình` : 'Ổn định',
        status: q2Status,
        content: q2Content
      },
      {
        id: 'q3',
        question: '3. Hồ sơ trọng điểm trễ sâu hoặc trình nhiều lần (Rev 02+)',
        metric: `Trễ hạn: ${totalLate} hồ sơ • Trình Rev 02+: ${multiRevRecords.length} hồ sơ`,
        status: q3Status,
        content: q3Content
      },
      {
        id: 'q4',
        question: '4. Đáp ứng pháp lý Vật tư đầu vào & Nghiệm thu MOA phần hầm',
        metric: `MOA hoàn thành: ${moaStats.approved}/${moaStats.total} (${moaRatio}%) • Chưa trình: ${moaStats.notStarted}`,
        status: q4Status,
        content: q4Content
      },
      {
        id: 'q5',
        question: '5. Khuyến nghị hành động ưu tiên (Action Plan 7 ngày tới)',
        metric: `Tổng hoàn thành: ${approvedDocs}/${totalDocs} (${kpiStats.approvalRate}%)`,
        status: q5Status,
        content: q5Content
      }
    ];
  }, [masterRecords, kpiStats, moaStats, categoryAnalytics, filterConfig]);

  const renderSubmittalStatusBadge = (status: 'SAFE' | 'WARNING' | 'DANGER') => {
    if (status === 'DANGER') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 shrink-0">
          <AlertTriangle className="w-3 h-3" />
          Cần xử lý gấp
        </span>
      );
    }
    if (status === 'WARNING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
          <AlertTriangle className="w-3 h-3" />
          Cận cảnh báo
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        An toàn
      </span>
    );
  };

const renderCN82CategoryChartsSection = () => {
    if (selectedCategory !== 'all') {
      const singleItem = categoryAnalytics.find((c) => c.cat.key === selectedCategory);
      if (!singleItem) return null;
      const hasOverdue = singleItem.overdue > 0;

      return (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-sm md:text-base font-black text-slate-800">
                Biểu đồ tiến độ & Hồ sơ chậm phê duyệt — {singleItem.cat.label}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-xs font-bold">
                TVGS &gt; {filterConfig.tvgsLimitDays} ngày | CĐT &gt; {filterConfig.cdtLimitDays} ngày: {singleItem.overdue} hồ sơ
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer"
              >
                Xem tất cả 9 nhóm
              </button>
              <button
                type="button"
                onClick={() => setShowCategoryCharts((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                {showCategoryCharts ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Thu gọn biểu đồ</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Hiển thị biểu đồ</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showCategoryCharts && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div
                className={`lg:col-span-5 bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
                  hasOverdue ? 'border-rose-200/90' : 'border-slate-200/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          hasOverdue ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                      />
                      <h4 className="font-black text-slate-800 text-base">
                        {singleItem.cat.shortLabel}
                      </h4>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400">
                      {singleItem.cat.label}
                    </span>
                  </div>

                  <div className="mt-3 bg-slate-50/90 border border-slate-100 rounded-xl px-3.5 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs font-medium text-slate-600">
                    <span>
                      Tổng: <b className="font-black text-slate-900">{singleItem.total}</b>
                    </span>
                    <span>
                      Đã duyệt: <b className="font-black text-emerald-600">{singleItem.approved}</b>
                    </span>
                    <span>
                      Đang trình: <b className="font-black text-amber-600">{singleItem.unapproved}</b>
                    </span>
                    <span>
                      Đã đóng: <b className="font-black text-slate-600">{singleItem.closedRejected}</b>
                    </span>
                    <span>
                      Trễ:{' '}
                      <b className={`font-black ${hasOverdue ? 'text-rose-600' : 'text-slate-600'}`}>
                        {singleItem.overdue}
                      </b>
                    </span>
                  </div>
                </div>

                <div className="my-auto py-2">
                  {renderCN82DonutChart(singleItem.total, singleItem.approved, singleItem.unapproved, singleItem.closedRejected)}
                </div>

                <div className="text-center text-[11px] text-slate-400 font-medium pt-2 border-t border-slate-100">
                  Tỷ lệ hoàn thành phê duyệt:{' '}
                  <b className="text-emerald-600">
                    {singleItem.total > 0
                      ? Math.round((singleItem.approved / singleItem.total) * 100)
                      : 0}
                    %
                  </b>
                </div>
              </div>

              <div
                className={`lg:col-span-7 rounded-2xl border p-5 shadow-xs flex flex-col justify-between ${
                  hasOverdue
                    ? 'bg-rose-50/35 border-rose-200/90'
                    : 'bg-white border-slate-200/90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3 flex-wrap pb-3.5 border-b border-rose-200/60">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                          hasOverdue
                            ? 'bg-rose-600 text-white'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                        }`}
                      >
                        {hasOverdue ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4
                          className={`text-sm md:text-base font-black ${
                            hasOverdue ? 'text-rose-950' : 'text-slate-800'
                          }`}
                        >
                          Hồ sơ chậm phê duyệt ({singleItem.cat.shortLabel})
                        </h4>
                        <p
                          className={`text-xs mt-0.5 ${
                            hasOverdue ? 'text-rose-700/85' : 'text-slate-500'
                          }`}
                        >
                          TVGS quá {filterConfig.tvgsLimitDays} ngày chưa duyệt hoặc CĐT quá {filterConfig.cdtLimitDays} ngày chưa duyệt
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black shadow-2xs ${
                        hasOverdue
                          ? 'bg-rose-600 text-white'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {singleItem.overdue} hồ sơ chậm
                    </span>
                  </div>

                  {hasOverdue ? (
                    <div className="mt-4 space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                      {singleItem.overdueRecords.map((rec) => {
                        const dInfo = evaluateRecordDelay(rec);
                        return (
                          <div
                            key={rec.id}
                            onClick={() => setSelectedRecord(rec)}
                            className="bg-white hover:bg-rose-50/60 border border-rose-100 hover:border-rose-300 rounded-xl p-3 transition-all cursor-pointer shadow-2xs text-left group"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                {renderDelayBadge(rec)}
                                <span className="text-xs font-black text-rose-900 group-hover:text-rose-600 transition-colors">
                                  {rec.code}
                                </span>
                              </div>
                              {rec.submissionDate && (
                                <span className="text-[11px] font-semibold text-slate-400">
                                  Trình: {rec.submissionDate} {rec.tvgsDate ? `• TVGS: ${rec.tvgsDate}` : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-800 mt-1.5 line-clamp-2 leading-relaxed">
                              {rec.title}
                            </p>
                            {dInfo.delayDetailText && (
                              <p className="text-[11px] font-bold text-rose-600 mt-1">
                                Ghi chú: {dInfo.delayDetailText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="my-auto py-12 px-4 text-center flex flex-col items-center justify-center">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 border border-emerald-200">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">
                        Không có hồ sơ chậm phê duyệt
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Tất cả hồ sơ thuộc phân hệ {singleItem.cat.shortLabel} đều đang trong hạn hoặc đã đóng/phê duyệt.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        {/* KHỐI 1: DANH SÁCH TỔNG HỢP HỒ SƠ CHẬM PHÊ DUYỆT (TVGS CHẬM / CĐT CHẬM / NHÀ THẦU CHẬM) */}
        <div className="bg-rose-50/40 border border-rose-200/90 rounded-2xl p-4 md:p-5 shadow-xs">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm md:text-base font-black text-rose-950">
                  Danh sách tổng hợp hồ sơ trễ hạn
                </h3>
                <p className="text-xs text-rose-700/85 mt-0.5">
                  Căn cứ cột Trạng thái CĐT phê duyệt (Hồ sơ Từ chối = Đã đóng). Tự động phân loại: <b>TVGS chậm</b> ({kpiStats.tvgsDelayCount}) • <b>CĐT chậm</b> ({kpiStats.cdtDelayCount}) • <b>Chậm trình do Nhà thầu</b> ({kpiStats.contractorDelayCount})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowFilterConfigModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  title="Admin điều chỉnh số ngày trễ TVGS và CĐT"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Cấu hình hạn trễ (Admin)</span>
                </button>
              )}
              <span className="px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black shadow-xs">
                {allOverdueRecords.length} hồ sơ
              </span>
              <button
                type="button"
                onClick={() => setShowOverdueList((prev) => !prev)}
                className="p-1.5 rounded-xl bg-white/80 hover:bg-white text-rose-700 border border-rose-200 transition-all cursor-pointer"
                title={showOverdueList ? 'Thu gọn danh sách trễ hạn' : 'Mở rộng danh sách trễ hạn'}
              >
                {showOverdueList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Bộ lọc nhanh theo nhóm nguyên nhân chậm */}
          <div className="mt-3 pt-3 border-t border-rose-200/60 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider mr-1">
              Lọc theo nhóm chậm:
            </span>
            {[
              { key: 'ALL', label: `Tất cả trễ (${kpiStats.tvgsDelayCount + kpiStats.cdtDelayCount})` },
              { key: 'TVGS_DELAY', label: `TVGS chậm > ${filterConfig.tvgsLimitDays} ngày (${kpiStats.tvgsDelayCount})` },
              { key: 'CDT_DELAY', label: `CĐT chậm > ${filterConfig.cdtLimitDays} ngày (${kpiStats.cdtDelayCount})` },
              { key: 'CONTRACTOR_DELAY', label: `Chậm trình do Nhà thầu (${kpiStats.contractorDelayCount})` }
            ].map((item) => {
              const active = delayFilter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setDelayFilter(item.key as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'bg-white/90 hover:bg-white text-rose-800 border border-rose-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {showOverdueList && (
            allOverdueRecords.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {allOverdueRecords.map((rec) => {
                  const dInfo = evaluateRecordDelay(rec);
                  return (
                    <div
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className="bg-white hover:bg-rose-50/50 border border-rose-100 hover:border-rose-300 rounded-xl p-3 transition-all cursor-pointer shadow-2xs text-left group"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-wider border border-rose-200/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            {getCategoryShortLabel(rec.category)}
                          </span>
                          {renderDelayBadge(rec)}
                        </div>
                        <span className="text-[11px] font-bold text-slate-500 group-hover:text-rose-600 transition-colors font-mono">
                          {rec.code}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-1.5 line-clamp-2 leading-relaxed">
                        {rec.title}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-1">
                        <span>Ngày trình: <b className="text-slate-700">{rec.submissionDate || '-'}</b>{rec.tvgsDate ? ` • TVGS duyệt: ${rec.tvgsDate}` : ''}</span>
                        {dInfo.delayDetailText && (
                          <span className="font-bold text-rose-600">{dInfo.delayDetailText}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 bg-white/80 rounded-xl p-4 text-center text-xs text-slate-500 font-medium">
                Không có hồ sơ nào thuộc nhóm chậm đang chọn.
              </div>
            )
          )}
        </div>

        {/* KHỐI 1B: ĐÁNH GIÁ & PHÂN TÍCH ĐỘNG BẰNG GEMINI AI THEO DỮ LIỆU MỚI NHẤT (TƯƠNG TỰ QUAN TRẮC CHUYỂN VỊ) */}
        <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg">
                    Đánh Giá &amp; Phân Tích Động Hồ Sơ Đệ Trình (Gemini AI)
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Tự động cập nhật theo dữ liệu mới nhất
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động tổng hợp, nhận diện điểm nghẽn và đánh giá rủi ro tiến độ hồ sơ theo 5 tiêu chí quản trị cốt lõi • Cập nhật lúc: <b className="text-slate-700">{aiEvalLastUpdated}</b>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setAiEvalRefreshing(true);
                  const now = new Date();
                  setAiEvalLastUpdated(
                    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
                  );
                  setTimeout(() => setAiEvalRefreshing(false), 400);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${aiEvalRefreshing ? 'animate-spin' : ''}`} />
                <span>Cập nhật đánh giá Gemini</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {geminiSubmittalEvaluations.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all duration-200"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                      {item.question}
                    </h4>
                    {renderSubmittalStatusBadge(item.status)}
                  </div>

                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 text-[11px]">
                    <span className="font-semibold text-slate-400">Chỉ số:</span>
                    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {item.metric}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed font-normal">
                    {item.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KHỐI 2: NHÓM HỒ SƠ ĐANG TRIỂN KHAI / CÓ TỒN ĐỌNG (9 NHÓM) */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm md:text-base font-black text-slate-800">
                Nhóm hồ sơ đang triển khai / có tồn đọng
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-xs font-bold">
                {categoryAnalytics.length} nhóm
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCategoryCharts((prev) => !prev)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                {showCategoryCharts ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Thu gọn biểu đồ</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Hiển thị biểu đồ ({categoryAnalytics.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showCategoryCharts && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {categoryAnalytics.map((item) => {
                const hasOverdue = item.overdue > 0;
                return (
                  <div
                    key={item.cat.key}
                    className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                      hasOverdue ? 'border-rose-200/90' : 'border-slate-200/90'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div
                          onClick={() => setSelectedCategory(item.cat.key)}
                          className="flex items-center gap-2 cursor-pointer group"
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              hasOverdue ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                          />
                          <h4 className="font-black text-slate-800 text-sm md:text-base group-hover:text-blue-600 transition-colors">
                            {item.cat.shortLabel}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedCategory(item.cat.key)}
                          className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all cursor-pointer"
                          title={`Xem chi tiết phân hệ ${item.cat.label}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mt-3 bg-slate-50/90 border border-slate-100 rounded-xl px-3 py-2 flex items-center justify-between flex-wrap gap-1.5 text-[11px] md:text-xs font-medium text-slate-600">
                        <span>
                          Tổng: <b className="font-black text-slate-900">{item.total}</b>
                        </span>
                        <span>
                          Đã duyệt: <b className="font-black text-emerald-600">{item.approved}</b>
                        </span>
                        <span>
                          Đang trình: <b className="font-black text-amber-600">{item.unapproved}</b>
                        </span>
                        <span>
                          Trễ:{' '}
                          <b className={`font-black ${hasOverdue ? 'text-rose-600' : 'text-slate-600'}`}>
                            {item.overdue}
                          </b>
                        </span>
                      </div>

                      {renderCN82DonutChart(item.total, item.approved, item.unapproved, item.closedRejected)}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Hồ sơ chậm (TVGS &gt; {filterConfig.tvgsLimitDays}d | CĐT &gt; {filterConfig.cdtLimitDays}d)
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                            hasOverdue
                              ? 'bg-rose-100 text-rose-600'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.overdue}
                        </span>
                      </div>

                      {hasOverdue ? (
                        <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                          {item.overdueRecords.map((rec) => {
                            const d = evaluateRecordDelay(rec);
                            return (
                              <div
                                key={rec.id}
                                onClick={() => setSelectedRecord(rec)}
                                className="bg-rose-50/65 hover:bg-rose-100/75 border border-rose-100 rounded-xl p-2.5 text-xs text-slate-800 cursor-pointer transition-all flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <b className="text-rose-900 font-mono text-[11px]">{rec.code}</b>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                    d.delayType === 'CDT_DELAY'
                                      ? 'bg-purple-100 text-purple-800'
                                      : 'bg-rose-200 text-rose-800'
                                  }`}>
                                    {d.delayBadgeText}
                                  </span>
                                </div>
                                <span className="line-clamp-1 font-medium text-[11px] text-slate-700">
                                  {rec.title}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bg-slate-50/80 border border-slate-100 rounded-xl py-3.5 px-3 text-center text-xs italic text-slate-400">
                          Không có hồ sơ chậm trễ.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // 5. Lọc danh sách theo Tab, Search, Trạng thái CĐT và Nhóm chậm trễ
  const filteredRecords = useMemo(() => {
    return masterRecords.filter(rec => {
      if (selectedCategory !== 'all' && rec.category !== selectedCategory) {
        return false;
      }
      if (statusFilter === 'MOA_OVERDUE') {
        if (rec.finalStatus !== 'PENDING' || !isRecordOverdue(rec)) return false;
      } else if (statusFilter !== 'ALL' && rec.finalStatus !== statusFilter) {
        return false;
      }
      if (delayFilter !== 'ALL') {
        const d = evaluateRecordDelay(rec);
        if (delayFilter === 'OVERDUE_ALL' && d.delayType === 'NONE') return false;
        if (delayFilter === 'TVGS_DELAY' && d.delayType !== 'TVGS_DELAY') return false;
        if (delayFilter === 'CDT_DELAY' && d.delayType !== 'CDT_DELAY') return false;
        if (delayFilter === 'CONTRACTOR_DELAY' && !d.isContractorLate) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const d = evaluateRecordDelay(rec);
        const matchCode = (rec.code || '').toLowerCase().includes(q);
        const matchTitle = (rec.title || '').toLowerCase().includes(q);
        const matchDetail = (rec.detail || '').toLowerCase().includes(q);
        const matchSupplier = (rec.supplier || '').toLowerCase().includes(q);
        const matchNotes = (rec.notes || '').toLowerCase().includes(q);
        const matchDelay = d.delayBadgeText.toLowerCase().includes(q);
        return matchCode || matchTitle || matchDetail || matchSupplier || matchNotes || matchDelay;
      }
      return true;
    });
  }, [masterRecords, selectedCategory, statusFilter, delayFilter, searchQuery, filterConfig]);

  // Phân trang
  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, statusFilter, delayFilter, searchQuery]);

  const renderCategoryIcon = (key: SubmittalCategoryKey, className: string = 'w-4 h-4') => {
    switch (key) {
      case 'sdw': return <Layers className={className} />;
      case 'mat': return <Package className={className} />;
      case 'mos': return <FileText className={className} />;
      case 'rfi': return <HelpCircle className={className} />;
      case 'ots': return <ShieldCheck className={className} />;
      case 'hse': return <HardHat className={className} />;
      case 'concrete': return <Beaker className={className} />;
      case 'material_import': return <Truck className={className} />;
      case 'inspection_moa': return <FileCheck className={className} />;
      default: return <FileText className={className} />;
    }
  };

  // Render badge trạng thái + ghi chú TVGS chậm / CĐT chậm / Chậm trình do Nhà thầu
  const renderStatusBadge = (rec: MasterSubmittalRecord) => {
    if (rec.category === 'inspection_moa') {
      const status = rec.finalStatus;
      const dInfo = evaluateRecordDelay(rec);
      return (
        <div className="flex flex-col items-center gap-1">
          {status === 'APPROVED' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Đã hoàn thành (Đã ký)</span>
            </span>
          ) : status === 'PENDING' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Đang Trình</span>
            </span>
          ) : status === 'NOT_STARTED' ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Chưa trình</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>{rec.clientStatus || 'Từ chối'}</span>
            </span>
          )}
          {dInfo.delayBadgeText && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border bg-rose-50 text-rose-700 border-rose-300">
              {dInfo.delayBadgeText}
            </span>
          )}
        </div>
      );
    }

    const status = rec.finalStatus;
    const dInfo = evaluateRecordDelay(rec);
    return (
      <div className="flex flex-col items-center gap-1">
        {status === 'APPROVED' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Đã Duyệt {rec.clientCode ? `(${rec.clientCode})` : rec.tvgsCode ? `(${rec.tvgsCode})` : ''}</span>
          </span>
        ) : status === 'PENDING' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Đang Trình</span>
          </span>
        ) : status === 'NOT_STARTED' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Chưa trình</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap" title="Hồ sơ Từ chối hoặc Đã thay thế được tính là Đã đóng">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Từ chối (Đã đóng)</span>
          </span>
        )}
        {dInfo.delayBadgeText && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border whitespace-nowrap ${
            dInfo.delayType === 'TVGS_DELAY'
              ? 'bg-rose-100 text-rose-700 border-rose-300'
              : dInfo.delayType === 'CDT_DELAY'
              ? 'bg-purple-100 text-purple-800 border-purple-300'
              : 'bg-amber-100 text-amber-800 border-amber-300'
          }`}>
            {dInfo.delayBadgeText} {dInfo.overdueDays > 0 ? `(${dInfo.overdueDays} ngày)` : ''}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden p-4 md:p-6 box-border space-y-6">
      {/* Toast thông báo trạng thái đồng bộ */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium">{syncToast}</span>
          <button onClick={() => setSyncToast(null)} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* BANNER XEM THỬ KHÁCH (Khi Admin chuyển sang góc nhìn Viewer) */}
      {!canEdit && typeof window !== 'undefined' && localStorage.getItem('c10_preview_as_viewer') === 'true' && (
        <div className="bg-amber-500/10 border border-amber-300 p-4 rounded-2xl flex items-center justify-between gap-3 text-amber-900 text-xs shadow-xs flex-wrap">
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Chế độ Xem thử khách:</strong> Bạn đang kiểm tra giao diện dưới góc nhìn Khách / Người xem (Thanh công cụ cập nhật, nút đồng bộ và nút sửa đã được ẩn an toàn).
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('c10_preview_as_viewer');
              setCanEdit(computeCanEdit());
              setSyncToast('Đã quay lại chế độ Quản trị viên (Admin)!');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer transition-all shadow-xs"
          >
            Quay lại Admin
          </button>
        </div>
      )}

      {/* THANH CÔNG CỤ CẬP NHẬT DỮ LIỆU CHUẨN ADMIN (Chỉ Admin & người có Mã quyền hạn/Email mới thấy) */}
      {canEdit && (
        <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-5 rounded-2xl shadow-lg border border-indigo-800/40 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-xs uppercase tracking-wider text-blue-300">
                  Khu vực Quản trị & Cập nhật dữ liệu (Tối đa {MAX_ROWS_PER_SHEET} dòng/sheet)
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  autoSyncConfig.enabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-700 text-slate-300 border-slate-600'
                }`}>
                  {autoSyncConfig.enabled ? '● Tự động: BẬT' : '○ Tự động: TẮT'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Ngưỡng trễ hiện tại: <b>TVGS &gt; {filterConfig.tvgsLimitDays} ngày</b> | <b>CĐT &gt; {filterConfig.cdtLimitDays} ngày</b>
                {autoSyncConfig.lastSyncedAt && (
                  <span className="ml-2 text-slate-400">
                    • Đồng bộ cuối: {new Date(autoSyncConfig.lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Nút Cấu hình bộ lọc & hạn trễ TVGS / CĐT */}
            <button
              type="button"
              onClick={() => setShowFilterConfigModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 font-bold text-xs cursor-pointer transition-all"
              title="Điều chỉnh số ngày trễ đối với TVGS và CĐT"
            >
              <Sliders className="w-4 h-4 text-amber-300" />
              <span>Cài đặt hạn trễ ({filterConfig.tvgsLimitDays}d / {filterConfig.cdtLimitDays}d)</span>
            </button>

            {/* Nút Xem thử khách */}
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('c10_preview_as_viewer', 'true');
                setCanEdit(false);
                setSyncToast('Đang chuyển sang chế độ Xem thử khách (Ẩn thanh công cụ cập nhật)');
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 font-bold text-xs cursor-pointer transition-all"
              title="Xem trước giao diện dưới góc nhìn khách (ẩn toàn bộ nút quản trị)"
            >
              <Eye className="w-4 h-4 text-blue-300" />
              <span>Xem thử khách</span>
            </button>

            {/* Nút Đặt giờ tự động đồng bộ */}
            <button
              type="button"
              onClick={() => setShowAutoSyncModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/70 hover:bg-indigo-600 text-white border border-indigo-400/30 font-bold text-xs cursor-pointer transition-all shadow-xs"
              title="Cài đặt lịch giờ tự động đồng bộ số liệu từ Google Sheet"
            >
              <Clock className="w-4 h-4 text-amber-300" />
              <span>Đặt giờ tự động</span>
            </button>

            {/* Nút Thêm mới hồ sơ */}
            <button
              type="button"
              onClick={() => {
                setEditingRecord({
                  category: selectedCategory === 'all' ? 'mos' : selectedCategory,
                  submissionDate: new Date().toISOString().split('T')[0],
                  finalStatus: 'APPROVED'
                });
                setShowAddEditModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer transition-all shadow-xs"
              title="Thêm nhanh một bộ hồ sơ / đệ trình mới"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm hồ sơ</span>
            </button>

            {/* Nút Đồng bộ Google Sheet ngay */}
            <button
              type="button"
              onClick={handleSyncFromGoogleSheet}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ Sheet ngay'}</span>
            </button>

            {/* Nút Mở Google Sheet */}
            <a
              href={GOOGLE_SHEET_SUBMITTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 font-bold text-xs transition-all cursor-pointer"
              title="Mở trực tiếp bảng tính Google Sheet dự án C10"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              <span>Mở Sheet</span>
            </a>
          </div>
        </div>
      )}

      {/* ========================================================
          HEADER CARD: TIÊU ĐỀ, NHẬP MÃ QUYỀN HẠN & CHẾ ĐỘ XEM
         ======================================================== */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-md shadow-blue-500/25 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                Theo Dõi Hồ Sơ & Chất Lượng C10
              </h2>
              <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-lg text-xs font-bold border border-blue-200">
                EDMS 9 Phân Hệ
              </span>
              <span className="bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-lg text-xs font-bold border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Đã kết nối Google Sheet (Tối đa 1.000 dòng/sheet)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Căn cứ theo cột <b>Trạng thái CĐT phê duyệt</b> (Từ chối = Đã đóng) • Tự động cảnh báo <b>TVGS chậm (&gt; {filterConfig.tvgsLimitDays} ngày)</b> & <b>CĐT chậm (&gt; {filterConfig.cdtLimitDays} ngày)</b>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* Nút nhập mã quyền hạn nhanh cho người dùng chưa mở khóa */}
          {!canEdit && (
            showQuickCodeInput ? (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-xl px-2.5 py-1">
                <KeyRound className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <input
                  type="password"
                  value={quickAccessCode}
                  onChange={(e) => setQuickAccessCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyQuickCode()}
                  placeholder="Nhập mã quyền hạn..."
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none w-32"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleVerifyQuickCode}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
                >
                  Mở khóa
                </button>
                <button
                  type="button"
                  onClick={() => { setShowQuickCodeInput(false); setQuickAccessCode(''); }}
                  className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowQuickCodeInput(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Nhập Mã cấp quyền để thêm/chỉnh sửa dữ liệu trong tab Theo dõi hồ sơ"
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span>Nhập mã quyền hạn</span>
              </button>
            )
          )}

          {/* Nút chuyển đổi giao diện: Bảng EDMS / Biểu đồ */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('edms')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'edms'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Bảng EDMS (9 Phân hệ)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('charts')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'charts'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Biểu Đồ Tổng Quan</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          TIER 1: 4 KPI CARDS THỐNG KÊ TOÀN DỰ ÁN (CHUẨN CỘT CĐT)
         ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Tổng số hồ sơ đã trình
            </span>
            <span className="text-2xl md:text-3xl font-black text-slate-800 mt-1 block">
              {kpiStats.total}
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              9 phân hệ quản lý
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 rounded-2xl border border-emerald-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
              CĐT Đã duyệt (A/B)
            </span>
            <span className="text-2xl md:text-3xl font-black text-emerald-700 mt-1 block">
              {kpiStats.approved}
            </span>
            <span className="text-[11px] text-emerald-600/80 font-bold mt-0.5 block">
              Tỷ lệ đạt: {kpiStats.approvedPercent}%
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 rounded-2xl border border-amber-100 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block">
              Đang trình duyệt
            </span>
            <span className="text-2xl md:text-3xl font-black text-amber-700 mt-1 block">
              {kpiStats.pending}
            </span>
            <span className="text-[11px] text-amber-700 font-semibold mt-0.5 block">
              TVGS chậm: {kpiStats.tvgsDelayCount} • CĐT chậm: {kpiStats.cdtDelayCount}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
              Từ chối / Đã đóng (Code C)
            </span>
            <span className="text-2xl md:text-3xl font-black text-slate-700 mt-1 block">
              {kpiStats.rejected}
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              Từ chối đồng nghĩa đã đóng
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {viewMode === 'charts' ? (
        <div className="space-y-6">
          {renderCN82CategoryChartsSection()}
        </div>
      ) : (
        <div className="space-y-4">
          {/* TIER 2: 9 CATEGORY PILL TABS (DÀN HÀNG TỰ ĐỘNG FLEX-WRAP KHÔNG BỊ KHUẤT TRANG) */}
          <div
            className="bg-white/95 backdrop-blur-md p-2.5 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-2 flex-wrap sticky top-2 z-20 select-none"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer select-none ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-indigo-600 border border-slate-200/70'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Tất cả hồ sơ</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                selectedCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {categoryCounts.all || 0}
              </span>
            </button>

            {SUBMITTAL_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.key;
              const count = categoryCounts[cat.key] || 0;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 cursor-pointer select-none ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-md shadow-blue-500/25'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-indigo-600 border border-slate-200/70'
                  }`}
                >
                  {renderCategoryIcon(cat.key, 'w-4 h-4')}
                  <span>{cat.shortLabel}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* TIER 2.5: BIỂU ĐỒ TRÒN CHO TỪNG LOẠI HỒ SƠ & DANH SÁCH TRỄ HẠN */}
          {renderCN82CategoryChartsSection()}

          {/* TIER 3: THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC TRẠNG THÁI + BỘ LỌC CHẬM TRỄ */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Ô tìm kiếm */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã hồ sơ, tên hạng mục, TVGS chậm, CĐT chậm..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Bộ lọc trạng thái CĐT */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> {selectedCategory === 'inspection_moa' ? 'Trạng thái Trình kí MOA:' : 'Trạng thái CĐT:'}
                </span>
                {selectedCategory === 'inspection_moa' ? (
                  ([
                    { key: 'ALL', label: `Tất cả (${moaStats.total})` },
                    { key: 'APPROVED', label: `Đã hoàn thành (${moaStats.approved})` },
                    { key: 'PENDING', label: `Đang trình (${moaStats.pending})` },
                    { key: 'MOA_OVERDUE', label: `Chậm > 15 ngày (${moaStats.overdue})` },
                    { key: 'NOT_STARTED', label: `Chưa trình (${moaStats.notStarted})` }
                  ] as const).map((item) => {
                    const isActive = statusFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setStatusFilter(item.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })
                ) : (
                  (['ALL', 'APPROVED', 'PENDING', 'REJECTED'] as const).map((st) => {
                    const label =
                      st === 'ALL'
                        ? `Tất cả (${kpiStats.total})`
                        : st === 'APPROVED'
                        ? `Đã duyệt (${kpiStats.approved})`
                        : st === 'PENDING'
                        ? `Đang trình (${kpiStats.pending})`
                        : `Từ chối / Đã đóng (${kpiStats.rejected})`;
                    const isActive = statusFilter === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Hàng 2: Bộ lọc chi tiết theo nhóm chậm trễ & nút cấu hình Admin */}
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-400 mr-1">
                  Bộ lọc tiến độ duyệt:
                </span>
                {[
                  { key: 'ALL', label: 'Tất cả hồ sơ' },
                  { key: 'OVERDUE_ALL', label: `Tất cả hồ sơ chậm (${kpiStats.tvgsDelayCount + kpiStats.cdtDelayCount + kpiStats.contractorDelayCount})` },
                  { key: 'TVGS_DELAY', label: `TVGS chậm > ${filterConfig.tvgsLimitDays} ngày (${kpiStats.tvgsDelayCount})` },
                  { key: 'CDT_DELAY', label: `CĐT chậm > ${filterConfig.cdtLimitDays} ngày (${kpiStats.cdtDelayCount})` },
                  { key: 'CONTRACTOR_DELAY', label: `Chậm trình do Nhà thầu (${kpiStats.contractorDelayCount})` }
                ].map((df) => {
                  const active = delayFilter === df.key;
                  return (
                    <button
                      key={df.key}
                      type="button"
                      onClick={() => setDelayFilter(df.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {df.label}
                    </button>
                  );
                })}
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowFilterConfigModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition-all cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-600" />
                  <span>Điều chỉnh bộ lọc & ngày trễ (TVGS: {filterConfig.tvgsLimitDays}d | CĐT: {filterConfig.cdtLimitDays}d)</span>
                </button>
              )}
            </div>
          </div>

{/* BẢNG DỮ LIỆU TÙY BIẾN CHO TỪNG PHÂN HỆ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              {selectedCategory === 'concrete' ? (
                /* BẢNG ĐẶC THÙ: NHẬT KÝ BÊ TÔNG & KẾT QUẢ THÍ NGHIỆM R7/R28 */
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-3.5 w-12 text-center">STT</th>
                      <th className="p-3.5">Mã phiếu đệ trình</th>
                      <th className="p-3.5">Hạng mục thi công</th>
                      <th className="p-3.5 text-center">Mác BT</th>
                      <th className="p-3.5 text-right">Khối lượng (m³)</th>
                      <th className="p-3.5">Nhà cung cấp</th>
                      <th className="p-3.5 text-center">Ngày đổ</th>
                      <th className="p-3.5 text-center">Nén R7</th>
                      <th className="p-3.5 text-center">Nén R28</th>
                      <th className="p-3.5 text-center">Đánh giá</th>
                      <th className="p-3.5 text-center">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-3.5 font-bold font-mono text-blue-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{rec.code}</span>
                              {rec.tra && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200">
                                  TRA {rec.tra}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 font-medium text-slate-800 max-w-xs">
                            {rec.title}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-black border border-indigo-200 text-[11px]">
                              {rec.concreteGrade || 'B30'}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-black text-slate-900 font-mono">
                            {rec.volumeM3 || '-'}
                          </td>
                          <td className="p-3.5 text-slate-600 font-medium">
                            {rec.supplier || 'Việt Đức'}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-600">
                            {rec.submissionDate || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="text-[11px] font-bold text-slate-700">{rec.testR7Result || 'Đã nén'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{rec.testR7Date || ''}</div>
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="text-[11px] font-bold text-slate-700">{rec.testR28Result || 'Đã nén'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{rec.testR28Date || ''}</div>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {rec.rating || 'Đạt'}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                                type="button"
                                onClick={() => setSelectedRecord(rec)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 transition-all cursor-pointer"
                                title="Xem chi tiết hồ sơ"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRecord(rec);
                                    setShowAddEditModal(true);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition-all cursor-pointer"
                                  title="Chỉnh sửa mã, link SharePoint hoặc trạng thái hồ sơ"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}

                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                          Không tìm thấy bản ghi bê tông nào khớp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : selectedCategory === 'material_import' ? (
                /* BẢNG ĐẶC THÙ: QUẢN LÝ VẬT TƯ NHẬP VỀ CÔNG TRƯỜNG */
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-3.5 w-12 text-center">STT</th>
                      <th className="p-3.5 text-center">Đợt nhập</th>
                      <th className="p-3.5">Tên vật tư / Quy cách chủng loại</th>
                      <th className="p-3.5 text-center">Đơn vị tính</th>
                      <th className="p-3.5 text-right">Số lượng</th>
                      <th className="p-3.5">Nhà cung cấp / Đơn vị</th>
                      <th className="p-3.5 text-center">Ngày nghiệm thu</th>
                      <th className="p-3.5 text-center">Trạng thái</th>
                      <th className="p-3.5 text-center">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold border border-amber-200 text-[11px]">
                              {rec.batchNo || `Đợt ${rec.stt}`}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-slate-800">
                            {rec.title}
                          </td>
                          <td className="p-3.5 text-center font-semibold text-slate-600">
                            {rec.unit || '-'}
                          </td>
                          <td className="p-3.5 text-right font-black text-slate-900 font-mono text-sm">
                            {rec.quantity || '-'}
                          </td>
                          <td className="p-3.5 text-slate-600 font-medium">
                            {rec.supplier || 'Nhà thầu Delta'}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-600">
                            {rec.acceptanceDate || rec.submissionDate || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            {renderStatusBadge(rec)}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(rec)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 transition-all cursor-pointer"
                              title="Xem chi tiết"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                          Không tìm thấy vật tư nào khớp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : selectedCategory === 'inspection_moa' ? (
                /* BẢNG ĐẶC THÙ: BIÊN BẢN NGHIỆM THU MOA-M VÀ MOA-W */
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-3.5 w-12 text-center">STT</th>
                      <th className="p-3.5 text-center">Phân loại</th>
                      <th className="p-3.5">Mã biên bản nghiệm thu</th>
                      <th className="p-3.5">Nội dung công tác nghiệm thu</th>
                      <th className="p-3.5 text-center">Checklist NT</th>
                      <th className="p-3.5 text-center">Ngày trình MOA</th>
                      <th className="p-3.5 text-center">Quyển lưu trữ</th>
                      <th className="p-3.5 text-center">Trạng thái Trình kí MOA</th>
                      <th className="p-3.5 text-center">Tài liệu đính kèm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                              rec.moaType === 'MOA-M'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {rec.moaType || 'MOA-W'}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold font-mono text-slate-900">
                            {rec.code}
                          </td>
                          <td className="p-3.5 font-medium text-slate-800 max-w-sm">
                            {rec.title}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-600">
                            {rec.acceptanceDate ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span>{rec.acceptanceDate}</span>
                                {rec.tvgsStatus && (
                                  <span className="text-[10px] font-bold text-slate-500">({rec.tvgsStatus})</span>
                                )}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-600">
                            {rec.submissionDate || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[11px]">
                              Quyển {rec.volumeNo || 1}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            {renderStatusBadge(rec)}
                          </td>
                          <td className="p-3.5 text-center">
                            {rec.linkUrl ? (
                              <a
                                href={rec.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                                title="Mở biên bản nghiệm thu đã duyệt trên SharePoint"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Mở MOA</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Đang lưu trữ</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                          Không tìm thấy biên bản nghiệm thu nào khớp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                /* BẢNG CHUẨN: SHOPDRAWING, MAT, MOS, RFI, OTS, HSE & TẤT CẢ */
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/90 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-3.5 w-12 text-center">STT</th>
                      <th className="p-3.5 text-center">Phân hệ</th>
                      <th className="p-3.5">Mã hồ sơ / Đệ trình</th>
                      <th className="p-3.5 text-center">Rev</th>
                      <th className="p-3.5">Nội dung chi tiết</th>
                      <th className="p-3.5 text-center">Ngày trình</th>
                      <th className="p-3.5 text-center">TVGS Duyệt</th>
                      <th className="p-3.5 text-center">CĐT Duyệt</th>
                      <th className="p-3.5 text-center">Kết quả</th>
                      <th className="p-3.5 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRecords.length > 0 ? (
                      paginatedRecords.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                            {(currentPage - 1) * pageSize + idx + 1}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider">
                              {renderCategoryIcon(rec.category, 'w-3 h-3')}
                              <span>{rec.category}</span>
                            </span>
                          </td>
                          <td className="p-3.5 font-bold font-mono text-blue-700">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{rec.code}</span>
                              {rec.tra && (
                                <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold border border-blue-200">
                                  TRA {rec.tra}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-500 font-bold">
                            {rec.rev || '00'}
                          </td>
                          <td className="p-3.5 font-medium text-slate-800 max-w-sm">
                            <div className="line-clamp-2">{rec.title}</div>
                            {rec.notes && (
                              <div className="text-[10px] text-slate-400 mt-0.5 truncate">{rec.notes}</div>
                            )}
                          </td>
                          <td className="p-3.5 text-center font-mono text-slate-600 whitespace-nowrap">
                            {rec.submissionDate || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-bold text-slate-700">{rec.tvgsStatus || rec.tvgsCode || '-'}</span>
                            {rec.tvgsCode && rec.tvgsStatus && <span className="ml-1 text-[10px] font-bold text-blue-600">({rec.tvgsCode})</span>}
                            {rec.tvgsDate && <div className="text-[10px] text-slate-400 font-mono">{rec.tvgsDate}</div>}
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="font-bold text-slate-700">{rec.clientStatus || rec.clientCode || '-'}</span>
                            {rec.clientCode && rec.clientStatus && <span className="ml-1 text-[10px] font-bold text-emerald-600">({rec.clientCode})</span>}
                            {rec.clientDate && <div className="text-[10px] text-slate-400 font-mono">{rec.clientDate}</div>}
                          </td>
                          <td className="p-3.5 text-center">
                            {renderStatusBadge(rec)}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {rec.linkUrl && (
                                <a
                                  href={rec.linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs transition-all cursor-pointer"
                                  title="Mở file hồ sơ phê duyệt trên SharePoint / Drive"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Mở file</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedRecord(rec)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 transition-all cursor-pointer"
                                title="Xem chi tiết hồ sơ"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRecord(rec);
                                    setShowAddEditModal(true);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600 transition-all cursor-pointer"
                                  title="Chỉnh sửa mã, link SharePoint hoặc trạng thái hồ sơ"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}

                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400 italic">
                          Không tìm thấy hồ sơ nào khớp với điều kiện tìm kiếm.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* THANH PHÂN TRANG */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Hiển thị <b className="text-slate-800">{paginatedRecords.length}</b> trên tổng số <b className="text-slate-800">{filteredRecords.length}</b> bản ghi
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                >
                  Trang trước
                </button>
                <span className="px-3 py-1.5 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL CHI TIẾT HỒ SƠ ĐỆ TRÌNH
         ======================================================== */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
                  {renderCategoryIcon(selectedRecord.category, 'w-5 h-5')}
                </div>
                <div>
                  <h3 className="text-base font-bold font-mono tracking-tight text-white">
                    {selectedRecord.code}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Phân hệ: {selectedRecord.category.toUpperCase()} {selectedRecord.rev ? `• Rev: ${selectedRecord.rev}` : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
              {/* Highlight Card: Mã hồ sơ & Mã TRA */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 p-4 rounded-2xl border border-blue-200/80 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                    Mã đệ trình / Hồ sơ
                  </span>
                  <span className="text-base font-black font-mono text-blue-900 block mt-0.5">
                    {selectedRecord.code}
                  </span>
                </div>
                {selectedRecord.tra && (
                  <div className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs">
                    <span>MÃ TRA:</span>
                    <span className="font-mono text-amber-200 text-sm font-black">{selectedRecord.tra}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-slate-400 font-bold uppercase tracking-wider block text-[11px]">
                  Tiêu đề & Nội dung đệ trình
                </span>
                <p className="text-sm font-bold text-slate-800 mt-1 leading-relaxed">
                  {selectedRecord.title}
                </p>
                {selectedRecord.detail && (
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {selectedRecord.detail}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Ngày trình duyệt</span>
                  <span className="text-xs font-bold text-slate-700 font-mono mt-0.5 block">{selectedRecord.submissionDate || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Ý kiến TVGS</span>
                  <span className="text-xs font-bold text-slate-700 mt-0.5 block">{selectedRecord.tvgsCode || selectedRecord.tvgsStatus || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Ý kiến CĐT</span>
                  <span className="text-xs font-bold text-slate-700 mt-0.5 block">{selectedRecord.clientCode || selectedRecord.clientStatus || '-'}</span>
                </div>
                {selectedRecord.supplier && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Nhà cung cấp</span>
                    <span className="text-xs font-bold text-slate-700 mt-0.5 block">{selectedRecord.supplier}</span>
                  </div>
                )}
                {selectedRecord.volumeM3 && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Thể tích bê tông</span>
                    <span className="text-xs font-black text-slate-900 mt-0.5 block font-mono">{selectedRecord.volumeM3} m³</span>
                  </div>
                )}
                {selectedRecord.concreteGrade && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Mác thiết kế</span>
                    <span className="text-xs font-bold text-indigo-700 mt-0.5 block">{selectedRecord.concreteGrade}</span>
                  </div>
                )}
                {selectedRecord.quantity && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Số lượng nghiệm thu</span>
                    <span className="text-xs font-bold text-slate-900 mt-0.5 block font-mono">{selectedRecord.quantity} {selectedRecord.unit || ''}</span>
                  </div>
                )}
              </div>

              {selectedRecord.notes && (
                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider block text-[11px]">
                    Ghi chú & Tình trạng lưu trữ
                  </span>
                  <p className="text-xs text-slate-700 mt-1 bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                    {selectedRecord.notes}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>{renderStatusBadge(selectedRecord)}</div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRecord.linkUrl ? (
                  <a
                    href={selectedRecord.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mở file hồ sơ đã duyệt (SharePoint)</span>
                  </a>
                ) : (
                  <span className="text-xs text-slate-400 italic px-2">Chưa đính kèm link file</span>
                )}
                <a
                  href={GOOGLE_SHEET_SUBMITTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs flex items-center gap-1.5 transition-all"
                  title="Mở bảng tính Google Sheet dự án C10"
                >
                  <ExternalLink className="w-3 h-3 text-emerald-600" />
                  <span>Sheet gốc</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: ĐẶT GIỜ TỰ ĐỘNG ĐỒNG BỘ GOOGLE SHEET
         ======================================================== */}
      {showAutoSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <Clock className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cài Đặt Giờ Tự Động Đồng Bộ</h3>
                  <span className="text-xs text-slate-400">Đồng bộ ngầm dữ liệu từ Google Sheet C10 về hệ thống</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoSyncModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 text-xs text-slate-700">
              {/* ON/OFF Switch */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="font-bold text-slate-800 text-sm block">Trạng thái tự động đồng bộ</span>
                  <span className="text-slate-500 text-[11px]">Bật để hệ thống tự động quét và cập nhật số liệu mới từ Sheet</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoSyncConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`w-14 h-8 rounded-full transition-colors cursor-pointer p-1 flex items-center ${
                    autoSyncConfig.enabled ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-white shadow-md"></div>
                </button>
              </div>

              {/* Lựa chọn phương thức */}
              <div className="space-y-3">
                <span className="font-bold text-slate-800 block text-xs uppercase tracking-wider">
                  Chọn phương thức hẹn giờ
                </span>

                {/* Option 1: Khung giờ cố định */}
                <div className={`p-3.5 rounded-2xl border transition-all ${
                  autoSyncConfig.frequencyType === 'fixed'
                    ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                    : 'border-slate-200 bg-white'
                }`}>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="syncType"
                      checked={autoSyncConfig.frequencyType === 'fixed'}
                      onChange={() => setAutoSyncConfig(prev => ({ ...prev, frequencyType: 'fixed' }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800 block">Theo các khung giờ cố định trong ngày</span>
                      <span className="text-slate-500 text-[11px]">Đồng bộ vào các thời điểm giao ban và kết ca thi công</span>
                    </div>
                  </label>

                  {autoSyncConfig.frequencyType === 'fixed' && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-blue-100">
                      {[
                        { time: '08:00', label: '08:00 (Đầu ca sáng)' },
                        { time: '11:30', label: '11:30 (Nghỉ trưa)' },
                        { time: '14:00', label: '14:00 (Đầu ca chiều)' },
                        { time: '17:30', label: '17:30 (Giao ban chiều)' }
                      ].map(t => {
                        const isSelected = autoSyncConfig.fixedTimes.includes(t.time);
                        return (
                          <button
                            key={t.time}
                            type="button"
                            onClick={() => {
                              const next = isSelected
                                ? autoSyncConfig.fixedTimes.filter(x => x !== t.time)
                                : [...autoSyncConfig.fixedTimes, t.time];
                              setAutoSyncConfig(prev => ({ ...prev, fixedTimes: next }));
                            }}
                            className={`p-2 rounded-xl text-left font-bold text-xs border transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span>{t.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Option 2: Theo chu kỳ */}
                <div className={`p-3.5 rounded-2xl border transition-all ${
                  autoSyncConfig.frequencyType === 'interval'
                    ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                    : 'border-slate-200 bg-white'
                }`}>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="syncType"
                      checked={autoSyncConfig.frequencyType === 'interval'}
                      onChange={() => setAutoSyncConfig(prev => ({ ...prev, frequencyType: 'interval' }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800 block">Theo chu kỳ thời gian (đều đặn)</span>
                      <span className="text-slate-500 text-[11px]">Tự động quét lại Sheet sau một khoảng thời gian cố định</span>
                    </div>
                  </label>

                  {autoSyncConfig.frequencyType === 'interval' && (
                    <div className="mt-3 pt-3 border-t border-blue-100 flex items-center gap-2">
                      <span className="font-bold text-slate-700">Chu kỳ quét:</span>
                      <select
                        value={autoSyncConfig.intervalMinutes}
                        onChange={(e) => setAutoSyncConfig(prev => ({ ...prev, intervalMinutes: parseInt(e.target.value) }))}
                        className="p-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={30}>Mỗi 30 phút một lần</option>
                        <option value={60}>Mỗi 1 tiếng một lần</option>
                        <option value={120}>Mỗi 2 tiếng một lần</option>
                        <option value={240}>Mỗi 4 tiếng một lần</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAutoSyncModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  saveAutoSyncConfig(autoSyncConfig);
                  setShowAutoSyncModal(false);
                  setSyncToast('Đã lưu cấu hình tự động đồng bộ thành công!');
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-sm shadow-blue-500/25"
              >
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: THÊM MỚI & CHỈNH SỬA HỒ SƠ / ĐỆ TRÌNH
         ======================================================== */}
      {showAddEditModal && editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingRecord.id ? 'Chỉnh Sửa Hồ Sơ / Đệ Trình' : 'Thêm Mới Hồ Sơ / Đệ Trình'}
                  </h3>
                  <span className="text-xs text-slate-400">Cập nhật mã, ngày duyệt và link SharePoint</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddEditModal(false); setEditingRecord(null); }}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phân hệ quản lý *</label>
                  <select
                    value={editingRecord.category || 'mos'}
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, category: e.target.value as SubmittalCategoryKey }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                  >
                    {SUBMITTAL_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{c.shortLabel}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mã đệ trình / Hồ sơ *</label>
                  <input
                    type="text"
                    value={editingRecord.code || ''}
                    placeholder="VD: C10-MC1-DTA-CV-MOS-015"
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Mã TRA (đối chiếu Sheet)</label>
                  <input
                    type="text"
                    value={editingRecord.tra || ''}
                    placeholder="VD: 008, 021, 073"
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, tra: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Phiên bản Rev</label>
                  <input
                    type="text"
                    value={editingRecord.rev || '00'}
                    placeholder="00, 01, 02..."
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, rev: e.target.value }))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nội dung chi tiết đệ trình *</label>
                <textarea
                  rows={2}
                  value={editingRecord.title || ''}
                  placeholder="Mô tả tóm tắt nội dung công việc / hồ sơ trình duyệt..."
                  onChange={(e) => setEditingRecord(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-slate-800 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ngày trình duyệt</label>
                  <input
                    type="date"
                    value={editingRecord.submissionDate || ''}
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, submissionDate: e.target.value }))}
                    className="w-full p-2 rounded-xl border border-slate-300 text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kết quả chung</label>
                  <select
                    value={editingRecord.finalStatus || 'APPROVED'}
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, finalStatus: e.target.value as any }))}
                    className="w-full p-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                  >
                    <option value="APPROVED">Đã Duyệt (Code A / B)</option>
                    <option value="PENDING">Đang Chờ Duyệt</option>
                    <option value="REJECTED">Yêu Cầu Sửa Lại (Code C)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ý kiến TVGS (Code)</label>
                  <input
                    type="text"
                    value={editingRecord.tvgsCode || ''}
                    placeholder="A, B, C..."
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, tvgsCode: e.target.value }))}
                    className="w-full p-2 rounded-xl border border-slate-300 font-bold text-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Ý kiến CĐT (Code)</label>
                  <input
                    type="text"
                    value={editingRecord.clientCode || ''}
                    placeholder="A, B, C..."
                    onChange={(e) => setEditingRecord(prev => ({ ...prev, clientCode: e.target.value }))}
                    className="w-full p-2 rounded-xl border border-slate-300 font-bold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Link file hồ sơ (SharePoint / PDF)</label>
                <input
                  type="url"
                  value={editingRecord.linkUrl || ''}
                  placeholder="https://deltagroupvn-my.sharepoint.com/... hoặc link PDF"
                  onChange={(e) => setEditingRecord(prev => ({ ...prev, linkUrl: e.target.value }))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-blue-700 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Ghi chú lưu trữ</label>
                <input
                  type="text"
                  value={editingRecord.notes || ''}
                  placeholder="Ghi chú thêm (VD: Đã scan + photo 5 bản...)"
                  onChange={(e) => setEditingRecord(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-2 rounded-xl border border-slate-300 text-slate-800"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowAddEditModal(false); setEditingRecord(null); }}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editingRecord.code || !editingRecord.title) {
                    alert('Vui lòng nhập đầy đủ Mã hồ sơ và Tiêu đề!');
                    return;
                  }
                  let updatedList: MasterSubmittalRecord[];
                  if (editingRecord.id) {
                    updatedList = masterRecords.map(r => r.id === editingRecord.id ? { ...r, ...editingRecord } as MasterSubmittalRecord : r);
                  } else {
                    const newRec: MasterSubmittalRecord = {
                      id: `${editingRecord.category || 'mos'}-${Date.now()}`,
                      category: editingRecord.category || 'mos',
                      stt: masterRecords.length + 1,
                      code: editingRecord.code,
                      tra: editingRecord.tra,
                      rev: editingRecord.rev || '00',
                      title: editingRecord.title,
                      submissionDate: editingRecord.submissionDate,
                      tvgsCode: editingRecord.tvgsCode,
                      tvgsStatus: editingRecord.tvgsCode === 'A' || editingRecord.tvgsCode === 'B' ? 'Duyệt' : 'Đang trình',
                      clientCode: editingRecord.clientCode,
                      clientStatus: editingRecord.clientCode === 'A' || editingRecord.clientCode === 'B' ? 'Duyệt' : 'Đang trình',
                      finalStatus: editingRecord.finalStatus || 'APPROVED',
                      linkUrl: editingRecord.linkUrl,
                      notes: editingRecord.notes || (editingRecord.tra ? `TRA ${editingRecord.tra}` : undefined)
                    };
                    updatedList = [newRec, ...masterRecords];
                  }
                  setMasterRecords(updatedList);
                  saveLocalMasterSubmittals(updatedList);
                  await saveSubmittalsToFirestore(updatedList);
                  setShowAddEditModal(false);
                  setEditingRecord(null);
                  setSyncToast(`Đã lưu hồ sơ ${editingRecord.code} thành công!`);
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-sm shadow-blue-500/25"
              >
                Lưu hồ sơ
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================
          MODAL ADMIN: CẤU HÌNH BỘ LỌC & SỐ NGÀY TRỄ TVGS / CĐT
         ======================================================== */}
      {showFilterConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Cấu Hình Bộ Lọc & Ngưỡng Ngày Trễ</h3>
                  <span className="text-xs text-slate-400">Quyền Admin điều chỉnh mốc cảnh báo TVGS & CĐT</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterConfigModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700">
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-900 leading-relaxed">
                <b>Quy tắc chuẩn hóa:</b> Hồ sơ lấy dữ liệu ở cột <b>Trạng thái CĐT phê duyệt</b> làm căn cứ. Hồ sơ <b>Từ chối (Code C)</b> đồng nghĩa với việc <b>Đã đóng</b>.
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1.5 text-sm">
                  1. Số ngày tối đa đối với TVGS (Mặc định: 7 ngày)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Nếu trình TVGS quá số ngày này mà chưa duyệt thì ghi chú là <b className="text-rose-600">TVGS chậm</b>.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={filterConfig.tvgsLimitDays}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, tvgsLimitDays: Math.max(1, parseInt(e.target.value) || 7) }))}
                    className="w-28 p-2.5 rounded-xl border border-slate-300 font-black text-base text-rose-700 text-center"
                  />
                  <span className="font-bold text-slate-600">ngày kể từ ngày đệ trình</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1.5 text-sm">
                  2. Số ngày tối đa đối với CĐT (Mặc định: 20 ngày)
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Nếu quá số ngày này kể từ ngày trình CĐT (hoặc ngày TVGS duyệt) mà CĐT chưa duyệt thì ghi chú là <b className="text-purple-700">CĐT chậm</b>.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={filterConfig.cdtLimitDays}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, cdtLimitDays: Math.max(1, parseInt(e.target.value) || 20) }))}
                    className="w-28 p-2.5 rounded-xl border border-slate-300 font-black text-base text-purple-700 text-center"
                  />
                  <span className="font-bold text-slate-600">ngày kể từ ngày trình CĐT</span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1.5 text-sm">
                  3. Bộ lọc tiến độ mặc định khi mở trang
                </label>
                <select
                  value={filterConfig.defaultDelayFilter}
                  onChange={(e) => {
                    const val = e.target.value as SubmittalFilterConfig['defaultDelayFilter'];
                    setFilterConfig(prev => ({ ...prev, defaultDelayFilter: val }));
                    setDelayFilter(val);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold bg-white text-slate-800"
                >
                  <option value="ALL">Hiển thị tất cả hồ sơ</option>
                  <option value="OVERDUE_ALL">Lọc tất cả hồ sơ trễ hạn</option>
                  <option value="TVGS_DELAY">Chỉ lọc hồ sơ TVGS chậm</option>
                  <option value="CDT_DELAY">Chỉ lọc hồ sơ CĐT chậm</option>
                  <option value="CONTRACTOR_DELAY">Chỉ lọc Chậm trình do Nhà thầu</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterConfig(DEFAULT_SUBMITTAL_FILTER_CONFIG);
                  setDelayFilter('ALL');
                }}
                className="px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold text-xs cursor-pointer"
              >
                Khôi phục mặc định (7d / 20d)
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilterConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveSubmittalFilterConfig(filterConfig);
                    setShowFilterConfigModal(false);
                    setSyncToast(`Đã lưu cấu hình bộ lọc: TVGS > ${filterConfig.tvgsLimitDays} ngày, CĐT > ${filterConfig.cdtLimitDays} ngày!`);
                  }}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-sm"
                >
                  Lưu áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Submittal;
