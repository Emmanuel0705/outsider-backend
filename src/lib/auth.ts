import "dotenv/config";
import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { expo } from "@better-auth/expo";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { Merchant } from "../db/models";

const client = new MongoClient(process.env.MONGODB_URI as string);
const db = client.db(process.env.DB_NAME ?? "outsiders");

export const auth = betterAuth({
  appName: "outsider",
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    cookiePrefix: "better-auth",
  },
  emailAndPassword: {
    enabled: true,
  },

  database: mongodbAdapter(db, {
    // Optional: if you don't provide a client, database transactions won't be enabled.
    client,
  }),
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
