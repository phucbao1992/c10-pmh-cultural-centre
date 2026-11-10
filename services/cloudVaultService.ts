/**
 * KÉT SẮT ĐÁM MÂY TỰ ĐỘNG 3 LỚP (PERMANENT CLOUD VAULT SERVICE)
 * Giải quyết triệt để vấn đề mất dữ liệu (Mã cấp quyền, Báo cáo ngày, Hồ sơ nhập trực tiếp, Cấu hình)
 * mỗi khi cập nhật / đồng bộ code trên Google AI Studio & Cloudflare Pages.
 *
 * Hoạt động:
 * 1. Tự động sao lưu tức thì (Auto-Backup) mọi khóa dữ liệu quan trọng lên Cloud KV Store cố định.
 * 2. Tự động khôi phục (Auto-Restore) ngay khi mở App hoặc sau khi rebuild code mới.
 * 3. Cho phép Admin xuất/nhập file Sao lưu Tổng (.json) hoặc đồng bộ Cloud chỉ với 1 nút bấm.
 */

export const VAULT_KV_BASE = 'https://kvdb.io/A6XyP9kM2vQ8wL4rT7nZ1c';
export const VAULT_MASTER_URL = `${VAULT_KV_BASE}/c10_pmh_master_vault_v2`;
export const VAULT_SUB_URL = `${VAULT_KV_BASE}/c10_pmh_submittals_vault_v2`;
export const VAULT_EVENT_SYNCED = 'c10-cloud-vault-synced';

// Danh sách toàn bộ các khóa localStorage quan trọng cần bảo vệ vĩnh viễn qua mọi lần build code
export const PROTECTED_USER_DATA_KEYS = [
  // 1. Phân quyền & Mã truy cập
  'c10_user_permissions_v1',
  'c10_daily_report_permissions_v1',
  'c10_active_access_code',
  'c10_user_email',
  'c10_user_role',
  // 2. Báo cáo ngày & Kho Logo cố định
  'c10_daily_report_published_v3',
  'c10_daily_report_draft_v3',
  'c10_daily_report_cloud_config_v1',
  'c10_permanent_logos_v1',
  // 3. Hồ sơ đệ trình & Cấu hình bộ lọc trễ hạn (TVGS / CĐT)
  'c10_submittal_delay_config_v1',
  'c10_submittal_auto_sync_v1',
  // 4. Liên kết tài nguyên đám mây & cài đặt đồng bộ
  'c10_data_sync_settings_v1',
  'c10_monitoring_config',
  'c10_override_main_sheet_id',
  'c10_override_submittal_sheet_id',
  'c10_override_monitoring_sheet_id',
  'c10_daily_report_drive_folder',
  'c10_daily_report_sheet_url',
  'c10_override_site_photos_folder_id',
  'c10_override_weekly_report_folder_id',
  'c10_daily_report_webhook_url',
  'c10_override_defects_sheet_id',
  'c10_procurement_sheet_id'
] as const;

export const SUBMITTAL_DATA_KEYS = [
  'c10_master_submittals_v4',
  'c10_master_submittals_v1'
] as const;

