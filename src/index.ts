import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { toNodeHandler } from "better-auth/node";
import { connectDb } from "./db";
import { auth } from "./lib/auth";
import { swaggerDocument } from "./swagger";
import healthRoutes from "./modules/health/health.routes";
import merchantRoutes from "./modules/merchant/merchant.routes";
import merchantWalletRoutes from "./modules/merchant-wallet/merchant-wallet.routes";
import userRoutes from "./modules/user/user.routes";
import uploadRoutes from "./modules/upload/upload.routes";
import eventRoutes from "./modules/events/events.routes";
import passwordResetRoutes from "./modules/password-reset/password-reset.routes";
import walletRoutes from "./modules/wallet/wallet.routes";
import notificationRoutes from "./modules/notifications/notifications.routes";
import ticketRoutes from "./modules/tickets/tickets.routes";

const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
  }),
);

// better-auth routes must be registered BEFORE express.json() so that
// toNodeHandler can read the raw request body stream itself.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

// Swagger docs
app.use("/reference", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get("/openapi.json", (_, res) => res.json(swaggerDocument));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use(healthRoutes);
app.use(uploadRoutes);
app.use(merchantRoutes);
app.use(merchantWalletRoutes);
app.use(userRoutes);
app.use(eventRoutes);
app.use(passwordResetRoutes);
app.use(walletRoutes);
app.use(notificationRoutes);
app.use(ticketRoutes);

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  await connectDb();
  app.listen(3011, () => {
    console.log("Express is running at http://localhost:3011");
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
