const CACHE_KEY_PREFIX = 'C10_CACHE_V10_';
const CACHE_TTL_MS = 10 * 1000; // Tự động làm mới dữ liệu từ Google Sheet sau mỗi 10 giây

export const setCache = (key: string, data: any) => {
  const cacheObj = {
    timestamp: Date.now(),
    data: data
  };
  localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(cacheObj));
};

export const getCache = (key: string) => {
  const cached = localStorage.getItem(CACHE_KEY_PREFIX + key);
  if (!cached) return null;

  try {
    const { timestamp, data } = JSON.parse(cached);
    return { data, timestamp };
  } catch (e) {
    return null;
  }
};

export const clearDataCacheKeys = () => {
  try {
    ['sheets', 'submittal', 'monitoring'].forEach(k => {
      localStorage.removeItem(CACHE_KEY_PREFIX + k);
    });
  } catch {}
};

export const isCacheStale = (timestamp: number, forceRealtime: boolean = false) => {
  if (forceRealtime) return true;
  return (Date.now() - timestamp) > CACHE_TTL_MS;
};