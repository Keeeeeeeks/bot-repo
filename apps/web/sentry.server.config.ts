import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      for (const k of Object.keys(event.request.headers)) {
        if (k.toLowerCase() === "authorization" || k.toLowerCase() === "cookie") {
          delete event.request.headers[k];
        }
      }
    }
    return event;
  },
});
