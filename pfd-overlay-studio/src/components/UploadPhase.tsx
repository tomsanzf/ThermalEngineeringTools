import React, { useCallback, useState } from 'react';
import Papa from 'papaparse';
import { DataRow } from '../types';
import { UploadCloud, FileImage, FileText } from 'lucide-react';

interface UploadPhaseProps {
  onDataLoaded: (image: File, imageUrl: string, headers: string[], data: DataRow[]) => void;
}

export function UploadPhase({ onDataLoaded }: UploadPhaseProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCsvFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (!imageFile || !csvFile || !imageUrl) return;
    
    setLoading(true);
    Papa.parse(csvFile, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        setLoading(false);
        const headers = results.meta.fields || [];
        onDataLoaded(imageFile, imageUrl, headers, results.data as DataRow[]);
      },
      error: (error) => {
        setLoading(false);
        alert('Error parsing CSV: ' + error.message);
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-100">Upload Process Data</h2>
        <p className="text-slate-400 mt-2">Initialize the system with your PFD schematic and timeseries data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {/* Image Upload */}
        <div className="relative group border-2 border-dashed border-slate-700 rounded-xl p-8 hover:border-blue-500 hover:bg-slate-800/50 transition-all text-center">
          <input 
            type="file" 
            accept="image/png, image/jpeg" 
            onChange={handleImageChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-4">
            {imageUrl ? (
              <img src={imageUrl} alt="PFD Preview" className="h-32 object-contain rounded-lg" />
            ) : (
              <FileImage className="w-12 h-12 text-slate-500 group-hover:text-blue-400" />
            )}
            <div>
              <p className="font-semibold text-slate-200">
                {imageFile ? imageFile.name : '1. Upload PFD Image'}
              </p>
              <p className="text-sm text-slate-500 mt-1">PNG, JPG up to 10MB</p>
            </div>
          </div>
        </div>

        {/* CSV Upload */}
        <div className="relative group border-2 border-dashed border-slate-700 rounded-xl p-8 hover:border-emerald-500 hover:bg-slate-800/50 transition-all text-center">
          <input 
            type="file" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
            onChange={handleCsvChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-4">
            <div className="h-32 flex items-center justify-center">
             <FileText className={`w-12 h-12 ${csvFile ? 'text-emerald-400' : 'text-slate-500 group-hover:text-emerald-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-slate-200">
                {csvFile ? csvFile.name : '2. Upload Sensor Data'}
              </p>
              <p className="text-sm text-slate-500 mt-1">CSV file with time-series rows</p>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!imageFile || !csvFile || loading}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold rounded-lg flex items-center gap-2 transition-colors"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <UploadCloud className="w-5 h-5" />}
        Initialize Mapping Phase
      </button>
    </div>
  );
}
