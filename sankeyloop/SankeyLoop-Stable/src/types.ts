export interface Flow {
  Source: string;
  Target: string;
  Value: string;
  Color: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface Scenario {
  flows: Flow[];
  nodeColorOverrides: Record<string, string>;
  nodePositions: Record<string, NodePosition>;
  hasDraggedNodes: boolean;
  nodeSpacing?: number;
  nativePositions?: Record<string, NodePosition>;
}

export interface Config {
  orientation: 'h' | 'v';
  highVal: number;
  hotHighCol: string;
  hotLowCol: string;
  midVal: number;
  coldHighCol: string;
  coldLowCol: string;
  lowVal: number;
  nodeAlignment: 'justify' | 'left' | 'center' | 'right';
  nodeArrangement: 'snap' | 'perpendicular' | 'freeform';
  vMargin: number;
  hMargin: number;
  nodeSpacing: number;
  nodeThickness: number;
  linkOpacity: number;
  ghostOpacity: number;
  arrowSize: number;
  labelSize: number;
  labelColor: string;
  defaultNodeColor: string;
  figWidth: number;
  figHeight: number;
  valueUnit: string;
  gradUnit: string;
  gradGap: number;
  aspectRatio: 'fit' | '16:9' | '4:3' | '1:1' | 'custom';
  theme: 'light' | 'dark';
  bgColor: string;
}
