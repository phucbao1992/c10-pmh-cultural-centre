const FOLDER_ID = '1wadAN3mPs7t0Zj9Ytp2x3nA1ABC2ZbMp';

export interface DriveFile {
  id: string;
  name: string;
  thumbnailLink: string;
  webViewLink?: string;
  createdTime?: string;
}

export class DriveApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export const extractDriveFolderId = (input?: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
};

const getDriveApiKey = (): string | null => {
  const key = (import.meta as any).env?.VITE_DRIVE_API_KEY || 
              (import.meta as any).env?.VITE_API_KEY;
  if (!key || key === 'undefined' || typeof key !== 'string' || key.trim().length < 10) {
    return null;
  }
  return key.trim();
};

export const WEEKLY_REPORT_FOLDER_ID = '1K27iyUSy7hER-oo2qmHairwEAA2dpwsy';
export const LATEST_WEEKLY_REPORT_FALLBACK_URL = 'https://drive.google.com/file/d/1CKseiRJTkQpHtj1Fjc_8Mio3IGoLVnPn/view';

export const fetchLatestWeeklyReport = async (folderId?: string): Promise<string> => {
  let targetFolder = folderId;
  if (!targetFolder && typeof window !== 'undefined') {
    const override = localStorage.getItem('c10_override_weekly_report_folder_id');
    if (override) targetFolder = extractDriveFolderId(override);
  }
  if (!targetFolder) targetFolder = WEEKLY_REPORT_FOLDER_ID;

  // 1. Try server endpoint first (scrapes & parses newest file from Drive folder)
  try {
    const res = await fetch(`/api/drive/latest-weekly-report?folderId=${targetFolder}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.viewLink) {
        return data.viewLink;
      }
    }
  } catch (err) {
    // Continue to fallback
  }

  // 2. Try Google Drive API if client key is present
  const apiKey = getDriveApiKey();
  if (apiKey) {
    try {
      const query = `'${targetFolder}' in parents and mimeType = 'application/pdf' and trashed = false`;
      const fields = 'files(id,webViewLink,name)';
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=name desc&pageSize=1&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.files && data.files.length > 0) {
          return `https://drive.google.com/file/d/${data.files[0].id}/view`;
        }
      }
    } catch (error) {
      console.warn("DRIVE_SERVICE: Failed to fetch weekly report with API key:", error);
    }
  }

  // 3. Fallback to direct view link for latest known weekly report
  return LATEST_WEEKLY_REPORT_FALLBACK_URL;
};

export const fetchLatestDriveImages = async (folderId?: string): Promise<DriveFile[]> => {
  const apiKey = getDriveApiKey();
  if (!apiKey) {
    return [];
  }

  let targetFolder = folderId;
  if (!targetFolder && typeof window !== 'undefined') {
    const override = localStorage.getItem('c10_override_site_photos_folder_id');
    if (override) targetFolder = extractDriveFolderId(override);
  }
  if (!targetFolder) targetFolder = FOLDER_ID;

  try {
    const query = `'${targetFolder}' in parents and mimeType contains 'image/' and trashed = false`;
    const fields = 'files(id,name,thumbnailLink,webViewLink,createdTime)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&pageSize=20&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || "Unknown Drive API Error";
      const status = response.status;
      
      console.warn("GOOGLE_DRIVE_API_STATUS:", status, message);
      
      if (status === 400 && (message.toLowerCase().includes("key not valid") || message.toLowerCase().includes("invalid"))) {
        throw new DriveApiError(400, "INVALID_KEY");
      }
      if (message.toLowerCase().includes("has not been used") || message.toLowerCase().includes("disabled") || status === 403) {
        throw new DriveApiError(403, "INVALID_KEY");
      }
      return [];
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    if (error instanceof DriveApiError) throw error;
    console.warn("DRIVE_SERVICE: Failed to fetch drive images:", error);
    return [];
  }
};

export interface DriveReportFile {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
}

export const fetchRecentDailyReports = async (folderId?: string): Promise<DriveReportFile[]> => {
  const apiKey = getDriveApiKey();
  if (!apiKey) {
    return [];
  }

  let targetFolder = folderId;
  if (!targetFolder && typeof window !== 'undefined') {
    const override = localStorage.getItem('c10_daily_report_drive_folder');
    if (override) targetFolder = extractDriveFolderId(override);
  }
  if (!targetFolder) targetFolder = '10sldhCeoddg_8qx78DKVAauYET2J4sCp';

  try {
    const query = `'${targetFolder}' in parents and trashed = false`;
    const fields = 'files(id,name,webViewLink,createdTime)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&pageSize=7&fields=${encodeURIComponent(fields)}&key=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      console.warn("DRIVE_SERVICE: Could not fetch daily reports from Google Drive API. Status:", response.status);
      return [];
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.warn("DRIVE_SERVICE: Daily reports fetch issue:", error);
    return [];
  }
};