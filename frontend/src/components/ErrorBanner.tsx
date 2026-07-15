interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div className="banner banner--error" role="alert">
      {message}
    </div>
  );
}
