import mongoose, { Document, Model, Schema, Types } from "mongoose";

export interface IConsentPurpose {
  applicationId: Types.ObjectId;
  code: string;
  name: string;
  description: string;
  required: boolean;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConsentPurposeDocument extends IConsentPurpose, Document {}

export const consentPurposeSchema = new Schema<IConsentPurposeDocument>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "ConsumerApplication",
      required: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: (applicationId, code)
consentPurposeSchema.index({ applicationId: 1, code: 1 }, { unique: true });

export const ConsentPurpose: Model<IConsentPurposeDocument> =
  mongoose.models.ConsentPurpose ||
  mongoose.model<IConsentPurposeDocument>("ConsentPurpose", consentPurposeSchema);
