
import React, { useState, useEffect } from 'react';
import { Camera, Calendar, Maximize2, ExternalLink, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { fetchLatestDriveImages, DriveFile } from '../services/driveService';
import { SITE_IMAGES_FOLDER_ID, TRANSLATIONS } from '../constants';
import { Language } from '../types';

interface SitePhotosProps {
  language: Language;
}

const SitePhotos: React.FC<SitePhotosProps> = ({ language }) => {
  const [images, setImages] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const t = (key: string) => TRANSLATIONS[language][key] || key;

  const parseDateAndSort = (files: DriveFile[]) => {
    return files
      .map(file => {
        const match = file.name.match(/_(\d{14})_/);
        const timestamp = match ? match[1] : '0';
        return { ...file, timestamp };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 4);
  };

  const formatDate = (name: string) => {
    const match = name.match(/_(\d{8})/);
    if (match) {
      const d = match[1];
      const year = d.substring(0, 4);
      const month = d.substring(4, 6);
      const day = d.substring(6, 8);
      if (language === 'VN') {
        return `Ngày ${day} tháng ${month} năm ${year}`;
      }
      return `${day}/${month}/${year}`;
    }
    return '';
  };

  useEffect(() => {
    const loadImages = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchLatestDriveImages(SITE_IMAGES_FOLDER_ID);
        if (data.length === 0) {
          setError('no_images_found');
        } else {
          const sorted = parseDateAndSort(data);
          setImages(sorted);
        }
      } catch (err: any) {
        console.error("Failed to load site images:", err);
        setError(err.message === 'INVALID_KEY' ? 'invalid_api_key' : 'failed_to_load');
      } finally {
        setLoading(false);
      }
    };
    loadImages();
  }, [language]);

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">{t('loading')}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center min-h-[200px] text-center">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-600">
          <Camera className="w-6 h-6" />
        </div>
        <h4 className="font-bold text-slate-800 mb-2">{t('site_images')}</h4>
        <p className="text-slate-500 text-sm max-w-md">
          {error === 'invalid_api_key' 
            ? (language === 'EN' 
                ? 'Error: Current API Key does not have permission to access Google Drive API. Please enable Google Drive API in Google Cloud Console.' 
                : "Lỗi: API Key hiện tại chưa được cấp quyền truy cập Google Drive API. Vui lòng vào Google Cloud Console và bật 'Google Drive API' cho thư viện của dự án.")
            : error === 'no_images_found'
            ? (language === 'EN' ? 'No images found in the specified folder.' : "Không tìm thấy hình ảnh nào trong thư mục được chỉ định.")
            : t('failed_to_load')}
        </p>
      </div>
    );
  }

  if (images.length === 0) return null;

  const heroImage = images[0];
  const thumbImages = images.slice(1, 4);

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" /> {t('site_images')}
        </h3>
      </div>

      <div className="space-y-4">
        {/* Hero Image */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group rounded-xl overflow-hidden bg-slate-100"
        >
          <img 
            src={`https://drive.google.com/thumbnail?id=${heroImage.id}&sz=s2000`} 
            alt={heroImage.name}
            className="w-full h-auto block transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20">
              <Calendar className="w-4 h-4 text-blue-400" />
              <p className="text-white font-bold text-xs">
                {formatDate(heroImage.name)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Thumbnails Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {thumbImages.map((img, idx) => (
            <motion.div 
              key={img.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (idx + 1) }}
              className="relative group rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center"
            >
              <img 
                src={`https://drive.google.com/thumbnail?id=${img.id}&sz=s1000`} 
                alt={img.name}
                className="w-full h-auto block transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <p className="text-white font-bold text-[10px] flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-blue-400" />
                  {formatDate(img.name)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SitePhotos;
