import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const PolicyStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;

export type PolicyStatusType = (typeof PolicyStatus)[keyof typeof PolicyStatus];

export interface IPolicyVersion {
  purposeId: Types.ObjectId;
  version: string;
  content: string;
  plainLanguageSummary?: string | null;
  status: PolicyStatusType;
  requiresReconsent: boolean;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPolicyVersionDocument extends IPolicyVersion, Document {}

export const policyVersionSchema = new Schema<IPolicyVersionDocument>(
  {
    purposeId: {
      type: Schema.Types.ObjectId,
      ref: "ConsentPurpose",
      required: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    plainLanguageSummary: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(PolicyStatus),
      default: PolicyStatus.DRAFT,
      required: true,
    },
    requiresReconsent: {
      type: Boolean,
      default: false,
      required: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: (purposeId, version)
policyVersionSchema.index({ purposeId: 1, version: 1 }, { unique: true });

export const PolicyVersion: Model<IPolicyVersionDocument> =
  mongoose.models.PolicyVersion ||
  mongoose.model<IPolicyVersionDocument>("PolicyVersion", policyVersionSchema);
