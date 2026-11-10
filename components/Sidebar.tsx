
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Info, Home, X, Globe, Calendar, AlertCircle, FileText, Users, ClipboardCheck, Eye, Wallet, Activity, Camera, ShoppingBag, Lock, ShieldCheck, Key, User } from 'lucide-react';
import { Tab, Language } from '../types';
import { PROJECT_NAME, PROJECT_SUBTITLE, AUTHOR_NAME, LOGO_URL, TRANSLATIONS, ENABLE_PASSWORD_PROTECTION } from '../constants';
import PasswordProtection from '../components/PasswordProtection';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  isLayer2Authenticated?: boolean;
  setIsLayer2Authenticated?: (auth: boolean) => void;
}

const PROTECTED_TABS: Tab[] = [
  Tab.FOCUS_POINTS,
  Tab.MONITORING,
  Tab.ISSUES,
  Tab.PROCUREMENT,
  Tab.SUBMITTAL,
  Tab.PAYMENT,
  Tab.INSPECTION,
  Tab.SITE_PHOTOS,
  Tab.MODEL_HOUSE,
  Tab.MATERIALS,
  Tab.DEFECTS,
  Tab.ADMIN
];

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  isOpen, 
  onClose, 
  language, 
  setLanguage,
  isLayer2Authenticated: isLayer2AuthenticatedProp,
  setIsLayer2Authenticated: setIsLayer2AuthenticatedProp
}) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;
  const [visitorCount, setVisitorCount] = useState<number | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [isLayer2AuthenticatedLocal, setIsLayer2AuthenticatedLocal] = useState<boolean>(() => {
    if (localStorage.getItem('c10_guest_mode') === 'true') return false;
    return (
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true'
    );
  });

  const isAuth = Boolean(
    localStorage.getItem('c10_guest_mode') !== 'true' && (
      (isLayer2AuthenticatedProp === true && localStorage.getItem('is_admin') === 'true') ||
      isLayer2AuthenticatedLocal === true ||
      (localStorage.getItem('is_admin') === 'true' && localStorage.getItem('c10_admin_unlocked') === 'true')
    )
  );

  const handleTabClick = (tab: Tab) => {
    if (ENABLE_PASSWORD_PROTECTION && PROTECTED_TABS.includes(tab) && !isAuth) {
      setPendingTab(tab);
      setIsPasswordModalOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  const handlePasswordSuccess = () => {
    setIsPasswordModalOpen(false);
    const isAdminUser =
      localStorage.getItem('is_admin') === 'true' &&
      localStorage.getItem('c10_admin_unlocked') === 'true';
    setIsLayer2AuthenticatedLocal(isAdminUser);
    if (setIsLayer2AuthenticatedProp) {
      setIsLayer2AuthenticatedProp(isAdminUser);
    }
    localStorage.removeItem('c10_guest_mode');
    window.dispatchEvent(new Event('c10-auth-changed'));
    if (pendingTab) {
      if (pendingTab === Tab.ADMIN && !isAdminUser) {
        setPendingTab(null);
      } else {
        setActiveTab(pendingTab);
        setPendingTab(null);
      }
    }
  };

  useEffect(() => {
    const syncAuth = () => {
      if (localStorage.getItem('c10_guest_mode') === 'true') {
        setIsLayer2AuthenticatedLocal(false);
        return;
      }
      const hasAuth = 
        localStorage.getItem('is_admin') === 'true' &&
        localStorage.getItem('c10_admin_unlocked') === 'true';
      setIsLayer2AuthenticatedLocal(Boolean(hasAuth));
    };
    window.addEventListener('c10-auth-changed', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('c10-auth-changed', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  useEffect(() => {
    const VISITOR_OFFSET = 101; // Adjusted offset to start from 102 (101 + 1st visit)
    
    const fetchVisitorCount = async () => {
      try {
        // Using counterapi.dev - a free, no-auth visitor counter API
        const namespace = 'pmh-c10-v2';
        const key = 'visits_v2';
        const visitStorageKey = 'visited_c10_v1';
        const hasVisited = localStorage.getItem(visitStorageKey);
        
        let url = `https://api.counterapi.dev/v1/${namespace}/${key}`;
        
        // If first time visiting in this browser, increment once
        if (!hasVisited) {
          url += `/up`;
          localStorage.setItem(visitStorageKey, 'true');
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && typeof data.count === 'number') {
          setVisitorCount(data.count + VISITOR_OFFSET);
        }
      } catch (error) {
        console.error("Error fetching visitor count:", error);
        setVisitorCount(null);
      }
    };

    fetchVisitorCount();
  }, []);

  const menuItems = [
    { id: Tab.GENERAL, label: t('general_info'), icon: Info },
    { id: Tab.DASHBOARD, label: t('dashboard'), icon: LayoutDashboard },
    { id: Tab.SCHEDULE, label: t('schedule'), icon: Calendar },
    { id: Tab.DAILY_REPORT, label: t('daily_report'), icon: FileText },
    { id: Tab.FOCUS_POINTS, label: t('focus_points'), icon: Activity },
    { id: Tab.MONITORING, label: t('monitoring'), icon: Activity },
    { id: Tab.ISSUES, label: t('issues'), icon: AlertCircle },
    { id: Tab.PROCUREMENT, label: t('procurement_plan'), icon: ShoppingBag },
    { id: Tab.SUBMITTAL, label: t('submittal'), icon: FileText },
    { id: Tab.PAYMENT, label: t('payment_page'), icon: Wallet },
    { id: Tab.INSPECTION, label: t('inspection'), icon: ClipboardCheck },
    { id: Tab.SITE_PHOTOS, label: t('site_photos'), icon: Camera },
  ];

  return (
    <>
      <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-slate-800 text-white flex flex-col h-screen shadow-xl transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 overflow-hidden
      `}>
        <div className="relative z-10 flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-slate-700 flex flex-col items-center relative">
              <button 
                  onClick={onClose}
                  className="absolute top-4 right-4 md:hidden text-slate-400 hover:text-white"
              >
                  <X className="w-5 h-5" />
              </button>

              <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center mb-3 shadow-lg ring-2 ring-blue-400 overflow-hidden p-2">
              <img 
                  src={LOGO_URL}
                  alt="Logo" 
                  className="w-full h-full object-contain" 
              />
              </div>
              <h1 className="text-lg font-bold text-center leading-tight">{PROJECT_NAME[language]}</h1>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest text-center mt-1">
                {PROJECT_SUBTITLE[language]}
              </p>
          </div>

          {/* Menu */}
          <nav className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
              {menuItems.map((item) => {
                const isProtected = ENABLE_PASSWORD_PROTECTION && PROTECTED_TABS.includes(item.id) && !isAuth;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabClick(item.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                      activeTab === item.id
                        ? 'bg-blue-600 text-white shadow-md translate-x-1'
                        : 'text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="font-medium text-sm">{item.label}</span>
                    </div>
                    {isProtected && (
                      <Lock className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                    )}
                  </button>
                );
              })}

              {/* Admin Button - Only visible when logged in as Admin, placed directly below SITE_PHOTOS */}
              <button
                key="admin-tab"
                onClick={() => {
                  if (isAuth) {
                    setActiveTab(Tab.ADMIN);
                  } else {
                    setPendingTab(Tab.ADMIN);
                    setIsPasswordModalOpen(true);
                  }
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 border ${
                  activeTab === Tab.ADMIN
                    ? 'bg-emerald-600 text-white shadow-md translate-x-1 border-emerald-500'
                    : isAuth
                    ? 'text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-amber-300 hover:bg-slate-700 hover:text-white bg-slate-800/80 border-amber-500/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className={`w-5 h-5 flex-shrink-0 ${isAuth ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span className="font-semibold text-sm">
                    {isAuth
                      ? language === 'VN'
                        ? 'Quyền Admin'
                        : 'Admin Panel'
                      : language === 'VN'
                      ? 'Đăng nhập Admin'
                      : 'Admin Login'}
                  </span>
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                    isAuth
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {isAuth ? 'Admin' : language === 'VN' ? 'Mở khóa' : 'Login'}
                </span>
              </button>
          </nav>

          {/* Footer with Language Toggle */}
          <div className="p-4 border-t border-slate-700 space-y-4 bg-slate-900/50">
              {/* Role Indicator & Login Toggle */}
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2 overflow-hidden">
                  {isAuth ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : localStorage.getItem('c10_user_role') === 'EDITOR' ? (
                    <User className="w-4 h-4 text-blue-400 shrink-0" />
                  ) : (
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="shrink-0">{language === 'EN' ? 'Role:' : 'Quyền:'}</span>
                </div>

                {isAuth ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded text-[11px]">
                      Admin
                    </span>
                    <button
                      onClick={() => {
                        localStorage.setItem('c10_guest_mode', 'true');
                        localStorage.removeItem('layer2-auth');
                        localStorage.removeItem('c10_admin_unlocked');
                        localStorage.removeItem('is_admin');
                        localStorage.removeItem('c10_user_email');
                        localStorage.removeItem('c10_user_role');
                        setIsLayer2AuthenticatedLocal(false);
                        if (setIsLayer2AuthenticatedProp) {
                          setIsLayer2AuthenticatedProp(false);
                        }
                        if (activeTab === Tab.ADMIN) {
                          setActiveTab(Tab.DASHBOARD);
                        }
                        window.dispatchEvent(new Event('c10-auth-changed'));
                      }}
                      title={language === 'EN' ? 'Exit Admin Mode' : 'Đăng xuất quyền Admin'}
                      className="text-[10px] text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer"
                    >
                      {language === 'EN' ? 'Exit' : 'Thoát'}
                    </button>
                  </div>
                ) : localStorage.getItem('c10_user_role') === 'EDITOR' ? (
                  <div className="flex items-center gap-1.5 shrink-0 max-w-[150px]">
                    <span 
                      className="font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded text-[10px] truncate max-w-[90px]"
                      title={localStorage.getItem('c10_user_email') || 'Thành viên'}
                    >
                      {localStorage.getItem('c10_user_email')?.split('@')[0] || 'Thành viên'}
                    </span>
                    <button
                      onClick={() => {
                        localStorage.setItem('c10_guest_mode', 'true');
                        localStorage.removeItem('layer2-auth');
                        localStorage.removeItem('c10_admin_unlocked');
                        localStorage.removeItem('is_admin');
                        localStorage.removeItem('c10_user_email');
                        localStorage.removeItem('c10_user_role');
                        setIsLayer2AuthenticatedLocal(false);
                        if (setIsLayer2AuthenticatedProp) {
                          setIsLayer2AuthenticatedProp(false);
                        }
                        if (activeTab === Tab.ADMIN) {
                          setActiveTab(Tab.DASHBOARD);
                        }
                        window.dispatchEvent(new Event('c10-auth-changed'));
                      }}
                      title={language === 'EN' ? 'Sign out' : 'Đăng xuất tài khoản'}
                      className="text-[10px] text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer"
                    >
                      {language === 'EN' ? 'Exit' : 'Thoát'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-semibold text-slate-400 bg-slate-700/40 border border-slate-600/40 px-2 py-0.5 rounded text-[11px]">
                      {language === 'EN' ? 'Viewer' : 'Người xem'}
                    </span>
                    <button
                      onClick={() => setIsPasswordModalOpen(true)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-0.5 ml-1 transition-colors cursor-pointer"
                      title={language === 'EN' ? 'Sign in' : 'Đăng nhập'}
                    >
                      <Key className="w-3 h-3" />
                      <span>{language === 'EN' ? 'Login' : 'Đăng nhập'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Visitor Count */}
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span>{t('visitor_count')}:</span>
                </div>
                <span className="font-bold text-white bg-blue-600/20 px-2 py-0.5 rounded text-[11px]">
                  {visitorCount !== null ? visitorCount.toLocaleString() : '...'}
                </span>
              </div>

              {/* Language Toggle */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                  <Globe className="w-3 h-3" /> {t('select_language')}
                </div>
                <div className="flex bg-slate-700 p-1 rounded-lg">
                  <button 
                    onClick={() => setLanguage('EN')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'EN' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    EN
                  </button>
                  <button 
                    onClick={() => setLanguage('VN')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${language === 'VN' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    VN
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center italic opacity-80">{AUTHOR_NAME}</p>
          </div>
        </div>
      </div>

      <PasswordProtection 
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPendingTab(null);
        }}
        onSuccess={handlePasswordSuccess}
        language={language}
      />
    </>
  );
};

export default Sidebar;
