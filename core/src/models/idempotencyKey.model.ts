import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IIdempotencyKey {
  applicationId: Types.ObjectId;
  key: string;
  requestHash: string;
  responseSnapshot: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IIdempotencyKeyDocument extends IIdempotencyKey, Document {}

export const idempotencyKeySchema = new Schema<IIdempotencyKeyDocument>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "ConsumerApplication",
      required: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    requestHash: {
      type: String,
      required: true,
    },
    responseSnapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: (applicationId, key)
idempotencyKeySchema.index({ applicationId: 1, key: 1 }, { unique: true });

export const IdempotencyKey: Model<IIdempotencyKeyDocument> =
  mongoose.models.IdempotencyKey ||
  mongoose.model<IIdempotencyKeyDocument>("IdempotencyKey", idempotencyKeySchema);
