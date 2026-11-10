import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, Search, ExternalLink, RefreshCw, 
  Calendar, CheckCircle2, Clock, AlertCircle, Building2, Truck, FileSpreadsheet
} from 'lucide-react';
import { Language } from '../types';
import { parseCSV } from './IssuesList';

interface ProcurementPlanProps {
  language: Language;
  onProtectedAction?: (e: React.MouseEvent, url: string) => void;
  isAdmin?: boolean;
}

// PMH Data Format
export interface ProcurementItem {
  stt: string;
  category: string;
  conditions: string;
  tenderStartDate: string;
  contractorRequiredDate: string;
  constructionConditions: string;
  mainContractorSchedule: string;
  orderLeadTime: string;
  notes: string;
}

export interface OtherProcurementItem {
  stt: string;
  category: string;
  conditions: string;
  orderLeadTime: string;
  notes: string;
}

export interface PMHSheetData {
  mainItems: ProcurementItem[];
  otherItems: OtherProcurementItem[];
}

// MC Data Format
export interface MCItem {
  no: string;
  itemWorks: string;
  startDate: string;
  submissionDate: string;
  remark: string;
  isCategoryHeader: boolean;
}

export interface MCSheetData {
  items: MCItem[];
  notesFooter?: string;
}

const DEFAULT_SHEET_ID = "1Ei9tAIdX9VrZuOURw0MFy51-d0JTg8dkboNz8GLzWz0";

const DEFAULT_PMH_DATA: PMHSheetData = {
  mainItems: [
    {
      stt: "1",
      category: "Nhôm kính: Vách kính, cửa đi nhôm kính, cửa sổ, louver, diềm phào chỉ, nhôm mặt dựng",
      conditions: "Trước khi thi công vách GF trở lên (dính ô chờ khung cửa GF)\n2 tuần thực hiện bản vẽ và biện pháp",
      tenderStartDate: "25/11/2026",
      contractorRequiredDate: "23/02/2027",
      constructionConditions: "Sau khi tiến hành thi công lanh tô, tường gạch.\nSau khi thi công sơn nước cho (đối với tường gạch ngoài nhà)",
      mainContractorSchedule: "10/05/2027",
      orderLeadTime: "",
      notes: "MC bắt đầu khi xong KC 4F"
    },
    {
      stt: "2",
      category: "Trang trí nội thất:\n- Khu vực công cộng\n- Các phòng chức năng",
      conditions: "Trước khi thực hiện shopdrawing cho tường gạch hầm\nTrước khi thực hiện shopdrawing cấp nguồn, ME\n2 tuần thực hiện bản vẽ",
      tenderStartDate: "12/01/2027",
      contractorRequiredDate: "12/04/2027",
      constructionConditions: "Sau khi hoàn thành hạng mục thô từ BF - 3F (tường, chống thấm, cấp nguồn,...)\nBàn gian không gian hầm (nền epoxy, vách, chống thấm, tường, nguồn điện,...) phải hoàn thành\nHoàn thành cửa sổ, cửa đi ra không gian ngoài\nHoàn thành ME",
      mainContractorSchedule: "20/11/2028",
      orderLeadTime: "",
      notes: "Hoàn thành Epoxy hầm hơi muộn\nCó thể thực hiện nội thất không gian GF-3F trước"
    },
    {
      stt: "3",
      category: "Hệ thống thang máy:\n- Nội thất thang máy\n- Bảng hiển thị, máy lạnh,...",
      conditions: "Trước khi thực hiện shop kết cấu lõi thang (nghĩa là nên có lúc shop vách cửa thang máy từ BF2)\nTrước khi thực hiện shop hoàn thiện nền",
      tenderStartDate: "15/11/2026",
      contractorRequiredDate: "13/02/2027",
      constructionConditions: "Hoàn thành toàn bộ kết cấu thân\nHoàn thành cấp nguồn\nHoàn thành chống thấm đáy hố pit, mái phòng máy\nHoàn thành phòng máy",
      mainContractorSchedule: "25/02/2028",
      orderLeadTime: "",
      notes: "Ngày hoàn thành phần thân\nChống thấm mái phòng máy đang đi sau ngày này"
    },
    {
      stt: "4",
      category: "Cửa đi chính và khóa điện tử cho căn hộ",
      conditions: "Trước khi thực hiện shop xây tô\nTrước khi thực hiện shop cấp nguồn\nTrước khi thực hiện shop cán nền",
      tenderStartDate: "13/01/2027",
      contractorRequiredDate: "13/04/2027",
      constructionConditions: "Hoàn thành xây tô ô cửa\nHoàn thành cán nền",
      mainContractorSchedule: "24/06/2027",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "5",
      category: "Cung cấp lắp dựng đá mặt dựng và cảnh quan",
      conditions: "Trước khi thực hiện shop cấp nguồn",
      tenderStartDate: "10/12/2026",
      contractorRequiredDate: "10/03/2027",
      constructionConditions: "Trước khi tháo giáo\nHoàn thành kết cấu thân\nHoàn thành kết cấu 3F",
      mainContractorSchedule: "15/07/2027",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "6",
      category: "Hệ thống IBS",
      conditions: "Trước khi thực hiện shop ME",
      tenderStartDate: "",
      contractorRequiredDate: "10/03/2027",
      constructionConditions: "Hoàn thành hoàn thiện cơ bản",
      mainContractorSchedule: "19/06/2027",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "7",
      category: "Biển hiệu, số tầng, tên dự án, cảnh quan",
      conditions: "Trước khi thực hiện shop cấp nguồn\nCác trang trí nặng cần phải có trước shop xây tô để đặt cục thí hoặc KC bê tông",
      tenderStartDate: "25/02/2027",
      contractorRequiredDate: "26/05/2027",
      constructionConditions: "Hoàn thiện tường các khu vực công cộng (Landscape, GF - 3F)",
      mainContractorSchedule: "02/02/2028",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "8",
      category: "Nhà hát",
      conditions: "Sau Khi MC2 hoàn thành công tác đổ bê tông tầng 6",
      tenderStartDate: "02/03/2027",
      contractorRequiredDate: "02/06/2027",
      constructionConditions: "Hoàn thiện nền, chống thấm, tường\nHoàn thiện nội thất cơ bản\nHoàn thiện ME",
      mainContractorSchedule: "16/07/2027",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "9",
      category: "Tác phẩm nghệ thuật theo ID",
      conditions: "2 tháng trước khi MC hoàn thành scope",
      tenderStartDate: "01/08/2027",
      contractorRequiredDate: "30/10/2027",
      constructionConditions: "Hoàn thành scope MC",
      mainContractorSchedule: "12/04/2028",
      orderLeadTime: "",
      notes: ""
    },
    {
      stt: "10",
      category: "Cung cấp và trồng cây xanh",
      conditions: "2 tháng trước khi MC hoàn thành scope",
      tenderStartDate: "01/06/2027",
      contractorRequiredDate: "30/08/2027",
      constructionConditions: "Hoàn thành scope MC",
      mainContractorSchedule: "12/04/2028",
      orderLeadTime: "",
      notes: ""
    }
  ],
  otherItems: []
};

