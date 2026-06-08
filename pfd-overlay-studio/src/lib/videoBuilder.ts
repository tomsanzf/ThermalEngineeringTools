import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { AppSettings, DataRow, TagMapping } from '../types';
import { safeParseFloat, formatSafeTime } from './utils';

interface GenerationParams {
  imageUrl: string;
  data: DataRow[];
  mappings: TagMapping[];
  settings: AppSettings;
  onProgress: (percent: number) => void;
}

export async function generateVideo({ imageUrl, data, mappings, settings, onProgress }: GenerationParams): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imageUrl;
  
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  // Must be even width/height for standard h264 encoder
  canvas.width = img.width % 2 === 0 ? img.width : img.width - 1;
  canvas.height = img.height % 2 === 0 ? img.height : img.height - 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas context");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: canvas.width,
      height: canvas.height
    },
    // Set fastStart for web playback
    fastStart: 'in-memory'
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error("VideoEncoder error", e)
  });

  videoEncoder.configure({
    codec: 'avc1.42001f', // Basic h264
    width: canvas.width,
    height: canvas.height,
    bitrate: 5_000_000, 
    framerate: settings.fps
  });

  for (let i = 0; i < data.length; i++) {
    const rowData = data[i];

    // Clear and draw base
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw overlays
    mappings.forEach(mapping => {
        const val = rowData[mapping.column] || "";
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
           
           const textMetrics = ctx.measureText(displayVal);
           const padX = 8, padY = 6;
           const boxW = textMetrics.width + padX * 2;
           const boxH = 32;

           ctx.fillStyle = 'rgba(0,0,0,0.7)';
           ctx.fillRect(pxX - boxW/2, pxY - boxH/2, boxW, boxH);
           
           ctx.fillStyle = '#10B981';
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

    // Create frame and encode
    const timestamp = (i / settings.fps) * 1_000_000;
    const frame = new VideoFrame(canvas, { timestamp });
    
    const keyFrame = i % 30 === 0;
    videoEncoder.encode(frame, { keyFrame });
    frame.close();

    if (videoEncoder.encodeQueueSize > 30) {
       await new Promise(r => setTimeout(r, 10));
    }

    onProgress((i / data.length) * 100);
  }

  await videoEncoder.flush();
  muxer.finalize();

  const buffer = muxer.target.buffer;
  return new Blob([buffer], { type: 'video/mp4' });
}
