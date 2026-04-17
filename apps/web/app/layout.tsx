import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "To Catch A Bot Repo",
  description: "Is this repo's growth organic? Investigative analytics for GitHub stargazers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
