import mongoose from "mongoose"

import { env } from "@/lib/env"

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var __visionMongooseCache: MongooseCache | undefined
}

const cached: MongooseCache =
  global.__visionMongooseCache ?? { conn: null, promise: null }
global.__visionMongooseCache = cached

/**
 * Returns a cached Mongoose connection to the shared `user-account` cluster.
 * Mirrors the dashboard-revamp pattern so Vision plays nicely with other
 * Worldstreet services that share the same Mongo instance.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn
  }

  if (cached.conn && cached.conn.connection.readyState !== 1) {
    cached.conn = null
    cached.promise = null
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongo.uri, {
      bufferCommands: false,
      dbName: env.mongo.dbName,
      serverSelectionTimeoutMS: 15_000,
      socketTimeoutMS: 30_000,
      connectTimeoutMS: 15_000,
      maxPoolSize: 10,
      retryWrites: true,
      retryReads: true,
      family: 4,
    })
  }

  try {
    cached.conn = await cached.promise
    return cached.conn
  } catch (error) {
    cached.promise = null
    cached.conn = null
    throw error
  }
}
