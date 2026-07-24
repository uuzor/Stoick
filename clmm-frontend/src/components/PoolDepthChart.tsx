const bars = [34, 42, 58, 76, 88, 96, 82, 64, 51, 39, 28, 22, 31, 46, 62, 74, 69, 53];

export function PoolDepthChart() {
  return (
    <div className="depth-chart" aria-label="Pool depth visualization">
      <div className="depth-header">
        <span>Concentrated depth</span>
        <strong>Current tick 0</strong>
      </div>
      <div className="bars">
        {bars.map((height, index) => (
          <span
            className={index > 3 && index < 9 ? "active" : ""}
            key={`${height}-${index}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}
