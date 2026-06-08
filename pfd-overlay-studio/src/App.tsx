import React, { useState, useRef } from 'react';
import { UploadPhase } from './components/UploadPhase';
import { MappingPhase } from './components/MappingPhase';
import { SettingsPhase } from './components/SettingsPhase';
import { PreviewAndRenderPhase } from './components/PreviewAndRenderPhase';
import { AppState, DataRow, TagMapping } from './types';
import { Activity, Download, Upload } from 'lucide-react';

export default function App() {
  const [step, setStep] = useState(0); // 0: upload, 1: map, 2: settings, 3: render
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [state, setState] = useState<AppState>({
    imageFile: null,
    imageUrl: null,
    csvData: [],
    csvHeaders: [],
    mappings: [],
    settings: {
      startRow: 0,
      endRow: 0,
      downsample: 1,
      movingWindow: 1,
      fps: 24,
    }
  });

  const handleDataLoaded = (image: File, imageUrl: string, headers: string[], data: DataRow[]) => {
    setState(prev => ({
      ...prev,
      imageFile: image,
      imageUrl,
      csvHeaders: headers,
      csvData: data,
      settings: { ...prev.settings, endRow: data.length }
    }));
    setStep(1);
  };

  const handleSaveProject = async () => {
    if (!state.imageFile) {
        alert("No project data to save");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        const base64Image = reader.result;
        const projectData = {
            version: 1,
            imageFile: {
                name: state.imageFile!.name,
                type: state.imageFile!.type,
                data: base64Image
            },
            csvData: state.csvData,
            csvHeaders: state.csvHeaders,
            mappings: state.mappings,
            settings: state.settings,
        };
        const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "pfd_overlay_project.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    reader.readAsDataURL(state.imageFile);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
       try {
          const data = JSON.parse(reader.result as string);
          if (data.version === 1) {
              const fetchResult = await fetch(data.imageFile.data);
              const blob = await fetchResult.blob();
              const imageFile = new File([blob], data.imageFile.name, { type: data.imageFile.type });
              const imageUrl = URL.createObjectURL(imageFile);
              
              setState({
                  imageFile,
                  imageUrl,
                  csvData: data.csvData,
                  csvHeaders: data.csvHeaders,
                  mappings: data.mappings,
                  settings: data.settings,
              });
              setStep(1);
          } else {
             alert("Unsupported project version");
          }
       } catch (err: any) {
           alert("Error parsing project file: " + err.message);
       }
       if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-white hidden sm:block">PFD Overlay Studio</h1>
          </div>
          
          {/* Stepper */}
          <div className="hidden md:flex items-center gap-2 flex-1 justify-center">
             {['Upload', 'Map', 'Settings', 'Render'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                   <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                     ${step > i ? 'bg-blue-600 text-white' : step === i ? 'bg-blue-500 text-white ring-2 ring-blue-500/50 ring-offset-2 ring-offset-slate-950' : 'bg-slate-800 text-slate-500'}
                   `}>
                     {i + 1}
                   </div>
                   <span className={`text-sm font-medium ${step >= i ? 'text-slate-200' : 'text-slate-600'}`}>{s}</span>
                   {i < 3 && <div className={`w-8 h-px ${step > i ? 'bg-blue-600' : 'bg-slate-800'}`} />}
                </div>
             ))}
          </div>

          <div className="flex items-center gap-3">
             <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleLoadProject} />
             <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
               <Upload className="w-4 h-4" /> Load Project
             </button>
             {state.imageFile && step > 0 && (
               <button onClick={handleSaveProject} className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-md text-slate-300 transition-colors">
                 <Download className="w-4 h-4" /> Save
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {step === 0 && (
          <UploadPhase onDataLoaded={handleDataLoaded} />
        )}
        
        {step === 1 && state.imageUrl && (
          <MappingPhase 
            imageUrl={state.imageUrl}
            headers={state.csvHeaders}
            mappings={state.mappings}
            setMappings={(maps) => setState(prev => ({ ...prev, mappings: typeof maps === 'function' ? maps(prev.mappings) : maps }))}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <SettingsPhase
             settings={state.settings}
             setSettings={(sets) => setState(prev => ({ ...prev, settings: typeof sets === 'function' ? sets(prev.settings) : sets }))}
             totalRows={state.csvData.length}
             onBack={() => setStep(1)}
             onNext={() => setStep(3)}
          />
        )}

        {step === 3 && state.imageUrl && (
          <PreviewAndRenderPhase 
             imageUrl={state.imageUrl}
             data={state.csvData}
             mappings={state.mappings}
             settings={state.settings}
             onBack={() => setStep(2)}
          />
        )}
      </main>
    </div>
  );
}
