import mongoose, { Document, Model, Schema, Types } from "mongoose";

export const ActorType = {
  USER: "USER",
  ADMIN: "ADMIN",
  SYSTEM: "SYSTEM",
} as const;

export type ActorTypeType = (typeof ActorType)[keyof typeof ActorType];

export interface IAuditLog {
  actorId?: Types.ObjectId | null;
  actorType: ActorTypeType;
  applicationId: Types.ObjectId;
  purposeId?: Types.ObjectId | null;
  action: string;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document {}

export const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorType: {
      type: String,
      enum: Object.values(ActorType),
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
      default: null,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    previousState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Indexes: (applicationId, createdAt) and (actorId, createdAt)
auditLogSchema.index({ applicationId: 1, createdAt: 1 });
auditLogSchema.index({ actorId: 1, createdAt: 1 });

export const AuditLog: Model<IAuditLogDocument> =
  mongoose.models.AuditLog || mongoose.model<IAuditLogDocument>("AuditLog", auditLogSchema);
