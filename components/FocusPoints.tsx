import React, { useEffect, useRef, useCallback, useState } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { scheduleAutoCloudVaultBackup } from '../services/cloudVaultService';
import PasswordProtection from './PasswordProtection';
import { Lock, Unlock } from 'lucide-react';
import { ENABLE_PASSWORD_PROTECTION } from '../constants';

import { Language } from '../types';

interface FocusPointsProps {
  language?: Language;
}

const FocusPoints: React.FC<FocusPointsProps> = ({ language = 'VN' }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestStateRef = useRef<any>(null);
  const [isUnlocked, setIsUnlocked] = useState(!ENABLE_PASSWORD_PROTECTION);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const pendingSaveRef = useRef<any>(null);
  const pendingCountsRef = useRef<any>(null);

  const sendLanguageToIframe = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'LANGUAGE_CHANGED',
        language
      }, '*');
    }
  }, [language]);

  useEffect(() => {
    sendLanguageToIframe();
  }, [language, sendLanguageToIframe]);

  useEffect(() => {
    const syncAuth = () => {
      if (
        localStorage.getItem('is_admin') === 'true' &&
        localStorage.getItem('c10_admin_unlocked') === 'true'
      ) {
        setIsUnlocked(true);
      } else {
        setIsUnlocked(false);
      }
    };
    syncAuth();
    window.addEventListener('c10-auth-changed', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('c10-auth-changed', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  const handleUnlockSuccess = () => {
    setIsUnlocked(true);
    setShowPasswordModal(false);
    localStorage.setItem('c10_admin_unlocked', 'true');
    localStorage.setItem('layer2-auth', 'true');
    window.dispatchEvent(new Event('c10-auth-changed'));
    // process pending save if any
    if (pendingSaveRef.current) {
      setDoc(doc(db, 'c10', 'focusPointsState'), pendingSaveRef.current).catch(console.error);
      latestStateRef.current = pendingSaveRef.current;
      pendingSaveRef.current = null;
    }
    if (pendingCountsRef.current) {
      setDoc(doc(db, 'c10', 'focusPointsCounts'), pendingCountsRef.current).catch(console.error);
      pendingCountsRef.current = null;
    }
  };

  const hideIframeControls = useCallback(() => {
    try {
      const docRef = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
      if (!docRef) return;
      if (!docRef.getElementById('c10-hide-controls-style')) {
        const styleEl = docRef.createElement('style');
        styleEl.id = 'c10-hide-controls-style';
        styleEl.textContent = `
          #exportBtn,
          .control-date {
            display: none !important;
          }
        `;
        docRef.head?.appendChild(styleEl);
      }
    } catch (e) {
      // Ignore cross-origin if any
    }
  }, []);

  const sendStateToIframe = useCallback((stateVal?: any) => {
    hideIframeControls();
    const val = stateVal !== undefined ? stateVal : latestStateRef.current;
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'FIREBASE_STATE_LOADED',
        state: val
      }, '*');
    }
  }, [hideIframeControls]);

  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      if (!e.data || !e.data.type) return;

      if (e.data.type === 'IFRAME_READY') {
        sendStateToIframe();
      }

      if (e.data.type === 'SAVE_FOCUS_STATE') {
        const { state } = e.data;
        if (!isUnlocked) {
          pendingSaveRef.current = state;
          setShowPasswordModal(true);
          return;
        }
        try {
          latestStateRef.current = state;
          localStorage.setItem('c10-excavation-layer2-v2', JSON.stringify(state));
          scheduleAutoCloudVaultBackup('focus_points');
          await setDoc(doc(db, 'c10', 'focusPointsState'), state);
        } catch (error) {
          console.error('Error saving state to Firebase', error);
        }
      }

      if (e.data.type === 'SAVE_FOCUS_COUNTS') {
        const { counts } = e.data;
        if (!isUnlocked) {
          pendingCountsRef.current = counts;
          return;
        }
        try {
          localStorage.setItem('c10_focus_points_counts', JSON.stringify(counts));
          scheduleAutoCloudVaultBackup('focus_points_counts');
          await setDoc(doc(db, 'c10', 'focusPointsCounts'), counts);
        } catch (error) {
          console.error('Error saving counts to Firebase', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Primary listener on 'c10' collection
    const unsub = onSnapshot(doc(db, 'c10', 'focusPointsState'), (docSnap) => {
      if (docSnap.exists()) {
        const remoteData = docSnap.data();
        latestStateRef.current = remoteData;
        try {
          localStorage.setItem('c10-excavation-layer2-v2', JSON.stringify(remoteData));
        } catch {}
        sendStateToIframe(remoteData);
      } else {
        let localSaved: any = null;
        try {
          const raw = localStorage.getItem('c10-excavation-layer2-v2');
          if (raw) localSaved = JSON.parse(raw);
        } catch {}
        latestStateRef.current = localSaved;
        sendStateToIframe(localSaved);
      }
    }, (error) => {
      console.error("Firestore listening error in FocusPoints:", error);
      let localSaved: any = null;
      try {
        const raw = localStorage.getItem('c10-excavation-layer2-v2');
        if (raw) localSaved = JSON.parse(raw);
      } catch {}
      latestStateRef.current = localSaved;
      sendStateToIframe(localSaved);
    });

    return () => {
      window.removeEventListener('message', handleMessage);
      unsub();
    };
  }, [sendStateToIframe, isUnlocked]);

  return (
    <div className="w-full h-full min-h-[calc(100vh-3.5rem)] md:min-h-screen relative">
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => {
            if (isUnlocked && ENABLE_PASSWORD_PROTECTION) {
              setIsUnlocked(false);
              localStorage.removeItem('c10_admin_unlocked');
              localStorage.removeItem('layer2-auth');
              window.dispatchEvent(new Event('c10-auth-changed'));
            } else if (!isUnlocked) {
              if (!ENABLE_PASSWORD_PROTECTION) {
                setIsUnlocked(true);
              } else {
                setShowPasswordModal(true);
              }
            }
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md ${
            isUnlocked 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-2 border-emerald-200' 
              : 'bg-white text-slate-600 hover:bg-slate-50 border-2 border-slate-200'
          }`}
        >
          {isUnlocked ? (
            <>
              <Unlock className="w-4 h-4" />
              Chế độ Ghi
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Chỉ Xem
            </>
          )}
        </button>
      </div>

      <iframe 
        ref={iframeRef}
        src="/c10/index.html" 
        className="w-full h-full border-none"
        style={{ minHeight: 'calc(100vh - 3.5rem)' }}
        title="Focus Points"
        onLoad={sendStateToIframe}
      />

      <PasswordProtection
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={handleUnlockSuccess}
        language="VN"
      />
    </div>
  );
};

export default FocusPoints;
