import React, { useRef, useState, useEffect } from 'react';
import { DataRow, TagMapping, TagType } from '../types';
import { GripVertical, Settings2, X } from 'lucide-react';

interface MappingPhaseProps {
  imageUrl: string;
  headers: string[];
  mappings: TagMapping[];
  setMappings: React.Dispatch<React.SetStateAction<TagMapping[]>>;
  onNext: () => void;
  onBack: () => void;
}

export function MappingPhase({ imageUrl, headers, mappings, setMappings, onNext, onBack }: MappingPhaseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);

  // Smooth drag logic for already mapped tags
  useEffect(() => {
    if (!draggingTagId) return;
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;
      
      x = Math.max(0, Math.min(100, x));
      y = Math.max(0, Math.min(100, y));

      setMappings(prev => prev.map(m => m.id === draggingTagId ? { ...m, x, y } : m));
    };

    const handlePointerUp = () => {
      setDraggingTagId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingTagId, setMappings]);

  const handleDragStart = (e: React.DragEvent, header: string) => {
    e.dataTransfer.setData('text/plain', header);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const header = e.dataTransfer.getData('text/plain');
    if (!header || !imgRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;

    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setMappings(prev => {
      const existing = prev.find(m => m.column === header);
      if (existing) {
        return prev.map(m => m.column === header ? { ...m, x, y } : m);
      }
      return [...prev, {
        id: Math.random().toString(36).substring(7),
        column: header,
        x,
        y,
        type: 'number',
        decimals: 1,
        threshold: 50,
        indicatorShape: 'circle',
        orientation: 'horizontal'
      }];
    });
  };

  const updateMapping = (id: string, updates: Partial<TagMapping>) => {
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const removeMapping = (id: string) => {
    setMappings(prev => prev.filter(m => m.id !== id));
    if (selectedTag === id) setSelectedTag(null);
  };

  const unmappedHeaders = headers.filter(h => !mappings.some(m => m.column === h));

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      {/* Sidebar: Tags */}
      <div className="w-64 bg-slate-800 rounded-xl border border-slate-700 flex flex-col overflow-hidden shrink-0">
        <div className="p-4 border-b border-slate-700 bg-slate-800/50">
          <h3 className="font-semibold text-slate-200">Available Sensors</h3>
          <p className="text-xs text-slate-400 mt-1">Drag onto diagram</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {unmappedHeaders.map(header => (
            <div
              key={header}
              draggable
              onDragStart={(e) => handleDragStart(e, header)}
              className="flex items-center gap-2 p-2 bg-slate-900/50 border border-slate-700 rounded-lg cursor-grab active:cursor-grabbing hover:border-blue-500 transition-colors"
            >
              <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-sm font-mono text-slate-300 truncate" title={header}>{header}</span>
            </div>
          ))}
          {unmappedHeaders.length === 0 && (
            <div className="text-center p-4 text-sm text-slate-500">All columns mapped!</div>
          )}
        </div>
      </div>

      {/* Main Diagram Area */}
      <div className="flex-1 flex flex-col gap-4 relative min-h-0 min-w-0">
        <div 
          className="flex-1 relative bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex items-center justify-center p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {/* Inner wrapper constrained exactly to image size */}
          <div ref={containerRef} className="relative inline-flex items-center justify-center max-w-full max-h-full aspect-auto h-full w-full">
            <img 
              ref={imgRef}
              src={imageUrl} 
              alt="Process Flow Diagram" 
              className="object-contain max-h-full max-w-full block"
              draggable={false}
              style={{ objectPosition: 'center' }}
            />
            
            {/* Overlay Container matching exact image bounds */}
            <div className="absolute inset-0 m-auto" style={{
              width: imgRef.current ? imgRef.current.width : '100%',
              height: imgRef.current ? imgRef.current.height : '100%',
              pointerEvents: 'none'
            }}>
              {mappings.map(mapping => (
                <div
                  key={mapping.id}
                  onPointerDown={(e) => {
                     e.stopPropagation();
                     setSelectedTag(mapping.id);
                     setDraggingTagId(mapping.id);
                     e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center ${draggingTagId === mapping.id ? 'opacity-80 cursor-grabbing' : 'cursor-grab'} pointer-events-auto
                    ${mapping.type === 'number' || mapping.type === 'text' || mapping.type === 'time' || mapping.type === 'percentage'
                      ? 'bg-black/70 border border-slate-600 px-2 py-1 rounded shadow-lg' 
                      : mapping.type === 'indicator' && (mapping.indicatorShape === 'valve' || mapping.indicatorShape === '3-way-valve')
                        ? 'bg-slate-900 border border-slate-600 p-1 rounded font-bold text-slate-400'
                        : 'w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}
                    ${selectedTag === mapping.id ? 'ring-2 ring-blue-500 z-10' : 'z-0'}
                  `}
                  style={{ left: `${mapping.x}%`, top: `${mapping.y}%` }}
                >
                  {(mapping.type === 'number' || mapping.type === 'text' || mapping.type === 'percentage') ? (
                    <span className="text-xs font-mono text-emerald-400 font-bold whitespace-nowrap">
                      {mapping.column.substring(0, 8)}{mapping.type === 'percentage' ? '%' : mapping.unit ? ` ${mapping.unit}` : ''}
                    </span>
                  ) : mapping.type === 'time' ? (
                    <span className="text-xs font-mono text-blue-400 font-bold whitespace-nowrap">
                      {mapping.timeFormat || 'HH:mm'}
                    </span>
                  ) : mapping.type === 'indicator' && (mapping.indicatorShape === 'valve' || mapping.indicatorShape === '3-way-valve') ? (
                     <span className={`text-xs block ${mapping.orientation === 'vertical' ? 'rotate-90' : ''}`}>
                       {mapping.indicatorShape === '3-way-valve' ? '┳' : '⧓'}
                     </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
          <button onClick={onBack} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">Back</button>
          <span className="text-sm text-slate-400">Mapped: {mappings.length} / {headers.length}</span>
          <button 
            onClick={onNext}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Configure Settings
          </button>
        </div>
      </div>

      {/* Sidebar: Tag Settings */}
      <div className={`w-72 bg-slate-800 rounded-xl border border-slate-700 flex flex-col transition-all duration-300 overflow-hidden shrink-0 ${selectedTag ? 'translate-x-0 opacity-100' : 'w-0 border-0 opacity-0'}`}>
        {selectedTag && (() => {
          const mapping = mappings.find(m => m.id === selectedTag);
          if (!mapping) return null;
          // Support legacy 'text' mappings
          const currentType = mapping.type === 'text' ? 'number' : mapping.type;
          
          return (
            <div className="flex flex-col h-full w-72">
              <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2 w-full overflow-hidden mr-2">
                  <Settings2 className="w-4 h-4 text-slate-400 shrink-0" />
                  <h3 className="font-semibold text-slate-200 truncate" title={mapping.column}>{mapping.column}</h3>
                </div>
                <button onClick={() => removeMapping(mapping.id)} className="text-slate-500 hover:text-red-400 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Display Type</label>
                  <select 
                    value={currentType}
                    onChange={(e) => updateMapping(mapping.id, { type: e.target.value as TagType, indicatorShape: mapping.indicatorShape || 'circle', orientation: mapping.orientation || 'horizontal' })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="number">Numerical Value</option>
                    <option value="percentage">Percentage</option>
                    <option value="time">Time</option>
                    <option value="indicator">Actuator / Indicator</option>
                  </select>
                </div>

                {(currentType === 'number' || currentType === 'percentage') && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Decimals</label>
                      <input 
                        type="number" 
                        min="0" 
                        max="10"
                        value={mapping.decimals ?? 1}
                        onChange={(e) => updateMapping(mapping.id, { decimals: parseInt(e.target.value) >= 0 ? parseInt(e.target.value) : 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                      />
                    </div>
                    {currentType === 'number' && (
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">Unit (String)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. ºC, m3/h"
                          value={mapping.unit || ''}
                          onChange={(e) => updateMapping(mapping.id, { unit: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                    {currentType === 'percentage' && (
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mt-2">
                        <input 
                          type="checkbox" 
                          checked={mapping.is0to1 || false}
                          onChange={(e) => updateMapping(mapping.id, { is0to1: e.target.checked })}
                          className="rounded border-slate-700 bg-slate-900 text-blue-500"
                        />
                        Data is 0 to 1 (Multiply by 100)
                      </label>
                    )}
                  </>
                )}

                {currentType === 'time' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Time Format</label>
                    <input 
                      type="text" 
                      placeholder="dd/MM/yyyy HH:mm"
                      value={mapping.timeFormat || ''}
                      onChange={(e) => updateMapping(mapping.id, { timeFormat: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Use format like 'dd/MM/yyyy HH:mm'</p>
                  </div>
                )}

                {currentType === 'indicator' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Threshold ({">="} turns Green)</label>
                      <input 
                        type="number"
                        value={mapping.threshold ?? 0}
                        onChange={(e) => updateMapping(mapping.id, { threshold: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Shape</label>
                      <select 
                        value={mapping.indicatorShape || 'circle'}
                        onChange={(e) => updateMapping(mapping.id, { indicatorShape: e.target.value as 'circle' | 'valve' | '3-way-valve' })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                      >
                        <option value="circle">Circle Dot</option>
                        <option value="valve">Valve</option>
                        <option value="3-way-valve">3-Way Valve</option>
                      </select>
                    </div>
                    {(mapping.indicatorShape === 'valve' || mapping.indicatorShape === '3-way-valve') && (
                      <div className="space-y-4">
                         <div>
                           <label className="block text-xs font-medium text-slate-400 mb-1">Base Orientation</label>
                           <select 
                             value={mapping.orientation || 'horizontal'}
                             onChange={(e) => updateMapping(mapping.id, { orientation: e.target.value as 'horizontal' | 'vertical' })}
                             className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-slate-200 outline-none focus:border-blue-500"
                           >
                             <option value="horizontal">Horizontal</option>
                             <option value="vertical">Vertical</option>
                           </select>
                         </div>
                         <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                           <input 
                             type="checkbox" 
                             checked={mapping.showPercentage || false}
                             onChange={(e) => updateMapping(mapping.id, { showPercentage: e.target.checked })}
                             className="rounded border-slate-700 bg-slate-900 text-blue-500"
                           />
                           Show % Value Below
                         </label>
                         <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                           <input 
                             type="checkbox" 
                             checked={mapping.is0to1 || false}
                             onChange={(e) => updateMapping(mapping.id, { is0to1: e.target.checked })}
                             className="rounded border-slate-700 bg-slate-900 text-blue-500"
                           />
                           Data is 0.0 - 1.0 (Multiply by 100)
                         </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
