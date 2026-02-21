import { Elysia, Context, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { connectDb } from "./db";
import { auth } from "./lib/auth";
import { createMerchantHandler } from "./routes/merchants";
import { openapi } from "@elysiajs/openapi";
// import { OpenAPI } from "./lib/auth";
const betterAuthView = (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"];
  // validate request method
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    return auth.handler(context.request);
  } else {
    context.status(405);
    return {
      error: "Method not allowed",
    };
  }
};

// user middleware (compute user and session and pass to routes)
const betterAuth = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });

        if (!session) return status(401);

        console.log("session", session);

        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

const app = new Elysia()
  // .use(
  //   openapi({
  //     documentation: {
  //       components: await OpenAPI.components,
  //       paths: await OpenAPI.getPaths(),
  //     },
  //   }),
  // )
  .use(
    cors({
      origin: true, // Allow all origins for development
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
      ],
    })
  )
  .use(betterAuth)
  .all("/api/auth/*", betterAuthView)
  .get(
    "/api/user",
    ({ user }) => {
      const merchant =
        (user as { merchant?: unknown } | null)?.merchant ?? null;
      return { user: user ?? null, merchant };
    },
    {
      auth: true,
    }
  )
  .post("/api/merchants", createMerchantHandler, {
    auth: true,
    body: t.Object({
      organizerName: t.String(),
      email: t.String(),
      phoneNumber: t.String(),
      eventCategory: t.String(),
      customCategory: t.Optional(t.String()),
      organizerType: t.String(),
      description: t.Optional(t.String()),
      website: t.Optional(t.String()),
    }),
  })
  .get("/health", () => ({ status: "ok" }));

async function start() {
  await connectDb();
  app.listen(3000);
  console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
  );
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
