import mongoose, { Schema, model } from "mongoose";

/**
 * Entry record for one attendee at one event. The unique (eventId, userId)
 * index is what makes a QR code single-use per event: the first scan inserts,
 * later scans only admit tickets bought since (admitted < entitled).
 */
export interface ICheckIn {
  eventId: mongoose.Types.ObjectId;
  merchantId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orderIds: mongoose.Types.ObjectId[];
  admitted: number;
  tiers: Array<{ name: string; quantity: number }>;
  checkedInBy: mongoose.Types.ObjectId;
  checkedInAt: Date;
  lastScanAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const checkInSchema = new Schema<ICheckIn>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "Order" }],
    admitted: { type: Number, required: true, min: 0 },
    tiers: [{ _id: false, name: String, quantity: Number }],
    checkedInBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    checkedInAt: { type: Date, required: true },
    lastScanAt: { type: Date, required: true },
  },
  { timestamps: true }
);

checkInSchema.index({ eventId: 1, userId: 1 }, { unique: true, name: "unique_event_attendee" });
checkInSchema.index({ eventId: 1, checkedInAt: -1 });

export const CheckIn = model<ICheckIn>("CheckIn", checkInSchema);
