let hasLoadedFromFirebase = false;
let iframeReadyInterval = null;
let currentLanguage = 'VN';

// Listen for messages from parent window
window.addEventListener('message', e => {
  try {
    if (!e || !e.data) return;

    if (e.data.type === 'FIREBASE_STATE_LOADED') {
      hasLoadedFromFirebase = true;
      if (iframeReadyInterval) {
        clearInterval(iframeReadyInterval);
        iframeReadyInterval = null;
      }
      if (e.data.state) {
        try { 
          localStorage.setItem(KEY, JSON.stringify(e.data.state)); 
          localStorage.setItem(FALLBACK_KEY, JSON.stringify(e.data.state)); 
        } catch(err){}
        state = load();
        render();
      }
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) overlay.classList.add('hidden');
    }

    if (e.data.type === 'LANGUAGE_CHANGED') {
      currentLanguage = e.data.language || 'VN';
      applyTranslations();
      render();
    }
  } catch(err) {
    console.error('Message handler error:', err);
  }
});

setTimeout(() => {
  if (!hasLoadedFromFirebase) {
    hasLoadedFromFirebase = true;
    if (iframeReadyInterval) {
      clearInterval(iframeReadyInterval);
      iframeReadyInterval = null;
    }
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('hidden');
  }
}, 1500);

const KEY = 'c10-excavation-layer2-v2';
const FALLBACK_KEY = 'c10-excavation-layer2-v2';

