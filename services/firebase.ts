import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp({
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId,
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const ADMIN_EMAIL = 'phucbao1992@gmail.com';
export const ADMIN_BACKUP_PASSCODE = '04012000';

export async function signInAsAdminWithGoogle(): Promise<{ 
  success: boolean; 
  email?: string; 
  role?: 'ADMIN' | 'EDITOR'; 
  error?: string 
}> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const email = (result.user?.email || '').trim().toLowerCase();

    // 1. Kiểm tra nếu là Super Admin
    if (email === ADMIN_EMAIL.toLowerCase()) {
      localStorage.setItem('c10_user_email', email);
      localStorage.setItem('c10_user_role', 'ADMIN');
      localStorage.setItem('is_admin', 'true');
      localStorage.setItem('c10_admin_unlocked', 'true');
      localStorage.setItem('layer2-auth', 'true');
      localStorage.removeItem('c10_guest_mode');
      window.dispatchEvent(new Event('c10-auth-changed'));
      return { success: true, email, role: 'ADMIN' };
    }

    // 2. Kiểm tra nếu là thành viên đã được phân quyền
    try {
      // Import động hoặc lấy từ storage/Firestore
      const raw = localStorage.getItem('c10_user_permissions_v1');
      const permissionsList = raw ? JSON.parse(raw) : [];
      const isAuthorized = Array.isArray(permissionsList) && permissionsList.some(
        (u: any) => (u?.email || '').trim().toLowerCase() === email
      );

      if (isAuthorized) {
        localStorage.setItem('c10_user_email', email);
        localStorage.setItem('c10_user_role', 'EDITOR');
        localStorage.removeItem('is_admin');
        localStorage.removeItem('c10_admin_unlocked');
        localStorage.removeItem('c10_guest_mode');
        window.dispatchEvent(new Event('c10-auth-changed'));
        return { success: true, email, role: 'EDITOR' };
      }
    } catch {}

    // 3. Nếu không có trong danh sách phân quyền
    await signOut(auth).catch(() => {});
    return {
      success: false,
      email,
      error: `Tài khoản ${email || 'này'} chưa được cấp quyền thao tác trên hệ thống. Vui lòng liên hệ Quản trị viên để được phân quyền.`
    };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return { success: false, error: 'Bạn đã đóng cửa sổ đăng nhập Google. Vui lòng thử lại hoặc dùng Mã PIN quản trị.' };
    }
    if (code === 'auth/popup-blocked') {
      return { success: false, error: 'Trình duyệt đã chặn cửa sổ bật lên (Popup). Vui lòng cho phép Popup trên thanh địa chỉ và thử lại.' };
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'domain';
      return {
        success: false,
        error: `Tên miền [${host}] chưa được khai báo trong Firebase Console. Bạn có thể nhập Mã PIN quản trị ở ô bên dưới!`
      };
    }
    if (code === 'auth/network-request-failed') {
      return { success: false, error: 'Lỗi kết nối mạng khi xác thực. Vui lòng kiểm tra lại đường truyền Internet hoặc dùng Mã PIN dự phòng.' };
    }
    if (code === 'auth/user-disabled') {
      return { success: false, error: 'Tài khoản Google này đã bị vô hiệu hóa. Vui lòng liên hệ Quản trị viên.' };
    }
    return {
      success: false,
      error: `Lỗi đăng nhập: ${err?.message || 'Không thể kết nối xác thực Google'}. Bạn có thể nhập Mã PIN quản trị ở bên dưới!`
    };
  }
}
