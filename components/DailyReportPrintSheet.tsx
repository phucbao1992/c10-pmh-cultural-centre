import React, { useMemo } from 'react';
import { Printer } from 'lucide-react';
import {
  DailyReportModel,
  formatVNDate,
  WeatherRow,
  SafetyRow,
  ManpowerRow,
  MachineryRow,
  MaterialRow,
  WorkRow,
  InspectionRow,
  PhotoRow
} from '../services/dailyReportService';

export type SignRecord = DailyReportModel['sign'];

export interface DailyReportPrintSheetProps {
  report: DailyReportModel;
  onPrint?: () => void;
}

/**
 * Phương án 1: Native Browser Print (In Vector gốc chuẩn A4 không bao giờ bị lệch lề)
 * - Tự động đặt document.title chuẩn trước khi window.print()
 * - Trình duyệt render vector 100% sắc nét, chuẩn khổ A4 portrait / landscape
 * - Khắc phục triệt để lỗi lệch lề trái và mờ chữ của html2canvas / html2pdf / jsPDF
 */
export const handleExportPdf = (report: any) => {
  const reportNo = report?.reportNo || report?.g?.reportNo || 'C10';
  const rawDate = report?.date || report?.g?.reportDate || '';
  const cleanDate = String(rawDate).replace(/[/\\?%*:|"<>]/g, '-');
  const prevTitle = document.title;
  document.title = `${reportNo}_Bao_Cao_Ngay_${cleanDate}`;
  window.print();
  setTimeout(() => {
    document.title = prevTitle;
  }, 1200);
};

// -------------------------------------------------------------
// Sub-types for grouped materials and works
// -------------------------------------------------------------
export interface PaginatedMatGroup {
  id: string;
  sectionLetter: string;
  name: string;
  rows: (MaterialRow & { no: number })[];
}

export interface PaginatedWorkGroup {
  id: string;
  sectionLetter: string;
  name: string;
  rows: (WorkRow & { no: number })[];
}

export function groupMaterials(rawMat: MaterialRow[]): PaginatedMatGroup[] {
  const groups: PaginatedMatGroup[] = [];
  let currentGroup: PaginatedMatGroup = {
    id: 'mat_default',
    sectionLetter: 'A',
    name: 'VẬT LIỆU CHUNG',
    rows: []
  };
  let secIdx = 0;
  let rowIdx = 0;

  for (const item of rawMat || []) {
    if (item.type === 'A') {
      const letter = String.fromCharCode(65 + secIdx++);
      currentGroup = {
        id: item.id || `mat_sec_${secIdx}`,
        sectionLetter: letter,
        name: item.name,
        rows: []
      };
      groups.push(currentGroup);
      rowIdx = 0;
    } else {
      if (groups.length === 0) {
        groups.push(currentGroup);
      }
      currentGroup.rows.push({
        ...item,
        no: ++rowIdx
      });
    }
  }
  return groups;
}

export function groupWorks(rawWork: WorkRow[]): PaginatedWorkGroup[] {
  const groups: PaginatedWorkGroup[] = [];
  let currentGroup: PaginatedWorkGroup = {
    id: 'work_default',
    sectionLetter: 'A',
    name: 'CÔNG VIỆC CHUNG',
    rows: []
  };
  let secIdx = 0;
  let rowIdx = 0;

  for (const item of rawWork || []) {
    if (item.type === 'A') {
      const letter = String.fromCharCode(65 + secIdx++);
      currentGroup = {
        id: item.id || `work_sec_${secIdx}`,
        sectionLetter: letter,
        name: item.name,
        rows: []
      };
      groups.push(currentGroup);
      rowIdx = 0;
    } else {
      if (groups.length === 0) {
        groups.push(currentGroup);
      }
      currentGroup.rows.push({
        ...item,
        no: ++rowIdx
      });
    }
  }
  return groups;
}

// -------------------------------------------------------------
// Page Specification for Dynamic Pagination
// -------------------------------------------------------------
export interface ReportPageDef {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  isLandscape?: boolean;
  hasWeather?: boolean;
  hasSafety?: boolean;
  hasManMach?: boolean;
  matBlocks: { isContinued: boolean; groups: PaginatedMatGroup[] }[];
  workBlocks: { isContinued: boolean; groups: PaginatedWorkGroup[] }[];
  inspBlocks: { isContinued: boolean; rows: InspectionRow[] }[];
  photoBlocks: { isContinued: boolean; photos: PhotoRow[]; hasSign: boolean }[];
}

/**
 * Thuật toán phân trang động (Dynamic Pagination):
 * Tính toán dung lượng chiều cao thực tế theo số lượng dòng và phân bổ
 * các mục vào từng trang A4 riêng biệt, đảm bảo:
 * 1. Tuyệt đối KHÔNG làm mất hoặc che khuất FOOTER chân trang (Trang X / Y).
 * 2. Không bao giờ xuất hiện tiêu đề mồ côi (Orphan Header) không có dòng nội dung ở cuối trang.
 * 3. Khi mục lớn bị chuyển sang trang sau, luôn tự động lặp lại TIÊU ĐỀ ĐẦU MỤC (tiếp theo)
 *    và TOÀN BỘ CỘT TIÊU ĐỀ BẢNG (thead).
 * 4. Mục VIII (Hình ảnh thi công) được hiển thị theo khổ A4 Ngang (Landscape: 297mm x 210mm),
 *    mỗi trang 4 ảnh rộng rãi, sắc nét và khối ký tên trang trọng.
 */
export function buildDynamicPages(report: DailyReportModel): ReportPageDef[] {
  const SUBSEQUENT_PAGE_CAPACITY = 850;

  const inspRows = report.insp || [];
  const matGroups = groupMaterials(report.mat || []);
  const workGroups = groupWorks(report.work || []);

  const pages: ReportPageDef[] = [];

  const createNewPage = (isLandscape: boolean = false): ReportPageDef => ({
    pageNumber: pages.length + 1,
    totalPages: 1,
    isFirstPage: pages.length === 0,
    isLandscape,
    matBlocks: [],
    workBlocks: [],
    inspBlocks: [],
    photoBlocks: []
  });

  // Trang 1 luôn chứa đầy đủ và trọn vẹn:
  // Header + Mục I (Thời tiết) + Mục II (An toàn) + Mục III (Nhân lực) + Mục IV (Máy móc)
  let currentPage = createNewPage();
  pages.push(currentPage);
  currentPage.hasWeather = true;
  currentPage.hasSafety = true;
  currentPage.hasManMach = true;

  // Ngắt sang Trang 2 để Mục V (Vật liệu) bắt đầu trang trọng ở Trang 2
  currentPage = createNewPage();
  pages.push(currentPage);
  let curCapacity = SUBSEQUENT_PAGE_CAPACITY;
  let curUsed = 0;

  // 4. Mục V (Vật liệu nhập vào công trình)
  if (matGroups.length > 0) {
    let pendingMatGroups = [...matGroups];
    let isContinued = false;

    while (pendingMatGroups.length > 0) {
      const matBaseH = 28 + 32 + 8;

      if (curCapacity - curUsed < 140) {
        currentPage = createNewPage();
        pages.push(currentPage);
        curCapacity = SUBSEQUENT_PAGE_CAPACITY;
        curUsed = 0;
      }

      const groupsToFit: PaginatedMatGroup[] = [];
      let batchH = matBaseH;

      while (pendingMatGroups.length > 0) {
        const nextG = pendingMatGroups[0];
        const gH = 26 + nextG.rows.length * 28;

        if (curUsed + batchH + gH <= curCapacity) {
          groupsToFit.push(pendingMatGroups.shift()!);
          batchH += gH;
        } else if (groupsToFit.length === 0 && curUsed === 0) {
          groupsToFit.push(pendingMatGroups.shift()!);
          batchH += gH;
          break;
        } else {
          break;
        }
      }

      if (groupsToFit.length > 0) {
        currentPage.matBlocks.push({
          isContinued,
          groups: groupsToFit
        });
        curUsed += batchH;
        isContinued = true;
      }

      if (pendingMatGroups.length > 0) {
        currentPage = createNewPage();
        pages.push(currentPage);
        curCapacity = SUBSEQUENT_PAGE_CAPACITY;
        curUsed = 0;
      }
    }
  }

  // 5. Mục VI (Khối lượng công việc thực hiện trong ngày)
  if (workGroups.length > 0) {
    let pendingWorkGroups = [...workGroups];
    let isContinued = false;

    while (pendingWorkGroups.length > 0) {
      const workBaseH = 28 + 48 + 8;

      if (curCapacity - curUsed < 160) {
        currentPage = createNewPage();
        pages.push(currentPage);
        curCapacity = SUBSEQUENT_PAGE_CAPACITY;
        curUsed = 0;
      }

      const groupsToFit: PaginatedWorkGroup[] = [];
      let batchH = workBaseH;

      while (pendingWorkGroups.length > 0) {
        const nextG = pendingWorkGroups[0];
        const gH = 26 + nextG.rows.length * 28;

        if (curUsed + batchH + gH <= curCapacity) {
          groupsToFit.push(pendingWorkGroups.shift()!);
          batchH += gH;
        } else if (groupsToFit.length === 0 && curUsed === 0) {
          groupsToFit.push(pendingWorkGroups.shift()!);
          batchH += gH;
          break;
        } else {
          break;
        }
      }

      if (groupsToFit.length > 0) {
        currentPage.workBlocks.push({
          isContinued,
          groups: groupsToFit
        });
        curUsed += batchH;
        isContinued = true;
      }

      if (pendingWorkGroups.length > 0) {
        currentPage = createNewPage();
        pages.push(currentPage);
        curCapacity = SUBSEQUENT_PAGE_CAPACITY;
        curUsed = 0;
      }
    }
  }

  // 6. Mục VII (Công tác nghiệm thu trong ngày)
  if (inspRows.length > 0) {
    const inspH = 28 + 28 + inspRows.length * 28 + 10;
    if (curUsed + inspH <= curCapacity) {
      currentPage.inspBlocks.push({ isContinued: false, rows: inspRows });
      curUsed += inspH;
    } else {
      currentPage = createNewPage();
      pages.push(currentPage);
      curCapacity = SUBSEQUENT_PAGE_CAPACITY;
      currentPage.inspBlocks.push({ isContinued: false, rows: inspRows });
      curUsed = inspH;
    }
  }

  // 7. Mục VIII (Hình ảnh thi công) & Khối chữ ký xác nhận 2 bên
  // Khổ A4 Ngang (Landscape: 297mm x 210mm), mỗi trang tối đa 4 ảnh (2 cột x 2 hàng).
  // Khối chữ ký đại diện Delta & SCQC2 nằm trang trọng ở trang ảnh cuối cùng.
  const allPhotos: PhotoRow[] = (report.photos && report.photos.length > 0) ? report.photos : [
    { id: 'p1', type: 'row', url: '', caption: 'Ảnh 1' },
    { id: 'p2', type: 'row', url: '', caption: 'Ảnh 2' }
  ];

  const PHOTOS_PER_PAGE = 4;
  const photoBatches: PhotoRow[][] = [];
  for (let i = 0; i < allPhotos.length; i += PHOTOS_PER_PAGE) {
    photoBatches.push(allPhotos.slice(i, i + PHOTOS_PER_PAGE));
  }

  photoBatches.forEach((batch, batchIdx) => {
    const isFirstBatch = batchIdx === 0;
    const isLastBatch = batchIdx === photoBatches.length - 1;

    // Trang hình ảnh luôn độc lập sang trang khổ ngang Landscape
    currentPage = createNewPage(false);
    pages.push(currentPage);

    currentPage.photoBlocks.push({
      isContinued: !isFirstBatch,
      photos: batch,
      hasSign: isLastBatch
    });
  });

  const total = pages.length;
  pages.forEach((p) => {
    p.totalPages = total;
  });

  return pages;
}
// -------------------------------------------------------------
// Header & Footer Components
// -------------------------------------------------------------
const PageOneHeader: React.FC<{ report: DailyReportModel }> = ({ report }) => (
  <div style={{ flexShrink: 0, marginBottom: '6px' }}>
    {/* Logos Header */}
    <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '6px' }}>
      {([
        ['TƯ VẤN GIÁM SÁT/ CONSULTANT', 'tvgs'],
        ['CHỦ ĐẦU TƯ/ CLIENT', 'cdt'],
        ['NHÀ THẦU THI CÔNG/ CONTRACTOR', 'nt']
      ] as const).map(([label, key]) => (
        <div key={key} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '7.5pt', color: '#6b7280', fontWeight: 700 }}>{label}</div>
          <div className="c10-logo-box" style={{ height: '48px', minHeight: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible', marginTop: '2px' }}>
            {report.logos[key] ? (
              <img
                className="c10-logo-img"
                src={report.logos[key]}
                alt={label}
                style={{ height: '44px', width: 'auto', maxWidth: '100%', maxHeight: '44px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>

    <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '13pt', margin: '4px 0 6px' }}>
      BÁO CÁO NGÀY/ <i>DAILY REPORT</i>
    </div>

    {/* General Info Table */}
    <table style={{ marginBottom: '6px' }}>
      <tbody>
        <tr>
          <td className="l b" style={{ width: '22%' }}>DỰ ÁN/ <i>PROJECT:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.project}</td>
          <td className="l b" style={{ width: '22%' }}>ĐỊA ĐIỂM/ <i>LOCATION:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.location}</td>
        </tr>
        <tr>
          <td className="l b" style={{ width: '22%' }}>CHỦ ĐẦU TƯ/ <i>CLIENT:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.client}</td>
          <td className="l b" style={{ width: '22%' }}>BÁO CÁO SỐ/ <i>REPORT NO.:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.reportNo}</td>
        </tr>
        <tr>
          <td className="l b" style={{ width: '22%' }}>TƯ VẤN GIÁM SÁT/ <i>CONSULTANT:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.consultant}</td>
          <td className="l b" style={{ width: '22%' }}>NGÀY LẬP BÁO CÁO/ <i>REPORT DATE:</i></td>
          <td className="l" style={{ width: '28%' }}>{formatVNDate(report.g.reportDate)}</td>
        </tr>
        <tr>
          <td className="l b" style={{ width: '22%' }}>NHÀ THẦU/ <i>CONTRACTOR:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.contractor}</td>
          <td className="l b" style={{ width: '22%' }}>NGƯỜI BÁO CÁO/ <i>REPORTER:</i></td>
          <td className="l" style={{ width: '28%' }}>{report.g.reporter}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

