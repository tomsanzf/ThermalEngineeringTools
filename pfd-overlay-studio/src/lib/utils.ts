import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, isValid } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeParseFloat(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return NaN;
  // Replace comma with dot if there is no other dot and exactly one comma (simple european decimal support)
  const s = String(val);
  if (s.includes(',') && !s.includes('.')) {
    return parseFloat(s.replace(',', '.'));
  }
  return parseFloat(s);
}

function excelDateToJSDate(serial: number) {
  const utc_days  = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;                                        
  const date_info = new Date(utc_value * 1000);
  
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  
  return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate(), hours, minutes, seconds);
}

export function formatSafeTime(val: any, timeFormat: string): string {
  if (!val && val !== 0) return "";
  let d: Date;
  
  const floatVal = safeParseFloat(val);
  
  // A typical excel date is somewhat between 30000 and 60000 (1982 to 2064).
  if (!isNaN(floatVal) && floatVal > 10000 && floatVal < 100000) {
    d = excelDateToJSDate(floatVal);
  } else if (typeof val === 'number') {
    d = new Date(val);
  } else {
    d = new Date(String(val));
    if (!isValid(d)) d = parseISO(String(val));
  }
  
  if (!isValid(d)) return String(val); 
  
  try {
    let fStr = timeFormat || 'dd/MM/yyyy HH:mm';
    if (fStr.includes('mm') && !fStr.includes('MM')) {
        fStr = fStr.replace('mm', 'MM'); // First 'mm' becomes 'MM' (months), second remains 'mm' (minutes)
    }
    fStr = fStr.replace('yyy', 'yyyy').replace('yyyyy', 'yyyy');
    return format(d, fStr);
  } catch (e) {
    return String(val);
  }
}
