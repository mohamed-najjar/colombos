import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Colombos — Kube WSL Dashboard",
  description: "Visualize contexts & cluster info from your local kubeconfig (WSL-friendly).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="text-lg font-semibold tracking-wide">
              <span className="px-2 py-1 rounded-lg bg-neutral-800 border border-neutral-700 mr-2">🕵️‍♂️</span>
              Colombos
            </div>
            <div className="text-xs text-neutral-400">Kubernetes contexts & clusters (WSL)</div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
