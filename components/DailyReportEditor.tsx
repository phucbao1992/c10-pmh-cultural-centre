import React, { useState } from 'react';
import {
  Edit3, ArrowRight, Trash2, Plus, CheckCircle2, Cloud, ExternalLink
} from 'lucide-react';
import {
  DailyReportModel,
  uid,
  todayISO,
  formatVNDate,
  labelRows
} from '../services/dailyReportService';

interface DailyReportEditorProps {
  draftReport: DailyReportModel;
  setDraftReport: React.Dispatch<React.SetStateAction<DailyReportModel>>;
  onPublish: () => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const DailyReportEditor: React.FC<DailyReportEditorProps> = ({
  draftReport,
  setDraftReport,
  onPublish,
  onClose,
  showToast
}) => {
  const [activeEditorTab, setActiveEditorTab] = useState<'general' | 'weather' | 'man' | 'mat' | 'works' | 'photos'>('general');

  const setG = (field: keyof DailyReportModel['g'], value: string) => {
    setDraftReport((prev) => ({ ...prev, g: { ...prev.g, [field]: value } }));
  };

  const setCloud = (field: keyof DailyReportModel['cloud'], value: string) => {
    setDraftReport((prev) => ({
      ...prev,
      cloud: { ...(prev.cloud || { driveFolderUrl: '', sheetUrl: '' }), [field]: value }
    }));
  };

  const updateRow = (
    key: 'weather' | 'safety' | 'man' | 'mach' | 'mat' | 'work' | 'insp' | 'photos',
    id: string,
    field: string,
    value: any
  ) => {
    setDraftReport((prev) => ({
      ...prev,
      [key]: (prev[key] as any[]).map((r) => (r.id === id ? { ...r, [field]: value } : r))
    }));
  };

  const addRow = (
    key: 'weather' | 'safety' | 'man' | 'mach' | 'mat' | 'work' | 'insp' | 'photos',
    newRow: any
  ) => {
    setDraftReport((prev) => ({
      ...prev,
      [key]: [...(prev[key] as any[]), { id: uid(), ...newRow }]
    }));
  };

  const deleteRow = (
    key: 'weather' | 'safety' | 'man' | 'mach' | 'mat' | 'work' | 'insp' | 'photos',
    id: string
  ) => {
    setDraftReport((prev) => ({
      ...prev,
      [key]: (prev[key] as any[]).filter((r) => r.id !== id)
    }));
  };

  const handleImageUpload = (file: File | undefined, maxDim: number, png: boolean, cb: (dataUrl: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (!png) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          cb(png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82));
        }
      };
      img.onerror = () => cb(String(reader.result));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="no-print bg-white rounded-2xl border-2 border-blue-500/30 shadow-md overflow-hidden space-y-5 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-blue-600" />
            <span>Trình lập & Chỉnh sửa Mẫu Báo Cáo Ngày (Mục I – VII)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Khi bạn thêm nhân lực, thiết bị, vật tư hoặc công tác tại đây và bấm <b>"Xuất báo cáo ngày"</b>, toàn bộ 8 mục hiển thị trên web sẽ tự động đồng bộ 100% và Gemini Flash sẽ tóm tắt lại đánh giá chung.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextDate = new Date((draftReport.g.reportDate || todayISO()) + 'T00:00:00');
              nextDate.setDate(nextDate.getDate() + 1);
              const ds = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
              const rn = draftReport.g.reportNo;
              const n = parseInt(rn, 10);
              setDraftReport((prev) => ({
                ...prev,
                g: {
                  ...prev.g,
                  reportDate: ds,
                  reportNo: isNaN(n) ? rn : String(n + 1).padStart(String(rn).length, '0')
                },
                mat: prev.mat.map((r) => (r.type === 'A' ? r : { ...r, today: '0' })),
                work: prev.work.map((r) => (r.type === 'A' ? r : { ...r, plan: r.next || '', today: '', next: '' }))
              }));
              showToast(`Đã chuyển sang ngày mới: ${formatVNDate(ds)}`);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Sang ngày mới</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
          >
            Đóng khung sửa
          </button>
        </div>
      </div>

