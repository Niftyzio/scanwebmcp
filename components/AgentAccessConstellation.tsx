export type AccessTreatment = "allowed" | "default" | "blocked" | "unmeasured";

export interface AccessAxis {
  label: string;
  detail: string;
  treatment: AccessTreatment;
}

const CENTRE = { x: 170, y: 148 };
const NODES = [
  { x: 170, y: 48, labelX: 170, labelY: 18, anchor: "middle" as const },
  { x: 260, y: 96, labelX: 282, labelY: 91, anchor: "start" as const },
  { x: 260, y: 200, labelX: 282, labelY: 205, anchor: "start" as const },
  { x: 170, y: 248, labelX: 170, labelY: 284, anchor: "middle" as const },
  { x: 80, y: 200, labelX: 58, labelY: 205, anchor: "end" as const },
  { x: 80, y: 96, labelX: 58, labelY: 91, anchor: "end" as const },
];

const TREATMENT_SYMBOL: Record<AccessTreatment, string> = {
  allowed: "✓",
  default: "•",
  blocked: "×",
  unmeasured: "?",
};

export default function AgentAccessConstellation({
  axes,
  className = "",
}: {
  axes: AccessAxis[];
  className?: string;
}) {
  const visibleAxes = axes.slice(0, NODES.length);
  const ariaLabel = visibleAxes.map((axis) => `${axis.label}: ${axis.detail}`).join("; ");

  return (
    <svg
      className={`access-constellation ${className}`.trim()}
      viewBox="0 0 340 300"
      role="img"
      aria-label={ariaLabel}
    >
      <circle className="access-orbit" cx={CENTRE.x} cy={CENTRE.y} r="101" />
      <g className="access-spokes">
        {NODES.map((node, index) => (
          <line key={index} x1={CENTRE.x} y1={CENTRE.y} x2={node.x} y2={node.y} />
        ))}
      </g>
      <g className="access-centre">
        <circle cx={CENTRE.x} cy={CENTRE.y} r="26" />
        <circle cx={CENTRE.x} cy={CENTRE.y - 4} r="4" />
        <text x={CENTRE.x} y={CENTRE.y + 12} textAnchor="middle">SITE</text>
      </g>
      <g className="access-nodes">
        {NODES.map((node, index) => {
          const data = visibleAxes[index] ?? {
            label: "Unmeasured",
            detail: "not measured in this scan",
            treatment: "unmeasured" as const,
          };
          return (
            <g key={`${data.label}-${index}`} className={`access-node is-${data.treatment}`}>
              <circle className="access-node-halo" cx={node.x} cy={node.y} r="15">
                <title>{`${data.label}: ${data.detail}`}</title>
              </circle>
              <circle className="access-node-dot" cx={node.x} cy={node.y} r="10" />
              <text className="access-node-symbol" x={node.x} y={node.y + 4} textAnchor="middle">
                {TREATMENT_SYMBOL[data.treatment]}
              </text>
            </g>
          );
        })}
      </g>
      <g className="access-node-labels">
        {NODES.map((node, index) => (
          <text
            key={visibleAxes[index]?.label ?? index}
            x={node.labelX}
            y={node.labelY}
            textAnchor={node.anchor}
          >
            {visibleAxes[index]?.label ?? "Unmeasured"}
          </text>
        ))}
      </g>
    </svg>
  );
}
