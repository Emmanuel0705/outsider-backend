export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Outsider API",
    version: "1.0.0",
    description: "API documentation for the Outsider platform",
  },
  tags: [
    { name: "Health", description: "Health check endpoints" },
    { name: "User", description: "User profile endpoints" },
    { name: "Merchants", description: "Merchant management endpoints" },
    { name: "Wallet", description: "Wallet endpoints" },
    { name: "MerchantWallet", description: "Merchant wallet endpoints" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns server health status",
        responses: {
          "200": {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/me": {
      get: {
        tags: ["User"],
        summary: "Get current user profile",
        description:
          "Returns the authenticated user's profile, wallet details, and merchant account (null if not a merchant)",
        responses: {
          "200": {
            description: "Current user profile with wallet and merchant",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        emailVerified: { type: "boolean" },
                        image: { type: "string", nullable: true },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                    wallet: {
                      type: "object",
                      nullable: true,
                      properties: {
                        _id: { type: "string" },
                        userId: { type: "string" },
                        balance: { type: "number", example: 0 },
                        currency: { type: "string", example: "NGN" },
                        status: {
                          type: "string",
                          enum: ["active", "frozen", "closed"],
                        },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                    merchant: {
                      type: "object",
                      nullable: true,
                      description: "Merchant account, or null if not a merchant",
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/user": {
      get: {
        tags: ["User"],
        summary: "Get current user",
        description:
          "Returns the authenticated user's profile and merchant info",
        responses: {
          "200": { description: "User profile and merchant info" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/merchants": {
      post: {
        tags: ["Merchants"],
        summary: "Create merchant account",
        description:
          "Creates a new merchant/organizer account for the authenticated user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "organizerName",
                  "email",
                  "phoneNumber",
                  "eventCategory",
                  "organizerType",
                ],
                properties: {
                  organizerName: { type: "string" },
                  email: { type: "string", format: "email" },
                  phoneNumber: { type: "string" },
                  eventCategory: { type: "string" },
                  customCategory: { type: "string" },
                  organizerType: { type: "string" },
                  description: { type: "string" },
                  website: { type: "string", format: "uri" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Merchant account created successfully" },
          "401": { description: "Unauthorized" },
          "409": {
            description: "Merchant account already exists for this user",
          },
        },
      },
    },
    "/api/merchant/wallet": {
      get: {
        tags: ["MerchantWallet"],
        summary: "Get merchant wallet",
        description:
          "Returns the authenticated merchant's wallet with available, pending, and total balances. Creates wallet on first access.",
        responses: {
          "200": {
            description: "Merchant wallet",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wallet: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        merchantId: { type: "string" },
                        availableBalance: { type: "number", example: 0 },
                        pendingBalance: { type: "number", example: 0 },
                        totalBalance: { type: "number", example: 0 },
                        currency: { type: "string", example: "NGN" },
                        status: {
                          type: "string",
                          enum: ["active", "frozen", "closed"],
                        },
                        createdAt: { type: "string", format: "date-time" },
                        updatedAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "No merchant account found" },
        },
      },
    },
  },
};
