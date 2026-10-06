import "./globals.css";
import "./landing.css";
import { headers } from "next/headers";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await headers()).get("x-snapmatch-locale") || "az";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
