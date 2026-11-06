import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, Users, Plus, Pencil, Trash2, X, RotateCcw, 
  Save, Phone, Mail, UserCheck, Check, Sparkles, ShieldCheck, Lock, Shield
} from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { 
  TeamMember, 
  getStoredTeamMembers, 
  updateTeamMember, 
  addTeamMember, 
  deleteTeamMember, 
  resetTeamToDefault, 
  subscribeTeamMembers,
  fetchRemoteTeamMembers
} from '../services/teamService';

interface ManagementTeamCardProps {
  language: Language;
  isAdmin?: boolean;
}

const COMMON_ROLES = [
  { code: 'PM', name: 'PM (Project Manager)' },
  { code: 'CM', name: 'CM (Construction Manager)' },
  { code: 'QC MEP', name: 'QC MEP (Kỹ sư chất lượng MEP)' },
  { code: 'QC XD', name: 'QC XD (Kỹ sư chất lượng Xây dựng)' },
  { code: 'MEP', name: 'MEP (Cơ điện)' },
  { code: 'QC', name: 'QC (Quality Control)' },
  { code: 'QS', name: 'QS (Quantity Surveyor)' },
  { code: 'HSE', name: 'HSE (An toàn lao động)' },
  { code: 'SE', name: 'Site Engineer' },
  { code: 'Admin', name: 'Thư ký / Điều phối' },
];

