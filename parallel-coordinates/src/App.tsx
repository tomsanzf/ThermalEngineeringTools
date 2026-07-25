import React, { useState, useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Download, 
  Upload, 
  Sliders, 
  Activity, 
  ChevronUp, 
  ChevronDown, 
  Play, 
  Settings, 
  RefreshCw,
  ArrowUpDown,
  Copy
} from 'lucide-react';

// ----------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------
interface Column {
  id: string;
  name: string;
  type: 'input' | 'output';
  unit: string;
  inverted?: boolean;
}

interface Scenario {
  id: string;
  name: string;
  values: Record<string, number>;
}

// ----------------------------------------------------------------------
// PRESET DATASETS
// ----------------------------------------------------------------------
const PRESETS: Record<string, { name: string; columns: Column[]; scenarios: Scenario[] }> = {
  heatPump: {
    name: "Heat Pump Cycle Sweep",
    columns: [
      { id: "t_evap", name: "Evaporator Temp", type: "input", unit: "°C" },
      { id: "t_cond", name: "Condenser Temp", type: "input", unit: "°C" },
      { id: "speed", name: "Compressor Speed", type: "input", unit: "RPM" },
      { id: "refrig_flow", name: "Refrigerant Flow", type: "output", unit: "kg/s" },
      { id: "power", name: "Compressor Power", type: "output", unit: "kW" },
      { id: "heat_cap", name: "Heating Capacity", type: "output", unit: "kW" },
      { id: "cop", name: "Heating COP", type: "output", unit: "—" }
    ],
    scenarios: [
      { id: "s1", name: "Low Source / Standard Speed", values: { t_evap: 2, t_cond: 45, speed: 3000, refrig_flow: 0.052, power: 4.2, heat_cap: 15.4, cop: 3.67 } },
      { id: "s2", name: "Low Source / High Speed", values: { t_evap: 2, t_cond: 45, speed: 4200, refrig_flow: 0.071, power: 6.1, heat_cap: 20.8, cop: 3.41 } },
      { id: "s3", name: "Standard Source / Standard Speed", values: { t_evap: 7, t_cond: 45, speed: 3000, refrig_flow: 0.061, power: 4.0, heat_cap: 18.2, cop: 4.55 } },
      { id: "s4", name: "Standard Source / High Speed", values: { t_evap: 7, t_cond: 45, speed: 4200, refrig_flow: 0.084, power: 5.8, heat_cap: 24.6, cop: 4.24 } },
      { id: "s5", name: "Standard Source / Low Speed", values: { t_evap: 7, t_cond: 45, speed: 2000, refrig_flow: 0.040, power: 2.6, heat_cap: 12.1, cop: 4.65 } },
      { id: "s6", name: "Warm Source / Standard Speed", values: { t_evap: 12, t_cond: 45, speed: 3000, refrig_flow: 0.071, power: 3.8, heat_cap: 21.3, cop: 5.61 } },
      { id: "s7", name: "Warm Source / High Speed", values: { t_evap: 12, t_cond: 45, speed: 4200, refrig_flow: 0.098, power: 5.5, heat_cap: 28.9, cop: 5.25 } },
      { id: "s8", name: "High Lift (Radiator Heating)", values: { t_evap: 2, t_cond: 60, speed: 3500, refrig_flow: 0.058, power: 6.5, heat_cap: 16.3, cop: 2.51 } },
      { id: "s9", name: "High Lift / Max Speed", values: { t_evap: 2, t_cond: 60, speed: 4500, refrig_flow: 0.073, power: 8.8, heat_cap: 20.2, cop: 2.30 } },
      { id: "s10", name: "Low Lift (Underfloor Heating)", values: { t_evap: 12, t_cond: 35, speed: 3000, refrig_flow: 0.072, power: 2.8, heat_cap: 22.1, cop: 7.89 } }
    ]
  },
  pinchAnalysis: {
    name: "Pinch Utility & Cost Optimization",
    columns: [
      { id: "dt_min", name: "Min Approach dT", type: "input", unit: "°C" },
      { id: "q_h_min", name: "Hot Utility Target", type: "output", unit: "kW" },
      { id: "q_c_min", name: "Cold Utility Target", type: "output", unit: "kW" },
      { id: "pinch_temp", name: "Shifted Pinch Temp", type: "output", unit: "°C" },
      { id: "hex_count", name: "Min Exchanger Count", type: "output", unit: "—" },
      { id: "cap_cost", name: "HEX Network CapEx", type: "output", unit: "k$" },
      { id: "op_cost", name: "Annual Utility OpEx", type: "output", unit: "k$/yr" }
    ],
    scenarios: [
      { id: "p1", name: "Approach dT = 5 K", values: { dt_min: 5, q_h_min: 120, q_c_min: 70, pinch_temp: 92.5, hex_count: 9, cap_cost: 380, op_cost: 28.5 } },
      { id: "p2", name: "Approach dT = 8 K", values: { dt_min: 8, q_h_min: 155, q_c_min: 105, pinch_temp: 94.0, hex_count: 8, cap_cost: 325, op_cost: 33.7 } },
      { id: "p3", name: "Approach dT = 10 K (Standard)", values: { dt_min: 10, q_h_min: 180, q_c_min: 130, pinch_temp: 95.0, hex_count: 7, cap_cost: 290, op_cost: 37.2 } },
      { id: "p4", name: "Approach dT = 12 K", values: { dt_min: 12, q_h_min: 208, q_c_min: 158, pinch_temp: 96.0, hex_count: 7, cap_cost: 265, op_cost: 41.4 } },
      { id: "p5", name: "Approach dT = 15 K", values: { dt_min: 15, q_h_min: 250, q_c_min: 200, pinch_temp: 97.5, hex_count: 6, cap_cost: 235, op_cost: 47.7 } },
      { id: "p6", name: "Approach dT = 18 K", values: { dt_min: 18, q_h_min: 292, q_c_min: 242, pinch_temp: 99.0, hex_count: 6, cap_cost: 212, op_cost: 54.0 } },
      { id: "p7", name: "Approach dT = 20 K", values: { dt_min: 20, q_h_min: 320, q_c_min: 270, pinch_temp: 100.0, hex_count: 5, cap_cost: 195, op_cost: 58.2 } },
      { id: "p8", name: "Approach dT = 25 K", values: { dt_min: 25, q_h_min: 390, q_c_min: 340, pinch_temp: 102.5, hex_count: 5, cap_cost: 168, op_cost: 68.7 } }
    ]
  }
};

