import "dotenv/config";
import { betterAuth } from "better-auth";
import { customSession } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { expo } from "@better-auth/expo";
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { Merchant } from "../db/models";

const client = new MongoClient(
  "mongodb+srv://samuel88783so_db_user:Y4Pej0iTR2CXhL5C@outsiders.a8ptz20.mongodb.net/?appName=outsiders"
);
// Y4Pej0iTR2CXhL5C
// samuel88783so_db_user
const db = client.db();

export const auth = betterAuth({
  appName: "outsider",
  baseURL: "http://localhost:3000",
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
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000/*",
    "http://192.168.31.91:3000",
    "http://192.168.31.91:3000/*",
    "exp://*/*", // Trust all Expo development URLs
    "exp://10.0.0.*:*/*", // Trust 10.0.0.x IP range
    "exp://192.168.*.*:*/*", // Trust 192.168.x.x IP range
    "exp://172.*.*.*:*/*", // Trust 172.x.x.x IP range
    "exp://localhost:*/*", // Trust localhost
    "http://localhost:8081", // Trust localhost HTTP
    "http://localhost:8081/*", // Trust all localhost HTTP paths
    "http://localhost:3000",
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
  hooks: {
    after: async (context) => {
      // console.log("after", context);
      // Return the context to preserve the response
      return context;
    },
    before: async (context) => {
      // console.log("before", context);
      // Return the context to preserve the request
      console.log("before");
      // fetch user from database
      const user = await db.collection("users").find().toArray();
      console.log({ users: user });
      return context;
    },
  },
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
