import express, { Request, Response } from "express";
import cors from "cors";
import mongoose from "mongoose";
import { config } from "./config/index.js";
import authRouter from "./routes/auth.routes.js";

const app = express();
const PORT = config.PORT;

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Placeholder health check and root routes
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ConsentGuard Core",
    message: "ConsentGuard Core API is running.",
    environment: config.NODE_ENV,
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  });
});

// Auth endpoints
app.use("/api/auth", authRouter);

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(config.MONGO_URI)
    .then(() => {
      console.log("[ConsentGuard Core] MongoDB connected");
      app.listen(PORT, () => {
        console.log(
          `[ConsentGuard Core] Server listening on http://localhost:${PORT} in ${config.NODE_ENV} mode`
        );
      });
    })
    .catch((err) => {
      console.error("[ConsentGuard Core] MongoDB connection failed:", err);
      process.exit(1);
    });
}

export default app;
