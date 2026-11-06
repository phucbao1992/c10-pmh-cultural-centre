import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, Plus, Pencil, Trash2, Check, X, ShieldCheck, 
  RotateCcw, Lock, Unlock, AlertCircle, Save, Info, Calendar
} from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { 
  MilestoneItem, 
  getStoredMilestones, 
  updateMilestone, 
  addMilestone, 
  deleteMilestone, 
  resetMilestonesToDefault, 
  subscribeMilestones,
  fetchRemoteMilestones,
  isMilestonesAdminLockEnabled,
  setMilestonesAdminLock
} from '../services/milestoneService';
import { ADMIN_EMAIL, signInAsAdminWithGoogle } from '../services/firebase';

interface MilestonesCardProps {
  language: Language;
}

export const MilestonesCard: React.FC<MilestonesCardProps> = ({ 
  language 
}) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;
  
  const [milestones, setMilestones] = useState<MilestoneItem[]>(getStoredMilestones());
  const [isAdminLocked, setIsAdminLocked] = useState<boolean>(isMilestonesAdminLockEnabled());
  const [isAdminAuth, setIsAdminAuth] = useState<boolean>(() => {
    return localStorage.getItem('is_admin') === 'true' && localStorage.getItem('c10_admin_unlocked') === 'true';
  });

  // Modal Edit / Add State
  const [editingMilestone, setEditingMilestone] = useState<MilestoneItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Admin Settings Modal
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pendingMilestoneToEdit, setPendingMilestoneToEdit] = useState<MilestoneItem | null>(null);
  
  // Feedback Toast
  const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);
  const [isSigningInAdmin, setIsSigningInAdmin] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'reset'; id?: string; message: string } | null>(null);

  // Form states
  const [formDate, setFormDate] = useState('');
  const [formDescVN, setFormDescVN] = useState('');
  const [formDescEN, setFormDescEN] = useState('');
  const [formCompleted, setFormCompleted] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);

  // Sync with service
  useEffect(() => {
    const unsub = subscribeMilestones((items) => {
      setMilestones(items);
    });

    const handleLockChanged = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setIsAdminLocked(custom.detail);
    };
    window.addEventListener('c10-milestones-admin-lock-changed', handleLockChanged);

    // Try fetching remote
    fetchRemoteMilestones().then(remoteItems => {
      if (remoteItems) setMilestones(remoteItems);
    }).catch(() => {});

    return () => {
      unsub();
      window.removeEventListener('c10-milestones-admin-lock-changed', handleLockChanged);
    };
  }, []);

  // Auto focus input when modal opens
  useEffect(() => {
    if (isEditModalOpen) {
      setTimeout(() => {
        dateInputRef.current?.focus();
      }, 100);
    }
  }, [isEditModalOpen]);

  const triggerToast = (msg: string) => {
    setShowSuccessToast(msg);
    setTimeout(() => {
      setShowSuccessToast(null);
    }, 2800);
  };

  // Permission check
  const isEditable = !isAdminLocked || isAdminAuth;

  const openEditModalForMilestone = (milestone: MilestoneItem) => {
    if (!isEditable) {
      setPendingMilestoneToEdit(milestone);
      setShowAdminModal(true);
      return;
    }
    setEditingMilestone(milestone);
    setFormDate(milestone.date);
    setFormDescVN(milestone.description.VN || '');
    setFormDescEN(milestone.description.EN || '');
    setFormCompleted(milestone.completed);
    setIsAddingNew(false);
    setIsEditModalOpen(true);
  };

  const openAddModal = () => {
    if (!isEditable) {
      setPendingMilestoneToEdit(null);
      setShowAdminModal(true);
      return;
    }
    setEditingMilestone(null);
    setFormDate('');
    setFormDescVN('');
    setFormDescEN('');
    setFormCompleted(false);
    setIsAddingNew(true);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate.trim() || !formDescVN.trim()) return;

    if (editingMilestone) {
      updateMilestone(editingMilestone.id, {
        date: formDate.trim(),
        description: {
          VN: formDescVN.trim(),
          EN: formDescEN.trim() || formDescVN.trim()
        },
        completed: formCompleted
      });
      triggerToast(language === 'VN' ? 'Đã lưu thay đổi mốc tiến độ!' : 'Milestone updated!');
    } else if (isAddingNew) {
      addMilestone({
        date: formDate.trim(),
        description: {
          VN: formDescVN.trim(),
          EN: formDescEN.trim() || formDescVN.trim()
        },
        completed: formCompleted
      });
      triggerToast(language === 'VN' ? 'Đã thêm mốc tiến độ mới!' : 'Added new milestone!');
    }

    setIsEditModalOpen(false);
    setEditingMilestone(null);
    setIsAddingNew(false);
  };

  const handleDelete = (id: string) => {
    setConfirmAction({
      type: 'delete',
      id,
      message: language === 'VN' ? 'Bạn có chắc chắn muốn xóa mốc này?' : 'Are you sure you want to delete this milestone?'
    });
  };

  const handleReset = () => {
    setConfirmAction({
      type: 'reset',
      message: language === 'VN' ? 'Khôi phục danh sách mốc tiến độ về mặc định ban đầu?' : 'Reset milestones to default?'
    });
  };

  const executeConfirmedAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete' && confirmAction.id) {
      deleteMilestone(confirmAction.id);
      setIsEditModalOpen(false);
      setEditingMilestone(null);
      triggerToast(language === 'VN' ? 'Đã xóa mốc tiến độ!' : 'Milestone deleted!');
    } else if (confirmAction.type === 'reset') {
      resetMilestonesToDefault();
      setIsEditModalOpen(false);
      setEditingMilestone(null);
      setIsAddingNew(false);
      triggerToast(language === 'VN' ? 'Đã khôi phục mốc mặc định!' : 'Milestones restored!');
    }
    setConfirmAction(null);
  };

  const handleAdminGoogleSignIn = async () => {
    if (isSigningInAdmin) return;
    setIsSigningInAdmin(true);
    setAdminAuthError(null);
    try {
      const res = await signInAsAdminWithGoogle();
      if (res.success) {
        setIsAdminAuth(true);
        localStorage.setItem('c10_admin_unlocked', 'true');
        localStorage.setItem('layer2-auth', 'true');
        localStorage.setItem('is_admin', 'true');
        window.dispatchEvent(new Event('c10-auth-changed'));
        setAdminAuthError(null);
        setShowAdminModal(false);
        triggerToast(language === 'VN' ? 'Đã xác thực quyền Admin!' : 'Admin access granted!');

        // Automatically proceed to open edit modal if user was trying to edit
        if (pendingMilestoneToEdit) {
          setTimeout(() => {
            openEditModalForMilestone(pendingMilestoneToEdit);
            setPendingMilestoneToEdit(null);
          }, 150);
        } else {
          setTimeout(() => {
            openAddModal();
          }, 150);
        }
      } else {
        setAdminAuthError(
          res.error ||
            (language === 'VN'
              ? `Chỉ tài khoản ${ADMIN_EMAIL} mới có quyền Quản trị.`
              : `Only ${ADMIN_EMAIL} is authorized as Admin.`)
        );
      }
    } catch {
      setAdminAuthError(
        language === 'VN' ? 'Lỗi kết nối xác thực Google.' : 'Google authentication failed.'
      );
    } finally {
      setIsSigningInAdmin(false);
    }
  };

  const toggleAdminLockMode = (enable: boolean) => {
    setMilestonesAdminLock(enable);
    setIsAdminLocked(enable);
    triggerToast(
      enable 
        ? (language === 'VN' ? 'Đã bật phân quyền: Chỉ Admin mới được chỉnh sửa' : 'Admin protection enabled') 
        : (language === 'VN' ? 'Đã mở quyền: Mọi người có thể nhấp để sửa' : 'Open edit mode enabled')
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-8 transition-all">
      {/* Toast notification */}
      {showSuccessToast && (
        <div className="fixed bottom-6 right-6 z-[120] bg-slate-900 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{showSuccessToast}</span>
          <button onClick={() => setShowSuccessToast(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" /> {t('milestones')}
        </h3>

        {/* Admin Permission & Management Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowAdminModal(true)}
            title={
              isAdminLocked 
                ? (language === 'VN' ? 'Đang bật phân quyền Admin (Bấm để cài đặt)' : 'Admin lock active') 
                : (language === 'VN' ? 'Đang mở chế độ nhấp để sửa (Bấm để cài đặt phân quyền)' : 'Click-to-edit open')
            }
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
              isAdminLocked
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            {isAdminLocked ? <Lock className="w-3 h-3 text-amber-600" /> : <Unlock className="w-3 h-3 text-emerald-600" />}
            <span className="hidden sm:inline">
              {isAdminLocked ? (language === 'VN' ? 'Khóa Admin' : 'Admin Locked') : (language === 'VN' ? 'Nhấp để sửa' : 'Click to Edit')}
            </span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            title={language === 'VN' ? 'Thêm mốc tiến độ mới' : 'Add new milestone'}
            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            title={language === 'VN' ? 'Khôi phục danh sách mặc định' : 'Reset default'}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editing Guide Hint */}
      <div className="mb-4 px-3 py-2 bg-blue-50/70 border border-blue-100 rounded-lg flex items-center justify-between text-[11px] text-blue-900">
        <span className="flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            {language === 'VN' 
              ? 'Bấm trực tiếp vào mốc hoặc biểu tượng cây bút để sửa thông tin' 
              : 'Click on any milestone or pencil icon to edit'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setShowAdminModal(true)}
          className="text-[10px] text-blue-700 font-bold hover:underline shrink-0 ml-1.5 bg-white/80 px-1.5 py-0.5 rounded border border-blue-200 shadow-2xs"
        >
          {language === 'VN' ? 'Phân quyền' : 'Admin'}
        </button>
      </div>

      {/* Timeline List */}
      <div className="relative border-l-2 border-slate-200 ml-3 space-y-5 py-2">
        {milestones.map((milestone, idx) => {
          return (
            <div
              key={milestone.id || idx}
              onClick={() => openEditModalForMilestone(milestone)}
              className="relative pl-7 pr-2 py-2 group cursor-pointer transition-all rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200"
              title={language === 'VN' ? 'Bấm để chỉnh sửa mốc tiến độ này' : 'Click to edit this milestone'}
            >
              {/* Timeline circle node */}
              <div 
                className={`absolute -left-[9px] top-3.5 w-4 h-4 rounded-full border-2 transition-all duration-200 shadow-2xs ${
                  milestone.completed 
                    ? 'bg-green-500 border-green-500 ring-2 ring-green-100' 
                    : 'bg-white border-slate-300 group-hover:border-blue-500 group-hover:scale-110'
                }`}
              >
                {milestone.completed && (
                  <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto stroke-[3]" />
                )}
              </div>

              {/* Milestone Details & Pencil Button */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wide group-hover:underline">
                      {milestone.date}
                    </span>
                    {milestone.completed && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {language === 'VN' ? 'Hoàn thành' : 'Done'}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-800 leading-snug group-hover:text-blue-900 transition-colors">
                    {milestone.description[language] || milestone.description.VN}
                  </span>
                </div>

                {/* Permanent and explicit Pencil Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditModalForMilestone(milestone);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 group-hover:text-blue-600 hover:text-blue-700 bg-slate-100/60 hover:bg-blue-100/80 border border-slate-200 hover:border-blue-300 transition-all shrink-0 shadow-2xs"
                  title={language === 'VN' ? 'Chỉnh sửa mốc này' : 'Edit this milestone'}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Add Button at Bottom */}
      <button
        type="button"
        onClick={openAddModal}
        className="mt-4 w-full py-2.5 px-3 border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/60 rounded-xl text-xs font-bold text-slate-600 hover:text-blue-600 transition-all flex items-center justify-center gap-2 shadow-2xs active:scale-[0.99]"
      >
        <Plus className="w-4 h-4" />
        {language === 'VN' ? 'Thêm mốc tiến độ mới' : 'Add New Milestone'}
      </button>

      {/* POPUP MODAL FOR EDITING / ADDING MILESTONES (100% visible, centered, impossible to miss) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {isAddingNew 
                      ? (language === 'VN' ? 'Thêm mốc tiến độ mới' : 'Add New Milestone')
                      : (language === 'VN' ? 'Chỉnh sửa mốc tiến độ' : 'Edit Milestone')}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {language === 'VN' ? 'Nhập tay ngày và nội dung mốc tiến độ' : 'Enter date and milestone description'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingMilestone(null);
                  setIsAddingNew(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  {language === 'VN' ? 'Ngày / Mốc thời gian:' : 'Milestone Date:'}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={dateInputRef}
                  type="text"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  placeholder="VD: 28/08/2026 hoặc 10/2026"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-900 shadow-2xs"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {language === 'VN' ? 'Hỗ trợ định dạng: ngày/tháng/năm (vd: 28/08/2026) để hiển thị tự động trên biểu đồ.' : 'Suggested format: DD/MM/YYYY (e.g. 28/08/2026)'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {language === 'VN' ? 'Nội dung mốc tiến độ (Tiếng Việt):' : 'Milestone Description (Vietnamese):'}
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={formDescVN}
                  onChange={(e) => setFormDescVN(e.target.value)}
                  placeholder="VD: Nghiệm thu Phần móng (Sở Xây Dựng)"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {language === 'VN' ? 'Nội dung tiếng Anh (Tùy chọn):' : 'Milestone Description (English - Optional):'}
                </label>
                <input
                  type="text"
                  value={formDescEN}
                  onChange={(e) => setFormDescEN(e.target.value)}
                  placeholder="VD: Foundation Acceptance (DOC)"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 shadow-2xs"
                />
              </div>

              {/* Completed Status Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none hover:bg-slate-100/70 transition-colors">
                  <input
                    type="checkbox"
                    checked={formCompleted}
                    onChange={(e) => setFormCompleted(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      {language === 'VN' ? 'Đã hoàn thành mốc này' : 'Mark as completed'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {language === 'VN' ? 'Hiển thị nút màu xanh lá kèm dấu tích' : 'Will display with a green checkmark'}
                    </span>
                  </div>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
                {editingMilestone ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingMilestone.id)}
                    className="px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    {language === 'VN' ? 'Xóa mốc' : 'Delete'}
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingMilestone(null);
                      setIsAddingNew(false);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    {language === 'VN' ? 'Hủy bỏ' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-200 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {language === 'VN' ? 'Lưu mốc tiến độ' : 'Save Milestone'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Role & Permission Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scale-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {language === 'VN' ? 'Phân Quyền Chỉnh Sửa Mốc Tiến Độ' : 'Milestone Edit Permissions'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {language === 'VN' ? 'Quản lý quyền biên tập & bảo vệ dữ liệu mốc' : 'Manage editing roles & security'}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowAdminModal(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs text-slate-600">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {language === 'VN' ? 'Ghi nhận phân quyền Admin cho tương lai:' : 'Future Admin Role Architecture:'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {language === 'VN' 
                      ? 'Hệ thống đã thiết lập sẵn cơ chế phân quyền (RBAC). Khi bật tính năng Khóa Admin, chỉ người dùng có quyền Quản trị viên (hoặc nhập mật khẩu quản lý) mới được chỉnh sửa/xóa/thêm các mốc tiến độ.'
                      : 'Role-based access control is ready. When Admin Lock is enabled, only users with Admin role or manager password can modify milestones.'}
                  </p>
                </div>
              </div>

              {/* Status Section */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">
                    {language === 'VN' ? 'Trạng thái quyền hiện tại:' : 'Current Status:'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] flex items-center gap-1.5 ${
                    isAdminAuth
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {isAdminAuth ? <Check className="w-3 h-3 text-emerald-600" /> : <Lock className="w-3 h-3" />}
                    {isAdminAuth ? (language === 'VN' ? 'Đã mở quyền Admin' : 'Admin Unlocked') : (language === 'VN' ? 'Chế độ xem chung' : 'Standard View')}
                  </span>
                </div>

                {/* Lock policy toggle */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">
                      {language === 'VN' ? 'Khóa bảo vệ mốc (Chỉ Admin)' : 'Admin Lock for Milestones'}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {language === 'VN' ? 'Yêu cầu mật khẩu quản trị khi click sửa' : 'Require admin password to edit'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleAdminLockMode(!isAdminLocked)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isAdminLocked ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isAdminLocked ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Admin Unlock via Google if not authenticated */}
              {!isAdminAuth && (
                <div className="space-y-3 pt-1">
                  <div className="text-[11px] text-slate-600">
                    {language === 'VN' ? 'Đăng nhập bằng tài khoản Google Quản trị (' : 'Sign in with Admin Google account ('}
                    <span className="font-mono font-bold text-blue-700">{ADMIN_EMAIL}</span>
                    {'):'}
                  </div>
                  <button
                    type="button"
                    onClick={handleAdminGoogleSignIn}
                    disabled={isSigningInAdmin}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-60"
                  >
                    <span>
                      {isSigningInAdmin
                        ? (language === 'VN' ? 'Đang xác thực với Google...' : 'Signing in with Google...')
                        : (language === 'VN' ? 'Đăng nhập bằng Google' : 'Sign in with Google')}
                    </span>
                  </button>
                  {adminAuthError && (
                    <p className="text-rose-500 text-[11px] font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{adminAuthError}</span>
                    </p>
                  )}
                </div>
              )}

              {isAdminAuth && (
                <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
                  <span className="font-medium">
                    {language === 'VN' ? 'Tài khoản có toàn quyền sửa mốc tiến độ' : 'You have full editing permissions'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdminAuth(false);
                      localStorage.removeItem('c10_admin_unlocked');
                      localStorage.removeItem('layer2-auth');
                      window.dispatchEvent(new Event('c10-auth-changed'));
                      triggerToast(language === 'VN' ? 'Đã khóa quyền quản trị' : 'Admin locked');
                    }}
                    className="text-xs text-rose-600 hover:underline font-bold"
                  >
                    {language === 'VN' ? 'Khóa lại' : 'Relock'}
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAdminModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {language === 'VN' ? 'Đóng' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Confirmation Modal (replaces blocked window.confirm) */}
      {confirmAction && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 animate-scale-in space-y-4">
            <h4 className="text-base font-bold text-slate-900">
              {language === 'VN' ? 'Xác nhận thao tác' : 'Confirm Action'}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmAction.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                {language === 'VN' ? 'Hủy' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-all"
              >
                {language === 'VN' ? 'Xác nhận' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MilestonesCard;
