import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "./page.js";

describe("Portal HomePage", () => {
  it("renders the hospital portal heading and status information", () => {
    render(<HomePage />);
    expect(screen.getByText(/ConsentGuard Hospital Portal/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 0 — Monorepo Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/Portal Workspace Active/i)).toBeInTheDocument();
  });
});
