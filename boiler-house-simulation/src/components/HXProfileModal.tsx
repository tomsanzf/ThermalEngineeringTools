import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { ClampedNumericInput } from '../App';

interface ProfilePoint {
  pct: number;
  tHot: number;
  tCold: number;
}

interface HXProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfilePoint[];
  tDew: number;
  condPinch: number;
  bindingConstraint: string;
  ecoFlueTempOutClamped: number;
  condenserInputMode: 'dtmin' | 't14';
  onPinchChange: (val: number) => void;
  onExitTempChange: (val: number) => void;
}

export const HXProfileModal: React.FC<HXProfileModalProps> = ({
  isOpen,
  onClose,
  profileData,
  tDew,
  condPinch,
  bindingConstraint,
  ecoFlueTempOutClamped,
  condenserInputMode,
  onPinchChange,
  onExitTempChange
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!isOpen || !profileData || profileData.length === 0) return null;

  // Chart layout dimensions
  const svgWidth = 640;
  const svgHeight = 400;
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 40;
  const paddingBottom = 60;

  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  // Temperature ranges
  const allTemps = profileData.flatMap(p => [p.tHot, p.tCold]);
  const minT = Math.min(...allTemps);
  const maxT = Math.max(...allTemps);
  const yMin = Math.max(0, Math.floor(minT / 10) * 10 - 10);
  const yMax = Math.ceil(maxT / 10) * 10 + 10;

  // Coordinate conversion helper functions
  const getX = (pct: number) => paddingLeft + (pct / 100) * plotWidth;
  const getY = (temp: number) => paddingBottom + plotHeight - ((temp - yMin) / (yMax - yMin)) * plotHeight;

  // Find the exact pinch point (minimum delta T) in the profile data
  let minDiff = Infinity;
  let pinchIdx = 0;
  profileData.forEach((p, idx) => {
    const diff = p.tHot - p.tCold;
    if (diff < minDiff) {
      minDiff = diff;
      pinchIdx = idx;
    }
  });
  const pinchPoint = profileData[pinchIdx];

  // Draw paths
  const hotPath = profileData
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.pct)} ${getY(p.tHot)}`)
    .join(' ');

  const coldPath = profileData
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(p.pct)} ${getY(p.tCold)}`)
    .join(' ');

  // Hover mouse interaction handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Convert screen coordinates back to percentage
    const pct = ((mouseX - paddingLeft) / plotWidth) * 100;
    
    // Find closest index in profileData
    let closestIdx = 0;
    let minDist = Infinity;
    profileData.forEach((p, idx) => {
      const dist = Math.abs(p.pct - pct);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    if (pct >= -5 && pct <= 105) {
      setHoverIndex(closestIdx);
    } else {
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // Generate grid ticks
  const xTicks = [0, 20, 40, 60, 80, 100];
  const yTicks: number[] = [];
  const yStep = (yMax - yMin) <= 60 ? 10 : 20;
  for (let t = yMin; t <= yMax; t += yStep) {
    yTicks.push(t);
  }

  // Hover point info
  const hoverPoint = hoverIndex !== null ? profileData[hoverIndex] : null;

  // Helper to render an arrowhead triangle pointing along the slope
  const renderArrow = (cx: number, cy: number, angleRad: number, color: string) => {
    const angleDeg = (angleRad * 180) / Math.PI;
    return (
      <polygon
        points="5,0 -5,-3.5 -2,0 -5,3.5"
        fill={color}
        stroke="none"
        transform={`translate(${cx}, ${cy}) rotate(${angleDeg})`}
      />
    );
  };

  // Indices to place arrowheads along the 51-point path
  const idx1 = 12; // ~24% path length
  const idx2 = 38; // ~76% path length

  // Compute angles & coordinates for hot stream (orange, flowing left-to-right)
  const x1_hot = getX(profileData[idx1].pct);
  const y1_hot = getY(profileData[idx1].tHot);
  const dx1_hot = getX(profileData[idx1+1].pct) - getX(profileData[idx1-1].pct);
  const dy1_hot = getY(profileData[idx1+1].tHot) - getY(profileData[idx1-1].tHot);
  const angle1_hot = Math.atan2(dy1_hot, dx1_hot);

  const x2_hot = getX(profileData[idx2].pct);
  const y2_hot = getY(profileData[idx2].tHot);
  const dx2_hot = getX(profileData[idx2+1].pct) - getX(profileData[idx2-1].pct);
  const dy2_hot = getY(profileData[idx2+1].tHot) - getY(profileData[idx2-1].tHot);
  const angle2_hot = Math.atan2(dy2_hot, dx2_hot);

  // Compute angles & coordinates for cold stream (blue, flowing counter-current: right-to-left)
  const x1_cold = getX(profileData[idx1].pct);
  const y1_cold = getY(profileData[idx1].tCold);
  const dx1_cold = getX(profileData[idx1+1].pct) - getX(profileData[idx1-1].pct);
  const dy1_cold = getY(profileData[idx1+1].tCold) - getY(profileData[idx1-1].tCold);
  const angle1_cold = Math.atan2(dy1_cold, dx1_cold) + Math.PI;

  const x2_cold = getX(profileData[idx2].pct);
  const y2_cold = getY(profileData[idx2].tCold);
  const dx2_cold = getX(profileData[idx2+1].pct) - getX(profileData[idx2-1].pct);
  const dy2_cold = getY(profileData[idx2+1].tCold) - getY(profileData[idx2-1].tCold);
  const angle2_cold = Math.atan2(dy2_cold, dx2_cold) + Math.PI;

  return (
    <div 
      className="modal-backdrop" 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div 
        className="modal-content" 
        style={{
          backgroundColor: '#1e293b',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)',
          width: '680px',
          padding: '1.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          color: '#e6edf3'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer'
          }}
        >
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
          Condenser Temperature Profile
        </h3>
        
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
          Shows the counter-current heat exchange curves inside the condensing stack recovery unit.
          The pinch point is bound by: <strong style={{ color: '#38bdf8' }}>{bindingConstraint}</strong>.
        </p>

        {/* Interactive Inputs Row */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '1rem', 
          backgroundColor: '#0f172a', 
          padding: '0.75rem 1rem', 
          borderRadius: '6px', 
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: condenserInputMode === 'dtmin' ? 'bold' : 'normal' }}>
              Pinch (deltaTmin) {condenserInputMode === 'dtmin' ? '★' : ''}
            </label>
            <div className="input-with-unit" style={{ display: 'flex', alignItems: 'center' }}>
              <ClampedNumericInput
                step="0.5"
                min={0.1}
                max={50}
                value={Number(condPinch.toFixed(1))}
                onChange={onPinchChange}
              />
              <span className="form-unit" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>K</span>
            </div>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: condenserInputMode === 't14' ? 'bold' : 'normal' }}>
              Stack Exit Temp {condenserInputMode === 't14' ? '★' : ''}
            </label>
            <div className="input-with-unit" style={{ display: 'flex', alignItems: 'center' }}>
              <ClampedNumericInput
                step="1"
                min={15}
                max={150}
                value={Number(ecoFlueTempOutClamped.toFixed(1))}
                onChange={onExitTempChange}
              />
              <span className="form-unit" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>°C</span>
            </div>
          </div>
        </div>

        {/* Custom SVG Chart */}
        <div style={{ backgroundColor: '#0f172a', borderRadius: '6px', padding: '0.5rem', overflow: 'hidden' }}>
          <svg 
            ref={svgRef}
            width="100%" 
            height={svgHeight} 
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ cursor: 'crosshair', userSelect: 'none' }}
          >
            {/* Grid Lines */}
            {yTicks.map(t => (
              <g key={t}>
                <line 
                  x1={paddingLeft} 
                  y1={getY(t)} 
                  x2={svgWidth - paddingRight} 
                  y2={getY(t)} 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeWidth="1"
                />
                <text 
                  x={paddingLeft - 8} 
                  y={getY(t) + 4} 
                  fill="#64748b" 
                  fontSize="10" 
                  textAnchor="end"
                >
                  {t}
                </text>
              </g>
            ))}

            {xTicks.map(pct => (
              <g key={pct}>
                <line 
                  x1={getX(pct)} 
                  y1={paddingTop} 
                  x2={getX(pct)} 
                  y2={svgHeight - paddingBottom} 
                  stroke="rgba(255,255,255,0.05)" 
                  strokeWidth="1"
                />
                <text 
                  x={getX(pct)} 
                  y={svgHeight - paddingBottom + 16} 
                  fill="#64748b" 
                  fontSize="10" 
                  textAnchor="middle"
                >
                  {pct}%
                </text>
              </g>
            ))}

            {/* Axes Labels */}
            <text 
              x={paddingLeft + plotWidth / 2} 
              y={svgHeight - paddingBottom + 36} 
              fill="#94a3b8" 
              fontSize="11" 
              textAnchor="middle"
              fontWeight="bold"
            >
              % Heat Transferred
            </text>

            <text 
              x="16" 
              y={paddingTop + plotHeight / 2} 
              transform={`rotate(-90 16 ${paddingTop + plotHeight / 2})`}
              fill="#94a3b8" 
              fontSize="11" 
              textAnchor="middle"
              fontWeight="bold"
            >
              Temperature (°C)
            </text>

            {/* Dew Point Line annotation */}
            {tDew >= yMin && tDew <= yMax && (
              <g>
                <line 
                  x1={paddingLeft} 
                  y1={getY(tDew)} 
                  x2={svgWidth - paddingRight} 
                  y2={getY(tDew)} 
                  stroke="#fbbf24" 
                  strokeWidth="1" 
                  strokeDasharray="2 4"
                  opacity="0.3"
                />
                <text 
                  x={svgWidth - paddingRight - 8} 
                  y={getY(tDew) - 4} 
                  fill="#fbbf24" 
                  fontSize="9" 
                  textAnchor="end"
                  opacity="0.6"
                >
                  Dew Point ({tDew.toFixed(1)} °C)
                </text>
              </g>
            )}

            {/* Curves */}
            <path 
              d={coldPath} 
              fill="none" 
              stroke="#38bdf8" 
              strokeWidth="2.5" 
              strokeDasharray="4 4"
            />
            <path 
              d={hotPath} 
              fill="none" 
              stroke="#ff7c2a" 
              strokeWidth="2.5" 
            />

            {/* Directional Arrowheads */}
            {renderArrow(x1_hot, y1_hot, angle1_hot, "#ff7c2a")}
            {renderArrow(x2_hot, y2_hot, angle2_hot, "#ff7c2a")}
            {renderArrow(x1_cold, y1_cold, angle1_cold, "#38bdf8")}
            {renderArrow(x2_cold, y2_cold, angle2_cold, "#38bdf8")}

            {/* Pinch Point Highlight */}
            <g>
              <line 
                x1={getX(pinchPoint.pct)} 
                y1={getY(pinchPoint.tHot)} 
                x2={getX(pinchPoint.pct)} 
                y2={getY(pinchPoint.tCold)} 
                stroke="#c084fc" 
                strokeWidth="1.5" 
                strokeDasharray="2 2"
              />
              <circle cx={getX(pinchPoint.pct)} cy={getY(pinchPoint.tHot)} r="4" fill="#ff7c2a" stroke="#c084fc" strokeWidth="1" />
              <circle cx={getX(pinchPoint.pct)} cy={getY(pinchPoint.tCold)} r="4" fill="#38bdf8" stroke="#c084fc" strokeWidth="1" />
              <text 
                x={getX(pinchPoint.pct) + (pinchPoint.pct > 70 ? -8 : 8)} 
                y={(getY(pinchPoint.tHot) + getY(pinchPoint.tCold)) / 2 + 3} 
                fill="#c084fc" 
                fontSize="10" 
                fontWeight="bold"
                textAnchor={pinchPoint.pct > 70 ? "end" : "start"}
              >
                dTmin: {condPinch.toFixed(1)} K ({pinchPoint.pct.toFixed(0)}%)
              </text>
            </g>

            {/* Interactive Hover Line & Info Card */}
            {hoverPoint && (
              <g>
                <line 
                  x1={getX(hoverPoint.pct)} 
                  y1={paddingTop} 
                  x2={getX(hoverPoint.pct)} 
                  y2={svgHeight - paddingBottom} 
                  stroke="#94a3b8" 
                  strokeWidth="1.2" 
                  strokeDasharray="3 3"
                />
                
                {/* Dots at intersection */}
                <circle cx={getX(hoverPoint.pct)} cy={getY(hoverPoint.tHot)} r="5" fill="#ff7c2a" />
                <circle cx={getX(hoverPoint.pct)} cy={getY(hoverPoint.tCold)} r="5" fill="#38bdf8" />
                
                {/* Overlay Tooltip inside SVG */}
                <g transform={`translate(${getX(hoverPoint.pct) + (hoverPoint.pct > 50 ? -135 : 15)}, ${paddingTop + 10})`}>
                  <rect 
                    width="120" 
                    height="76" 
                    rx="4" 
                    fill="rgba(15,23,42,0.9)" 
                    stroke="rgba(255,255,255,0.12)" 
                    strokeWidth="1"
                  />
                  <text x="8" y="16" fill="#e6edf3" fontSize="10" fontWeight="bold">Path: {hoverPoint.pct.toFixed(0)}%</text>
                  <text x="8" y="32" fill="#ff7c2a" fontSize="10">Flue Temp: {hoverPoint.tHot.toFixed(1)} °C</text>
                  <text x="8" y="48" fill="#38bdf8" fontSize="10">Water Temp: {hoverPoint.tCold.toFixed(1)} °C</text>
                  <text x="8" y="64" fill="#e2e8f0" fontSize="10" fontWeight="semibold">Diff: {(hoverPoint.tHot - hoverPoint.tCold).toFixed(1)} K</text>
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '4px', backgroundColor: '#ff7c2a' }}></span>
            <span>Flue Gas (Hot Stream)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '4px', borderTop: '2px dashed #38bdf8' }}></span>
            <span>Water (Cold Stream)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '0px', borderTop: '2px dotted #c084fc' }}></span>
            <span>Pinch Point (Approach)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
