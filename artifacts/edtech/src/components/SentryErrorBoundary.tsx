import { Sentry } from "@/lib/sentry";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const { ErrorBoundary } = Sentry;

function FallbackUI({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            An unexpected error occurred. The error has been reported automatically.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 text-left text-xs bg-muted rounded-lg p-4 overflow-auto max-h-40 text-destructive">
              {error.message}
            </pre>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={resetError} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Try Again
          </Button>
          <Button variant="outline" onClick={() => window.location.href = "/"}>
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary fallback={({ error, resetError }) => (
      <FallbackUI error={error as Error} resetError={resetError} />
    )}>
      {children}
    </ErrorBoundary>
  );
}
