interface WarningsBannerProps {
  warnings: string[];
}

export function WarningsBanner({ warnings }: WarningsBannerProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="banner banner--warning" role="alert">
      <strong>Warnings</strong>
      <ul>
        {warnings.map((warning, index) => (
          <li key={`${index}-${warning}`}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