const DEFAULT_MC_DATA: MCSheetData = {
  items: [
    {
        "no": "",
        "itemWorks": "CÔNG TÁC XÂY VÀ TÔ BRICK WORKS AND PLASTERING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "1.1",
        "itemWorks": "Gạch đất nung Burnt clay brick",
        "startDate": "19-2-27",
        "submissionDate": "20-1-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "1.2",
        "itemWorks": "Cát xây tô Construction sand",
        "startDate": "19-2-27",
        "submissionDate": "20-1-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "1.3",
        "itemWorks": "Xi măng Cement",
        "startDate": "19-2-27",
        "submissionDate": "20-1-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC CHỐNG THẤM WATERPROOFING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "2.1",
        "itemWorks": "Chống thấm gốc xi măng Polymer cải tiến Cement Polymer-modified based waterproofing",
        "startDate": "10-5-27",
        "submissionDate": "10-4-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "2.2",
        "itemWorks": "Chống thấm gốc Polyurethane 2 thành phần 2-component Polyurethane waterproofing",
        "startDate": "12-11-27",
        "submissionDate": "13-10-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "2.3",
        "itemWorks": "Thi công chống thấm dạng lỏng lộ thiên gồm 3 lớp Exposed liquid waterproofing includes 3 layers",
        "startDate": "12-11-27",
        "submissionDate": "13-10-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "2.4",
        "itemWorks": "2 lớp chống thấm gốc Polyurethane thuần 2-layer of Polyurethane liquid membrane",
        "startDate": "12-11-27",
        "submissionDate": "13-10-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC KẾT CẤU THÉP STEEL STRUCTURE WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "3.1",
        "itemWorks": "Lắp đặt mái che Tầng 3 Install Level 3 canopy",
        "startDate": "4-11-27",
        "submissionDate": "5-10-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "3.2",
        "itemWorks": "Lắp đặt mái che Tầng mái Install rooftop canopy",
        "startDate": "11-10-27",
        "submissionDate": "11-9-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "3.3",
        "itemWorks": "Lắp đặt sàn kỹ thuật bảo trì Tầng 2 Install technical platform ceiling at Level 2",
        "startDate": "29-11-27",
        "submissionDate": "30-10-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC CỬA DOOR WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "4.1",
        "itemWorks": "Cửa thép chống cháy Fire rated steel door",
        "startDate": "10-5-27",
        "submissionDate": "26-3-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "4.2",
        "itemWorks": "Cửa thép Steel door",
        "startDate": "10-5-27",
        "submissionDate": "26-3-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC KIM LOẠI METAL WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "5.1",
        "itemWorks": "Lan can thép Steel railing",
        "startDate": "19-7-27",
        "submissionDate": "19-6-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "5.2",
        "itemWorks": "Thang leo bằng thép không gỉ Stainless steel cat ladder",
        "startDate": "26-2-28",
        "submissionDate": "22-1-28",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC HOÀN THIỆN TRẦN CEILING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "6.1",
        "itemWorks": "Trần thạch cao chống ẩm dày 12mm, khung chìm 12mm thick moisture-resistant gypsum board ceiling, with concealed frame",
        "startDate": "26-5-27",
        "submissionDate": "16-4-27",
        "remark": "Sảnh và hành lang kỹ thuật BF- 20F; Phòng chức năng ở GF",
        "isCategoryHeader": false
    },
    {
        "no": "6.2",
        "itemWorks": "Trần thạch cao Weather Block dày 12mm (CL-06AR), khung chìm 12mm thick Weather Block gypsum board ceiling (CL-06AR), with concealed frame",
        "startDate": "21-6-27",
        "submissionDate": "12-5-27",
        "remark": "Sảnh đón GF, Mái đón 3F, Bãi đậu xe BF",
        "isCategoryHeader": false
    },
    {
        "no": "6.3",
        "itemWorks": "Trần cách âm (CR1) bao gồm: Lớp cao su cách âm; Tấm tole đục lỗ mạ kẽm dày 0.58mm, Ø4mm; Lớp vải tiêu âm chống cháy; Lớp Rockwool tỉ trọng 80kg/m³, dày 100mm (50mm×2 lớp); Hệ khung xương C51 & U52 Soundproof ceiling (CR1) include: Acoustic rubber layer; 0.58mm thick galvanized perforated metal sheet, with Ø4mm holes; Fire-resistant acoustic fabric layer; 100mm thick Rockwool layer with density 80kg/m³ (2 layers × 50mm each); C51 & U52 framing system",
        "startDate": "21-6-27",
        "submissionDate": "7-5-27",
        "remark": "Phòng máy phát điện, trung thế - máy biến áp",
        "isCategoryHeader": false
    },
    {
        "no": "6.4",
        "itemWorks": "Trần nhôm (C.AL) bao gồm hệ khung treo Aluminum ceiling (C.AL), including suspension system",
        "startDate": "16-7-27",
        "submissionDate": "1-6-27",
        "remark": "Ban công và lô gia",
        "isCategoryHeader": false
    },
    {
        "no": "6.5",
        "itemWorks": "Trần lam nhôm W50×H100mm, khoảng cách 200mm (CL-02AR), hoàn thiện màu RAL 8025 Pale Brown, bao gồm hệ khung treo Aluminum slat ceiling, size W50×H100mm, spacing 200mm (CL-02AR), finished in RAL 8025 - Pale Brown, including suspended frame system",
        "startDate": "6-8-27",
        "submissionDate": "22-6-27",
        "remark": "Đường xe chạy BF",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC HOÀN THIỆN SÀN FLOOR FINISHING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "7.1",
        "itemWorks": "Tấm cách âm sàn Flexible Polyethylene dày 5mm, chỉ số cách âm ≥ 25db (SCT1) 5mm thick Flexible Polyethylene acoustic layer, with sound reduction rating (SCT1)",
        "startDate": "19-7-27",
        "submissionDate": "4-6-27",
        "remark": "Phòng gym, yoga, dance & khu vực căn hộ",
        "isCategoryHeader": false
    },
    {
        "no": "7.2",
        "itemWorks": "Gạch Porcelain chống trượt 600×600mm 600×600mm anti-slip Porcelain floor",
        "startDate": "11-8-27",
        "submissionDate": "3-4-27",
        "remark": "Phòng đệm thang máy và hành lang kỹ thuật BF-20F, Phòng kỹ thuật BF& GF, Ban công & lô gia căn hộ",
        "isCategoryHeader": false
    },
    {
        "no": "7.3",
        "itemWorks": "Gạch Porcelain chống trượt 300×600mm 300×600mm anti-slip Porcelain floor tiles",
        "startDate": "26-5-27",
        "submissionDate": "11-4-27",
        "remark": "Bể cân bằng, bể nước chữa cháy BF; Nhà bảo vệ, WC, phòng rác GF; Phòng đệm và phòng rác 3F - 20F; Ban công máy lạnh",
        "isCategoryHeader": false
    },
    {
        "no": "7.4",
        "itemWorks": "Sơn Epoxy hoàn thiện sàn (F.Epx) Epoxy floor finish with anti-slip texture (F.Epx)",
        "startDate": "7-1-28",
        "submissionDate": "23-11-27",
        "remark": "Phòng máy phát điện, trung thế - máy biến áp, bồn dầu",
        "isCategoryHeader": false
    },
    {
        "no": "7.5",
        "itemWorks": "Đá màu be (ST-02AR) Beige limestone (ST-02AR)",
        "startDate": "11-8-27",
        "submissionDate": "27-6-27",
        "remark": "Chân lan can ban công & lô gia",
        "isCategoryHeader": false
    },
    {
        "no": "7.6",
        "itemWorks": "Sàn sơn Epoxy dày 3mm (SF-02AR/SF-03AR/SF-04AR/SF-05AR) Finish floor with 3mm thick Epoxy coating (SF-02AR/SF-03AR/SF-04AR/SF-05AR)",
        "startDate": "14-1-28",
        "submissionDate": "30-11-27",
        "remark": "Khu vực bãi đậu xe & đường xe chạy BF",
        "isCategoryHeader": false
    },
    {
        "no": "7.7",
        "itemWorks": "Đá granite 100×100mm (ST-03AR) 100×100mm granite stone floor (ST-03AR)",
        "startDate": "24-8-27",
        "submissionDate": "10-7-27",
        "remark": "Ram dốc xuống BF",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC HOÀN THIỆN TƯỜNG WALL FINISHING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "8.1",
        "itemWorks": "Gạch Porcelain 600×1200mm (W.Po3) 600×1200mm Porcelain wall tiles (W.Po3)",
        "startDate": "11-8-27",
        "submissionDate": "3-4-27",
        "remark": "Phòng đệm thang máy và hành lang kỹ thuật BF-20F",
        "isCategoryHeader": false
    },
    {
        "no": "8.2",
        "itemWorks": "Gạch Porcelain 300×600mm (W.Po2) 300×600mm Porcelain wall tiles (W.Po2)",
        "startDate": "26-5-27",
        "submissionDate": "11-4-27",
        "remark": "Bể cân bằng, bể nước chữa cháy BF; Nhà bảo vệ, WC, phòng rác GF; Phòng đệm và phòng rác 3F - 20F",
        "isCategoryHeader": false
    },
    {
        "no": "8.3",
        "itemWorks": "Phào chỉ phân tầng, bằng bê tông trang trí đúc sẵn (GC4a/GC4b), kích thước W400×H930mm Level-division moulding, made of precast decorative concrete moulding (GC4a/GC4b), size W400×H930mm",
        "startDate": "16-7-27",
        "submissionDate": "16-6-27",
        "remark": "Tường ngoài 3F, 5F, 19F",
        "isCategoryHeader": false
    },
    {
        "no": "8.4",
        "itemWorks": "Vách trang trí (PA-05), bao gồm hệ khung thép mạ kẽm nhúng nóng, ốp tấm thạch cao 2 lớp dày 12mm sơn hiệu ứng hoàn thiện (SF-01.1AR) Decorative wall panel (PA-05), including hot-dip galvanized steel frame, 2-layer gypsum board sheet, 12mm thick, finished with texture paint coating (SF-01.1AR)",
        "startDate": "6-8-27",
        "submissionDate": "22-6-27",
        "remark": "Khu vực ID - BF",
        "isCategoryHeader": false
    },
    {
        "no": "8.5",
        "itemWorks": "Vách trang trí (PA-07), bao gồm hệ khung thép mạ kẽm nhúng nóng, ốp tấm nhôm sơn hiệu ứng hoàn thiện (SF-01.1AR) Decorative wall panel (PA-07), including hot-dip galvanized steel frame, aluminum sheet cladding with texture paint coating (SF-01.1AR)",
        "startDate": "6-8-27",
        "submissionDate": "22-6-27",
        "remark": "Khu vực ID - BF",
        "isCategoryHeader": false
    },
    {
        "no": "8.6",
        "itemWorks": "Vách trang trí (PA-09), bao gồm hệ khung thép mạ kẽm nhúng nóng, bát treo đá, ốp đá hoàn thiện (ST-01.1AR) Decorative wall panel (PA-09), including hot-dip galvanized steel frame, stone bracket, stone cladding (ST-01.1AR)",
        "startDate": "6-8-27",
        "submissionDate": "22-6-27",
        "remark": "Khu vực ID - BF",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC SƠN PAINTING WORKS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "9.1",
        "itemWorks": "Sơn ngoại thất External painting",
        "startDate": "16-7-27",
        "submissionDate": "7-4-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "9.2",
        "itemWorks": "Sơn nội thất Internal painting",
        "startDate": "16-7-27",
        "submissionDate": "1-6-27",
        "remark": "",
        "isCategoryHeader": false
    },
    {
        "no": "",
        "itemWorks": "CÔNG TÁC LẮP ĐẶT THIẾT BỊ VỆ SINH VÀ PHỤ KIỆN SANITARY WARES AND FITTINGS",
        "startDate": "",
        "submissionDate": "",
        "remark": "",
        "isCategoryHeader": true
    },
    {
        "no": "10.1",
        "itemWorks": "Thiết bị vệ sinh và phụ kiện Sanitary wares and fittings",
        "startDate": "7-3-28",
        "submissionDate": "7-1-28",
        "remark": "WC công cộng BF, GF",
        "isCategoryHeader": false
    }
],
  notesFooter: ""
};