export const ManagementTeamCard: React.FC<ManagementTeamCardProps> = ({ language, isAdmin: propIsAdmin }) => {
  const t = (key: string) => TRANSLATIONS[language]?.[key] || key;

  // Admin permission resolution (supports prop, user_role, localStorage flags)
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (propIsAdmin !== undefined) return propIsAdmin;
    try {
      return (
        localStorage.getItem('is_admin') === 'true' &&
        localStorage.getItem('c10_admin_unlocked') === 'true'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (propIsAdmin !== undefined) {
      setIsAdmin(propIsAdmin);
    }
  }, [propIsAdmin]);

  // Keep admin state synced with localStorage and custom role events
  useEffect(() => {
    const handleRoleCheck = () => {
      if (propIsAdmin !== undefined) {
        setIsAdmin(propIsAdmin);
        return;
      }
      try {
        const hasAdmin = (
          localStorage.getItem('is_admin') === 'true' &&
          localStorage.getItem('c10_admin_unlocked') === 'true'
        );
        setIsAdmin(Boolean(hasAdmin));
      } catch {
        setIsAdmin(false);
      }
    };

    window.addEventListener('storage', handleRoleCheck);
    window.addEventListener('c10-auth-changed', handleRoleCheck);
    window.addEventListener('layer2-auth-changed', handleRoleCheck);
    return () => {
      window.removeEventListener('storage', handleRoleCheck);
      window.removeEventListener('c10-auth-changed', handleRoleCheck);
      window.removeEventListener('layer2-auth-changed', handleRoleCheck);
    };
  }, [propIsAdmin]);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(getStoredTeamMembers());
  
  // Modal Edit / Add State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formRoleVN, setFormRoleVN] = useState('');
  const [formRoleEN, setFormRoleEN] = useState('');
  const [formContact, setFormContact] = useState('');

  // Feedback Toast
  const [showToast, setShowToast] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'reset'; id?: string; message: string } | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeTeamMembers((items) => {
      setTeamMembers(items);
    });

    fetchRemoteTeamMembers().then(remoteItems => {
      if (remoteItems) setTeamMembers(remoteItems);
    }).catch(() => {});

    return () => unsub();
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isModalOpen]);

  const triggerToast = (msg: string) => {
    setShowToast(msg);
    setTimeout(() => {
      setShowToast(null);
    }, 2800);
  };

  const openEditModal = (member: TeamMember) => {
    if (!isAdmin) return; // Guard: only admin can edit
    setEditingMember(member);
    setFormName(member.name);
    setFormRoleVN(member.role.VN || '');
    setFormRoleEN(member.role.EN || member.role.VN || '');
    setFormContact(member.contact || '');
    setIsAddingNew(false);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    if (!isAdmin) return; // Guard: only admin can add
    setEditingMember(null);
    setFormName('');
    setFormRoleVN('PM');
    setFormRoleEN('PM');
    setFormContact('');
    setIsAddingNew(true);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return; // Guard: only admin can save
    if (!formName.trim() || !formRoleVN.trim()) return;

    if (editingMember) {
      updateTeamMember(editingMember.id, {
        name: formName.trim(),
        role: {
          VN: formRoleVN.trim(),
          EN: formRoleEN.trim() || formRoleVN.trim()
        },
        contact: formContact.trim()
      });
      triggerToast(language === 'VN' ? 'Đã cập nhật nhân sự BQLDA!' : 'Team member updated!');
    } else if (isAddingNew) {
      addTeamMember({
        name: formName.trim(),
        role: {
          VN: formRoleVN.trim(),
          EN: formRoleEN.trim() || formRoleVN.trim()
        },
        contact: formContact.trim()
      });
      triggerToast(language === 'VN' ? 'Đã thêm thành viên BQLDA mới!' : 'New member added!');
    }

    setIsModalOpen(false);
    setEditingMember(null);
    setIsAddingNew(false);
  };

  const handleDelete = (id: string) => {
    if (!isAdmin) return; // Guard: only admin can delete
    setConfirmAction({
      type: 'delete',
      id,
      message: language === 'VN' ? 'Bạn có chắc chắn muốn xóa nhân sự này khỏi Ban Quản Lý?' : 'Remove this member from team?'
    });
  };

  const handleReset = () => {
    if (!isAdmin) return; // Guard: only admin can reset
    setConfirmAction({
      type: 'reset',
      message: language === 'VN' ? 'Khôi phục danh sách Ban Quản Lý về mặc định 5 thành viên?' : 'Reset team to default 5 members?'
    });
  };

  const executeConfirmedAction = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete' && confirmAction.id) {
      deleteTeamMember(confirmAction.id);
      setIsModalOpen(false);
      setEditingMember(null);
      triggerToast(language === 'VN' ? 'Đã xóa nhân sự khỏi danh sách!' : 'Member deleted!');
    } else if (confirmAction.type === 'reset') {
      resetTeamToDefault();
      setIsModalOpen(false);
      setEditingMember(null);
      triggerToast(language === 'VN' ? 'Đã khôi phục danh sách mặc định!' : 'Team reset to default!');
    }
    setConfirmAction(null);
  };

  const getRoleBadgeClass = (role: string) => {
    const r = role.toUpperCase();
    if (r === 'PM') return 'bg-blue-50 text-blue-700 border-blue-200/80';
    if (r === 'CM') return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
    if (r.includes('MEP')) return 'bg-amber-50 text-amber-800 border-amber-200/80';
    if (r.includes('XD')) return 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
    if (r.includes('HSE')) return 'bg-rose-50 text-rose-700 border-rose-200/80';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 relative">
      {/* Toast notification */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-[120] bg-slate-900 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{showToast}</span>
          <button onClick={() => setShowToast(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600"/> {t('pm_team')}
            </h3>

            {/* Permission badge */}
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                {language === 'VN' ? 'Quyền Admin: Cho phép Thêm/Sửa' : 'Admin: Edit Mode'}
              </span>
            ) : (
              <span 
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                title={language === 'VN' ? 'Mục thêm/sửa chỉ hiển thị và chỉnh sửa bởi quyền Admin' : 'Add/edit restricted to Admin'}
              >
                <Lock className="w-3 h-3 text-slate-400" />
                {language === 'VN' ? 'Quyền xem' : 'Read-only'}
              </span>
            )}
          </div>
          
          <p className="text-xs text-slate-500 mt-1">
            {isAdmin 
              ? (language === 'VN' ? 'Bấm nút "+ Thêm nhân sự" hoặc nhấp trực tiếp vào từng thành viên để chỉnh sửa thông tin' : 'Click "+ Add Member" or click on any row to edit information')
              : (language === 'VN' ? 'Danh sách nhân sự điều hành & giám sát chất lượng dự án C10' : 'Project management and quality control personnel directory')}
          </p>
        </div>

        {/* Admin-only Action buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95"
              title={language === 'VN' ? 'Thêm nhân sự mới vào BQLDA' : 'Add new team member'}
            >
              <Plus className="w-3.5 h-3.5" />
              {language === 'VN' ? 'Thêm nhân sự' : 'Add Member'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              title={language === 'VN' ? 'Khôi phục danh sách mặc định' : 'Reset default'}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="p-3.5 w-12 text-center border-r border-slate-200 whitespace-nowrap">STT</th>
              <th className="p-3.5 border-r border-slate-200 whitespace-nowrap">{t('team_name')}</th>
              <th className="p-3.5 text-center border-r border-slate-200 whitespace-nowrap">{t('team_role')}</th>
              <th className="p-3.5 border-r border-slate-200 whitespace-nowrap">{t('team_contact')}</th>
              {isAdmin && (
                <th className="p-3.5 w-24 text-center whitespace-nowrap">{language === 'VN' ? 'Thao tác' : 'Actions'}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {teamMembers.map((member, idx) => {
              const displayRole = member.role[language] || member.role.VN || 'PM';
              const hasContact = member.contact && member.contact.trim() !== '' && member.contact.trim() !== '-';
              const isPhone = hasContact && /^[0-9+.\s()-]{7,}$/.test(member.contact.trim());
              const isEmail = hasContact && member.contact.includes('@');

              return (
                <tr 
                  key={member.id || idx}
                  onClick={isAdmin ? () => openEditModal(member) : undefined}
                  className={`transition-colors ${
                    isAdmin 
                      ? 'hover:bg-blue-50/50 cursor-pointer group' 
                      : 'hover:bg-slate-50/50'
                  }`}
                  title={isAdmin ? (language === 'VN' ? 'Nhấp để chỉnh sửa thành viên này' : 'Click to edit member') : undefined}
                >
                  <td className="p-3.5 text-center text-xs font-mono text-slate-400 border-r border-slate-100 whitespace-nowrap">
                    {idx + 1}
                  </td>
                  <td className="p-3.5 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                    <div className="flex items-center gap-2.5 whitespace-nowrap">
                      <div className={`w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 transition-colors ${
                        isAdmin ? 'group-hover:bg-blue-600 group-hover:text-white' : ''
                      }`}>
                        {member.name.trim().charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span className={`whitespace-nowrap transition-colors ${isAdmin ? 'group-hover:text-blue-600' : ''}`}>
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <td className="p-3.5 text-center border-r border-slate-100 whitespace-nowrap">
                    <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-bold text-xs border shadow-2xs whitespace-nowrap ${getRoleBadgeClass(displayRole)}`}>
                      {displayRole}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-xs text-slate-600 border-r border-slate-100 whitespace-nowrap">
                    {isEmail ? (
                      <a 
                        href={`mailto:${member.contact}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {member.contact}
                      </a>
                    ) : isPhone ? (
                      <a 
                        href={`tel:${member.contact.replace(/[^\d+]/g, '')}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-800 hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {member.contact}
                      </a>
                    ) : (
                      <span className="text-slate-400">{hasContact ? member.contact : ''}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(member);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-transparent hover:border-blue-200 shadow-2xs"
                          title={language === 'VN' ? 'Sửa thông tin' : 'Edit'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(member.id);
                          }}
                          className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200 shadow-2xs"
                          title={language === 'VN' ? 'Xóa khỏi ban' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL POPUP FOR ADDING / EDITING MEMBER (Admin only) */}
      {isModalOpen && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-scale-in">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                  {isAddingNew ? <Plus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    {isAddingNew 
                      ? (language === 'VN' ? 'Thêm Nhân Sự Ban Quản Lý (Admin)' : 'Add Team Member (Admin)')
                      : (language === 'VN' ? 'Chỉnh Sửa Thông Tin Nhân Sự (Admin)' : 'Edit Team Member (Admin)')}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {language === 'VN' ? 'Cập nhật tên, chức vụ và thông tin liên hệ' : 'Update name, position and contact'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingMember(null);
                  setIsAddingNew(false);
                }}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {language === 'VN' ? 'Họ và Tên:' : 'Full Name:'}
                  <span className="text-rose-500 ml-1">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="VD: Châu Chí Công"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-900 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {language === 'VN' ? 'Chức Vụ / Vai Trò:' : 'Position / Role:'}
                  <span className="text-rose-500 ml-1">*</span>
                </label>
                
                {/* Quick Select Buttons */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_ROLES.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => {
                        setFormRoleVN(r.code);
                        setFormRoleEN(r.code);
                      }}
                      className={`text-[11px] font-bold px-2 py-1 rounded-md border transition-all ${
                        formRoleVN === r.code
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {r.code}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  required
                  value={formRoleVN}
                  onChange={(e) => {
                    setFormRoleVN(e.target.value);
                    if (!formRoleEN || formRoleEN === formRoleVN) setFormRoleEN(e.target.value);
                  }}
                  placeholder="VD: PM, CM, QC MEP, QC XD..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-900 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {language === 'VN' ? 'Thông Tin Liên Hệ (Để trống nếu chưa có):' : 'Contact (Leave empty if none):'}
                </label>
                <input
                  type="text"
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  placeholder={language === 'VN' ? 'Để trống hoặc nhập SĐT / Email' : 'Leave blank or enter phone/email'}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-mono text-slate-900 shadow-2xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
                {editingMember ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingMember.id)}
                    className="px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    {language === 'VN' ? 'Xóa nhân sự' : 'Delete'}
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingMember(null);
                      setIsAddingNew(false);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    {language === 'VN' ? 'Hủy' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-200 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {language === 'VN' ? 'Lưu nhân sự' : 'Save Member'}
                  </button>
                </div>
              </div>
            </form>
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

export default ManagementTeamCard;