// 9 Zones data with exact polygon contours on 1374x1192 CAD drawing
const zones = {
  Z1: {
    id: 'Z1',
    code: 'ZONE 1',
    phaseVN: 'GIAI ĐOẠN 1',
    phaseEN: 'PHASE 1',
    phaseKey: 'P1',
    phaseClass: 'phase-1',
    polygon: '865,115 1165,115 1218,170 1218,468 865,468',
    center: { x: 1040, y: 290 },
    start: '2026-10-28',
    end: '2026-11-09',
    startFormatted: '28/10/2026',
    endFormatted: '09/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '28/10/2026', end: '01/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '30/10/2026', end: '02/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '02/11/2026', end: '07/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '02/11/2026', end: '05/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '08/11/2026', end: '09/11/2026' }
    ]
  },
  Z2: {
    id: 'Z2',
    code: 'ZONE 2',
    phaseVN: 'GIAI ĐOẠN 2',
    phaseEN: 'PHASE 2',
    phaseKey: 'P2',
    phaseClass: 'phase-2',
    polygon: '865,468 1222,468 1222,740 865,740',
    center: { x: 1043, y: 604 },
    start: '2026-11-02',
    end: '2026-11-14',
    startFormatted: '02/11/2026',
    endFormatted: '14/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '02/11/2026', end: '06/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '04/11/2026', end: '07/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '07/11/2026', end: '12/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '07/11/2026', end: '10/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '13/11/2026', end: '14/11/2026' }
    ]
  },
  Z3: {
    id: 'Z3',
    code: 'ZONE 3',
    phaseVN: 'GIAI ĐOẠN 1',
    phaseEN: 'PHASE 1',
    phaseKey: 'P1',
    phaseClass: 'phase-1',
    polygon: '865,740 1218,740 1218,1035 1165,1092 865,1092',
    center: { x: 1040, y: 916 },
    start: '2026-10-27',
    end: '2026-11-09',
    startFormatted: '27/10/2026',
    endFormatted: '09/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '27/10/2026', end: '31/10/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '29/10/2026', end: '01/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '02/11/2026', end: '07/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '01/11/2026', end: '04/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '08/11/2026', end: '09/11/2026' }
    ]
  },
  Z4: {
    id: 'Z4',
    code: 'ZONE 4',
    phaseVN: 'GIAI ĐOẠN 3',
    phaseEN: 'PHASE 3',
    phaseKey: 'P3',
    phaseClass: 'phase-3',
    polygon: '565,115 865,115 865,468 565,468',
    center: { x: 715, y: 290 },
    start: '2026-11-07',
    end: '2026-11-17',
    startFormatted: '07/11/2026',
    endFormatted: '17/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '07/11/2026', end: '09/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '07/11/2026', end: '10/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '10/11/2026', end: '15/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '10/11/2026', end: '14/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '16/11/2026', end: '17/11/2026' }
    ]
  },
  Z5: {
    id: 'Z5',
    code: 'ZONE 5',
    phaseVN: 'GIAI ĐOẠN 2',
    phaseEN: 'PHASE 2',
    phaseKey: 'P2',
    phaseClass: 'phase-2',
    polygon: '565,468 865,468 865,740 565,740',
    center: { x: 715, y: 604 },
    start: '2026-11-02',
    end: '2026-11-14',
    startFormatted: '02/11/2026',
    endFormatted: '14/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '02/11/2026', end: '06/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '04/11/2026', end: '07/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '07/11/2026', end: '12/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '07/11/2026', end: '10/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '13/11/2026', end: '14/11/2026' }
    ]
  },
  Z6: {
    id: 'Z6',
    code: 'ZONE 6',
    phaseVN: 'GIAI ĐOẠN 3',
    phaseEN: 'PHASE 3',
    phaseKey: 'P3',
    phaseClass: 'phase-3',
    polygon: '565,740 865,740 865,1092 565,1092',
    center: { x: 715, y: 916 },
    start: '2026-11-07',
    end: '2026-11-17',
    startFormatted: '07/11/2026',
    endFormatted: '17/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '07/11/2026', end: '09/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '07/11/2026', end: '10/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '10/11/2026', end: '15/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '10/11/2026', end: '14/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '16/11/2026', end: '17/11/2026' }
    ]
  },
  Z7: {
    id: 'Z7',
    code: 'ZONE 7',
    phaseVN: 'GIAI ĐOẠN 2',
    phaseEN: 'PHASE 2',
    phaseKey: 'P2',
    phaseClass: 'phase-2',
    polygon: '200,468 565,468 565,740 200,740',
    center: { x: 382, y: 604 },
    start: '2026-11-02',
    end: '2026-11-14',
    startFormatted: '02/11/2026',
    endFormatted: '14/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '02/11/2026', end: '06/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '04/11/2026', end: '07/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '07/11/2026', end: '12/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '07/11/2026', end: '11/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '13/11/2026', end: '14/11/2026' }
    ]
  },
  Z8: {
    id: 'Z8',
    code: 'ZONE 8',
    phaseVN: 'GIAI ĐOẠN 1',
    phaseEN: 'PHASE 1',
    phaseKey: 'P1',
    phaseClass: 'phase-1',
    polygon: '265,115 565,115 565,468 210,468 210,170',
    center: { x: 387, y: 290 },
    start: '2026-10-28',
    end: '2026-11-09',
    startFormatted: '28/10/2026',
    endFormatted: '09/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '28/10/2026', end: '01/11/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '30/10/2026', end: '02/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '02/11/2026', end: '07/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '02/11/2026', end: '05/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '08/11/2026', end: '09/11/2026' }
    ]
  },
  Z9: {
    id: 'Z9',
    code: 'ZONE 9',
    phaseVN: 'GIAI ĐOẠN 1',
    phaseEN: 'PHASE 1',
    phaseKey: 'P1',
    phaseClass: 'phase-1',
    polygon: '210,740 565,740 565,1092 265,1092 210,1035',
    center: { x: 387, y: 916 },
    start: '2026-10-27',
    end: '2026-11-09',
    startFormatted: '27/10/2026',
    endFormatted: '09/11/2026',
    volume: '5.300 m³',
    tasks: [
      { nameVN: 'Đào lớp 2', nameEN: 'Excavation Layer 2', start: '27/10/2026', end: '31/10/2026' },
      { nameVN: 'Lắp văng biên', nameEN: 'Perimeter shoring install', start: '29/10/2026', end: '01/11/2026' },
      { nameVN: 'Hoàn thiện văng', nameEN: 'Strut completion', start: '02/11/2026', end: '07/11/2026' },
      { nameVN: 'Đổ chèn + sàn biện pháp', nameEN: 'Infill & temporary platform', start: '01/11/2026', end: '04/11/2026' },
      { nameVN: 'Kích', nameEN: 'Pre-stress jacking', start: '08/11/2026', end: '09/11/2026' }
    ]
  }
};

