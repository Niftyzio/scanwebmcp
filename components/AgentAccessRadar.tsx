export type AccessTreatment = "allowed" | "default" | "blocked" | "unmeasured";

export interface AccessAxis {
  label: string;
  detail: string;
  treatment: AccessTreatment;
}

const CENTRE = { x: 150, y: 126 };
const AXES = [
  { x: 150, y: 28, labelX: 150, labelY: 15, anchor: "middle" as const },
  { x: 235, y: 77, labelX: 246, labelY: 73, anchor: "start" as const },
  { x: 235, y: 175, labelX: 246, labelY: 184, anchor: "start" as const },
  { x: 150, y: 224, labelX: 150, labelY: 247, anchor: "middle" as const },
  { x: 65, y: 175, labelX: 54, labelY: 184, anchor: "end" as const },
  { x: 65, y: 77, labelX: 54, labelY: 73, anchor: "end" as const },
];

const TREATMENT_SCORE: Record<AccessTreatment, number> = {
  allowed: 100,
  default: 76,
  blocked: 8,
  unmeasured: 0,
};

function ringPoints(ratio: number) {
  return AXES.map((axis) => {
    const x = CENTRE.x + (axis.x - CENTRE.x) * ratio;
    const y = CENTRE.y + (axis.y - CENTRE.y) * ratio;
    return `${x},${y}`;
  }).join(" ");
}

export default function AgentAccessRadar({ axes, className = "" }: { axes: AccessAxis[]; className?: string }) {
  const visibleAxes = axes.slice(0, AXES.length);
  const points = AXES.map((axis, index) => {
    const score = TREATMENT_SCORE[visibleAxes[index]?.treatment ?? "unmeasured"] / 100;
    return {
      x: CENTRE.x + (axis.x - CENTRE.x) * score,
      y: CENTRE.y + (axis.y - CENTRE.y) * score,
    };
  });
  const ariaLabel = visibleAxes.map((axis) => `${axis.label}: ${axis.detail}`).join("; ");

  return (
    <svg className={`access-radar ${className}`.trim()} viewBox="0 0 300 260" role="img" aria-label={ariaLabel}>
      <g className="radar-grid">
        <polygon points={ringPoints(1)} />
        <polygon points={ringPoints(0.66)} />
        <polygon points={ringPoints(0.33)} />
        {AXES.map((axis, index) => (
          <line key={index} x1={CENTRE.x} y1={CENTRE.y} x2={axis.x} y2={axis.y} />
        ))}
      </g>
      <polygon className="radar-value" points={points.map(({ x, y }) => `${x},${y}`).join(" ")} />
      <g className="radar-points">
        {points.map(({ x, y }, index) => {
          const data = visibleAxes[index];
          return (
            <circle key={data?.label ?? index} className={`access-${data?.treatment ?? "unmeasured"}`} cx={x} cy={y} r="4.5">
              {data && <title>{`${data.label}: ${data.detail}`}</title>}
            </circle>
          );
        })}
      </g>
      <g className="radar-labels">
        {AXES.map((axis, index) => (
          <text key={visibleAxes[index]?.label ?? index} x={axis.labelX} y={axis.labelY} textAnchor={axis.anchor}>
            {visibleAxes[index]?.label ?? "Unmeasured"}
          </text>
        ))}
      </g>
    </svg>
  );
}
