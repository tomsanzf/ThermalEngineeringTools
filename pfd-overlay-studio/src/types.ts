export interface DataRow {
  [key: string]: string | number;
}

export type TagType = 'number' | 'percentage' | 'time' | 'indicator';

export interface TagMapping {
  id: string;
  column: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  type: TagType;
  decimals: number;
  threshold: number; // For indicator true/false threshold
  
  // New options
  unit?: string;
  timeFormat?: string; // 'dd/MM/yyyy HH:mm', etc
  indicatorShape?: 'circle' | 'valve' | '3-way-valve';
  orientation?: 'horizontal' | 'vertical'; // For valve
  showPercentage?: boolean; // For indicators
  is0to1?: boolean; // If true, multiply value by 100 for percentage display
}

export interface AppSettings {
  startRow: number;
  endRow: number;
  downsample: number;
  movingWindow: number;
  fps: number;
}

export interface AppState {
  imageFile: File | null;
  imageUrl: string | null;
  csvData: DataRow[];
  csvHeaders: string[];
  mappings: TagMapping[];
  settings: AppSettings;
}