const zoneOrder = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9'];

const baseZoneItem = () => ({
  stage: 'not-started',
  doneQty: 0,
  totalQty: 5300,
  unit: 'm³',
  note: '',
  history: []
});

const defaults = {
  controlDate: '2026-10-28',
  updatedAt: null,
  items: Object.fromEntries(zoneOrder.map(id => [id, baseZoneItem()]))
};

let state = load();
let selectedZoneId = 'Z1'; // Default select Zone 1

function load() {
  try {
    const rawSaved = localStorage.getItem(KEY) || localStorage.getItem(FALLBACK_KEY);
    const saved = rawSaved ? JSON.parse(rawSaved) : null;
    if (!saved) return structuredClone(defaults);
    const items = {};
    zoneOrder.forEach(id => {
      const old = saved.items?.[id] || {};
      items[id] = {
        ...baseZoneItem(),
        ...old,
        totalQty: +(old.totalQty ?? 5300),
        doneQty: +(old.doneQty ?? 0),
        history: Array.isArray(old.history) ? old.history : []
      };
    });
    return { ...defaults, ...saved, items };
  } catch {
    return structuredClone(defaults);
  }
}

function formatDateStr(v) {
  if (!v) return '—';
  if (v.includes('/')) return v;
  const parts = v.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return v;
}

