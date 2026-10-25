import React from 'react';

export function Solid({ paths, tone = 'hi', crease = 'faint', lit = false, flat = false, className = '' }) {
  return <g className={`iso-solid ${className}`.trim()} data-lit={lit ? '' : undefined}>
    <path className="iso-fill" d={paths.fill}/>
    {!flat && paths.shades.map((d, shade) => d ? <path key={shade} className="iso-shade" data-shade={shade} d={d}/> : null)}
    {!flat && <path className="iso-top" d={paths.top}/>}
    {crease !== 'none' && paths.crease && <path className="iso-line iso-crease" data-tone={crease} d={paths.crease}/>}
    {crease !== 'none' && paths.bevel && <path className="iso-line iso-bevel" data-tone={crease} d={paths.bevel}/>}
    <path className="iso-line iso-edge" data-tone={tone} d={paths.outline}/>
  </g>;
}

export function Line({ d, tone = 'lo', className = '', flow = false }) {
  if (!d) return null;
  return <path className={`iso-line ${className}`.trim()} data-tone={tone} data-flow={flow ? '' : undefined} d={d}/>;
}

export function Dots({ points, size = 0.5, tone = 'mid' }) {
  return <g className="iso-dots" data-tone={tone}>
    {points.map(([x, y], index) => <circle key={index} cx={Math.round(x * 10) / 10} cy={Math.round(y * 10) / 10} r={size}/>)}
  </g>;
}
