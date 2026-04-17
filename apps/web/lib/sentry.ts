import * as Sentry from "@sentry/nextjs";

export function captureError(err: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(err, { extra: context });
}