function applyTranslations() {
  const isEN = currentLanguage === 'EN';
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('topbarTitle', isEN ? 'EXCAVATION & SHORING LAYER 2 PLAN | SCHEDULE TRACKING' : 'MẶT BẰNG ĐÀO ĐẤT - LẮP VĂNG LỚP 2 | THEO DÕI TIẾN ĐỘ');
  setText('topbarSubtitle', isEN ? 'Detailed 9 Zones Schedule (27/10/2026 - 17/11/2026)' : 'Tiến độ chi tiết 9 Zone (27/10/2026 - 17/11/2026)');
  setText('lblSavedAt', isEN ? 'Updated:' : 'Cập nhật:');
  setText('exportBtn', isEN ? 'Export Report' : 'Xuất báo cáo');
  setText('todayBtn', isEN ? 'Today' : 'Về hôm nay');

  setText('briefEyebrow', isEN ? 'EXECUTIVE CONTROL VIEW' : 'EXECUTIVE CONTROL VIEW');
  setText('briefTitle', isEN ? 'Excavation & Shoring Layer 2 Progress' : 'Tiến độ Đào đất & Lắp văng Lớp 2');
  setText('briefDesc', isEN 
    ? 'Detailed plan of 9 zones for excavation & layer 2 shoring strut system (Elevation -3.5m to -6.9m). Click directly on any Zone to darken it and view Start & End dates.' 
    : 'Bản đồ chi tiết 9 Zone đào đất & hệ văng chống Shoring lớp 2 (Cos -3.5m đến -6.9m). Bấm trực tiếp vào từng Zone để làm nổi bật và hiển thị ngày Bắt đầu & Kết thúc.');

  setText('lblPhase1', isEN ? 'Phase 1 (Z1,3,8,9)' : 'Giai đoạn 1 (Z1,3,8,9)');
  setText('lblPhase2', isEN ? 'Phase 2 (Z2,5,7)' : 'Giai đoạn 2 (Z2,5,7)');
  setText('lblPhase3', isEN ? 'Phase 3 (Z4,6)' : 'Giai đoạn 3 (Z4,6)');
  setText('lblTotalVol', isEN ? 'Total Layer 2 Excavation' : 'Tổng đào đất lớp 2');
  setText('lblTotalDays', isEN ? 'Total Duration' : 'Tổng thời gian thi công');
  setText('forecastDelay', isEN ? '21 days' : '21 ngày');

  setText('lblControlDate', isEN ? 'Control Date' : 'Ngày kiểm soát');
  setText('lblControlDateHint', isEN ? 'Change date to view progress over time' : 'Thay đổi ngày để xem tiến độ theo thời gian');

  setText('mapEyebrow', isEN ? '01 · 9-ZONE DETAILED SITE PLAN' : '01 · MẶT BẰNG THI CÔNG CHI TIẾT 9 ZONE');
  setText('mapHeading', isEN ? 'Excavation & Shoring Layer 2 Plan' : 'Mặt bằng đào đất - Lắp văng lớp 2');
  setText('legPhase1', isEN ? 'Phase 1 (Green)' : 'Giai đoạn 1');
  setText('legPhase2', isEN ? 'Phase 2 (Purple)' : 'Giai đoạn 2');
  setText('legPhase3', isEN ? 'Phase 3 (Orange)' : 'Giai đoạn 3');

  setText('lblChooseZone', isEN ? 'Select Zone:' : 'Chọn Zone:');
  setText('lblMapHint', isEN 
    ? '💡 Click a Zone on the map: it will darken and display Start - End dates' 
    : '💡 Bấm vào 1 Zone trên hình: Zone đó sẽ đậm màu lên và hiển thị ngày Bắt đầu - Kết thúc');

  setText('emptyHeading', isEN ? 'Select a Zone on the plan' : 'Chọn một Zone trên mặt bằng');
  setText('emptyDesc', isEN ? 'Click any Zone 1 to 9 to view schedule and 5 sub-tasks.' : 'Bấm vào bất kỳ Zone 1, 2, 3, 4, 5, 6, 7, 8, 9 để xem chi tiết thời gian và 5 công tác.');

  setText('lblDetailStart', isEN ? 'START DATE' : 'NGÀY BẮT ĐẦU');
  setText('lblDetailEnd', isEN ? 'END DATE' : 'NGÀY KẾT THÚC');
  setText('lblDetailVolTitle', isEN ? 'ZONE VOLUME' : 'KHỐI LƯỢNG ZONE');
  setText('lblTasksTableTitle', isEN ? '5 Sub-tasks in this Zone' : 'Chi tiết 5 công tác trong Zone');

  setText('lblFormStage', isEN ? 'Zone Construction Status' : 'Trạng thái thi công Zone');
  setText('lblTotalQty', isEN ? 'Total Volume (m³)' : 'Tổng khối lượng (m³)');
  setText('lblDoneQty', isEN ? 'Excavated Volume (m³)' : 'Đã đào (m³)');
  setText('lblUnit', isEN ? 'Unit' : 'Đơn vị');
  setText('lblCalcProg', isEN ? 'Zone Completion Progress' : 'Tiến độ hoàn thành Zone');
  setText('lblFormNotes', isEN ? 'Site Notes' : 'Ghi chú hiện trường');
  setText('btnSaveZone', isEN ? 'Save Zone Progress & Sync Firebase' : 'Lưu tiến độ Zone & Cập nhật Firebase');

  setText('lblGrid02', isEN ? '02 · 9-ZONE BREAKDOWN' : '02 · DANH SÁCH 9 ZONE');
  setText('lblGrid02Title', isEN ? 'Zone Detailed Progress' : 'Tiến độ chi tiết từng Zone');
  setText('lblGrid03', isEN ? '03 · PHASE MILESTONES' : '03 · THEO DÕI GIAI ĐOẠN');
  setText('lblGrid03Title', isEN ? 'Key Zone Dates' : 'Các mốc thời gian Zone');
}

function save(msg = 'Đã lưu tiến độ Zone') {
  state.updatedAt = new Date().toISOString();
  window.parent.postMessage({ type: 'SAVE_FOCUS_STATE', state }, '*');
  render();
  toast(msg);
}

