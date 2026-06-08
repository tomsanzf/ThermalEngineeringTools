import React from 'react';
import { AppSettings } from '../types';
import { Settings, Play, ArrowLeft } from 'lucide-react';

interface SettingsPhaseProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  totalRows: number;
  onNext: () => void;
  onBack: () => void;
}

export function SettingsPhase({ settings, setSettings, totalRows, onNext, onBack }: SettingsPhaseProps) {
  const updateSetting = (key: keyof AppSettings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const fpsOptions = [5, 10, 24, 30, 60];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto w-full">
      <div className="w-full bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-700 flex items-center gap-3">
          <Settings className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-semibold text-slate-100">Render Settings</h2>
        </div>

        <div className="p-6 space-y-6">
           <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Start Row</label>
                <input 
                  type="number" min="0" max={settings.endRow - 1}
                  value={settings.startRow}
                  onChange={(e) => updateSetting('startRow', parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">End Row (Max {totalRows})</label>
                <input 
                  type="number" min={settings.startRow + 1} max={totalRows}
                  value={settings.endRow}
                  onChange={(e) => updateSetting('endRow', Math.min(parseInt(e.target.value) || totalRows, totalRows))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-blue-500"
                />
              </div>
           </div>

           <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Downsample (Skip N-1 frames)</label>
              <p className="text-xs text-slate-500 mb-2">Use e.g., 5 to only render 1 out of every 5 rows to drastically speed up processing and shorten video.</p>
              <input 
                type="number" min="1" max="1000"
                value={settings.downsample}
                onChange={(e) => updateSetting('downsample', parseInt(e.target.value) || 1)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-blue-500"
              />
           </div>

           <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Output FPS</label>
              <select 
                value={settings.fps}
                onChange={(e) => updateSetting('fps', parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 outline-none focus:border-blue-500"
              >
                {fpsOptions.map(fps => (
                  <option key={fps} value={fps}>{fps} FPS</option>
                ))}
              </select>
           </div>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center">
            <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={onNext} className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
              <Play className="w-4 h-4" /> Preview & Render
            </button>
        </div>
      </div>
    </div>
  );
}