export interface CloudVaultSnapshot {
  version: number;
  updatedAt: string;
  updatedBy?: string;
  data: Record<string, string>;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let lastVaultSyncTime: string = '';

export const getLastVaultSyncTime = (): string => {
  return lastVaultSyncTime || localStorage.getItem('c10_vault_last_synced_at') || '';
};

/**
 * Thu thập toàn bộ dữ liệu người dùng hiện có trên trình duyệt để đóng gói vào Két sắt
 */
export const collectLocalVaultPayload = (): {
  master: CloudVaultSnapshot;
  submittals: CloudVaultSnapshot | null;
} => {
  const now = new Date().toISOString();
  const user = localStorage.getItem('c10_user_email') || 'Admin';
  const masterData: Record<string, string> = {};

  PROTECTED_USER_DATA_KEYS.forEach((key) => {
    // Không đẩy session cá nhân (active_access_code / user_role) đè lên máy khác, chỉ đẩy dữ liệu hệ thống
    if (key === 'c10_active_access_code' || key === 'c10_user_email' || key === 'c10_user_role') {
      return;
    }
    const val = localStorage.getItem(key);
    if (val && val.trim().length > 0) {
      masterData[key] = val;
    }
  });

  // Kiểm tra dữ liệu Hồ sơ đệ trình (tách riêng key KV để tránh vượt giới hạn kích thước gói tin)
  let submittalSnapshot: CloudVaultSnapshot | null = null;
  const subRaw =
    localStorage.getItem('c10_master_submittals_v4') ||
    localStorage.getItem('c10_master_submittals_v1');
  if (subRaw && subRaw.trim().length > 2) {
    submittalSnapshot = {
      version: 2,
      updatedAt: now,
      updatedBy: user,
      data: {
        c10_master_submittals_v4: subRaw
      }
    };
  }

  return {
    master: {
      version: 2,
      updatedAt: now,
      updatedBy: user,
      data: masterData
    },
    submittals: submittalSnapshot
  };
};

/**
 * Đẩy toàn bộ dữ liệu hiện tại lên Két sắt Đám mây KV (Tự động hoặc Thủ công)
 */
export const backupToCloudVaultNow = async (includeSubmittals = false): Promise<boolean> => {
  try {
    const { master, submittals } = collectLocalVaultPayload();
    const tasks: Promise<Response>[] = [
      fetch(VAULT_MASTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(master)
      })
    ];

    if (includeSubmittals && submittals) {
      tasks.push(
        fetch(VAULT_SUB_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submittals)
        })
      );
    }

    await Promise.allSettled(tasks);
    lastVaultSyncTime = master.updatedAt;
    localStorage.setItem('c10_vault_last_synced_at', lastVaultSyncTime);
    window.dispatchEvent(new CustomEvent(VAULT_EVENT_SYNCED, { detail: { updatedAt: lastVaultSyncTime } }));
    return true;
  } catch (err) {
    console.warn('Cloud Vault backup pending:', err);
    return false;
  }
};

/**
 * Đặt lịch tự động sao lưu ngầm (Debounced 600ms) mỗi khi có thay đổi
 */
export const scheduleAutoCloudVaultBackup = (includeSubmittals = false): void => {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    backupToCloudVaultNow(includeSubmittals).catch(() => {});
  }, 600);
};

/**
 * Tự động khôi phục toàn bộ dữ liệu từ Két sắt Đám mây KV khi vừa mở App hoặc vừa Build/Deploy code mới
 */
