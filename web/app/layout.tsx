import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PromptWars x UVCE",
  description: "8-hour build sprint prototype",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
