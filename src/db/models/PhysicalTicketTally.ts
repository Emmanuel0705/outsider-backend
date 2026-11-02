import mongoose, { Schema, model } from "mongoose";

/**
 * How many guests each ticket type's shared physical-ticket QR has admitted at
 * an event. Paper tickets have no individual identity, so a count is all there is.
 */
export interface IPhysicalTicketTally {
  eventId: mongoose.Types.ObjectId;
  tierId: mongoose.Types.ObjectId;
  admitted: number;
  lastScanAt: Date;
  lastScannedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IPhysicalTicketTally>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    tierId: { type: Schema.Types.ObjectId, required: true },
    admitted: { type: Number, default: 0, min: 0 },
    lastScanAt: { type: Date, required: true },
    lastScannedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

schema.index({ eventId: 1, tierId: 1 }, { unique: true, name: "one_tally_per_tier" });

export const PhysicalTicketTally = model<IPhysicalTicketTally>("PhysicalTicketTally", schema);
