import { Download, Share, X } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className="h-9 px-3 sm:px-3.5 rounded-xl border border-cyan-400/45 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-[0_0_16px_rgba(6,182,212,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        <Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
        <span>Install App for Offline Use</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowGuide(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div
            className="console-chassis w-full max-w-sm rounded-2xl p-6 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h2
                id="pwa-install-guide-title"
                className="font-display text-base font-semibold text-white"
              >
                Install Live FX Console
              </h2>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/[0.04] flex items-center justify-center text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-300">
                <p>Install this console onto your iPhone or iPad for full-screen offline use:</p>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-300">
                  <li>
                    Tap the <span className="inline-flex items-center gap-1 text-cyan-300 font-semibold"><Share className="w-3.5 h-3.5" /> Share</span> button in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong className="text-white">Add</strong> to launch in standalone mode.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3 text-sm text-slate-300">
                <p className="text-xs leading-relaxed text-slate-300">
                  To install with the browser&apos;s native prompt, open this app directly in Chrome, Edge, or Android Chrome (outside an embedded preview frame) and click <strong className="text-cyan-300">Install App for Offline Use</strong>, or select <strong className="text-white">Install app / Add to Home screen</strong> from your browser menu.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full py-2.5 rounded-xl text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
