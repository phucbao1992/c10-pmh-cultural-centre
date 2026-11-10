export function parseCSV(text: string): string[][] {
  let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (',' === l && s) l = row[++i] = '';
    else if ('\n' === l && s) {
      if ('\r' === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [l = '']; i = 0;
    } else row[i] += l;
    p = l;
  }
  if (ret.length && ret[ret.length - 1].length === 1 && ret[ret.length - 1][0] === '') ret.pop();
  return ret;
}

export const extractSheetId = (input?: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];
  return trimmed;
};

export const extractDriveFolderId = (input?: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return trimmed;
};

export const calculateDaysElapsed = (dateStr: string): number | null => {
  if (!dateStr || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dateObj: Date | null = null;
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const ymdMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    dateObj = new Date(year, month, day);
  } else if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    dateObj = new Date(year, month, day);
  } else {
    const fallback = new Date(trimmed);
    if (!isNaN(fallback.getTime())) {
      dateObj = fallback;
    }
  }

  if (!dateObj || isNaN(dateObj.getTime())) return null;

  dateObj.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - dateObj.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
};

export const DEFAULT_DEFECTS_SHEET_ID = '1yPaZhqlwRk0RQje_Ferb17XdpheR2nPEcbWlYuQVdWI';

export const FALLBACK_DEFECTS_CSV = `Project : C10,,Defect list,,,,,,,,,,,,
,,,,,,,,,,,,,,
Số,Vị trí,Mô tả,Mức độ,Người báo cáo,Ngày lập,Ngày yêu cầu chỉnh sửa,Trạng thái,Đơn vị xử lý,Ảnh hiện trạng,Ảnh sau khi sửa,Ngày sửa chữa,Xác nhận,Ghi chú,Vị trí trên bản vẽ
1,TRONG CÔNG TRƯỜNG,VÁ LỖ HÀNG RÀO,1,SCQC2,04-08-2026,11-08-2026,Đã sửa,Delta,,,04/08/2026,Đạt,,
2,DẦM MŨ,"KÊ LẠI VẬT TƯ THÉP, COFA CHÌM TRONG ĐẤT",1,PMH,07-08-2026,14-08-2026,Đã sửa,Delta,,,07/08/2026,Đạt,,
3,DẦM MŨ,HỘP KHUNG BẢO VỆ ỐNG QUAN TRẮC,1,Delta,07-08-2026,14-08-2026,Đã sửa,Delta,,,07/08/2026,Đạt,,
4,TRONG CÔNG TRƯỜNG,"CHE ĐẬY BẢO QUẢN CÁC BÌNH KHÍ, BỔ SUNG THIẾT BỊ PCCC",1,PMH,07-08-2026,14-08-2026,Đã sửa,Delta,,,07/08/2026,Đạt,,
5,DẦM MŨ,VỆ SINH NGOÀI HÀNG RÀO,1,Delta,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
6,DẦM MŨ,VỆ SINH NGOÀI HÀNG RÀO,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
7,DẦM MŨ,VỆ SINH NGOÀI HÀNG RÀO,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
8,TRONG CÔNG TRƯỜNG,BỔ SUNG ĐÈN CHIẾU SÁNG BẢNG THÔNG TIN,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
9,CẦU RỬA XE,BỔ SUNG ĐÈN CHIẾU SÁNG BẢNG THÔNG TIN,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
10,CỔNG CHÍNH,DỌN DẸP VẬT TƯ DỂ CHÁY,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
11,TRONG CÔNG TRƯỜNG,VÁ LỖ HÀNG RÀO,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
12,TRONG CÔNG TRƯỜNG,BỔ SUNG DÂY TEE,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
13,TRONG CÔNG TRƯỜNG,TỰ Ý THÁO DÂY BẢO VỆ DÒNG RÒ,1,Delta,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
14,TRONG CÔNG TRƯỜNG,XỬ LÝ ỐNG SIÊU ÂM ĐỂ ĐẢM BẢO CÔNG TÁC BƠM VỮA,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
15,DẦM BO,XỬ LÝ ỐNG QUAN TRẮC KHÔNG ĐẢM BẢO ,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
16,TRONG CÔNG TRƯỜNG,ĐI GỌN GÀNG LẠI HỆ THỐNG DÂY TEE,1,Delta,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
17,TRONG CÔNG TRƯỜNG,BỔ SUNG NỐI ĐẤT HÀNG RÀO MỖI VỊ TRÍ TỦ,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
18,TRONG CÔNG TRƯỜNG,XỬ LÝ ỐNG QUAN TRẮC KHÔNG ĐẢM BẢO ,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,12/08/2026,Đạt,,
19,KHO NHÀ THẦU,BỔ SUNG RUỘT GÀ ĐI GỌN GÀNG LẠI DÂY ĐIỆN,1,SCQC2,12-08-2026,19-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
20,CÁC ỐNG QUAN TRẮC,ĐI GỌN GÀNG LẠI HỆ THỐNG DÂY TEE VÀ DÂY ĐIỆN,1,PMH,12-08-2026,19-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
21,TRONG CÔNG TRƯỜNG,DỌN DẸP KHU VỰC CHỐT BẢO VỆ,1,Delta,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
22,CÁC TỦ ĐANG TREO TRÊN HÀNG RÀO TÔN,KÊ KÍCH LẠI THÉP TRONG BÙN,1,PMH,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
23,TRONG CÔNG TRƯỜNG,DỌN DẸP VẬT TƯ DỂ CHÁY KHỎI KHU VỰC TRẠM ĐIỆN,1,SCQC2,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
24,TRONG CÔNG TRƯỜNG,KÊ KÍCH LẠI THÉP TRONG BÙN,1,PMH,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
25,TRONG CÔNG TRƯỜNG,DỌN DẸP KHU VỰC NGHỈ NGƠI KHÔNG ĐÚNG QUY ĐỊNH,1,Delta,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
26,TRONG CÔNG TRƯỜNG,ĐI DÂY ĐIỆN GỌN GÀNG LẠI,1,SCQC2,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
27,TRONG CÔNG TRƯỜNG,DỌN DẸP KHU VỰC NGHỈ NGƠI KHÔNG ĐÚNG QUY ĐỊNH,1,PMH,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
28,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,VỆ SINH KHU VỰC LÀM VIỆC SAU KHI LÀM,1,SCQC2,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
29,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,BỔ SUNG GHẾ NGHỈ NGƠI,1,PMH,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
30,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,VẬT TƯ KHÔNG ĐÚNG NƠI QUY ĐỊNH,1,Delta,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
31,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,THAY THẾ TRƯƠNG NỞ NGÂM TRONG NƯỚC,1,SCQC2,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
32,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,THAY THẾ TRƯƠNG NỞ NGÂM TRONG NƯỚC,1,PMH,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
33,HÀNG RÀO NGOÀI CÔNG TRƯỜNG,DỌN DẸP RÁC ,1,SCQC2,18-08-2026,25-08-2026,Đã sửa,Delta,,,18/08/2026,Đạt,,
34,TRONG CÔNG TRƯỜNG,"CUỐN GỌN DÂY, LÀM LẠI ĐƯỜNG ĐẢM BẢO CÓ LỐI ĐI AN TOÀN",1,PMH,25-08-2026,01-09-2026,Đã sửa,Delta,,,25/08/2026,Đạt,,
35,TRONG CÔNG TRƯỜNG,VẬT TƯ KHÔNG ĐÚNG NƠI QUY ĐỊNH,1,Delta,25-08-2026,01-09-2026,Đã sửa,Delta,,,28/08/2026,Đạt,,
36,TRONG CÔNG TRƯỜNG,"TRÌNH BP XỬ LÝ TY, THÁO VÁN KHUÔN MỜI NGHIỆM THU BỀ MẶT BÊ TÔNG",1,PMH,25-08-2026,01-09-2026,Đã sửa,Delta,,,28/08/2026,Đạt,,
37,TRONG CÔNG TRƯỜNG,DỌN VẬT TƯ SAU KHI THI CÔNG,1,SCQC2,28/08/2026,04/09/2026,Đã sửa,Delta,,,28/08/2026,Đạt,,
38,TRONG CÔNG TRƯỜNG,"chưa lắp thanh chặn, lan can bị hư chưa gắn lại",1,SCQC2,02-11-2026,09-11-2026,Quá hạn,,,,,,,
39,TRONG CÔNG TRƯỜNG,cánh cổng để cản lối thoát nạn,1,SCQC2,10-11-2026,17-11-2026,Chưa đến hạn,,,,,,,
40,TRONG CÔNG TRƯỜNG,chưa vệ sinh shoring,1,SCQC2,10-11-2026,17-11-2026,Chưa đến hạn,,,,,,,
41,TRONG CÔNG TRƯỜNG, chưa lắp thang lên xuống,1,SCQC2,10-11-2026,17-11-2026,Chưa đến hạn,,,,,,,`;

