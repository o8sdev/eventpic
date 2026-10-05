import "./globals.css";
import { headers } from "next/headers";
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await headers()).get("x-facefind-locale") || "az";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
