import express, { Request, Response } from "express";
import cors from "cors";
import { config } from "./config/index.js";

const app = express();
const PORT = config.PORT;

app.use(cors());
app.use(express.json());

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

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(
      `[ConsentGuard Core] Server listening on http://localhost:${PORT} in ${config.NODE_ENV} mode`
    );
  });
}

export default app;