export interface ParsedDefectRow {
  id: string;
  description: string;
  location: string;
  priority: string;
  reporter: string;
  assignee: string;
  dateStr: string;
  deadlineStr: string;
  status: string;
  isPending: boolean;
  isResolved: boolean;
  isHighPriority: boolean;
  daysElapsed: number | null;
}

export const parseDefectsFromCSV = (csvText: string): ParsedDefectRow[] => {
  const csv = parseCSV(csvText || '');
  if (!csv || csv.length === 0) return [];

  // Detect header row index ("Số,Vị trí,Mô tả..." vs legacy Row 0)
  let headerIdx = 0;
  let isNewFormat = false;
  for (let i = 0; i < Math.min(csv.length, 6); i++) {
    const r = csv[i].map(c => (c || '').trim().toLowerCase());
    if ((r[0] === 'số' || r[0] === 'stt') && (r[1].includes('vị trí') || r[2].includes('mô tả'))) {
      headerIdx = i;
      isNewFormat = true;
      break;
    }
  }

  const dataRows = csv.slice(headerIdx + 1);

  return dataRows
    .filter(row => {
      if (!row || row.length < 3) return false;
      const col1 = (row[1] || '').trim();
      const col2 = (row[2] || '').trim();
      return col1 !== '' || col2 !== '';
    })
    .map((row, idx) => {
      let description = '';
      let location = '';
      let rawPriority = '';
      let reporter = '';
      let assignee = '';
      let dateStr = '';
      let deadlineStr = '';
      let status = '';

      if (isNewFormat) {
        location = (row[1] || '').trim() || 'Chưa phân loại';
        description = (row[2] || '').trim() || location;
        rawPriority = (row[3] || '').trim();
        reporter = (row[4] || '').trim();
        dateStr = (row[5] || '').trim();
        deadlineStr = (row[6] || '').trim();
        status = (row[7] || '').trim() || 'Chưa xử lý';
        assignee = (row[8] || '').trim() || 'Delta';
      } else {
        description = (row[1] || '').trim();
        location = (row[2] || '').trim() || 'Chưa phân loại';
        rawPriority = (row[3] || '').trim();
        assignee = (row[4] || '').trim() || 'Chưa bàn giao';
        dateStr = (row[5] || '').trim();
        status = (row[6] || '').trim() || 'Chưa sửa';
      }

      const priority = /^[123]$/.test(rawPriority) ? `Level ${rawPriority}` : (rawPriority || 'Level 1');
      const statusLower = status.toLowerCase();
      const isResolved =
        statusLower.includes('đã sửa') ||
        statusLower.includes('đã hoàn thành') ||
        statusLower.includes('hoàn thành') ||
        statusLower.includes('xong') ||
        statusLower === 'đạt';
      const isPending = !isResolved;

      const priorityLower = priority.toLowerCase();
      const isHighPriority =
        priorityLower.includes('level 2') ||
        priorityLower.includes('level 3') ||
        rawPriority === '2' ||
        rawPriority === '3' ||
        priorityLower.includes('cao') ||
        priorityLower.includes('gấp') ||
        statusLower.includes('quá hạn');

      const daysElapsed = calculateDaysElapsed(dateStr);
      const rawId = (row[0] || '').trim();
      const id = rawId ? (/^\d+$/.test(rawId) ? `DEF-${rawId.padStart(2, '0')}` : rawId) : `DEF-${idx + 1}`;

      return {
        id,
        description,
        location,
        priority,
        reporter,
        assignee,
        dateStr,
        deadlineStr,
        status,
        isPending,
        isResolved,
        isHighPriority,
        daysElapsed
      };
    });
};

