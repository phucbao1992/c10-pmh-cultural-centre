import React, { useState, useEffect } from 'react';
import { Language } from '../types';

interface Building3DViewerProps {
  language?: Language;
  projectName: string;
  logoUrl: string;
}

const IMAGES = [
  '/assets/aistudio/1_87a270a4.jpg',
  '/assets/aistudio/2_e1cd583a.jpg',
  '/assets/aistudio/3_ee507d89.jpg',
  '/assets/aistudio/4_80231320.jpg'
];

export const Building3DViewer: React.FC<Building3DViewerProps> = ({
  language = 'VN',
  projectName,
  logoUrl,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Preload all 4 images on mount
  useEffect(() => {
    IMAGES.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // Slow continuous 3D loop (4.5s per view so it's relaxed and comfortable to watch)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % IMAGES.length);
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="relative rounded-2xl overflow-hidden shadow-2xl h-[400px] md:h-[460px] w-full border border-slate-700/30 bg-slate-950 select-none"
      style={{ perspective: '1600px' }}
    >
      <style>{`
        @keyframes lightSweepAnimation {
          0% {
            left: -380px;
            opacity: 0;
          }
          15% {
            opacity: 0.85;
          }
          60% {
            opacity: 0.95;
          }
          100% {
            left: 125%;
            opacity: 0;
          }
        }
        @keyframes sunBloomAnimation {
          0% {
            transform: scale(0.95);
            opacity: 0.3;
          }
          40% {
            transform: scale(1.35);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.0);
            opacity: 0.35;
          }
        }
      `}</style>

      {/* 3D Rotating Stack with 3D Carousel Turn */}
      <div 
        className="relative w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {IMAGES.map((src, idx) => {
          const isActive = idx === currentIndex;
          const isPrev = idx === (currentIndex - 1 + IMAGES.length) % IMAGES.length;

          return (
            <div
              key={src}
              className={`absolute inset-0 transition-all duration-[1500ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${
                isActive
                  ? 'opacity-100 z-10'
                  : isPrev
                  ? 'opacity-0 z-0'
                  : 'opacity-0 z-0 pointer-events-none'
              }`}
              style={{
                willChange: 'transform, opacity, filter',
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
                transform: isActive
                  ? 'rotateY(0deg) scale(1) translateZ(0px)'
                  : isPrev
                  ? 'rotateY(-85deg) scale(0.9) translateZ(-100px)'
                  : 'rotateY(85deg) scale(0.9) translateZ(-100px)',
                filter: isActive
                  ? 'brightness(1.02) contrast(1.03)'
                  : 'brightness(0.65) contrast(0.95)'
              }}
            >
              <img
                src={src}
                alt="C10 3D Building Rotation"
                className="w-full h-full object-cover object-center"
                draggable={false}
              />

              {/* Dynamic Facade Shadow overlay as building turns away from sun */}
              <div 
                className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-[1500ms] ${
                  isActive ? 'opacity-0' : 'opacity-85'
                }`} 
              />
            </div>
          );
        })}
      </div>

      {/* Hiệu ứng ánh sáng 1: Cinematic Sun Flare / Light Sweep quét ngang toà nhà khi chuyển cảnh */}
      <div 
        key={`light-sweep-${currentIndex}`}
        className="absolute inset-0 pointer-events-none z-20 overflow-hidden"
      >
        <div 
          className="absolute -top-32 -bottom-32 w-80 pointer-events-none transform -rotate-12"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.4) 48%, rgba(255,245,215,0.7) 50%, rgba(255,255,255,0.4) 52%, transparent 80%)',
            animation: 'lightSweepAnimation 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
          }}
        />
      </div>

      {/* Hiệu ứng ánh sáng 2: Hào quang mặt trời góc trên (Sun Bloom & Lens Flare) */}
      <div 
        key={`sun-bloom-${currentIndex}`}
        className="absolute -top-16 -right-16 w-72 h-72 pointer-events-none z-20"
      >
        <div 
          className="w-full h-full rounded-full bg-gradient-to-br from-amber-200/50 via-amber-400/25 to-transparent blur-3xl pointer-events-none"
          style={{
            animation: 'sunBloomAnimation 1.8s ease-out forwards'
          }}
        />
      </div>

      {/* Subtle Top Gradient for text & logo readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/80 via-slate-950/25 to-transparent pointer-events-none z-25" />

      {/* Project Logo & Name Overlay: Thu nhỏ còn 1/2 ở góc trên bên trái */}
      <div className="absolute top-0 left-0 p-3.5 md:p-4 flex items-center gap-2.5 z-30 pointer-events-none">
        <div className="w-9 h-9 md:w-10 md:h-10 bg-white/95 backdrop-blur-md rounded-lg flex items-center justify-center shadow-lg ring-1 ring-white/30 shrink-0 overflow-hidden p-1">
          <img 
            src={logoUrl}
            alt="Logo Phú Mỹ Hưng" 
            className="w-full h-full object-contain" 
          />
        </div>
        <div>
          <h2 className="text-xs md:text-sm font-bold text-white tracking-wider uppercase drop-shadow-md">
            {projectName}
          </h2>
          <p className="text-[10px] md:text-xs font-semibold text-amber-300 tracking-wider uppercase drop-shadow-md">
            {language === 'EN' ? 'Basement' : 'Phần Hầm'}
          </p>
          <div className="h-0.5 w-10 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full mt-0.5 shadow-sm"></div>
        </div>
      </div>
    </div>
  );
};

export default Building3DViewer;
