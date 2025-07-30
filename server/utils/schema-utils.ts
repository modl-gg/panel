import { Schema, Connection, Model } from 'mongoose';

/**
 * Get or create the StaffRole model with consistent schema definition
 */
export function getStaffRoleModel(connection: Connection): Model<any> {
  try {
    // Try to get existing model
    return connection.model('StaffRole');
  } catch {
    // If model doesn't exist, create it with the schema
    const StaffRoleSchema = new Schema({
      id: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      description: { type: String, required: true },
      permissions: [{ type: String }],
      isDefault: { type: Boolean, default: false },
      order: { type: Number, default: 0 }
    }, { timestamps: true });
    
    return connection.model('StaffRole', StaffRoleSchema);
  }
}

/**
 * Ensure a model is registered on the given connection
 * Returns the model instance
 */
export function ensureModel<T>(
  connection: Connection, 
  modelName: string, 
  schema: Schema<T>
): Model<T> {
  try {
    return connection.model<T>(modelName);
  } catch {
    return connection.model<T>(modelName, schema);
  }
}