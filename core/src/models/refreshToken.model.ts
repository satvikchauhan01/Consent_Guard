import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IRefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IRefreshTokenDocument extends IRefreshToken, Document {}

export const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

refreshTokenSchema.index({ userId: 1 });

export const RefreshToken: Model<IRefreshTokenDocument> =
  mongoose.models.RefreshToken ||
  mongoose.model<IRefreshTokenDocument>("RefreshToken", refreshTokenSchema);
