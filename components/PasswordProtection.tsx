import React, { useState } from 'react';
import { X, AlertCircle, RefreshCw, ShieldCheck, Key, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { ADMIN_BACKUP_PASSCODE, signInAsAdminWithGoogle } from '../services/firebase';
import { verifyAndActivateAccessCodeAsync, loadUserPermissions } from '../services/userPermissionsService';
import { loadDailyReportPermissions } from '../services/dailyReportService';

interface PasswordProtectionProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  language: Language;
}

const PasswordProtection: React.FC<PasswordProtectionProps> = ({ isOpen, onClose, onSuccess, language }) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await signInAsAdminWithGoogle();
      if (res.success) {
        setErrorMessage(null);
        onSuccess();
      } else {
        setErrorMessage(
          res.error ||
            (language === 'VN'
              ? 'Tài khoản chưa được cấp quyền trên hệ thống.'
              : 'Account not authorized.')
        );
      }
    } catch {
      setErrorMessage(
        language === 'VN'
          ? 'Không thể kết nối xác thực Google. Vui lòng thử lại.'
          : 'Failed to authenticate with Google. Please try again.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handlePasscodeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = passcodeInput.trim();
    if (!clean) {
      setErrorMessage(
        language === 'VN'
          ? 'Vui lòng nhập Mã cấp quyền Tab hoặc Mã PIN quản trị.'
          : 'Please enter an Access Code or Admin PIN.'
      );
      return;
    }

    // 1. Kiểm tra nếu là Mã PIN Quản trị viên tối cao
    if (clean === ADMIN_BACKUP_PASSCODE) {
      setErrorMessage(null);
      setSuccessMessage(null);
      setPasscodeInput('');
      localStorage.setItem('c10_user_role', 'ADMIN');
      localStorage.setItem('is_admin', 'true');
      localStorage.setItem('c10_admin_unlocked', 'true');
      localStorage.setItem('layer2-auth', 'true');
      localStorage.removeItem('c10_guest_mode');
      localStorage.removeItem('c10_preview_as_viewer');
      window.dispatchEvent(new Event('c10-auth-changed'));
      onSuccess();
      return;
    }

    // 2. Đồng bộ danh sách mã phân quyền mới nhất từ Cloud trước khi kiểm tra (cả 2 bảng user_permissions và daily_report_permissions)
    try {
      await Promise.all([loadUserPermissions(), loadDailyReportPermissions()]);
    } catch {}

    // 3. Kiểm tra nếu là Mã cấp quyền theo từng Tab (Access Code do Admin cấp)
    const codeResult = await verifyAndActivateAccessCodeAsync(clean);
    if (codeResult.success) {
      setErrorMessage(null);
      setPasscodeInput('');
      localStorage.setItem('c10_user_role', 'EDITOR');
      localStorage.removeItem('is_admin');
      localStorage.removeItem('c10_admin_unlocked');
      localStorage.removeItem('c10_guest_mode');
      localStorage.removeItem('c10_preview_as_viewer');
      window.dispatchEvent(new Event('c10-auth-changed'));
      setSuccessMessage(codeResult.message);
      setTimeout(() => {
        setSuccessMessage(null);
        onSuccess();
      }, 700);
      return;
    }

    setErrorMessage(
      language === 'VN'
        ? 'Mã cấp quyền hoặc Mã PIN không chính xác. Vui lòng kiểm tra lại!'
        : 'Incorrect Access Code or Admin PIN. Please try again!'
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {language === 'VN' ? 'Đăng Nhập & Nhập Mã Quyền Hạn C10' : 'C10 System Login & Access Code'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {language === 'VN'
                  ? 'Đăng nhập bằng Email Google hoặc Nhập mã cấp quyền theo Tab'
                  : 'Sign in with Google or enter a Tab Access Code'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {errorMessage && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-xl font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Option 1: Admin / Google Account Login */}
          <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                {language === 'VN' ? 'Cách 1: Đăng Nhập Quyền Admin (Google)' : 'Option 1: Admin Google Sign-In'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Quản trị viên
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {language === 'VN'
                ? 'Đăng nhập bằng tài khoản Google Admin hoặc Email đã được cấp quyền trên hệ thống.'
                : 'Sign in with your authorized Google Admin or Editor account.'}
            </p>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isSigningIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{language === 'VN' ? 'Đang xác thực với Google...' : 'Signing in with Google...'}</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{language === 'VN' ? 'Đăng nhập Quản trị viên bằng Google' : 'Sign in with Google Admin'}</span>
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-1">
            <div className="border-t border-slate-200 w-full" />
            <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
              {language === 'VN' ? 'Hoặc nhập Mã PIN Admin / Mã Tab' : 'Or Enter Admin PIN / Tab Code'}
            </span>
            <div className="border-t border-slate-200 w-full" />
          </div>

          {/* Access Code & Admin PIN Form */}
          <form onSubmit={handlePasscodeSubmit} className="space-y-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4">
            <div className="text-xs font-bold text-indigo-950 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                {language === 'VN' ? 'Cách 2: Nhập Mã PIN Admin hoặc Mã Cấp Quyền Tab' : 'Option 2: Enter Admin PIN or Tab Access Code'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {language === 'VN'
                ? 'Nhập Mã PIN Quản trị viên để mở toàn bộ Quyền Admin, hoặc nhập Mã cấp quyền theo từng Tab (ví dụ: Báo cáo ngày, Theo dõi hồ sơ...).'
                : 'Enter Admin PIN for full Admin access, or a Tab Access Code provided by Admin.'}
            </p>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showPasscode ? 'text' : 'password'}
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder={language === 'VN' ? 'Nhập Mã PIN Admin hoặc Mã Tab (VD: BCN2026)...' : 'Enter Admin PIN or Access Code...'}
                className="w-full pl-9 pr-10 py-2.5 text-xs bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-mono font-bold tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-98 cursor-pointer"
            >
              <Lock className="w-4 h-4 text-amber-300" />
              <span>{language === 'VN' ? 'Mở Khóa Quyền Admin / Mã Tab' : 'Unlock Admin / Verify Code'}</span>
            </button>
          </form>

          {/* Cancel Button */}
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setSuccessMessage(null);
              setPasscodeInput('');
              onClose();
            }}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordProtection;