const COLOR_SCALES = [
  { id: "Jet", name: "Thermal Jet" },
  { id: "Viridis", name: "Viridis" },
  { id: "Plasma", name: "Plasma" },
  { id: "Electric", name: "Electric Blue" },
  { id: "Hot", name: "Incandescent Hot" },
  { id: "Rainbow", name: "Rainbow Spectrum" },
  { id: "Cividis", name: "Cividis Contrast" }
];

export default function App() {
  const chartRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------------
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>("heatPump");
  const [columns, setColumns] = useState<Column[]>(PRESETS.heatPump.columns);
  const [scenarios, setScenarios] = useState<Scenario[]>(PRESETS.heatPump.scenarios);

  const [colorColumnId, setColorColumnId] = useState<string>("cop");
  const [colorScale, setColorScale] = useState<string>("Jet");
  const [lineOpacity, setLineOpacity] = useState<number>(0.65);
  const [fontSize, setFontSize] = useState<number>(11);

  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const [activeConstraints, setActiveConstraints] = useState<Record<string, any>>({});

  // Column Creator State
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<'input' | 'output'>("input");
  const [newColUnit, setNewColUnit] = useState("");

  // Target Optimizer State
  const [optInputColId, setOptInputColId] = useState<string>("speed");
  const [optInputMode, setOptInputMode] = useState<'min' | 'max'>("min");
  const [optOutputColId, setOptOutputColId] = useState<string>("cop");
  const [optOutputMode, setOptOutputMode] = useState<'min' | 'max'>("max");

  // ----------------------------------------------------------------------
  // PRESET SELECTION
  // ----------------------------------------------------------------------
  const handleLoadPreset = (key: string) => {
    const preset = PRESETS[key];
    if (preset) {
      setSelectedPresetKey(key);
      setColumns(preset.columns);
      setScenarios(preset.scenarios);
      // Auto-pick a logical default color-grading column
      const defaultColorCol = preset.columns.find(c => c.id === 'cop' || c.id === 'op_cost' || c.id === 'cap_cost') || preset.columns[preset.columns.length - 1];
      setColorColumnId(defaultColorCol.id);
      setActiveConstraints({});
      setSelectedScenarioIds([]);
    }
  };

  // ----------------------------------------------------------------------
  // COLUMN MANAGEMENT
  // ----------------------------------------------------------------------
  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;

    const newId = `col_${Date.now()}`;
    const newCol: Column = {
      id: newId,
      name: newColName.trim(),
      type: newColType,
      unit: newColUnit.trim()
    };

    setColumns([...columns, newCol]);
    setScenarios(scenarios.map(s => ({
      ...s,
      values: { ...s.values, [newId]: 0 }
    })));

    setNewColName("");
    setNewColUnit("");
  };

  const handleDeleteColumn = (id: string) => {
    if (columns.length <= 2) {
      alert("At least 2 variables are required to generate a parallel coordinate plot.");
      return;
    }
    setColumns(columns.filter(c => c.id !== id));
    setScenarios(scenarios.map(s => {
      const newVals = { ...s.values };
      delete newVals[id];
      return { ...s, values: newVals };
    }));
    if (colorColumnId === id) {
      setColorColumnId(columns.find(c => c.id !== id)?.id || "");
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;
    setColumns(newCols);
  };

  const handleToggleInvertColumn = (id: string) => {
    setColumns(columns.map(c => {
      if (c.id === id) {
        return { ...c, inverted: !c.inverted };
      }
      return c;
    }));
  };

  // ----------------------------------------------------------------------
  // SCENARIO (ROW) MANAGEMENT
  // ----------------------------------------------------------------------
  const handleAddScenario = () => {
    const defaultValues: Record<string, number> = {};
    columns.forEach(col => {
      // average value of current scenarios for this column
      const vals = scenarios.map(s => s.values[col.id]).filter(v => v !== undefined);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      defaultValues[col.id] = Number(avg.toFixed(2));
    });

    const newScen: Scenario = {
      id: `scen_${Date.now()}`,
      name: `Design Case ${scenarios.length + 1}`,
      values: defaultValues
    };
    setScenarios([...scenarios, newScen]);
  };

  const handleRandomizeScenario = () => {
    const newScenarios = scenarios.map(s => {
      const vals: Record<string, number> = {};
      columns.forEach(col => {
        const currentVals = scenarios.map(sc => sc.values[col.id]);
        const min = Math.min(...currentVals, 0);
        const max = Math.max(...currentVals, 10);
        vals[col.id] = Number((min + Math.random() * (max - min)).toFixed(2));
      });
      return { ...s, values: vals };
    });
    setScenarios(newScenarios);
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const handleClearAllScenarios = () => {
    if (window.confirm("Are you sure you want to delete all scenarios?")) {
      setScenarios([]);
      setSelectedScenarioIds([]);
    }
  };

  const handleCopyTableToClipboard = () => {
    const headers = ["Scenario", ...columns.map(c => `${c.name}${c.unit ? ` [${c.unit}]` : ''}`)];
    const rows = [headers.join("\t")];
    
    scenarios.forEach(scen => {
      const row = [
        scen.name,
        ...columns.map(c => scen.values[c.id] !== undefined ? scen.values[c.id] : "")
      ];
      rows.push(row.join("\t"));
    });

    navigator.clipboard.writeText(rows.join("\n"))
      .then(() => alert("Table copied to clipboard in Excel-compatible format!"))
      .catch(err => console.error("Failed to copy table", err));
  };

  const handlePasteCell = (e: React.ClipboardEvent<HTMLInputElement>, startScenId: string, colId: string) => {
    const pastedText = e.clipboardData.getData('text');
    
    if (!pastedText.includes('\t') && !pastedText.includes('\n') && !pastedText.includes('\r')) {
      return; // normal standard paste
    }

    e.preventDefault();

    const rows = pastedText.split(/\r?\n/).map(line => line.split('\t'));
    if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
      rows.pop();
    }

    const startRowIdx = scenarios.findIndex(s => s.id === startScenId);
    if (startRowIdx === -1) return;

    const colOrder = ['name', ...columns.map(c => c.id)];
    const startColIdx = colOrder.indexOf(colId);
    if (startColIdx === -1) return;

    const updatedScenarios = [...scenarios];

    rows.forEach((rowCells, rOffset) => {
      const targetRowIdx = startRowIdx + rOffset;
      
      if (targetRowIdx >= updatedScenarios.length) {
        const defaultValues: Record<string, number> = {};
        columns.forEach(col => {
          const vals = scenarios.map(s => s.values[col.id]).filter(v => v !== undefined);
          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          defaultValues[col.id] = Number(avg.toFixed(2));
        });

        updatedScenarios.push({
          id: `scen_pasted_${Date.now()}_${rOffset}`,
          name: `Design Case ${updatedScenarios.length + 1}`,
          values: defaultValues
        });
      }

      const targetScen = updatedScenarios[targetRowIdx];
      const updatedValues = { ...targetScen.values };
      let updatedName = targetScen.name;

      rowCells.forEach((cellVal, cOffset) => {
        const targetColIdx = startColIdx + cOffset;
        if (targetColIdx >= colOrder.length) return;

        const targetColId = colOrder[targetColIdx];
        if (targetColId === 'name') {
          updatedName = cellVal;
        } else {
          const parsed = parseFloat(cellVal);
          updatedValues[targetColId] = isNaN(parsed) ? 0 : parsed;
        }
      });

      updatedScenarios[targetRowIdx] = {
        ...targetScen,
        name: updatedName,
        values: updatedValues
      };
    });

    setScenarios(updatedScenarios);
  };

  const handleCellChange = (scenId: string, colId: string, value: string) => {
    const num = parseFloat(value);
    setScenarios(scenarios.map(s => {
      if (s.id === scenId) {
        return {
          ...s,
          values: { ...s.values, [colId]: isNaN(num) ? 0 : num }
        };
      }
      return s;
    }));
  };

  const handleNameChange = (scenId: string, newName: string) => {
    setScenarios(scenarios.map(s => {
      if (s.id === scenId) {
        return { ...s, name: newName };
      }
      return s;
    }));
  };

  // ----------------------------------------------------------------------
  // CSV / CONFIG EXPORT & IMPORT
  // ----------------------------------------------------------------------
  const handleExportCSV = () => {
    const headers = ["Scenario", ...columns.map(c => `${c.name}${c.unit ? ` [${c.unit}]` : ''}`)];
    const csvRows = [headers.join(",")];
    
    scenarios.forEach(scen => {
      const row = [
        `"${scen.name.replace(/"/g, '""')}"`,
        ...columns.map(c => scen.values[c.id] || 0)
      ];
      csvRows.push(row.join(","));
    });

    // Add config metadata as comment at the end
    const configData = {
      selectedPresetKey,
      colorColumnId,
      colorScale,
      lineOpacity,
      fontSize,
      columns,
      activeConstraints,
      optInputColId,
      optInputMode,
      optOutputColId,
      optOutputMode
    };
    csvRows.push(`# CONFIG: ${JSON.stringify(configData)}`);

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedPresetKey}_scenarios.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 1) {
        alert("Invalid CSV file structure.");
        return;
      }

      // Check if we have a config line
      const configLine = lines.find(l => l.startsWith("# CONFIG:"));
      let parsedConfig: any = null;
      if (configLine) {
        try {
          const configJson = configLine.substring("# CONFIG:".length).trim();
          parsedConfig = JSON.parse(configJson);
        } catch (err) {
          console.error("Failed to parse config from CSV", err);
        }
      }

      // Filter out comments/metadata rows for scenario data rows
      const dataLines = lines.filter(l => !l.startsWith("#"));

      if (dataLines.length < 2) {
        alert("Invalid CSV file structure. Must contain at least a header row and one data row.");
        return;
      }

      // Parse headers
      const csvHeaders = dataLines[0].split(",").map(h => h.replace(/^["']|["']$/g, '').trim());
      let newCols: Column[] = [];
      let newScenarios: Scenario[] = [];

      if (parsedConfig && parsedConfig.columns) {
        // If config contains columns, restore exactly
        newCols = parsedConfig.columns;
        
        newScenarios = dataLines.slice(1).map((line, rowIdx) => {
          const parts = line.split(",").map(p => p.replace(/^["']|["']$/g, '').trim());
          const scenName = parts[0] || `CSV Scenario ${rowIdx + 1}`;
          const vals: Record<string, number> = {};
          
          newCols.forEach((col, colIdx) => {
            const rawVal = parseFloat(parts[colIdx + 1]);
            vals[col.id] = isNaN(rawVal) ? 0 : rawVal;
          });

          return {
            id: parsedConfig.scenarios?.[rowIdx]?.id || `csv_scen_${rowIdx}_${Date.now()}`,
            name: scenName,
            values: vals
          };
        });

        // Restore configurations
        if (parsedConfig.selectedPresetKey !== undefined) setSelectedPresetKey(parsedConfig.selectedPresetKey);
        if (parsedConfig.colorColumnId !== undefined) setColorColumnId(parsedConfig.colorColumnId);
        if (parsedConfig.colorScale !== undefined) setColorScale(parsedConfig.colorScale);
        if (parsedConfig.lineOpacity !== undefined) setLineOpacity(parsedConfig.lineOpacity);
        if (parsedConfig.fontSize !== undefined) setFontSize(parsedConfig.fontSize);
        if (parsedConfig.activeConstraints !== undefined) setActiveConstraints(parsedConfig.activeConstraints);
        if (parsedConfig.optInputColId !== undefined) setOptInputColId(parsedConfig.optInputColId);
        if (parsedConfig.optInputMode !== undefined) setOptInputMode(parsedConfig.optInputMode);
        if (parsedConfig.optOutputColId !== undefined) setOptOutputColId(parsedConfig.optOutputColId);
        if (parsedConfig.optOutputMode !== undefined) setOptOutputMode(parsedConfig.optOutputMode);
      } else {
        // Fallback for standard CSV format
        csvHeaders.slice(1).forEach((h, idx) => {
          let name = h;
          let unit = "";
          const match = h.match(/(.+?)\s*\[(.+?)\]/);
          if (match) {
            name = match[1];
            unit = match[2];
          }
          newCols.push({
            id: `csv_col_${idx}`,
            name: name,
            type: idx >= csvHeaders.slice(1).length / 2 ? 'input' : 'output',
            unit: unit
          });
        });

        newScenarios = dataLines.slice(1).map((line, rowIdx) => {
          const parts = line.split(",").map(p => p.replace(/^["']|["']$/g, '').trim());
          const scenName = parts[0] || `CSV Scenario ${rowIdx + 1}`;
          const vals: Record<string, number> = {};
          newCols.forEach((col, colIdx) => {
            const rawVal = parseFloat(parts[colIdx + 1]);
            vals[col.id] = isNaN(rawVal) ? 0 : rawVal;
          });
          return {
            id: `csv_scen_${rowIdx}`,
            name: scenName,
            values: vals
          };
        });

        if (newCols.length > 0) {
          setColorColumnId(newCols[newCols.length - 1].id);
        }
        setActiveConstraints({});
        setSelectedScenarioIds([]);
      }

      setColumns(newCols);
      setScenarios(newScenarios);
    };
    reader.readAsText(file);
  };

  // ----------------------------------------------------------------------
  // DYNAMIC CHART RENDERING (PLOTLY)
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!chartRef.current || columns.length < 2 || scenarios.length === 0) return;

    // Build the colors vector
    const colors = scenarios.map(scen => {
      const val = scen.values[colorColumnId];
      return val === undefined ? 0 : val;
    });

    // Build dimensions list for Plotly parcoords
    const dimensions = columns.map(col => {
      const vals = scenarios.map(s => {
        const val = s.values[col.id];
        return val === undefined ? 0 : val;
      });
      const min = Math.min(...vals, 0);
      const max = Math.max(...vals, 1);
      const padding = (max - min) * 0.05 || 1;

      return {
        label: `${col.name}${col.unit ? ` (${col.unit})` : ''}`,
        values: vals,
        range: col.inverted ? [max + padding, min - padding] : [min - padding, max + padding],
        constraintrange: activeConstraints[col.id] || undefined
      };
    });

    // Define the parallel coordinates trace
    const trace = {
      type: 'parcoords',
      line: {
        color: colors,
        colorscale: colorScale,
        showscale: true,
        reversescale: colorColumnId === 'op_cost' || colorColumnId === 'cap_cost', // invert cost color scale
        opacity: lineOpacity,
        colorbar: {
          title: {
            text: columns.find(c => c.id === colorColumnId)?.name || "",
            font: { color: '#94a3b8', size: 10 }
          },
          tickfont: { color: '#94a3b8', size: 9 },
          thickness: 12
        }
      },
      dimensions: dimensions
    };

    // Dark mode layout parameters
    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        color: '#f8fafc',
        family: 'Inter, sans-serif',
        size: fontSize
      },
      margin: { t: 50, b: 30, l: 60, r: 60 },
      height: 480,
      autosize: true
    };

    const config = {
      responsive: true,
      displayModeBar: false
    };

    // Render / update plot
    Plotly.newPlot(chartRef.current, [trace], layout, config);

    // RESTYLE LISTENER: Captures active selection filters in Plotly
    const handleRestyle = (eventData: any) => {
      // Parse restyle event structure to update selected filters
      const gd = chartRef.current;
      if (!gd) return;

      const pTrace = (gd as any).data[0];
      const constraints: Record<string, any> = {};

      pTrace.dimensions.forEach((dim: any, idx: number) => {
        const col = columns[idx];
        if (col && dim.constraintrange) {
          constraints[col.id] = dim.constraintrange;
        }
      });

      setActiveConstraints(constraints);
    };

    chartRef.current.on('plotly_restyle', handleRestyle);

    return () => {
      if (chartRef.current) {
        chartRef.current.removeAllListeners('plotly_restyle');
      }
    };
  }, [columns, scenarios, colorColumnId, colorScale, lineOpacity, fontSize]);

  // ----------------------------------------------------------------------
  // SCENARIO FILTER MATH (CLIENT SIDE)
  // ----------------------------------------------------------------------
  const isScenarioActive = (scen: Scenario) => {
    for (const col of columns) {
      const range = activeConstraints[col.id];
      if (!range) continue;
      const val = scen.values[col.id];
      if (val === undefined) return false;

      // Handle dual-range array vs single range
      if (Array.isArray(range[0])) {
        const matchesAny = range.some((r: [number, number]) => val >= r[0] && val <= r[1]);
        if (!matchesAny) return false;
      } else {
        if (val < range[0] || val > range[1]) return false;
      }
    }
    return true;
  };

  const activeScenarios = scenarios.filter(isScenarioActive);

  // ----------------------------------------------------------------------
  // MULTI-OBJECTIVE TRADEOFF OPTIMIZER
  // ----------------------------------------------------------------------
  const getBestScenario = () => {
    if (activeScenarios.length === 0) return null;

    let best: Scenario | null = null;
    let bestScore = -Infinity;

    activeScenarios.forEach(scen => {
      const inputVal = scen.values[optInputColId] || 0;
      const outputVal = scen.values[optOutputColId] || 0;

      // Normalization ranges across active subset
      const inputVals = activeScenarios.map(s => s.values[optInputColId] || 0);
      const outputVals = activeScenarios.map(s => s.values[optOutputColId] || 0);
      
      const maxIn = Math.max(...inputVals, 1);
      const minIn = Math.min(...inputVals, 0);
      const maxOut = Math.max(...outputVals, 1);
      const minOut = Math.min(...outputVals, 0);

      // Scale between 0 and 1
      const normInput = (maxIn - minIn) !== 0 ? (inputVal - minIn) / (maxIn - minIn) : 0.5;
      const normOutput = (maxOut - minOut) !== 0 ? (outputVal - minOut) / (maxOut - minOut) : 0.5;

      // Score: Maximize output, Minimize input
      const inputFactor = optInputMode === 'min' ? (1 - normInput) : normInput;
      const outputFactor = optOutputMode === 'max' ? normOutput : (1 - normOutput);

      // Simple objective weighting: 50% input penalty, 50% output gain
      const score = (inputFactor * 0.5) + (outputFactor * 0.5);

      if (score > bestScore) {
        bestScore = score;
        best = scen;
      }
    });

    return best;
  };

  const bestScenario = getBestScenario();

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased overflow-hidden">
      
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center space-x-4">
          <a 
            href="../../index.html" 
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition duration-200 border border-slate-700/50 flex items-center justify-center shrink-0 cursor-pointer"
            title="Back to Portal"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] font-extrabold tracking-[0.2em] text-indigo-400 uppercase leading-none mb-1">
                Armstrong International
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white leading-tight">Parallel Coordinate Plotter</h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Visualize high-dimensional engineering tradeoffs and scenario design spaces</p>
          </div>
        </div>

        {/* Presets & Actions */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-slate-400">Preset:</span>
          <select 
            value={selectedPresetKey}
            onChange={(e) => handleLoadPreset(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 font-medium focus:outline-none focus:border-slate-600"
          >
            <option value="heatPump">Heat Pump Sweep</option>
            <option value="pinchAnalysis">Pinch Target Sweep</option>
          </select>

          <div className="h-5 w-px bg-slate-800"></div>

          <button 
            onClick={handleExportCSV}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded flex items-center space-x-1.5 transition duration-200 cursor-pointer font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <label className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded flex items-center space-x-1.5 transition duration-200 cursor-pointer font-medium">
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleImportCSV} 
              className="hidden" 
            />
          </label>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        
        {/* Left Panel: Variable list and Scenario table */}
        <div className="w-[45%] border-r border-slate-800 bg-slate-950 flex flex-col min-w-[420px] max-w-[650px] relative">
          
          {/* Top: Variable Configuration list */}
          <div className="p-4 border-b border-slate-900 flex-1 flex flex-col min-h-0 overflow-y-auto">
            <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 flex items-center justify-between">
              <span>Variables Configurator (Axes)</span>
              <span className="text-[10px] text-slate-600 lowercase font-normal">adjust default axis order using chevrons</span>
            </h2>

            {/* List */}
            <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-1">
              {columns.map((col, idx) => (
                <div key={col.id} className="flex items-center justify-between bg-slate-900/40 border border-slate-900 hover:border-slate-850 px-2 py-1.5 rounded-lg transition">
                  <div className="flex items-center space-x-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${col.type === 'input' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                    <span className="text-xs font-semibold text-slate-200">{col.name}</span>
                    {col.unit && <span className="text-[10px] text-slate-500">[{col.unit}]</span>}
                  </div>

                  <div className="flex items-center space-x-1">
                    <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold tracking-wider ${col.type === 'input' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/50' : 'bg-emerald-950 text-emerald-400 border border-emerald-900/50'}`}>
                      {col.type}
                    </span>

                    {/* Move columns */}
                    <button 
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, 'up')}
                      className="p-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button 
                      disabled={idx === columns.length - 1}
                      onClick={() => handleMoveColumn(idx, 'down')}
                      className="p-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {/* Invert column range */}
                    <button 
                      onClick={() => handleToggleInvertColumn(col.id)}
                      className={`p-1 hover:bg-slate-800 rounded cursor-pointer ${col.inverted ? 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                      title="Invert axis values"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </button>

                    <div className="w-px h-4 bg-slate-800 mx-1"></div>

                    {/* Delete column */}
                    <button 
                      onClick={() => handleDeleteColumn(col.id)}
                      className="p-1 hover:bg-slate-800 text-slate-500 hover:text-red-400 rounded cursor-pointer"
                      title="Delete variable"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleAddColumn} className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-900">
              <input 
                type="text" 
                placeholder="New axis name..." 
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-xs rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700"
              />
              <div className="flex space-x-1.5">
                <select
                  value={newColType}
                  onChange={e => setNewColType(e.target.value as 'input' | 'output')}
                  className="bg-slate-900 border border-slate-800 text-xs rounded px-1.5 py-1.5 text-slate-300 focus:outline-none focus:border-slate-700 flex-1"
                >
                  <option value="input">Input</option>
                  <option value="output">Output</option>
                </select>
                <input 
                  type="text" 
                  placeholder="Unit..." 
                  value={newColUnit}
                  onChange={e => setNewColUnit(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-xs rounded px-1 w-12 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700 text-center"
                />
              </div>
              <button 
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold py-1.5 cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variable</span>
              </button>
            </form>
          </div>

          {/* Bottom: Scenario values spreadsheet */}
          <div className="h-[55%] flex flex-col min-h-0 bg-slate-950/80">
            <div className="p-4 border-t border-b border-slate-900 bg-slate-950 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center space-x-2">
                <span>Scenario Database</span>
                <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded font-mono text-slate-400 font-normal">
                  {scenarios.length} cases
                </span>
              </h2>

              <div className="flex items-center space-x-1.5">
                <button 
                  onClick={handleCopyTableToClipboard}
                  className="px-2 py-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px] border border-slate-850 flex items-center space-x-1 transition cursor-pointer"
                  title="Copy table to clipboard (Excel compatible)"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Table</span>
                </button>
                <button 
                  onClick={handleRandomizeScenario}
                  className="px-2 py-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[10px] border border-slate-850 flex items-center space-x-1 transition cursor-pointer"
                  title="Randomize scenario values"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Scatter Vals</span>
                </button>
                <button 
                  onClick={handleClearAllScenarios}
                  className="px-2 py-1 hover:bg-red-950/45 text-red-400 hover:text-red-300 border border-red-900/30 hover:border-red-900/50 rounded text-[10px] flex items-center space-x-1 transition cursor-pointer"
                  title="Delete all cases"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
                <button 
                  onClick={handleAddScenario}
                  className="px-2 py-1 bg-indigo-950 hover:bg-indigo-900 text-indigo-400 border border-indigo-900/30 rounded text-[10px] flex items-center space-x-1 transition cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Case</span>
                </button>
              </div>
            </div>

            {/* Spreadsheet Grid */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[500px]">
                <thead className="bg-slate-900/60 sticky top-0 z-10 border-b border-slate-900">
                  <tr>
                    <th className="p-2 font-bold text-slate-400 min-w-[130px] border-r border-slate-900">Case Name</th>
                    {columns.map(col => (
                      <th key={col.id} className="p-2 font-bold text-slate-400 text-center min-w-[110px] border-r border-slate-900">
                        <div className="flex flex-col items-center justify-center">
                          <div className="flex items-center space-x-1 justify-center">
                            <span>{col.name}</span>
                            <button
                              onClick={() => handleToggleInvertColumn(col.id)}
                              className={`p-1 rounded hover:bg-slate-800 transition cursor-pointer ${col.inverted ? 'text-indigo-400' : 'text-slate-650 hover:text-slate-400'}`}
                              title={col.inverted ? "Inverted axis (click to restore)" : "Normal axis (click to invert)"}
                            >
                              <ArrowUpDown className="w-3 h-3" />
                            </button>
                          </div>
                          {col.unit && <div className="text-[9px] text-slate-600 mt-0.5">({col.unit})</div>}
                        </div>
                      </th>
                    ))}
                    <th className="p-2 text-slate-400 text-center w-10">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/40">
                  {scenarios.map((scen, rIdx) => {
                    const isActive = isScenarioActive(scen);
                    return (
                      <tr 
                        key={scen.id} 
                        className={`hover:bg-slate-900/20 transition duration-150 ${
                          !isActive ? 'opacity-30 grayscale-[30%] bg-slate-950/40' : rIdx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/5'
                        }`}
                      >
                        {/* Name Cell */}
                        <td className="p-1 border-r border-slate-900">
                          <input 
                            type="text" 
                            value={scen.name}
                            onChange={e => handleNameChange(scen.id, e.target.value)}
                            onPaste={e => handlePasteCell(e, scen.id, 'name')}
                            className="bg-transparent w-full font-medium text-slate-200 focus:bg-slate-900 px-1 py-0.5 rounded focus:outline-none"
                          />
                        </td>
                        
                        {/* Numeric Cells */}
                        {columns.map(col => (
                          <td key={col.id} className="p-1 border-r border-slate-900">
                            <input 
                              type="number" 
                              step="any"
                              value={scen.values[col.id] === undefined ? "" : scen.values[col.id]}
                              onChange={e => handleCellChange(scen.id, col.id, e.target.value)}
                              onPaste={e => handlePasteCell(e, scen.id, col.id)}
                              className="bg-transparent w-full text-center font-mono text-slate-300 focus:bg-slate-900 px-1 py-0.5 rounded focus:outline-none"
                            />
                          </td>
                        ))}

                        {/* Delete Row */}
                        <td className="p-1 text-center">
                          <button 
                            onClick={() => handleDeleteScenario(scen.id)}
                            className="p-1 hover:bg-slate-800 text-slate-500 hover:text-red-500 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Plot and multi-objective selector */}
        <div className="flex-1 bg-slate-950 p-5 flex flex-col justify-between overflow-y-auto">
          
          {/* Top: Plot controls */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between backdrop-blur">
            <div className="flex flex-wrap gap-4 items-center">
              
              {/* Color grading dimension */}
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Color Grade Axis</span>
                <select 
                  value={colorColumnId}
                  onChange={(e) => setColorColumnId(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-slate-750"
                >
                  {columns.map(col => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
              </div>

              {/* Color scale style */}
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Color Scale Palette</span>
                <select 
                  value={colorScale}
                  onChange={(e) => setColorScale(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-slate-750"
                >
                  {COLOR_SCALES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Opacity slider */}
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Line Opacity</span>
                  <span className="font-mono text-slate-400">{(lineOpacity * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1.0" 
                  step="0.05"
                  value={lineOpacity}
                  onChange={e => setLineOpacity(parseFloat(e.target.value))}
                  className="w-28 h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Font Size slider */}
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>Font Size</span>
                  <span className="font-mono text-slate-400">{fontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="8" 
                  max="18" 
                  step="1"
                  value={fontSize}
                  onChange={e => setFontSize(parseInt(e.target.value))}
                  className="w-28 h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-white"
                />
              </div>
            </div>

            {/* Filter Reset */}
            {Object.keys(activeConstraints).length > 0 && (
              <button 
                onClick={() => setActiveConstraints({})}
                className="px-3 py-1.5 bg-indigo-950 hover:bg-indigo-900 border border-indigo-900 text-indigo-400 text-xs rounded-lg transition duration-200 cursor-pointer flex items-center space-x-1.5 font-bold shadow-sm"
              >
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>Reset Axis Filters</span>
              </button>
            )}
          </div>

          {/* Center: Plot Container */}
          <div className="flex-1 w-full bg-slate-950 border border-slate-900/60 rounded-3xl p-3 my-4 relative min-h-[400px] flex items-center justify-center">
            {scenarios.length === 0 ? (
              <div className="text-center text-slate-650 p-6">
                <Sliders className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-semibold">No scenarios available.</p>
                <p className="text-xs mt-1">Please add scenarios or load a preset dataset.</p>
              </div>
            ) : (
              <div id="plotly-parcoords" ref={chartRef} className="w-full h-full" />
            )}
          </div>

          {/* Bottom: Tradeoff Analytics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Box 1: Selection Status */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>Design Space Filtering</span>
                </h3>
                <p className="text-xs text-slate-500">Drag ranges along vertical axes on the graph above to isolate scenario tradeoffs.</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-900/80 pt-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Scenarios Matching Filters</span>
                  <span className="font-mono text-lg font-bold text-white mt-0.5">
                    {activeScenarios.length} / {scenarios.length}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Volume Retained</span>
                  <span className="font-mono text-lg font-bold text-indigo-400 mt-0.5 block">
                    {((activeScenarios.length / scenarios.length) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Box 2: Tradeoff Solver (Multi-Objective Optimization) */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-1 flex items-center space-x-2">
                  <Play className="w-4 h-4 text-emerald-400" />
                  <span>Tradeoff Target Optimizer</span>
                </h3>
                
                {/* Optimization Config */}
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 mt-1">
                  <span>Minimize</span>
                  <select 
                    value={optInputColId} 
                    onChange={e => setOptInputColId(e.target.value)}
                    className="bg-slate-950 border border-slate-900 rounded px-1.5 py-0.5 text-slate-200"
                  >
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span>& Maximize</span>
                  <select 
                    value={optOutputColId} 
                    onChange={e => setOptOutputColId(e.target.value)}
                    className="bg-slate-950 border border-slate-900 rounded px-1.5 py-0.5 text-slate-200"
                  >
                    {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Best Scenario Selection */}
              <div className="mt-3 flex items-center justify-between border-t border-slate-900/80 pt-3">
                {bestScenario ? (
                  <>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Optimal Filtered Case</span>
                      <span className="font-semibold text-xs text-emerald-400 mt-0.5 truncate max-w-[170px]" title={bestScenario.name}>
                        {bestScenario.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Trade-off Score</span>
                      <span className="font-mono text-sm font-bold text-white mt-0.5 block">
                        {(bestScenario.values[optOutputColId] / (bestScenario.values[optInputColId] || 1)).toFixed(2)} ratio
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-slate-600 text-xs py-1">No active scenarios match filter constraints.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