function render() {
  const isEN = currentLanguage === 'EN';

  const cd = document.getElementById('controlDate');
  if (cd) cd.value = state.controlDate || '';

  const asOf = document.getElementById('asOfText');
  if (asOf) asOf.textContent = (isEN ? 'As of ' : 'Tại ngày ') + formatDateStr(state.controlDate);

  const savedAt = document.getElementById('savedAt');
  if (savedAt) {
    let formattedSavedAt = isEN ? 'None' : 'chưa có';
    if (state.updatedAt) {
      const d = new Date(state.updatedAt);
      if (!isNaN(d.getTime())) {
        try {
          formattedSavedAt = new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
          }).format(d);
        } catch (e) {}
      }
    }
    savedAt.textContent = formattedSavedAt;
  }

  // 1. Render Quick Buttons List (Zone 1 to Zone 9)
  const buttonsContainer = document.getElementById('zoneButtonsList');
  if (buttonsContainer) {
    buttonsContainer.innerHTML = zoneOrder.map(id => {
      const z = zones[id];
      const isSelected = selectedZoneId === id;
      return `
        <button 
          class="btn-zone-select ${isSelected ? 'active' : ''}" 
          data-zone-select="${id}"
        >
          ${z.code}
        </button>
      `;
    }).join('');
  }

  // 2. Render SVG Interactive Polygons Layer
  const svgZonesLayer = document.getElementById('svgZonesLayer');
  if (svgZonesLayer) {
    svgZonesLayer.className = selectedZoneId ? 'has-active' : '';
    svgZonesLayer.innerHTML = zoneOrder.map(id => {
      const z = zones[id];
      const isSelected = selectedZoneId === id;
      return `
        <polygon 
          class="zone-poly ${z.phaseClass} ${isSelected ? 'active' : ''}" 
          points="${z.polygon}" 
          data-zone="${id}"
        />
      `;
    }).join('');
  }

  // 3. Render Active Zone Info Card Badge Directly on SVG (USER'S EXPLICIT REQUIREMENT)
  const svgBadgesLayer = document.getElementById('svgBadgesLayer');
  if (svgBadgesLayer) {
    if (selectedZoneId && zones[selectedZoneId]) {
      const selZone = zones[selectedZoneId];
      const cx = selZone.center.x;
      const cy = selZone.center.y;
      const d = state.items[selectedZoneId];
      const pct = Math.min(100, Math.round((d.doneQty / d.totalQty) * 100));

      const phaseText = isEN ? selZone.phaseEN : selZone.phaseVN;
      const lblStart = isEN ? 'START' : 'BẮT ĐẦU';
      const lblEnd = isEN ? 'END' : 'KẾT THÚC';
      const lblVol = isEN ? 'VOL' : 'KL';
      const lblProg = isEN ? 'PROG' : 'TIẾN ĐỘ';

      svgBadgesLayer.innerHTML = `
        <g class="svg-active-badge" transform="translate(${cx}, ${cy})">
          <!-- Drop Shadow & Border Background Card -->
          <rect 
            class="svg-badge-box" 
            x="-148" 
            y="-48" 
            width="296" 
            height="96" 
            rx="12" 
          />
          <!-- Zone & Phase Header -->
          <text class="svg-badge-title" y="-22">
            ${selZone.code} (${phaseText})
          </text>
          <!-- Prominent Start Date -->
          <text class="svg-badge-date-start" y="3">
            ${lblStart}: ${selZone.startFormatted}
          </text>
          <!-- Prominent End Date -->
          <text class="svg-badge-date-end" y="24">
            ${lblEnd}: ${selZone.endFormatted}
          </text>
          <!-- Volume and Progress -->
          <text class="svg-badge-vol" y="40">
            ${lblVol}: ${selZone.volume} | ${lblProg}: ${pct}%
          </text>
        </g>
      `;
    } else {
      svgBadgesLayer.innerHTML = '';
    }
  }

  // 4. Render Detail Card
  if (selectedZoneId) {
    renderDetail(selectedZoneId);
  }

  // 5. Render Lower Panels
  renderZoneCards();
  renderWatchlist();
}

