import React, { useEffect, useRef, useState } from 'react';
import { AppSettings, DataRow, TagMapping } from '../types';
import { Download, AlertCircle } from 'lucide-react';
import { generateVideo } from '../lib/videoBuilder';
import { safeParseFloat, formatSafeTime } from '../lib/utils';

interface PreviewAndRenderPhaseProps {
  imageUrl: string;
  data: DataRow[];
  mappings: TagMapping[];
  settings: AppSettings;
  onBack: () => void;
}

export function PreviewAndRenderPhase({ imageUrl, data, mappings, settings, onBack }: PreviewAndRenderPhaseProps) {
  const [currentRow, setCurrentRow] = useState(settings.startRow);
  const [renderProgress, setRenderProgress] = useState(-1);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Extract exactly the slice we will render
  const renderDataSubset = data.slice(settings.startRow, settings.endRow).filter((_, i) => i % settings.downsample === 0);

  // Redraw canvas whenever current row changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      // Setup canvas size
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw Base Image
      ctx.drawImage(img, 0, 0);

      // Get current data row
      const rowData = data[currentRow];

      // Draw Elements
      mappings.forEach(mapping => {
        const val = rowData?.[mapping.column] || "";
        const pxX = (mapping.x / 100) * canvas.width;
        const pxY = (mapping.y / 100) * canvas.height;

        if (mapping.type === 'number' || mapping.type === 'text' || mapping.type === 'percentage') {
           const numVal = safeParseFloat(val);
           let displayVal = String(val);
           if (!isNaN(numVal)) {
             if (mapping.type === 'percentage') {
               const pVal = mapping.is0to1 ? numVal * 100 : numVal;
               displayVal = `${pVal.toFixed(mapping.decimals ?? 1)}%`;
             } else {
               displayVal = `${numVal.toFixed(mapping.decimals ?? 1)}${mapping.unit ? ` ${mapping.unit}` : ''}`;
             }
           }
           ctx.font = 'bold 24px "Roboto Mono", monospace';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           
           // Box background
           const textMetrics = ctx.measureText(displayVal);
           const padX = 8, padY = 6;
           const boxW = textMetrics.width + padX * 2;
           const boxH = 32;

           ctx.fillStyle = 'rgba(0,0,0,0.7)';
           ctx.fillRect(pxX - boxW/2, pxY - boxH/2, boxW, boxH);
           
           ctx.fillStyle = '#10B981'; // Emerald 400
           ctx.fillText(displayVal, pxX, pxY);
        } else if (mapping.type === 'time') {
           const displayVal = formatSafeTime(val, mapping.timeFormat || 'HH:mm');
           ctx.font = 'bold 24px "Roboto Mono", monospace';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           
           const textMetrics = ctx.measureText(displayVal);
           const padX = 8, padY = 6;
           const boxW = textMetrics.width + padX * 2;
           const boxH = 32;

           ctx.fillStyle = 'rgba(0,0,0,0.7)';
           ctx.fillRect(pxX - boxW/2, pxY - boxH/2, boxW, boxH);
           
           ctx.fillStyle = '#60A5FA'; // Blue 400
           ctx.fillText(displayVal, pxX, pxY);
        } else if (mapping.type === 'indicator') {
           const numVal = safeParseFloat(val);
           const isOn = !isNaN(numVal) && numVal >= mapping.threshold;
           ctx.fillStyle = isOn ? '#10B981' : '#EF4444'; // Green / Red
           ctx.strokeStyle = '#0F172A';
           ctx.lineWidth = 2;

           if (mapping.indicatorShape === 'valve' || mapping.indicatorShape === '3-way-valve') {
             const size = 16;
             ctx.save();
             ctx.translate(pxX, pxY);

             const ratio = mapping.is0to1 ? numVal : (numVal / 100);
             const clampedRatio = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));
             const angle = clampedRatio * (Math.PI / 2) + (mapping.orientation === 'vertical' ? Math.PI / 2 : 0);
             ctx.rotate(angle);

             ctx.beginPath();
             ctx.moveTo(-size, -size/2);
             ctx.lineTo(-size, size/2);
             ctx.lineTo(0, 0);
             ctx.moveTo(size, -size/2);
             ctx.lineTo(size, size/2);
             ctx.lineTo(0, 0);
             ctx.closePath();
             ctx.fill();
             ctx.stroke();

             if (mapping.indicatorShape === '3-way-valve') {
                ctx.beginPath();
                ctx.moveTo(-size/2, size);
                ctx.lineTo(size/2, size);
                ctx.lineTo(0, 0);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
             }
             ctx.restore();

             if (mapping.showPercentage) {
                const percentText = !isNaN(numVal) ? `${(clampedRatio * 100).toFixed(0)}%` : String(val);
                ctx.font = 'bold 12px "Roboto Mono", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                
                const textMetrics = ctx.measureText(percentText);
                const padX = 4, padY = 2;
                const boxW = textMetrics.width + padX * 2;
                const boxH = 16;

                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(pxX - boxW/2, pxY + size + 4, boxW, boxH);
                
                ctx.fillStyle = '#10B981'; // Emerald
                ctx.fillText(percentText, pxX, pxY + size + 4 + padY);
             }
           } else {
             ctx.beginPath();
             ctx.arc(pxX, pxY, 12, 0, 2 * Math.PI, false);
             ctx.fill();
             ctx.stroke();
           }
        }
      });
    };
  }, [currentRow, imageUrl, mappings, data]);

  const handleStartRender = async () => {
    setRenderProgress(0);
    try {
      const blob = await generateVideo({
        imageUrl,
        data: renderDataSubset,
        mappings,
        settings,
        onProgress: (p) => setRenderProgress(p)
      });
      const url = URL.createObjectURL(blob);
      setRenderedUrl(url);
      setRenderProgress(100);
    } catch (e: any) {
      alert("Render failed: " + e.message);
      setRenderProgress(-1);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto">
       <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-100">Live Preview & Render</h2>
          <button onClick={onBack} className="text-slate-400 hover:text-white">Back to Settings</button>
       </div>

       <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-4">
          {/* Canvas Wrapper */}
          <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden border border-slate-700 flex items-center justify-center">
             <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
          </div>

          {/* Scrubber */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-mono text-slate-400">
              <span>Row {settings.startRow}</span>
              <span className="text-emerald-400 font-bold">Previewing Row: {currentRow}</span>
              <span>Row {settings.endRow}</span>
            </div>
            <input 
              type="range" 
              min={settings.startRow} 
              max={settings.endRow - 1} 
              value={currentRow}
              onChange={(e) => setCurrentRow(parseInt(e.target.value))}
              className="w-full cursor-pointer accent-blue-500"
            />
            <p className="text-xs text-slate-500 text-center">
              Total frames to be rendered: {renderDataSubset.length} ({(renderDataSubset.length / settings.fps).toFixed(1)} seconds @ {settings.fps} FPS)
            </p>
          </div>
       </div>

       {/* Render Status & Action */}
       <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center space-y-4">
          {renderProgress === -1 && (
             <>
               <div className="flex items-center gap-2 text-yellow-500 text-sm mb-2">
                 <AlertCircle className="w-4 h-4" /> This will process entirely in your browser using WebCodecs.
               </div>
               <button 
                 onClick={handleStartRender}
                 className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg transition-transform active:scale-95"
               >
                 Start Render
               </button>
             </>
          )}

          {renderProgress >= 0 && renderProgress < 100 && (
             <div className="w-full max-w-md space-y-2">
                <div className="flex justify-between text-sm text-slate-300 font-mono">
                  <span>Rendering...</span>
                  <span>{Math.round(renderProgress)}%</span>
                </div>
                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${renderProgress}%` }} />
                </div>
             </div>
          )}

          {renderProgress === 100 && renderedUrl && (
             <div className="space-y-4">
               <div className="text-emerald-400 font-semibold text-lg">Render Complete!</div>
               <a 
                 href={renderedUrl}
                 download="dashboard_export.mp4"
                 className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg transition-colors"
               >
                 <Download className="w-5 h-5"/> Download MP4
               </a>
               <br />
               <button onClick={() => {setRenderProgress(-1); setRenderedUrl(null);}} className="text-sm text-slate-400 hover:text-white underline">
                 Render Again
               </button>
             </div>
          )}
       </div>
    </div>
  );
}