const RunningHeader: React.FC<{ report: DailyReportModel; pageNumber: number; totalPages: number }> = ({ report, pageNumber }) => (
  <div style={{ flexShrink: 0, borderBottom: '1.5px solid #1e3a8a', paddingBottom: '4px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div style={{ fontWeight: 700, fontSize: '8.5pt', color: '#1e3a8a', textTransform: 'uppercase' }}>
      {report.g.project || 'DỰ ÁN C10 - NHÀ VĂN HÓA PHÚ MỸ HƯNG'} — BÁO CÁO NGÀY
    </div>
    <div style={{ fontSize: '7.5pt', color: '#4b5563' }}>
      Báo cáo số: <b>{report.g.reportNo}</b> &nbsp;|&nbsp; Ngày: <b>{formatVNDate(report.g.reportDate)}</b> &nbsp;|&nbsp; <i>Trang {pageNumber}</i>
    </div>
  </div>
);

const PageFooter: React.FC<{ report: DailyReportModel; pageNumber: number; totalPages: number }> = ({ report, pageNumber, totalPages }) => (
  <div
    className="c10-page-footer"
    style={{
      flexShrink: 0,
      marginTop: 'auto',
      paddingTop: '6px',
      paddingBottom: '8px',
      borderTop: '1px solid #1f2937',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '8pt',
      color: '#374151',
      lineHeight: 1.2
    }}
  >
    <div style={{ fontStyle: 'italic', fontWeight: 500, maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {report.g.project || 'Dự án C10 - Nhà Văn Hóa Phú Mỹ Hưng'} &nbsp;—&nbsp; {report.g.contractor || 'Công ty TNHH Tập Đoàn Xây Dựng Delta'}
    </div>
    <div style={{ fontWeight: 700, fontSize: '8.5pt', color: '#111827', whiteSpace: 'nowrap' }}>
      Trang {pageNumber} / {totalPages}
    </div>
  </div>
);

// -------------------------------------------------------------
// Section View Components
// -------------------------------------------------------------
const SectionWeatherView: React.FC<{ weather: WeatherRow[] }> = ({ weather }) => (
  <div style={{ marginBottom: '6px' }}>
    <div className="c10-a4-ttl">
      I. GHI CHÉP THỜI TIẾT/ <i>WEATHER RECORDS</i>
    </div>
    <table>
      <thead>
        <tr>
          <th style={{ width: '32px' }}>STT</th>
          <th>THỜI TIẾT<br /><i style={{ fontSize: '8pt', fontWeight: 400 }}>WEATHER</i></th>
          <th style={{ width: '130px' }}>THỜI GIAN<br /><i style={{ fontSize: '8pt', fontWeight: 400 }}>TIME</i></th>
          <th style={{ width: '150px' }}>GHI CHÚ<br /><i style={{ fontSize: '8pt', fontWeight: 400 }}>NOTE</i></th>
        </tr>
      </thead>
      <tbody>
        {weather.map((w, idx) => (
          <tr key={w.id}>
            <td>{idx + 1}</td>
            <td className="l">{w.weather || '\u00A0'}</td>
            <td>{w.time || '\u00A0'}</td>
            <td>{w.note || '\u00A0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionSafetyView: React.FC<{ safety: SafetyRow[] }> = ({ safety }) => (
  <div style={{ marginBottom: '6px' }}>
    <div className="c10-a4-ttl">
      II. QUẢN LÝ AN TOÀN CÔNG TRÌNH/ <i>CONSTRUCTION SAFETY MANAGEMENT</i>
    </div>
    <table>
      <thead>
        <tr>
          <th style={{ width: '32px' }}>STT</th>
          <th>MÔ TẢ<br /><i style={{ fontSize: '8pt', fontWeight: 400 }}>DESCRIPTION</i></th>
        </tr>
      </thead>
      <tbody>
        {safety.map((s, idx) => (
          <tr key={s.id}>
            <td>{idx + 1}</td>
            <td className="l">{s.desc || '\u00A0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionManMachView: React.FC<{ man: ManpowerRow[]; mach: MachineryRow[] }> = ({ man, mach }) => (
  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
    <table style={{ flex: '1 1 0', width: 'calc(50% - 4px)' }}>
      <thead>
        <tr>
          <th colSpan={4} className="l">III. NHÂN LỰC TRONG NGÀY/ <i>DAILY MANPOWER</i></th>
        </tr>
        <tr>
          <th rowSpan={2} style={{ width: '28px' }}>STT</th>
          <th rowSpan={2}>BỘ PHẬN<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>PERSONNEL CATEGORY</i></th>
          <th colSpan={2}>QUÂN SỐ/ <i style={{ fontSize: '7.5pt', fontWeight: 400 }}>HEADCOUNT</i></th>
        </tr>
        <tr>
          <th style={{ width: '58px' }}>TRONG GIỜ<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>REGULAR</i></th>
          <th style={{ width: '58px' }}>TĂNG CA<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>OVERTIME</i></th>
        </tr>
      </thead>
      <tbody>
        {man.map((m, idx) => (
          <tr key={m.id}>
            <td>{idx + 1}</td>
            <td className="l">{m.dept || '\u00A0'}</td>
            <td>{m.regular ?? 0}</td>
            <td>{m.overtime ?? 0}</td>
          </tr>
        ))}
        <tr className="b" style={{ background: '#f8fafc' }}>
          <td colSpan={2} style={{ textAlign: 'right', paddingRight: '6px' }}>Tổng nhân lực/ Total:</td>
          <td>{man.reduce((s, r) => s + (Number(r.regular) || 0), 0)}</td>
          <td>{man.reduce((s, r) => s + (Number(r.overtime) || 0), 0)}</td>
        </tr>
      </tbody>
    </table>

    <table style={{ flex: '1 1 0', width: 'calc(50% - 4px)' }}>
      <thead>
        <tr>
          <th colSpan={3} className="l">IV. MÁY MÓC VÀ THIẾT BỊ/ <i>MACHINERY & EQUIPMENT</i></th>
        </tr>
        <tr>
          <th style={{ width: '28px' }}>STT</th>
          <th>TÊN THIẾT BỊ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>EQUIPMENT NAME</i></th>
          <th style={{ width: '64px' }}>SỐ LƯỢNG<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>QUANTITY</i></th>
        </tr>
      </thead>
      <tbody>
        {mach.map((m, idx) => (
          <tr key={m.id}>
            <td>{idx + 1}</td>
            <td className="l">{m.name || '\u00A0'}</td>
            <td>{m.qty ?? 0}</td>
          </tr>
        ))}
        <tr className="b" style={{ background: '#f8fafc' }}>
          <td colSpan={2} style={{ textAlign: 'right', paddingRight: '6px' }}>Tổng thiết bị/ Total:</td>
          <td>{mach.reduce((s, r) => s + (Number(r.qty) || 0), 0)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

const SectionMaterialsView: React.FC<{ groups: PaginatedMatGroup[]; isContinued: boolean }> = ({ groups, isContinued }) => (
  <div style={{ marginBottom: '6px' }}>
    <div className="c10-a4-ttl">
      {isContinued ? (
        <>V. VẬT LIỆU NHẬP VÀO CÔNG TRÌNH <i>(tiếp theo)</i>/ <i>MATERIALS DELIVERED TO SITE (Continued)</i></>
      ) : (
        <>V. VẬT LIỆU NHẬP VÀO CÔNG TRÌNH/ <i>MATERIALS DELIVERED TO SITE</i></>
      )}
    </div>
    <table>
      <thead>
        <tr>
          <th style={{ width: '28px' }}>STT</th>
          <th>VẬT LIỆU<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>MATERIAL</i></th>
          <th style={{ width: '130px' }}>NHÀ CUNG CẤP<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>SUPPLIER</i></th>
          <th style={{ width: '46px' }}>ĐƠN VỊ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>UNIT</i></th>
          <th style={{ width: '90px' }}>SỐ LƯỢNG NHẬP TRONG NGÀY<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>QUANTITY RECEIVED TODAY</i></th>
          <th style={{ width: '85px' }}>LŨY KẾ NHẬP<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>CUMULATIVE RECEIVED</i></th>
          <th style={{ width: '120px' }}>GHI CHÚ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>NOTE</i></th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <React.Fragment key={group.id}>
            <tr className="sec">
              <td>{group.sectionLetter}</td>
              <td className="l">{group.name}</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            </tr>
            {group.rows.map((m) => (
              <tr key={m.id}>
                <td>{m.no}</td>
                <td className="l">{m.name || '\u00A0'}</td>
                <td>{m.supplier || '\u00A0'}</td>
                <td>{m.unit || '\u00A0'}</td>
                <td>{m.today ?? '\u00A0'}</td>
                <td>{m.cum ?? '\u00A0'}</td>
                <td>{m.note || '\u00A0'}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionWorksView: React.FC<{ groups: PaginatedWorkGroup[]; isContinued: boolean }> = ({ groups, isContinued }) => (
  <div style={{ marginBottom: '6px' }}>
    <div className="c10-a4-ttl">
      {isContinued ? (
        <>VI. KHỐI LƯỢNG CÔNG VIỆC THỰC HIỆN TRONG NGÀY <i>(tiếp theo)</i>/ <i>DAILY WORK QUANTITY (Continued)</i></>
      ) : (
        <>VI. KHỐI LƯỢNG CÔNG VIỆC THỰC HIỆN TRONG NGÀY/ <i>DAILY WORK QUANTITY</i></>
      )}
    </div>
    <table>
      <thead>
        <tr>
          <th rowSpan={2} style={{ width: '28px' }}>STT</th>
          <th rowSpan={2}>NỘI DUNG CÔNG VIỆC<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>WORK DESCRIPTION</i></th>
          <th colSpan={4}>KHỐI LƯỢNG CÔNG VIỆC/ <i style={{ fontSize: '7.5pt', fontWeight: 400 }}>WORK QUANTITY</i></th>
          <th rowSpan={2} style={{ width: '46px' }}>ĐƠN VỊ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>UNIT</i></th>
          <th rowSpan={2} style={{ width: '110px' }}>GHI CHÚ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>NOTE</i></th>
        </tr>
        <tr>
          <th style={{ width: '70px' }}>KẾ HOẠCH HÔM NAY<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>DAILY PLANNED</i></th>
          <th style={{ width: '70px' }}>THỰC HIỆN HÔM NAY<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>DAILY ACTUAL</i></th>
          <th style={{ width: '75px' }}>LŨY KẾ ĐẾN NAY<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>CUMULATIVE TO DATE</i></th>
          <th style={{ width: '70px' }}>KẾ HOẠCH MAI<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>TOMORROW PLAN</i></th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <React.Fragment key={group.id}>
            <tr className="sec">
              <td>{group.sectionLetter}</td>
              <td className="l">{group.name}</td>
              <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            </tr>
            {group.rows.map((w) => (
              <tr key={w.id}>
                <td>{w.no}</td>
                <td className="l">{w.name || '\u00A0'}</td>
                <td>{w.plan ?? '\u00A0'}</td>
                <td>{w.today ?? '\u00A0'}</td>
                <td>{w.cum ?? '\u00A0'}</td>
                <td>{w.next ?? '\u00A0'}</td>
                <td>{w.unit || '\u00A0'}</td>
                <td>{w.note || '\u00A0'}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionInspectionsView: React.FC<{ rows: InspectionRow[]; isContinued: boolean }> = ({ rows, isContinued }) => (
  <div style={{ marginBottom: '6px' }}>
    <div className="c10-a4-ttl">
      {isContinued ? (
        <>VII. CÔNG TÁC NGHIỆM THU TRONG NGÀY <i>(tiếp theo)</i>/ <i>DAILY INSPECTION WORKS (Continued)</i></>
      ) : (
        <>VII. CÔNG TÁC NGHIỆM THU TRONG NGÀY/ <i>DAILY INSPECTION WORKS</i></>
      )}
    </div>
    <table>
      <thead>
        <tr>
          <th style={{ width: '28px' }}>STT</th>
          <th>HẠNG MỤC<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>WORK ITEM</i></th>
          <th style={{ width: '110px' }}>THỜI GIAN VÀ NGÀY<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>TIME AND DATE</i></th>
          <th style={{ width: '110px' }}>CÁN BỘ PHỤ TRÁCH<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>PERSON IN CHARGE</i></th>
          <th style={{ width: '90px' }}>SĐT<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>PHONE NO.</i></th>
          <th style={{ width: '110px' }}>THÀNH PHẦN THAM GIA<br /><i style={{ fontSize: '7pt', fontWeight: 400 }}>PARTICIPANTS</i></th>
          <th style={{ width: '75px' }}>ĐÁNH GIÁ<br /><i style={{ fontSize: '7.5pt', fontWeight: 400 }}>ASSESSMENT</i></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((n, idx) => (
          <tr key={n.id}>
            <td>{idx + 1}</td>
            <td className="l">{n.item || '\u00A0'}</td>
            <td>{n.time || '\u00A0'}</td>
            <td>{n.person || '\u00A0'}</td>
            <td>{n.phone || '\u00A0'}</td>
            <td>{n.participants || '\u00A0'}</td>
            <td>{n.assess || '\u00A0'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const SectionPhotosView: React.FC<{
  photos: PhotoRow[];
  isContinued: boolean;
  hasSign: boolean;
  sign: SignRecord;
  isLandscape?: boolean;
}> = ({ photos, isContinued, hasSign, sign, isLandscape }) => {
  // Chiều cao khung ảnh thông minh theo bố cục:
  // - Nếu là trang ảnh phía trên (KHÔNG có chữ ký): 4 ảnh (2 cột x 2 hàng) cao 265px để dàn đều trọn vẹn đầy trang A4 ngang.
  // - Nếu là trang cuối cùng (CÓ chữ ký): 4 ảnh cao 205px vừa vặn, cân đối trọn vẹn trang có cả ảnh và chữ ký.
  // - Trường hợp 1-2 ảnh: nếu có chữ ký cao 245px, không có chữ ký cao 320px.
  const isSingleRow = photos.length <= 2;
  const frameHeight = hasSign
    ? (isSingleRow ? '280px' : '235px')
    : (isSingleRow ? '340px' : '285px');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto', justifyContent: 'space-between' }}>
      <div>
        <div className="c10-a4-ttl" style={{ marginBottom: '6px' }}>
          {isContinued ? (
            <>VIII. HÌNH ẢNH THI CÔNG VÀ NGHIỆM THU TRONG NGÀY <i>(tiếp theo)</i>/ <i>DAILY CONSTRUCTION AND INSPECTION PHOTOS (Continued)</i></>
          ) : (
            <>VIII. HÌNH ẢNH THI CÔNG VÀ NGHIỆM THU TRONG NGÀY/ <i>DAILY CONSTRUCTION AND INSPECTION PHOTOS</i></>
          )}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isSingleRow ? (photos.length === 1 ? '1fr' : '1fr 1fr') : '1fr 1fr',
          gap: hasSign ? '10px 14px' : '14px 16px',
          marginBottom: hasSign ? '8px' : '0'
        }}>
          {photos.map((p, idx) => (
            <div
              key={p.id || `photo_${idx}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}
            >
              {/* Khung chứa ảnh: cố định kích thước, nền xám nhạt, border tinh tế */}
              <div
                className="c10-photo-frame"
                style={{
                  width: '100%',
                  height: frameHeight,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '6px',
                  boxSizing: 'border-box'
                }}
              >
                {p.url ? (
                  <img
                    src={p.url}
                    alt={p.caption || `Ảnh ${idx + 1}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block',
                      margin: '0 auto'
                    }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '9pt', fontStyle: 'italic' }}>
                    Chưa có ảnh
                  </div>
                )}
              </div>
              {/* Chú thích ảnh: căn giữa, font chữ rõ ràng, không bị chèn ép */}
              <p style={{
                fontWeight: 600,
                margin: '5px 0 0',
                fontSize: '8.5pt',
                color: '#1e293b',
                textAlign: 'center',
                lineHeight: 1.3,
                maxWidth: '100%'
              }}>
                {p.caption || `Ảnh ${idx + 1}`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {hasSign && (
        <div className="c10-sign-block" style={{
          display: 'flex',
          justifyContent: 'space-around',
          marginTop: 'auto',
          paddingTop: '8px',
          pageBreakInside: 'avoid',
          breakInside: 'avoid'
        }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ fontWeight: 700, fontSize: '9.5pt' }}>{sign.cTitle || 'ĐẠI DIỆN NHÀ THẦU DELTA'}</div>
            <div style={{ textAlign: 'center' }}><i style={{ color: '#6b7280', fontSize: '8pt' }}>Contractor’s Representative</i></div>
            <div style={{ height: '42px' }}></div>
            <div style={{ borderTop: '1px solid #94a3b8', width: '60%', margin: '0 auto' }}></div>
            <div style={{ fontWeight: 700, fontSize: '10pt', marginTop: '3px' }}>{sign.cName}</div>
          </div>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ fontWeight: 700, fontSize: '9.5pt' }}>{sign.sTitle || 'GIÁM SÁT SCQC2'}</div>
            <div style={{ textAlign: 'center' }}><i style={{ color: '#6b7280', fontSize: '8pt' }}>Supervisor’s Representative</i></div>
            <div style={{ height: '42px' }}></div>
            <div style={{ borderTop: '1px solid #94a3b8', width: '60%', margin: '0 auto' }}></div>
            <div style={{ fontWeight: 700, fontSize: '10pt', marginTop: '3px' }}>{sign.sName}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------
export const DailyReportPrintSheet: React.FC<DailyReportPrintSheetProps> = ({ report, onPrint }) => {
  const pages = useMemo(() => buildDynamicPages(report), [report]);

  const handlePrintClick = () => {
    if (onPrint) {
      onPrint();
    } else {
      handleExportPdf(report);
    }
  };

  return (
    <div className="pt-4 c10-print-sheet-root">
      {/* Khối CSS @media print chuẩn hoá theo Phương án 1 (Native Vector A4 Print) */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm 10mm 8mm 10mm;
        }
        @page landscape-page {
          size: A4 landscape;
          margin: 8mm 10mm 8mm 10mm;
        }

        @media print {
          /* Ẩn toàn bộ thanh Sidebar, Navigation, Header, các nút điều khiển, thông báo */
          aside,
          nav,
          header,
          .no-print,
          button,
          .c10-header-bar {
            display: none !important;
          }

          /* Đặt nền trang trắng */
          body,
          #root {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Khung chứa #c10-printable-a4-sheet */
          #c10-printable-a4-sheet {
            width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            position: static !important;
          }

          /* Từng trang in .c10-a4-sheet */
          .c10-a4-sheet {
            width: 100% !important;
            min-height: 280mm !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            box-shadow: none !important;
            page-break-after: always !important;
            break-after: page !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }

          .c10-a4-sheet-landscape {
            page: landscape-page !important;
            min-height: 195mm !important;
          }

          /* Đảm bảo bảng biểu và các dòng không bị cắt đôi giữa trang */
          table {
            width: 100% !important;
          }

          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Giữ nguyên màu nền xanh của tiêu đề bảng và thanh bar */
          th {
            background: #a9c9ec !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .sec td {
            background: #dbe8f7 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .c10-a4-ttl {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Screen Preview styles */
        .c10-printable-container {
          margin: 0 auto;
        }
        .c10-a4-sheet {
          background: #fff;
          color: #000;
          font-family: "Times New Roman", Times, serif;
          font-size: 9.5pt;
          width: 210mm;
          min-height: 297mm;
          padding: 10mm 12mm;
          box-sizing: border-box;
          margin: 0 auto 24px auto;
          box-shadow: 0 4px 18px rgba(0,0,0,0.18);
          line-height: 1.35;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
        }
        .c10-a4-sheet-landscape {
          width: 297mm !important;
          min-height: 210mm !important;
          max-width: 297mm !important;
          padding: 10mm 12mm !important;
        }
        .c10-page-content {
          flex: 1 0 auto;
          min-height: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
        }
        .c10-page-footer {
          flex-shrink: 0;
          margin-top: auto;
        }
        .c10-a4-sheet table {
          width: 100%;
          border-collapse: separate !important;
          border-spacing: 0 !important;
          border-top: 1px solid #000 !important;
          border-left: 1px solid #000 !important;
          margin-bottom: 4px;
        }
        .c10-a4-sheet td, .c10-a4-sheet th {
          border-top: none !important;
          border-left: none !important;
          border-right: 1px solid #000 !important;
          border-bottom: 1px solid #000 !important;
          padding: 5px 6px;
          text-align: center;
          vertical-align: middle;
          box-sizing: border-box;
          line-height: 1.35;
        }
        .c10-a4-sheet img {
          display: inline-block !important;
        }
        .c10-a4-sheet tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .c10-a4-sheet th {
          background: #a9c9ec !important;
          font-weight: 700;
          vertical-align: middle;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .c10-a4-sheet i {
          font-weight: 400;
        }
        .c10-a4-sheet .l {
          text-align: left;
        }
        .c10-a4-sheet .b {
          font-weight: 700;
        }
        .c10-a4-sheet .sec td {
          background: #dbe8f7 !important;
          font-weight: 700;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .c10-a4-ttl {
          font-weight: 700;
          color: #1b2a49;
          font-size: 10pt;
          margin: 4px 0 2px;
        }
      `}</style>

      {/* Action / Notification Banner */}
      <div className="no-print bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-left">
          <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>Bản xem trước mẫu in khổ A4 chuẩn ({pages.length} trang)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phương án 1: Vector Native Print
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            In trực tiếp Vector chuẩn A4 từ trình duyệt — không bao giờ lệch lề, không mờ chữ, sắc nét 100%.
          </div>
        </div>
        <button
          type="button"
          onClick={handlePrintClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap"
        >
          <Printer className="w-4 h-4" />
          <span>In PDF (Vector Chuẩn A4)</span>
        </button>
      </div>

      <div className="overflow-x-auto pb-6 c10-print-scroll-wrap">
        <div id="c10-printable-a4-sheet" className="c10-printable-container">
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              id={`c10-a4-page-${page.pageNumber}`}
              className={`c10-a4-sheet c10-a4-page ${page.isLandscape ? 'c10-a4-sheet-landscape' : ''}`}
            >
              {/* TOP: Header */}
              {page.isFirstPage ? (
                <PageOneHeader report={report} />
              ) : (
                <RunningHeader report={report} pageNumber={page.pageNumber} totalPages={page.totalPages} />
              )}

              {/* MIDDLE: Content Body */}
              <div
                className="c10-page-content"
                style={{
                  flex: '1 0 auto',
                  minHeight: 0,
                  display: page.isLandscape ? 'flex' : undefined,
                  flexDirection: page.isLandscape ? 'column' : undefined,
                  justifyContent: page.isLandscape ? 'space-between' : undefined
                }}
              >
                {page.hasWeather && <SectionWeatherView weather={report.weather} />}
                {page.hasSafety && <SectionSafetyView safety={report.safety} />}
                {page.hasManMach && <SectionManMachView man={report.man} mach={report.mach} />}

                {page.matBlocks.map((mb, idx) => (
                  <SectionMaterialsView key={`mat_${idx}`} groups={mb.groups} isContinued={mb.isContinued} />
                ))}

                {page.workBlocks.map((wb, idx) => (
                  <SectionWorksView key={`work_${idx}`} groups={wb.groups} isContinued={wb.isContinued} />
                ))}

                {page.inspBlocks.map((ib, idx) => (
                  <SectionInspectionsView key={`insp_${idx}`} rows={ib.rows} isContinued={ib.isContinued} />
                ))}

                {(page.photoBlocks || []).map((pb, idx) => (
                  <SectionPhotosView
                    key={`photo_${idx}`}
                    photos={pb.photos}
                    isContinued={pb.isContinued}
                    hasSign={pb.hasSign}
                    sign={report.sign}
                    isLandscape={page.isLandscape}
                  />
                ))}
              </div>

              {/* BOTTOM: Footer (Luôn cố định chân trang) */}
              <PageFooter report={report} pageNumber={page.pageNumber} totalPages={page.totalPages} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyReportPrintSheet;