function renderDetail(id) {
  const z = zones[id];
  if (!z) return;

  const isEN = currentLanguage === 'EN';
  const d = state.items[id];
  const donePercent = Math.min(100, Math.round((d.doneQty / d.totalQty) * 100));

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('detailContent').classList.remove('hidden');

  document.getElementById('detailId').value = id;
  document.getElementById('detailZoneTag').textContent = isEN ? z.phaseEN : z.phaseVN;
  document.getElementById('detailName').textContent = z.code;

  const statusBadge = document.getElementById('detailStatus');
  if (d.stage === 'done') {
    statusBadge.textContent = isEN ? 'COMPLETED' : 'HOÀN THÀNH VĂNG & KÍCH';
    statusBadge.className = 'large-status green';
  } else if (d.stage === 'in-progress') {
    statusBadge.textContent = isEN ? 'IN PROGRESS' : 'ĐANG THI CÔNG';
    statusBadge.className = 'large-status yellow';
  } else {
    statusBadge.textContent = isEN ? 'NOT STARTED' : 'CHƯA TRIỂN KHAI';
    statusBadge.className = 'large-status red';
  }

  document.getElementById('detailPlanStart').textContent = z.startFormatted;
  document.getElementById('detailPlanEnd').textContent = z.endFormatted;
  document.getElementById('detailVolume').textContent = z.volume;
  document.getElementById('detailMessage').textContent = isEN 
    ? `${z.phaseEN}. Excavation & shoring layer 2 from ${z.startFormatted} to ${z.endFormatted}.`
    : `Thuộc ${z.phaseVN}. Thời gian đào đất & văng lớp 2 từ ${z.startFormatted} đến ${z.endFormatted}.`;

  // Render 5 sub-tasks detailed table from drawing
  const tasksContainer = document.getElementById('tasksTableContainer');
  if (tasksContainer) {
    tasksContainer.innerHTML = `
      <table class="tasks-table">
        <thead>
          <tr>
            <th>${isEN ? 'Task' : 'Hạng mục công tác'}</th>
            <th>${isEN ? 'Start' : 'Bắt đầu'}</th>
            <th>${isEN ? 'End' : 'Kết thúc'}</th>
          </tr>
        </thead>
        <tbody>
          ${z.tasks.map(t => `
            <tr>
              <td><strong>${isEN ? t.nameEN : t.nameVN}</strong></td>
              <td>${t.start}</td>
              <td>${t.end}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  document.getElementById('stageInput').value = d.stage;
  document.getElementById('totalQtyInput').value = d.totalQty;
  document.getElementById('doneQtyInput').value = d.doneQty;
  document.getElementById('progressOutput').textContent = donePercent + '%';
  document.getElementById('noteInput').value = d.note || '';

  document.getElementById('historyNote').textContent = d.history.length
    ? `${isEN ? 'History' : 'Lịch sử'}: ${d.history.slice(-3).map(p => `${formatDateStr(p.date)}: ${p.doneQty} m³`).join(' | ')}`
    : (isEN ? 'No progress updates yet.' : 'Chưa có lịch sử cập nhật.');
}

function renderZoneCards() {
  const container = document.getElementById('zoneCards');
  if (!container) return;

  const isEN = currentLanguage === 'EN';

  container.innerHTML = zoneOrder.map(id => {
    const z = zones[id];
    const d = state.items[id];
    const donePercent = Math.min(100, Math.round((d.doneQty / d.totalQty) * 100));

    return `
      <article class="zone-card ${z.phaseClass} ${selectedZoneId === id ? 'active' : ''}" data-zone-select="${id}">
        <header>
          <strong>${z.code}</strong>
          <span>${isEN ? z.phaseEN : z.phaseVN}</span>
        </header>
        <h3>${z.volume}</h3>
        <p>${z.startFormatted} → ${z.endFormatted}</p>
        <div class="zone-meter"><i style="width:${donePercent}%"></i></div>
        <footer>
          <span>${isEN ? 'Progress' : 'Hoàn thành'}: ${donePercent}%</span>
          <span>${d.stage === 'done' ? (isEN ? 'Done' : 'Đã xong') : d.stage === 'in-progress' ? (isEN ? 'Active' : 'Đang làm') : (isEN ? 'Pending' : 'Chưa làm')}</span>
        </footer>
      </article>
    `;
  }).join('');
}

function renderWatchlist() {
  const listEl = document.getElementById('riskList');
  if (!listEl) return;

  const isEN = currentLanguage === 'EN';

  listEl.innerHTML = zoneOrder.map(id => {
    const z = zones[id];
    const d = state.items[id];
    const donePercent = Math.min(100, Math.round((d.doneQty / d.totalQty) * 100));
    return `
      <div class="risk-list-item" data-zone-select="${z.id}">
        <i></i>
        <div>
          <strong>${z.code} (${isEN ? z.phaseEN : z.phaseVN})</strong>
          <span>${z.startFormatted} → ${z.endFormatted} · ${d.doneQty} / ${d.totalQty} m³</span>
        </div>
        <b>${donePercent}%</b>
      </div>
    `;
  }).join('');
}

function selectZone(id) {
  if (!zones[id]) return;
  selectedZoneId = id;
  render();
}

// Click listener on SVG polygons and quick buttons
document.addEventListener('click', e => {
  const poly = e.target.closest('[data-zone]');
  if (poly) {
    selectZone(poly.dataset.zone);
    return;
  }

  const btn = e.target.closest('[data-zone-select]');
  if (btn) {
    selectZone(btn.dataset.zoneSelect);
    return;
  }
});

document.getElementById('controlDate').onchange = e => {
  state.controlDate = e.target.value;
  save(currentLanguage === 'EN' ? 'Control date updated' : 'Đã đổi ngày kiểm soát');
};

document.getElementById('todayBtn').onclick = () => {
  const d = new Date();
  state.controlDate = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  save(currentLanguage === 'EN' ? 'Reset to today' : 'Đã về ngày hôm nay');
};

function updateProgressOutput() {
  const total = Math.max(1, +document.getElementById('totalQtyInput').value || 5300);
  const done = Math.max(0, +document.getElementById('doneQtyInput').value || 0);
  const pct = Math.min(100, Math.round((done / total) * 100));
  document.getElementById('progressOutput').textContent = pct + '%';
}

document.getElementById('totalQtyInput').oninput = updateProgressOutput;
document.getElementById('doneQtyInput').oninput = updateProgressOutput;

document.getElementById('updateForm').onsubmit = e => {
  e.preventDefault();
  const id = document.getElementById('detailId').value;
  if (!id) return;

  const d = state.items[id];
  const total = Math.max(1, +document.getElementById('totalQtyInput').value || 5300);
  let done = Math.max(0, +document.getElementById('doneQtyInput').value || 0);
  const stage = document.getElementById('stageInput').value;

  if (stage === 'done') {
    done = total;
  }

  const history = [...(d.history || [])];
  const existingIdx = history.findIndex(p => p.date === state.controlDate);
  const point = { date: state.controlDate, doneQty: done };

  if (existingIdx >= 0) {
    history[existingIdx] = point;
  } else {
    history.push(point);
  }

  state.items[id] = {
    ...d,
    stage,
    totalQty: total,
    doneQty: done,
    note: document.getElementById('noteInput').value.trim(),
    history
  };

  save(currentLanguage === 'EN' ? `Saved progress for ${zones[id].code}` : `Đã lưu tiến độ ${zones[id].code}`);
};

document.getElementById('exportBtn').onclick = () => {
  const report = {
    title: 'C10 Excavation Layer 2 Zone Report',
    exportedAt: new Date().toISOString(),
    ...state,
    zones
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `C10-Excavation-Layer2-${state.controlDate}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(currentLanguage === 'EN' ? 'Report exported' : 'Đã xuất báo cáo tiến độ 9 Zone');
};

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(window.__t);
  window.__t = setTimeout(() => el.classList.remove('show'), 2200);
}

// Initial Run
applyTranslations();
render();
window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
iframeReadyInterval = setInterval(() => {
  if (!hasLoadedFromFirebase) {
    window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
  } else {
    clearInterval(iframeReadyInterval);
    iframeReadyInterval = null;
  }
}, 500);
