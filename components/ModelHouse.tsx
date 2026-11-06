
import React from 'react';
import { Home, Hammer } from 'lucide-react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';

interface ModelHouseProps {
    data: any[];
    loading: boolean;
    error: boolean;
    language: Language;
}

const ModelHouse: React.FC<ModelHouseProps> = ({ language }) => {
  const t = (key: string) => TRANSLATIONS[language][key] || key;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl shadow-lg"><Home className="w-6 h-6 text-white" /></div>
            <div>
                <h2 className="text-2xl font-bold text-slate-800">{t('model_house')}</h2>
                <p className="text-slate-500 text-sm font-medium">{t('model_house_desc')}</p>
            </div>
        </div>
      </div>

      <div className="bg-white p-12 md:p-24 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center space-y-6">
        <div className="bg-amber-100 p-6 rounded-full">
          <Hammer className="w-16 h-16 text-amber-600" />
        </div>
        <h3 className="text-3xl font-black text-slate-800 tracking-tight">
          {t('under_construction')}
        </h3>
        <p className="text-slate-500 max-w-md mx-auto">
          {t('under_construction_desc')}
        </p>
      </div>
    </div>
  );
};

export default ModelHouse;
