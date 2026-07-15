export type ConfidenceBucket = "High" | "Medium" | "Low";

/** High >= 0.75, Medium 0.5–0.74, Low < 0.5. */
export function bucketConfidence(confidence: number): ConfidenceBucket {
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.5) return "Medium";
  return "Low";
}

interface ConfidenceBadgeProps {
  confidence: number;
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const bucket = bucketConfidence(confidence);

  return (
    <span
      className={`confidence-badge confidence-badge--${bucket.toLowerCase()}`}
      title="Model self-assessment — not a calibrated probability."
    >
      {bucket} · {confidence.toFixed(2)}
    </span>
  );
}