export const restoreFromCloudVaultOnBoot = async (): Promise<{
  restoredKeys: string[];
  updatedAt?: string;
}> => {
  const restoredKeys: string[] = [];
  let latestTimestamp = '';

  try {
    const [masterRes, subRes] = await Promise.allSettled([
      fetch(`${VAULT_MASTER_URL}?t=${Date.now()}`, { headers: { Accept: 'application/json' } }),
      fetch(`${VAULT_SUB_URL}?t=${Date.now()}`, { headers: { Accept: 'application/json' } })
    ]);

    // 1. Khôi phục Master Vault (Phân quyền, Báo cáo ngày, Logo, Cấu hình bộ lọc, Link Sheet...)
    if (masterRes.status === 'fulfilled' && masterRes.value.ok) {
      const snap = (await masterRes.value.json()) as CloudVaultSnapshot;
      if (snap && snap.data && typeof snap.data === 'object') {
        latestTimestamp = snap.updatedAt || '';
        Object.entries(snap.data).forEach(([key, remoteVal]) => {
          if (!remoteVal || typeof remoteVal !== 'string') return;
          const localVal = localStorage.getItem(key);

          // Hợp nhất thông minh đối với bảng Phân quyền để không bao giờ mất mã của bất kỳ máy nào
          if (key === 'c10_user_permissions_v1') {
            try {
              const remoteArr = JSON.parse(remoteVal);
              const localArr = localVal ? JSON.parse(localVal) : [];
              if (Array.isArray(remoteArr)) {
                const map = new Map<string, any>();
                (Array.isArray(localArr) ? localArr : []).forEach((u: any) => {
                  const k = (u.accessCode || u.email || '').trim().toLowerCase();
                  if (k) map.set(k, u);
                });
                remoteArr.forEach((u: any) => {
                  const k = (u.accessCode || u.email || '').trim().toLowerCase();
                  if (k) map.set(k, { ...(map.get(k) || {}), ...u });
                });
                const merged = Array.from(map.values());
                localStorage.setItem(key, JSON.stringify(merged));
                restoredKeys.push(key);
                return;
              }
            } catch {}
          }

          // Đối với Báo cáo ngày (Published & Draft): ưu tiên bản có savedAt mới hơn hoặc khi máy hiện tại chưa có
          if (key === 'c10_daily_report_published_v3' || key === 'c10_daily_report_draft_v3') {
            try {
              const remoteObj = JSON.parse(remoteVal);
              const localObj = localVal ? JSON.parse(localVal) : null;
              const remoteTime = remoteObj?.savedAt ? new Date(remoteObj.savedAt).getTime() : 0;
              const localTime = localObj?.savedAt ? new Date(localObj.savedAt).getTime() : 0;
              if (!localObj || remoteTime >= localTime) {
                localStorage.setItem(key, remoteVal);
                restoredKeys.push(key);
              }
              return;
            } catch {}
          }

          // Các khóa khác: nếu máy chưa có hoặc khác biệt thì nạp từ Két sắt
          if (!localVal || localVal !== remoteVal) {
            localStorage.setItem(key, remoteVal);
            restoredKeys.push(key);
          }
        });
      }
    }

    // 2. Khôi phục dữ liệu Hồ sơ đệ trình (Submittals) đã thêm/sửa trực tiếp trên web
    if (subRes.status === 'fulfilled' && subRes.value.ok) {
      const subSnap = (await subRes.value.json()) as CloudVaultSnapshot;
      const remoteSubRaw = subSnap?.data?.c10_master_submittals_v4;
      if (remoteSubRaw && typeof remoteSubRaw === 'string') {
        try {
          const remoteRecords = JSON.parse(remoteSubRaw);
          if (Array.isArray(remoteRecords) && remoteRecords.length > 0) {
            const localSubRaw = localStorage.getItem('c10_master_submittals_v4');
            const localRecords = localSubRaw ? JSON.parse(localSubRaw) : [];
            if (!Array.isArray(localRecords) || remoteRecords.length >= localRecords.length) {
              localStorage.setItem('c10_master_submittals_v4', remoteSubRaw);
              restoredKeys.push('c10_master_submittals_v4');
            }
          }
        } catch {}
      }
    }

    if (latestTimestamp) {
      lastVaultSyncTime = latestTimestamp;
      localStorage.setItem('c10_vault_last_synced_at', latestTimestamp);
    }

    if (restoredKeys.length > 0) {
      window.dispatchEvent(new Event('c10-auth-changed'));
      window.dispatchEvent(new Event('c10-user-permissions-changed'));
      window.dispatchEvent(new Event('c10-resource-updated'));
      window.dispatchEvent(new CustomEvent(VAULT_EVENT_SYNCED, { detail: { updatedAt: latestTimestamp, restoredKeys } }));
    }
  } catch (err) {
    console.warn('Cloud Vault restore skipped:', err);
  }

  return { restoredKeys, updatedAt: latestTimestamp };
};

/**
 * Xuất toàn bộ dữ liệu hệ thống (Phân quyền, Báo cáo ngày, Hồ sơ, Cấu hình) ra file .json để lưu dự phòng trên máy
 */
export const exportFullSystemBackupFile = (): void => {
  const { master, submittals } = collectLocalVaultPayload();
  const fullBundle = {
    project: 'C10-PMH-Cultural-Centre',
    exportedAt: new Date().toISOString(),
    masterData: master.data,
    submittalsData: submittals?.data || {}
  };
  const blob = new Blob([JSON.stringify(fullBundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `C10_SaoLuuHeThong_FullBackup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
};

/**
 * Nhập và khôi phục toàn bộ dữ liệu hệ thống từ file .json đồng thời đẩy luôn lên Két sắt Đám mây
 */
export const importFullSystemBackupFile = async (file: File): Promise<{ success: boolean; count: number }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        let count = 0;
        if (parsed?.masterData && typeof parsed.masterData === 'object') {
          Object.entries(parsed.masterData).forEach(([k, v]) => {
            if (typeof v === 'string') {
              localStorage.setItem(k, v);
              count++;
            }
          });
        }
        if (parsed?.submittalsData && typeof parsed.submittalsData === 'object') {
          Object.entries(parsed.submittalsData).forEach(([k, v]) => {
            if (typeof v === 'string') {
              localStorage.setItem(k, v);
              count++;
            }
          });
        }
        await backupToCloudVaultNow(true);
        window.dispatchEvent(new Event('c10-auth-changed'));
        window.dispatchEvent(new Event('c10-user-permissions-changed'));
        window.dispatchEvent(new Event('c10-resource-updated'));
        resolve({ success: count > 0, count });
      } catch {
        resolve({ success: false, count: 0 });
      }
    };
    reader.onerror = () => resolve({ success: false, count: 0 });
    reader.readAsText(file);
  });
};