      {/* Form Section Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'general', label: 'Thông tin chung, Drive & Logo' },
          { id: 'weather', label: 'I. Thời tiết & II. An toàn' },
          { id: 'man', label: 'III. Nhân lực & IV. Máy móc' },
          { id: 'mat', label: 'V. Vật liệu nhập' },
          { id: 'works', label: 'VI. Khối lượng & VII. Nghiệm thu' },
          { id: 'photos', label: 'Hình ảnh & Chữ ký' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveEditorTab(tab.id as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeEditorTab === tab.id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: General Info, Drive/Sheet Links & Logos */}
      {activeEditorTab === 'general' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Dự án</label>
              <input
                value={draftReport.g.project}
                onChange={(e) => setG('project', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ngày lập báo cáo</label>
              <input
                type="date"
                value={draftReport.g.reportDate}
                onChange={(e) => setG('reportDate', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Báo cáo số</label>
              <input
                value={draftReport.g.reportNo}
                onChange={(e) => setG('reportNo', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Người báo cáo</label>
              <input
                value={draftReport.g.reporter}
                onChange={(e) => setG('reporter', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Địa điểm</label>
              <input
                value={draftReport.g.location}
                onChange={(e) => setG('location', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Chủ đầu tư</label>
              <input
                value={draftReport.g.client}
                onChange={(e) => setG('client', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tư vấn giám sát</label>
              <input
                value={draftReport.g.consultant}
                onChange={(e) => setG('consultant', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nhà thầu thi công</label>
              <input
                value={draftReport.g.contractor}
                onChange={(e) => setG('contractor', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Drive, Google Sheet C10 & Google Apps Script Webhook Configuration */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-3">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-blue-600" />
              <span>Cấu hình Liên kết Lưu trữ Google Drive, Google Sheet C10 & Webhook Tự động</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. Link thư mục Google Drive C10 (nhận file PDF)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={draftReport.cloud?.driveFolderUrl || ''}
                    onChange={(e) => setCloud('driveFolderUrl', e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs"
                  />
                  {draftReport.cloud?.driveFolderUrl && (
                    <a
                      href={draftReport.cloud.driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-blue-600 hover:bg-blue-50 flex items-center"
                      title="Mở thư mục Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. Link Google Sheet Báo cáo ngày C10 (tách biệt CN82)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={draftReport.cloud?.sheetUrl || ''}
                    onChange={(e) => setCloud('sheetUrl', e.target.value)}
                    placeholder="Dán link Google Sheet C10 mới..."
                    className="flex-1 border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs"
                  />
                  {draftReport.cloud?.sheetUrl && (
                    <a
                      href={draftReport.cloud.sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-emerald-600 hover:bg-emerald-50 flex items-center"
                      title="Mở Google Sheet C10"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  3. Link Webhook Google Apps Script (Tự động 1 nút bấm)
                </label>
                <input
                  type="url"
                  value={draftReport.cloud?.appsScriptUrl || ''}
                  onChange={(e) => setCloud('appsScriptUrl', e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full border border-slate-300 bg-white rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Logos upload */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-xs font-bold text-slate-800 mb-3">Logo đầu báo cáo (Tư vấn giám sát / Chủ đầu tư / Nhà thầu)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                ['tvgs', 'Tư vấn giám sát'],
                ['cdt', 'Chủ đầu tư'],
                ['nt', 'Nhà thầu']
              ] as const).map(([key, label]) => (
                <div key={key} className="bg-white p-3 rounded-lg border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      handleImageUpload(e.target.files?.[0], 500, true, (dataUrl) =>
                        setDraftReport((prev) => ({ ...prev, logos: { ...prev.logos, [key]: dataUrl } }))
                      )
                    }
                    className="text-xs w-full"
                  />
                  {draftReport.logos[key] && (
                    <div className="flex items-center gap-2 mt-2">
                      <img src={draftReport.logos[key]} alt={label} className="h-9 object-contain border border-slate-200 rounded p-0.5" />
                      <button
                        type="button"
                        onClick={() => setDraftReport((prev) => ({ ...prev, logos: { ...prev.logos, [key]: '' } }))}
                        className="text-xs text-rose-600 font-semibold hover:underline"
                      >
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: I. Weather & II. Safety */}
      {activeEditorTab === 'weather' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">I. Ghi chép thời tiết</h4>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 text-left">Thời tiết</th>
                  <th className="p-2 w-28 text-left">Thời gian</th>
                  <th className="p-2 w-28 text-left">Ghi chú</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draftReport.weather.map((w, idx) => (
                  <tr key={w.id}>
                    <td className="p-1.5 text-center font-semibold">{idx + 1}</td>
                    <td className="p-1">
                      <input
                        value={w.weather}
                        onChange={(e) => updateRow('weather', w.id, 'weather', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={w.time}
                        onChange={(e) => updateRow('weather', w.id, 'time', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        value={w.note}
                        onChange={(e) => updateRow('weather', w.id, 'note', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button type="button" onClick={() => deleteRow('weather', w.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => addRow('weather', { type: 'row', weather: '', time: '', note: '' })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng thời tiết
            </button>
          </div>

          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">II. Quản lý an toàn công trình</h4>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 text-left">Mô tả công tác an toàn</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draftReport.safety.map((s, idx) => (
                  <tr key={s.id}>
                    <td className="p-1.5 text-center font-semibold">{idx + 1}</td>
                    <td className="p-1">
                      <input
                        value={s.desc}
                        onChange={(e) => updateRow('safety', s.id, 'desc', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button type="button" onClick={() => deleteRow('safety', s.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => addRow('safety', { type: 'row', desc: '' })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm dòng an toàn
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: III. Manpower & IV. Machinery */}
      {activeEditorTab === 'man' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">III. Nhân lực trong ngày</h4>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 text-left">Bộ phận</th>
                  <th className="p-2 w-24 text-center">Trong giờ</th>
                  <th className="p-2 w-24 text-center">Tăng ca</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draftReport.man.map((m, idx) => (
                  <tr key={m.id}>
                    <td className="p-1.5 text-center font-semibold">{idx + 1}</td>
                    <td className="p-1">
                      <input
                        value={m.dept}
                        onChange={(e) => updateRow('man', m.id, 'dept', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        value={m.regular}
                        onChange={(e) => updateRow('man', m.id, 'regular', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        value={m.overtime}
                        onChange={(e) => updateRow('man', m.id, 'overtime', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button type="button" onClick={() => deleteRow('man', m.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => addRow('man', { type: 'row', dept: '', regular: 0, overtime: 0 })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm nhân lực
            </button>
          </div>

          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">IV. Máy móc và thiết bị</h4>
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 text-left">Tên thiết bị</th>
                  <th className="p-2 w-24 text-center">Số lượng</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {draftReport.mach.map((m, idx) => (
                  <tr key={m.id}>
                    <td className="p-1.5 text-center font-semibold">{idx + 1}</td>
                    <td className="p-1">
                      <input
                        value={m.name}
                        onChange={(e) => updateRow('mach', m.id, 'name', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        value={m.qty}
                        onChange={(e) => updateRow('mach', m.id, 'qty', e.target.value)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button type="button" onClick={() => deleteRow('mach', m.id)} className="text-rose-500 hover:text-rose-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => addRow('mach', { type: 'row', name: '', qty: 1 })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm máy móc thiết bị
            </button>
          </div>
        </div>
      )}

      {/* Tab 4: V. Materials */}
      {activeEditorTab === 'mat' && (
        <div>
          <h4 className="text-sm font-bold text-blue-700 mb-2">V. Vật liệu nhập vào công trình</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-2 w-10 text-center">STT</th>
                  <th className="p-2 text-left">Vật liệu</th>
                  <th className="p-2 w-40 text-left">Nhà cung cấp</th>
                  <th className="p-2 w-20 text-center">Đơn vị</th>
                  <th className="p-2 w-28 text-center">Nhập trong ngày</th>
                  <th className="p-2 w-28 text-center">Lũy kế nhập</th>
                  <th className="p-2 w-36 text-left">Ghi chú</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {labelRows(draftReport.mat).map((m) =>
                  m.type === 'A' ? (
                    <tr key={m.id} className="bg-blue-50/70 font-bold">
                      <td className="p-1.5 text-center text-blue-800">{m.no}</td>
                      <td colSpan={6} className="p-1">
                        <input
                          value={m.name}
                          onChange={(e) => updateRow('mat', m.id, 'name', e.target.value)}
                          className="w-full px-2 py-1 font-bold bg-white border border-blue-200 rounded"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button type="button" onClick={() => deleteRow('mat', m.id)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.id}>
                      <td className="p-1.5 text-center font-semibold">{m.no}</td>
                      <td className="p-1">
                        <input
                          value={m.name}
                          onChange={(e) => updateRow('mat', m.id, 'name', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={m.supplier || ''}
                          onChange={(e) => updateRow('mat', m.id, 'supplier', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={m.unit || ''}
                          onChange={(e) => updateRow('mat', m.id, 'unit', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={m.today || ''}
                          onChange={(e) => updateRow('mat', m.id, 'today', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={m.cum || ''}
                          onChange={(e) => updateRow('mat', m.id, 'cum', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={m.note || ''}
                          onChange={(e) => updateRow('mat', m.id, 'note', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button type="button" onClick={() => deleteRow('mat', m.id)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <button
              type="button"
              onClick={() => addRow('mat', { type: 'A', name: 'ĐẦU MỤC VẬT TƯ MỚI' })}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm đầu mục lớn (A, B, C...)
            </button>
            <button
              type="button"
              onClick={() => addRow('mat', { type: 'row', name: '', supplier: '', unit: '', today: '0', cum: '', note: '' })}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm vật tư
            </button>
          </div>
        </div>
      )}

      {/* Tab 5: VI. Works & VII. Inspections */}
      {activeEditorTab === 'works' && (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">VI. Khối lượng công việc thực hiện trong ngày</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2 w-10 text-center">STT</th>
                    <th className="p-2 text-left">Nội dung công việc</th>
                    <th className="p-2 w-24 text-center">KH hôm nay</th>
                    <th className="p-2 w-24 text-center">TH hôm nay</th>
                    <th className="p-2 w-24 text-center">Lũy kế</th>
                    <th className="p-2 w-24 text-center">KH ngày mai</th>
                    <th className="p-2 w-16 text-center">Đơn vị</th>
                    <th className="p-2 w-32 text-left">Ghi chú</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {labelRows(draftReport.work).map((w) =>
                    w.type === 'A' ? (
                      <tr key={w.id} className="bg-blue-50/70 font-bold">
                        <td className="p-1.5 text-center text-blue-800">{w.no}</td>
                        <td colSpan={7} className="p-1">
                          <input
                            value={w.name}
                            onChange={(e) => updateRow('work', w.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 font-bold bg-white border border-blue-200 rounded"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button type="button" onClick={() => deleteRow('work', w.id)} className="text-rose-500 hover:text-rose-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={w.id}>
                        <td className="p-1.5 text-center font-semibold">{w.no}</td>
                        <td className="p-1">
                          <input
                            value={w.name}
                            onChange={(e) => updateRow('work', w.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.plan || ''}
                            onChange={(e) => updateRow('work', w.id, 'plan', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.today || ''}
                            onChange={(e) => updateRow('work', w.id, 'today', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.cum || ''}
                            onChange={(e) => updateRow('work', w.id, 'cum', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.next || ''}
                            onChange={(e) => updateRow('work', w.id, 'next', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.unit || ''}
                            onChange={(e) => updateRow('work', w.id, 'unit', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            value={w.note || ''}
                            onChange={(e) => updateRow('work', w.id, 'note', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button type="button" onClick={() => deleteRow('work', w.id)} className="text-rose-500 hover:text-rose-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <button
                type="button"
                onClick={() => addRow('work', { type: 'A', name: 'HẠNG MỤC CÔNG VIỆC MỚI' })}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm đầu mục lớn (A, B, C...)
              </button>
              <button
                type="button"
                onClick={() => addRow('work', { type: 'row', name: '', unit: '', plan: '', today: '', cum: '', next: '', note: '' })}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm công tác
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-blue-700 mb-2">VII. Công tác nghiệm thu trong ngày</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-700 font-bold">
                  <tr>
                    <th className="p-2 w-10 text-center">STT</th>
                    <th className="p-2 text-left">Hạng mục nghiệm thu</th>
                    <th className="p-2 w-32 text-center">Thời gian</th>
                    <th className="p-2 w-36 text-left">Cán bộ phụ trách</th>
                    <th className="p-2 w-28 text-left">SĐT</th>
                    <th className="p-2 w-36 text-left">Thành phần tham gia</th>
                    <th className="p-2 w-24 text-center">Đánh giá</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {draftReport.insp.map((n, idx) => (
                    <tr key={n.id}>
                      <td className="p-1.5 text-center font-semibold">{idx + 1}</td>
                      <td className="p-1">
                        <input
                          value={n.item}
                          onChange={(e) => updateRow('insp', n.id, 'item', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={n.time}
                          onChange={(e) => updateRow('insp', n.id, 'time', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={n.person}
                          onChange={(e) => updateRow('insp', n.id, 'person', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={n.phone}
                          onChange={(e) => updateRow('insp', n.id, 'phone', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={n.participants}
                          onChange={(e) => updateRow('insp', n.id, 'participants', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          value={n.assess}
                          onChange={(e) => updateRow('insp', n.id, 'assess', e.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-center font-bold"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button type="button" onClick={() => deleteRow('insp', n.id)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => addRow('insp', { type: 'row', item: '', time: '', person: '', phone: '', participants: 'TVGS + CĐT', assess: 'ĐẠT' })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm nghiệm thu
            </button>
          </div>
        </div>
      )}

      {/* Tab 6: Photos & Signatures */}
      {activeEditorTab === 'photos' && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-blue-700">Hình ảnh đính kèm & Chữ ký cuối báo cáo</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {draftReport.photos.map((p) => (
              <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 relative">
                <button
                  type="button"
                  onClick={() => deleteRow('photos', p.id)}
                  className="absolute top-2 right-2 text-rose-500 hover:text-rose-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleImageUpload(e.target.files?.[0], 1280, false, (url) => updateRow('photos', p.id, 'url', url))
                  }
                  className="text-xs mb-2 w-full"
                />
                {p.url ? (
                  <img src={p.url} alt={p.caption} className="h-32 w-full object-cover rounded border border-slate-200" />
                ) : (
                  <div className="h-32 border border-dashed border-slate-300 rounded flex items-center justify-center text-xs text-slate-400">
                    Chưa có ảnh
                  </div>
                )}
                <input
                  value={p.caption}
                  onChange={(e) => updateRow('photos', p.id, 'caption', e.target.value)}
                  placeholder="Ghi chú hình ảnh"
                  className="w-full mt-2 px-2.5 py-1.5 text-xs border border-slate-200 rounded text-center bg-white"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addRow('photos', { type: 'row', url: '', caption: 'Ảnh thi công' })}
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm hình ảnh
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề ký bên Nhà thầu</label>
              <input
                value={draftReport.sign.cTitle}
                onChange={(e) => setDraftReport((prev) => ({ ...prev, sign: { ...prev.sign, cTitle: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề ký bên Tư vấn giám sát</label>
              <input
                value={draftReport.sign.sTitle}
                onChange={(e) => setDraftReport((prev) => ({ ...prev, sign: { ...prev.sign, sTitle: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Họ tên đại diện Nhà thầu</label>
              <input
                value={draftReport.sign.cName}
                onChange={(e) => setDraftReport((prev) => ({ ...prev, sign: { ...prev.sign, cName: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Họ tên đại diện Giám sát</label>
              <input
                value={draftReport.sign.sName}
                onChange={(e) => setDraftReport((prev) => ({ ...prev, sign: { ...prev.sign, sName: e.target.value } }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom Publish Bar inside Editor */}
      <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onPublish}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-2 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Hoàn tất & Xuất báo cáo ngày ra giao diện Web (8 mục)</span>
        </button>
      </div>
    </div>
  );
};

export default DailyReportEditor;
