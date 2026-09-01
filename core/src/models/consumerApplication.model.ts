import mongoose, { Document, Model, Schema } from "mongoose";

export const ApplicationStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;

export type ApplicationStatusType = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export interface IConsumerApplication {
  name: string;
  status: ApplicationStatusType;
  apiKeyHash: string;
  previousKeyHash?: string | null;
  previousKeyExpiresAt?: Date | null;
  scopes: string[];
  lastUsedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConsumerApplicationDocument extends IConsumerApplication, Document {}

export const consumerApplicationSchema = new Schema<IConsumerApplicationDocument>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.ACTIVE,
      required: true,
    },
    apiKeyHash: {
      type: String,
      required: true,
    },
    previousKeyHash: {
      type: String,
      default: null,
    },
    previousKeyExpiresAt: {
      type: Date,
      default: null,
    },
    scopes: {
      type: [String],
      default: [],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const ConsumerApplication: Model<IConsumerApplicationDocument> =
  mongoose.models.ConsumerApplication ||
  mongoose.model<IConsumerApplicationDocument>("ConsumerApplication", consumerApplicationSchema);
