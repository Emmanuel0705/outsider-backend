import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  "mongodb://localhost:27017/outsiders";

const BETTER_AUTH_COLLECTIONS = ["user", "session", "account", "verification"];

async function dropLegacyBetterAuthIdIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;

  for (const collectionName of BETTER_AUTH_COLLECTIONS) {
    try {
      const collection = db.collection(collectionName);
      const indexes = await collection.indexes();
      const legacyIdIndex = indexes.find(
        (idx) =>
          idx.name === "id_1" ||
          (idx.key &&
            Object.keys(idx.key).length === 1 &&
            (idx.key as Record<string, unknown>).id === 1)
      );

      if (!legacyIdIndex) continue;

      if (!legacyIdIndex.name) continue;

      await collection.dropIndex(legacyIdIndex.name);
      console.log(
        `Dropped legacy Better Auth index "${legacyIdIndex.name}" on "${collectionName}".`
      );
    } catch (error) {
      // Ignore missing collections/namespaces; only surface actionable failures.
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("ns not found") &&
        !message.includes("NamespaceNotFound")
      ) {
        console.warn(
          `Unable to verify/drop legacy Better Auth index on "${collectionName}":`,
          message
        );
      }
    }
  }
}

export async function connectDb(): Promise<typeof mongoose> {
  console.log("Connecting to MongoDB...");
  if (mongoose.connection.readyState === 1) {
    console.log("Already connected to MongoDB.");
    return mongoose;
  }
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  await dropLegacyBetterAuthIdIndexes();
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  console.log("Disconnecting from MongoDB...");
  if (mongoose.connection.readyState !== 0) {
    console.log("Closing MongoDB connection...");
    await mongoose.disconnect();
  }
}

export { mongoose };
