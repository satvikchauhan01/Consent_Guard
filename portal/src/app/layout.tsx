import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConsentGuard — Hospital Portal",
  description: "Dynamic Consent Management System - Reference Consumer Application",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
