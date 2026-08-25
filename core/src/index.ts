import express, { Request, Response } from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Placeholder health check and root routes
app.get("/", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "ConsentGuard Core",
    message: "ConsentGuard Core API is running.",
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[ConsentGuard Core] Server listening on http://localhost:${PORT}`);
  });
}

export default app;
