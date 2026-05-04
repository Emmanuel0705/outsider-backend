import "dotenv/config";
import { createElement } from "react";
import { betterAuth } from "better-auth";
import { customSession, emailOTP } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { expo } from "@better-auth/expo";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { Merchant } from "../db/models";
import { sendEmail } from "./email";
import OTPEmail from "../email/otp";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/outsiders";

const DB_NAME = process.env.DB_NAME ?? "outsiders";
const ENABLE_AUTH_TRANSACTIONS = ["1", "true", "yes", "on"].includes(
  String(process.env.BETTER_AUTH_ENABLE_TRANSACTIONS ?? "").toLowerCase()
);

const client = new MongoClient(MONGODB_URI);
const db = client.db(DB_NAME);

export const auth = betterAuth({
  appName: "outsider",
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    cookiePrefix: "better-auth",
  },
  emailAndPassword: {
    enabled: true,
  },

  database: mongodbAdapter(
    db,
    ENABLE_AUTH_TRANSACTIONS
      ? {
          // Better Auth uses Mongo transactions only when `client` is provided.
          // Keep this opt-in so local standalone MongoDB works without replica set.
          client,
        }
      : undefined
  ),
  trustedOrigins: [
    "outsiders://", // Development mode - Expo's exp:// scheme with local IP ranges
    "outsiders://*",
    "exp+outsiders://*",
    "http://127.0.0.1:3011",
    "https://127.0.0.1:3011/*",
    "http://192.168.31.91:3011",
    "http://192.168.31.91:3011/*",
    "exp://*/*", // Trust all Expo development URLs
    "exp://10.0.0.*:*/*", // Trust 10.0.0.x IP range
    "exp://192.168.*.*:*/*", // Trust 192.168.x.x IP range
    "exp://172.*.*.*:*/*", // Trust 172.x.x.x IP range
    "exp://localhost:*/*", // Trust localhost
    "http://localhost:8081", // Trust localhost HTTP
    "http://localhost:8081/*", // Trust all localhost HTTP paths
    "http://localhost:3011",
  ],
  plugins: [
    expo(),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === "email-verification"
            ? "Verify your Outsiders account"
            : "Your Outsiders sign-in code";
        await sendEmail({
          to: email,
          subject,
          react: createElement(OTPEmail, { otp }),
        });
      },
      expiresIn: 600,
    }),
    customSession(async ({ user, session }) => {
      let merchant = null;
      if (user?.id) {
        try {
          const userId = new mongoose.Types.ObjectId(user.id);
          const doc = await Merchant.findOne({ userId }).lean();
          if (doc) {
            merchant = {
              _id: String(doc._id),
              userId: String(doc.userId),
              organizerName: doc.organizerName,
              email: doc.email,
              phoneNumber: doc.phoneNumber,
              eventCategory: doc.eventCategory,
              customCategory: doc.customCategory,
              organizerType: doc.organizerType,
              description: doc.description,
              website: doc.website,
              status: doc.status,
              createdAt: doc.createdAt,
              updatedAt: doc.updatedAt,
            };
          }
        } catch {
          // ignore invalid userId
        }
      }
      return {
        user: {
          ...user,
          merchant,
        },
        session,
      };
    }),
  ],
});

// let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
// const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());

// export const OpenAPI = {
//   getPaths: (prefix = "/auth/api") =>
//     getSchema().then(({ paths }) => {
//       const reference: typeof paths = Object.create(null);

//       for (const path of Object.keys(paths)) {
//         const key = prefix + path;
//         reference[key] = paths[path];

//         for (const method of Object.keys(paths[path])) {
//           const operation = (reference[key] as any)[method];

//           operation.tags = ["Better Auth"];
//         }
//       }

//       return reference;
//     }) as Promise<any>,
//   components: getSchema().then(({ components }) => components) as Promise<any>,
// } as const;
