export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

export function makeMailer(): Mailer {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_EMAIL_FROM ?? "admin@tcabr.local";
  if (!key) {
    return {
      async send(to, subject, text) {
        // Dev fallback: log to stdout so the operator can copy-paste the link.
        console.log(`[DEV EMAIL] to=${to} subject=${subject}\n${text}`);
      },
    };
  }
  return {
    async send(to, subject, text) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!r.ok) throw new Error(`email send failed: ${r.status}`);
    },
  };
}