export interface DefectsSummaryMetrics {
  total: number;
  pending: number;
  resolved: number;
  highPriority: number;
  overdue7Days: number;
  normalPending: number;
}

export const computeDefectsSummary = (rows: ParsedDefectRow[]): DefectsSummaryMetrics => {
  const total = rows.length;
  const pending = rows.filter(d => d.isPending).length;
  const resolved = rows.filter(d => d.isResolved).length;
  const highPriority = rows.filter(d => d.isPending && d.isHighPriority).length;
  const overdue7Days = rows.filter(
    d => d.isPending && ((d.daysElapsed !== null && d.daysElapsed > 7) || d.status.toLowerCase().includes('quá hạn'))
  ).length;
  const normalPending = Math.max(0, pending - overdue7Days);
  return { total, pending, resolved, highPriority, overdue7Days, normalPending };
};

export const getEffectiveDefectsSheetId = (): string => {
  if (typeof localStorage !== 'undefined') {
    const override = (localStorage.getItem('c10_override_defects_sheet_id') || '').trim();
    if (override && !override.includes('1FbTT_F03Od1R85TjyaB6qLWyqEm6SOoqLRZATjO26EM')) {
      return extractSheetId(override);
    }
  }
  return DEFAULT_DEFECTS_SHEET_ID;
};

export const fetchDefectsSheetCSV = async (sheetIdInput?: string): Promise<string> => {
  const sheetId = sheetIdInput ? extractSheetId(sheetIdInput) : getEffectiveDefectsSheetId();
  const ts = Date.now();
  const urls = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0&_t=${ts}`,
    `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=0&_t=${ts}`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 20 && !text.trim().startsWith('<!DOCTYPE')) {
          return text;
        }
      }
    } catch (e) {
      // Try next URL
    }
  }
  return FALLBACK_DEFECTS_CSV;
};