const ProcurementPlan: React.FC<ProcurementPlanProps> = ({ language, onProtectedAction, isAdmin: propIsAdmin }) => {
  const [activeSubTab, setActiveSubTab] = useState<'PMH' | 'MC'>('PMH');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const [dataPMH, setDataPMH] = useState<PMHSheetData | null>(DEFAULT_PMH_DATA);
  const [dataMC, setDataMC] = useState<MCSheetData | null>(DEFAULT_MC_DATA);

  // Admin permission resolution: Only Admin can see and manage "Thêm link"
  const [effectiveIsAdmin, setEffectiveIsAdmin] = useState<boolean>(() => {
    try {
      if (localStorage.getItem('c10_guest_mode') === 'true') return false;
      if (propIsAdmin !== undefined) return propIsAdmin;
      return (
        localStorage.getItem('is_admin') === 'true' &&
        localStorage.getItem('c10_admin_unlocked') === 'true'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleAuthChange = () => {
      try {
        if (localStorage.getItem('c10_guest_mode') === 'true') {
          setEffectiveIsAdmin(false);
          return;
        }
        const hasAuth = 
          propIsAdmin === true ||
          (localStorage.getItem('is_admin') === 'true' && localStorage.getItem('c10_admin_unlocked') === 'true');
        setEffectiveIsAdmin(Boolean(hasAuth));
      } catch {
        setEffectiveIsAdmin(false);
      }
    };

    window.addEventListener('c10-auth-changed', handleAuthChange);
    window.addEventListener('storage', handleAuthChange);
    return () => {
      window.removeEventListener('c10-auth-changed', handleAuthChange);
      window.removeEventListener('storage', handleAuthChange);
    };
  }, [propIsAdmin]);

  const [sheetId, setSheetId] = useState<string>(() => {
    try {
      return localStorage.getItem('c10_procurement_sheet_id') || '';
    } catch {
      return '';
    }
  });
  const [customSheetUrl, setCustomSheetUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('c10_procurement_custom_url') || '';
    } catch {
      return '';
    }
  });
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [sheetInput, setSheetInput] = useState(() => customSheetUrl || sheetId);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  // Parse PMH CSV (GID 1573500963)
  const parsePMHCSV = (text: string): PMHSheetData => {
    const rawRows = parseCSV(text);
    const mainItems: ProcurementItem[] = [];
    const otherItems: OtherProcurementItem[] = [];

    let isOtherSection = false;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const firstCol = (row[0] || '').trim();
      
      if (firstCol.toLowerCase().includes('hạng mục khác')) {
        isOtherSection = true;
        continue;
      }

      if (firstCol === 'STT') {
        continue;
      }

      if (!isOtherSection) {
        if (row[1] && row[1].trim()) {
          mainItems.push({
            stt: row[0] || '',
            category: row[1] || '',
            conditions: row[2] || '',
            tenderStartDate: row[3] || '',
            contractorRequiredDate: row[4] || '',
            constructionConditions: row[5] || '',
            mainContractorSchedule: row[6] || row[7] || '',
            orderLeadTime: row[8] || '',
            notes: row[9] || ''
          });
        }
      } else {
        if (row[1] && row[1].trim()) {
          otherItems.push({
            stt: row[0] || '',
            category: row[1] || '',
            conditions: row[2] || '',
            orderLeadTime: row[8] || row[7] || '',
            notes: row[9] || row[8] || ''
          });
        }
      }
    }

    return { mainItems, otherItems };
  };

  // Parse MC CSV (GID 463708799)
  const parseMCCSV = (text: string): MCSheetData => {
    const rawRows = parseCSV(text);
    const items: MCItem[] = [];
    let notesFooter = '';

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      // Check for footer note
      const fullText = row.join(' ');
      if (fullText.includes('Ghi chú:') || fullText.includes('bóc tách riêng biệt')) {
        notesFooter = fullText.trim();
        continue;
      }

      const col0 = (row[0] || '').trim(); // No. or STT
      const col1 = (row[1] || '').trim(); // Item works
      const col2 = (row[2] || '').trim(); // Start date
      const col3 = (row[3] || '').trim(); // Submission date
      const col4 = (row[4] || '').trim(); // Remark

      if (!col0 && !col1) continue;
      if (col0.toLowerCase().includes('no.') || col1.toLowerCase().includes('item works')) continue;

      // Determine if category header (e.g., No = "1", "2", "3" without dates or sub-numbers)
      const isHeader = !col0.includes('.') && (!col2 && !col3);

      items.push({
        no: col0,
        itemWorks: col1,
        startDate: col2,
        submissionDate: col3,
        remark: col4,
        isCategoryHeader: isHeader
      });
    }

    return { items, notesFooter };
  };

  const fetchSheetData = async (targetId?: string) => {
    setLoading(true);
    setError(false);
    const customId = targetId || localStorage.getItem('c10_procurement_sheet_id') || sheetId;

    try {
      // 1. Fetch PMH: If no custom sheet set by admin, load the user's latest asset
      let pmhLoaded = false;
      if (!customId) {
        try {
          const resLocal = await fetch('/assets/aistudio/C10_Procurement_data_22cf8358');
          if (resLocal.ok) {
            const textLocal = await resLocal.text();
            setDataPMH(parsePMHCSV(textLocal));
            pmhLoaded = true;
          }
        } catch (e) {
          console.warn('Local asset fetch failed:', e);
        }
      }

      if (!pmhLoaded && customId) {
        try {
          const resPmh = await fetch(`https://docs.google.com/spreadsheets/d/${customId}/export?format=csv&gid=1573500963`);
          if (resPmh.ok) {
            const textPmh = await resPmh.text();
            setDataPMH(parsePMHCSV(textPmh));
            pmhLoaded = true;
          }
        } catch (e) {
          console.warn('Remote PMH sheet fetch failed:', e);
        }
      }

      if (!pmhLoaded && !dataPMH) {
        setDataPMH(DEFAULT_PMH_DATA);
      }

      // 2. Fetch MC: Use customId if available, otherwise DEFAULT_SHEET_ID
      const mcSheetId = customId || DEFAULT_SHEET_ID;
      if (mcSheetId) {
        try {
          // Use gviz for browser CORS support
          const resMc = await fetch(`https://docs.google.com/spreadsheets/d/${mcSheetId}/gviz/tq?tqx=out:csv&gid=463708799`);
          if (resMc.ok) {
            const textMc = await resMc.text();
            setDataMC(parseMCCSV(textMc));
          } else {
            const resLocalMc = await fetch('/assets/c10_mc_procurement.csv');
            if (resLocalMc.ok) {
              const textLocalMc = await resLocalMc.text();
              setDataMC(parseMCCSV(textLocalMc));
            }
          }
        } catch (e) {
          try {
            const resLocalMc = await fetch('/assets/c10_mc_procurement.csv');
            if (resLocalMc.ok) {
              const textLocalMc = await resLocalMc.text();
              setDataMC(parseMCCSV(textLocalMc));
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('Error loading procurement data:', err);
      if (!dataPMH) setDataPMH(DEFAULT_PMH_DATA);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheetData();
  }, []);

  // Helper to check if a date string is upcoming or overdue (e.g. within 45 days or past)
  const isUpcomingOrOverdue = (dateStr?: string): boolean => {
    if (!dateStr || !dateStr.trim() || dateStr === '—') return false;
    const clean = dateStr.trim();
    const match = clean.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!match) return false;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    
    const dateObj = new Date(year, month, day);
    if (isNaN(dateObj.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= 45; // Upcoming or past due
  };

  // Filtered PMH
  const filteredPMHMain = useMemo(() => {
    if (!dataPMH?.mainItems) return [];
    if (!searchQuery.trim()) return dataPMH.mainItems;
    const q = searchQuery.toLowerCase();
    return dataPMH.mainItems.filter(item => 
      item.category.toLowerCase().includes(q) ||
      item.conditions.toLowerCase().includes(q) ||
      item.notes.toLowerCase().includes(q) ||
      item.constructionConditions.toLowerCase().includes(q)
    );
  }, [dataPMH, searchQuery]);

  const filteredPMHOther = useMemo(() => {
    if (!dataPMH?.otherItems) return [];
    if (!searchQuery.trim()) return dataPMH.otherItems;
    const q = searchQuery.toLowerCase();
    return dataPMH.otherItems.filter(item => 
      item.category.toLowerCase().includes(q) ||
      item.notes.toLowerCase().includes(q) ||
      item.orderLeadTime.toLowerCase().includes(q)
    );
  }, [dataPMH, searchQuery]);

  // Filtered MC
  const filteredMCItems = useMemo(() => {
    if (!dataMC?.items) return [];
    if (!searchQuery.trim()) return dataMC.items;
    const q = searchQuery.toLowerCase();
    return dataMC.items.filter(item => 
      item.itemWorks.toLowerCase().includes(q) ||
      item.remark.toLowerCase().includes(q) ||
      item.no.toLowerCase().includes(q) ||
      item.startDate.toLowerCase().includes(q) ||
      item.submissionDate.toLowerCase().includes(q)
    );
  }, [dataMC, searchQuery]);

  const handleOpenSheet = (e: React.MouseEvent) => {
    let targetUrl = '';
    const storedCustomUrl = localStorage.getItem('c10_procurement_custom_url') || customSheetUrl;
    const storedCustomId = localStorage.getItem('c10_procurement_sheet_id') || sheetId;

    if (activeSubTab === 'PMH') {
      if (storedCustomUrl && (storedCustomUrl.startsWith('http://') || storedCustomUrl.startsWith('https://'))) {
        targetUrl = storedCustomUrl;
      } else if (storedCustomId) {
        targetUrl = `https://docs.google.com/spreadsheets/d/${storedCustomId}/edit#gid=1573500963`;
      } else {
        // Mở file link dữ liệu kế hoạch mua hàng mới của người dùng
        targetUrl = '/assets/aistudio/C10_Procurement_data_22cf8358';
      }
    } else {
      // Tab MC (Thầu chính)
      const mcId = storedCustomId || DEFAULT_SHEET_ID;
      targetUrl = `https://docs.google.com/spreadsheets/d/${mcId}/edit#gid=463708799`;
    }

    if (onProtectedAction) {
      onProtectedAction(e, targetUrl);
    } else {
      window.open(targetUrl, '_blank');
    }
  };

  const handleSaveSheetConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = sheetInput.trim();
    if (!clean) return;
    let id = clean;
    const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      id = match[1];
    }
    setSheetId(id);
    setCustomSheetUrl(clean);
    localStorage.setItem('c10_procurement_sheet_id', id);
    localStorage.setItem('c10_procurement_custom_url', clean);
    setConfigFeedback(language === 'VN' ? 'Đã cập nhật link Google Sheet cho Kế hoạch mua hàng thành công!' : 'Successfully updated Google Sheet for Procurement Plan!');
    fetchSheetData(id);
    setTimeout(() => {
      setConfigFeedback(null);
      setIsConfigOpen(false);
    }, 1200);
  };

  const handleResetSheetConfig = () => {
    setSheetInput('');
    setSheetId('');
    setCustomSheetUrl('');
    localStorage.removeItem('c10_procurement_sheet_id');
    localStorage.removeItem('c10_procurement_custom_url');
    setConfigFeedback(language === 'VN' ? 'Đã khôi phục về link dữ liệu mới của dự án.' : 'Restored to new project data link.');
    fetchSheetData();
    setTimeout(() => {
      setConfigFeedback(null);
      setIsConfigOpen(false);
    }, 1000);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 sm:p-8 rounded-2xl shadow-sm text-white border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 rounded-xl border border-blue-500/30 text-blue-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                {language === 'EN' ? 'Procurement Plan' : 'Kế hoạch mua hàng'}
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-0.5">
                {language === 'EN' ? 'Live data from' : 'Dữ liệu trực tiếp từ tab'} <strong className="text-blue-400 font-bold">{activeSubTab === 'PMH' ? (language === 'EN' ? 'PMH (Developer)' : 'PMH (Chủ đầu tư)') : (language === 'EN' ? 'MC (Main Contractor)' : 'MC (Thầu chính)')}</strong> {language === 'EN' ? 'in project Google Sheet' : 'trong Google Sheet dự án'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto shrink-0 flex-wrap">
          <button
            onClick={() => fetchSheetData(sheetId)}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            {loading ? (language === 'EN' ? 'Loading...' : 'Đang tải...') : (language === 'EN' ? 'Refresh' : 'Làm mới')}
          </button>

          {/* CHỈ CÓ ADMIN MỚI THẤY CHỮ "THÊM LINK", CÒN LẠI KHÔNG AI ĐƯỢC NHÌN THẤY */}
          {effectiveIsAdmin && (
            <button
              onClick={() => {
                setSheetInput(sheetId);
                setConfigFeedback(null);
                setIsConfigOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 animate-fade-in"
              title={language === 'EN' ? 'Admin: Add / Update Google Sheet Link' : 'Admin: Thêm / Cập nhật link Google Sheet'}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{language === 'EN' ? 'Add Link' : 'Thêm link'}</span>
            </button>
          )}

          
        </div>
      </div>

      {/* Navigation Sub-Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        
        {/* Tab Toggle (PMH vs MC) */}
        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200/80 self-start sm:self-auto">
          <button
            onClick={() => setActiveSubTab('PMH')}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'PMH'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" /> {language === 'EN' ? 'PMH Tab (Developer)' : 'Tab PMH (CĐT)'}
          </button>

          <button
            onClick={() => setActiveSubTab('MC')}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'MC'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" /> {language === 'EN' ? 'MC Tab (Main Contractor)' : 'Tab MC (Thầu chính)'}
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={language === 'EN' ? `Search in tab ${activeSubTab}...` : `Tìm kiếm trong tab ${activeSubTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              {language === 'EN' ? 'Selected Tab' : 'Tab đang chọn'}
            </span>
            <div className="text-xl font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              {activeSubTab === 'PMH' ? (language === 'EN' ? 'PMH Data' : 'Dữ liệu PMH') : (language === 'EN' ? 'MC Data' : 'Dữ liệu MC')}
            </div>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            {activeSubTab === 'PMH' ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              {language === 'EN' ? 'Total Items' : 'Tổng số hạng mục'}
            </span>
            <div className="text-2xl font-black text-blue-600">
              {activeSubTab === 'PMH' 
                ? (dataPMH?.mainItems.length || 0) + (dataPMH?.otherItems.length || 0)
                : (dataMC?.items.length || 0)}
            </div>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* RENDER CONTENT ACCORDING TO SUB TAB */}
      {activeSubTab === 'PMH' ? (
        <>
          {/* PMH Main Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" /> {language === 'EN' ? '1. Main Procurement Items (Developer PMH)' : '1. Hạng mục mua sắm chính (Chủ Đầu Tư PMH)'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {language === 'EN' ? 'Data from PMH tab in Google Sheet (GID 1573500963)' : 'Dữ liệu từ tab PMH trong Google Sheet (GID 1573500963)'}
                </p>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                {filteredPMHMain.length} {language === 'EN' ? 'items' : 'hạng mục'}
              </span>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                <p className="text-xs font-medium">{language === 'EN' ? 'Loading Google Sheets data...' : 'Đang tải dữ liệu từ Google Sheets...'}</p>
              </div>
            ) : (!dataPMH || dataPMH.mainItems.length === 0) && error ? (
              <div className="p-12 text-center text-rose-500 space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto" />
                <p className="text-xs font-medium">{language === 'EN' ? 'Failed to load data. Please check connection.' : 'Không thể tải dữ liệu. Vui lòng kiểm tra lại kết nối.'}</p>
              </div>
            ) : filteredPMHMain.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="text-xs font-medium">{language === 'EN' ? `No items found matching "${searchQuery}".` : `Không tìm thấy hạng mục nào phù hợp với từ khóa "${searchQuery}".`}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3.5 px-4 w-12 text-center">STT</th>
                      <th className="py-3.5 px-4 min-w-[280px]">{language === 'EN' ? 'Category' : 'Hạng mục'}</th>
                      <th className="py-3.5 px-4 w-36 text-center">{language === 'EN' ? 'Tender Start' : 'Bắt đầu Tender'}</th>
                      <th className="py-3.5 px-4 w-36 text-center">{language === 'EN' ? 'Required Contractor' : 'Có thầu trước'}</th>
                      <th className="py-3.5 px-4 w-36 text-center">{language === 'EN' ? 'Main Contractor' : 'Thầu chính'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredPMHMain.map((item, idx) => {
                      const isTenderUrgent = isUpcomingOrOverdue(item.tenderStartDate);
                      const isContractorUrgent = isUpcomingOrOverdue(item.contractorRequiredDate);
                      const isUrgent = isTenderUrgent || isContractorUrgent;

                      return (
                        <tr 
                          key={idx} 
                          className={`transition-colors ${
                            isUrgent 
                              ? 'bg-rose-50/80 hover:bg-rose-100/80 border-l-4 border-l-rose-500' 
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className={`py-4 px-4 text-center font-bold ${isUrgent ? 'text-rose-700 bg-rose-100/50' : 'text-slate-500 bg-slate-50/30'}`}>
                            {item.stt || idx + 1}
                          </td>
                          <td className="py-4 px-4 font-bold text-slate-900 whitespace-pre-line leading-relaxed">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{item.category}</span>
                              {isUrgent && (
                                <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-md uppercase tracking-wider animate-pulse">
                                  {language === 'EN' ? 'Upcoming' : 'Sắp đến'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center font-semibold text-slate-800">
                            {item.tenderStartDate ? (
                              <span className={`inline-block px-2.5 py-1 rounded-md border font-bold text-[11px] ${
                                isTenderUrgent 
                                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs' 
                                  : 'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                                {item.tenderStartDate}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-4 px-4 text-center font-semibold text-slate-800">
                            {item.contractorRequiredDate ? (
                              <span className={`inline-block px-2.5 py-1 rounded-md border font-bold text-[11px] ${
                                isContractorUrgent 
                                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs' 
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {item.contractorRequiredDate}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-4 px-4 text-center font-medium text-slate-700">
                            {item.mainContractorSchedule || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PMH Secondary Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-600" /> {language === 'EN' ? '2. Other Items & Lead Time (PMH)' : '2. Hạng mục khác & Thời gian đặt hàng vật tư (PMH)'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {language === 'EN' ? 'Material order lead-time & origin' : 'Thời gian Lead-time đặt mua & xuất xứ vật tư'}
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                {filteredPMHOther.length} {language === 'EN' ? 'materials' : 'vật tư'}
              </span>
            </div>

            {filteredPMHOther.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-medium">{language === 'EN' ? 'No secondary materials found.' : 'Không có vật tư phụ hoặc không tìm thấy theo tìm kiếm.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-3.5 px-4 w-12 text-center">STT</th>
                      <th className="py-3.5 px-4 min-w-[250px]">{language === 'EN' ? 'Category / Material' : 'Hạng mục / Vật tư'}</th>
                      <th className="py-3.5 px-4 w-40 text-center">{language === 'EN' ? 'Order Lead Time' : 'Thời gian đặt hàng'}</th>
                      <th className="py-3.5 px-4 min-w-[250px]">{language === 'EN' ? 'Notes / Origin' : 'Ghi chú / Xuất xứ'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredPMHOther.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 text-center font-bold text-slate-500 bg-slate-50/30">
                          {item.stt || idx + 1}
                        </td>
                        <td className="py-4 px-4 font-bold text-slate-900 leading-relaxed">
                          {item.category}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 font-black rounded-lg border border-amber-200 text-xs">
                            {item.orderLeadTime || '—'}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-slate-600 leading-relaxed italic">
                          {item.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* MC TABLE (GID 463708799) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" /> {language === 'EN' ? 'Construction Items & Submittal Schedule (Main Contractor MC)' : 'Hạng mục thi công & Tiến độ trình nộp (Thầu chính MC)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'EN' ? 'Data from MC tab in Google Sheet (GID 463708799)' : 'Dữ liệu chính xác từ tab MC trong Google Sheet (GID 463708799)'}
              </p>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              {filteredMCItems.length} {language === 'EN' ? 'items' : 'công tác / vật tư'}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-xs font-medium">{language === 'EN' ? 'Loading MC tab data...' : 'Đang tải dữ liệu từ Google Sheets (Tab MC)...'}</p>
            </div>
          ) : (!dataMC || dataMC.items.length === 0) && error ? (
            <div className="p-12 text-center text-rose-500 space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto" />
              <p className="text-xs font-medium">{language === 'EN' ? 'Failed to load MC tab data. Please try again.' : 'Không thể tải dữ liệu tab MC. Vui lòng thử lại.'}</p>
            </div>
          ) : filteredMCItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-xs font-medium">{language === 'EN' ? `No items found in MC tab matching "${searchQuery}".` : `Không tìm thấy hạng mục nào trong tab MC phù hợp với "${searchQuery}".`}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3.5 px-4 w-16 text-center">STT / No.</th>
                    <th className="py-3.5 px-4 min-w-[300px]">{language === 'EN' ? 'Item Works / Material' : 'Hạng mục / Vật tư thi công (Item works)'}</th>
                    <th className="py-3.5 px-4 w-32 text-center">{language === 'EN' ? 'Start Date' : 'Ngày bắt đầu (Start Date)'}</th>
                    <th className="py-3.5 px-4 w-32 text-center">{language === 'EN' ? 'Submission Date' : 'Hạn nộp hồ sơ (Submission Date)'}</th>
                    <th className="py-3.5 px-4 min-w-[250px]">{language === 'EN' ? 'Area / Remarks' : 'Khu vực / Ghi chú (Remark)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredMCItems.map((item, idx) => {
                    if (item.isCategoryHeader) {
                      return (
                        <tr key={idx} className="bg-slate-800 text-white font-black text-xs">
                          <td className="py-3 px-4 text-center font-bold text-blue-300 bg-slate-900/60">
                            {item.no}
                          </td>
                          <td colSpan={4} className="py-3 px-4 text-slate-100 uppercase tracking-wide">
                            {item.itemWorks}
                          </td>
                        </tr>
                      );
                    }

                    const isStartUrgent = isUpcomingOrOverdue(item.startDate);
                    const isSubmissionUrgent = isUpcomingOrOverdue(item.submissionDate);
                    const isUrgent = isStartUrgent || isSubmissionUrgent;

                    return (
                      <tr 
                        key={idx} 
                        className={`transition-colors ${
                          isUrgent 
                            ? 'bg-rose-50/80 hover:bg-rose-100/80 border-l-4 border-l-rose-500' 
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className={`py-3.5 px-4 text-center font-bold ${isUrgent ? 'text-rose-700 bg-rose-100/50' : 'text-slate-500 bg-slate-50/30'}`}>
                          {item.no}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 leading-relaxed">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{item.itemWorks}</span>
                            {isUrgent && (
                              <span className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded-md uppercase tracking-wider animate-pulse">
                                {language === 'EN' ? 'Upcoming' : 'Sắp đến'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-800">
                          {item.startDate ? (
                            <span className={`inline-block px-2.5 py-1 rounded-md border font-bold text-[11px] ${
                              isStartUrgent 
                                ? 'bg-rose-600 text-white border-rose-700 shadow-xs' 
                                : 'bg-blue-50 text-blue-700 border-blue-100'
                            }`}>
                              {item.startDate}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium text-slate-800">
                          {item.submissionDate ? (
                            <span className={`inline-block px-2.5 py-1 rounded-md border font-bold text-[11px] ${
                              isSubmissionUrgent 
                                ? 'bg-rose-600 text-white border-rose-700 shadow-xs' 
                                : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {item.submissionDate}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 leading-relaxed italic">
                          {item.remark || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {dataMC?.notesFooter && (
                <div className="p-4 bg-amber-50/60 border-t border-amber-100 text-amber-900 text-xs italic">
                  💡 <strong>{language === 'EN' ? 'Project Note:' : 'Ghi chú dự án:'}</strong> {dataMC.notesFooter}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin Google Sheet Configuration Modal */}
      {isConfigOpen && effectiveIsAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  {language === 'EN' ? 'Add / Configure Google Sheet Link' : 'Thêm link Google Sheet Kế hoạch mua hàng'}
                </h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSheetConfig} className="p-6 space-y-4">
              {configFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                  {configFeedback}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {language === 'EN' ? 'New Google Sheet URL or ID' : 'Link Google Sheet mới'}
                </label>
                <input
                  type="text"
                  value={sheetInput}
                  onChange={(e) => setSheetInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {language === 'EN' 
                    ? 'Paste your live Google Sheet URL to sync new data. Click Reset Default to return to project file.' 
                    : 'Dán đường link Google Sheet mới để đồng bộ trực tiếp. Nhấn Khôi phục để quay về file dữ liệu mới của dự án.'}
                </p>
                <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-semibold text-slate-700">{language === 'EN' ? 'Current source: ' : 'Nguồn dữ liệu hiện tại: '}</span>
                  <span className="text-blue-600 font-mono break-all font-medium">
                    {customSheetUrl || (sheetId ? `Sheet ID: ${sheetId}` : 'C10 Procurement data (Mới)')}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetSheetConfig}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  {language === 'EN' ? 'Reset Default' : 'Khôi phục mặc định'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
                >
                  {language === 'EN' ? 'Save & Sync' : 'Lưu & Đồng bộ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProcurementPlan;
