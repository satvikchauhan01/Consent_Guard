import React from "react";

export default function HomePage() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        background: "radial-gradient(ellipse at top, #162032 0%, #0a0e17 70%)",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          width: "100%",
          backgroundColor: "rgba(18, 24, 38, 0.8)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          padding: "2.5rem",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}
        >
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              backgroundColor: "#10b981",
              boxShadow: "0 0 10px #10b981",
            }}
          />
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#10b981",
              textTransform: "uppercase",
            }}
          >
            Phase 0 — Monorepo Ready
          </span>
        </div>

        <h1
          style={{
            fontSize: "2.25rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
            background: "linear-gradient(135deg, #ffffff 0%, #94a3b8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          ConsentGuard Hospital Portal
        </h1>

        <p
          style={{
            color: "#94a3b8",
            fontSize: "1.05rem",
            lineHeight: 1.6,
            marginBottom: "2rem",
          }}
        >
          Reference consumer application for dynamic patient consent enforcement. Zero embedded
          permission logic — every action checks ConsentGuard Core.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{
              padding: "1rem",
              borderRadius: "10px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                marginBottom: "0.25rem",
              }}
            >
              Service Status
            </div>
            <div style={{ color: "#f1f5f9", fontWeight: 600 }}>Portal Workspace Active</div>
          </div>

          <div
            style={{
              padding: "1rem",
              borderRadius: "10px",
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <div
              style={{
                color: "#64748b",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                marginBottom: "0.25rem",
              }}
            >
              Core Connection
            </div>
            <div
              style={{
                color: "#38bdf8",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                fontSize: "0.9rem",
              }}
            >
              http://localhost:4000
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: "0.85rem",
            color: "#64748b",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: "1.25rem",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>ConsentGuard Monorepo Scaffold</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>Next.js 14 + Express + TypeScript</span>
        </div>
      </div>
    </main>
  );
}
