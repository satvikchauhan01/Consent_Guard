import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const ConsentStatus = {
  NOT_GRANTED: "NOT_GRANTED",
  GRANTED: "GRANTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

export type ConsentStatusType = (typeof ConsentStatus)[keyof typeof ConsentStatus];

export interface IConsentRecord {
  userId: Types.ObjectId;
  applicationId: Types.ObjectId;
  purposeId: Types.ObjectId;
  policyVersionId: Types.ObjectId;
  status: ConsentStatusType;
  version: number;
  grantedAt?: Date | null;
  withdrawnAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IConsentRecordDocument extends IConsentRecord, Document {}

export const consentRecordSchema = new Schema<IConsentRecordDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "ConsumerApplication",
      required: true,
    },
    purposeId: {
      type: Schema.Types.ObjectId,
      ref: "ConsentPurpose",
      required: true,
    },
    policyVersionId: {
      type: Schema.Types.ObjectId,
      ref: "PolicyVersion",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ConsentStatus),
      default: ConsentStatus.NOT_GRANTED,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    grantedAt: {
      type: Date,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: (userId, applicationId, purposeId)
consentRecordSchema.index({ userId: 1, applicationId: 1, purposeId: 1 }, { unique: true });

// Secondary compound index: (applicationId, purposeId, status)
consentRecordSchema.index({ applicationId: 1, purposeId: 1, status: 1 });

export const ConsentRecord: Model<IConsentRecordDocument> =
  mongoose.models.ConsentRecord ||
  mongoose.model<IConsentRecordDocument>("ConsentRecord", consentRecordSchema);
