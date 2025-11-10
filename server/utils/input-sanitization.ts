const MONGODB_OPERATOR_REGEX = /^\$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MINECRAFT_UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const IP_ADDRESS_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function sanitizeString(value: any, fieldName: string, maxLength: number = 500): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength}`);
  }

  if (MONGODB_OPERATOR_REGEX.test(value)) {
    throw new ValidationError(`${fieldName} contains invalid characters`);
  }

  return value.trim();
}

export function validateMinecraftUuid(uuid: any): string {
  if (typeof uuid !== 'string') {
    throw new ValidationError('Minecraft UUID must be a string');
  }

  if (!MINECRAFT_UUID_REGEX.test(uuid)) {
    throw new ValidationError('Invalid Minecraft UUID format');
  }

  return uuid;
}

export function validateUuid(uuid: any): string {
  if (typeof uuid !== 'string') {
    throw new ValidationError('UUID must be a string');
  }

  if (!UUID_REGEX.test(uuid.toLowerCase())) {
    throw new ValidationError('Invalid UUID format');
  }

  return uuid.toLowerCase();
}

export function validateDate(dateValue: any, fieldName: string): Date {
  if (!dateValue) {
    throw new ValidationError(`${fieldName} is required`);
  }

  const date = new Date(dateValue);

  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} is not a valid date`);
  }

  const year = date.getFullYear();
  if (year < 1970 || year > 2100) {
    throw new ValidationError(`${fieldName} is out of valid range (1970-2100)`);
  }

  return date;
}

export function validateOptionalDate(dateValue: any, fieldName: string): Date | undefined {
  if (!dateValue) {
    return undefined;
  }

  return validateDate(dateValue, fieldName);
}

export function validateNumber(value: any, fieldName: string, min?: number, max?: number): number {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (typeof num !== 'number' || isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }

  return num;
}

export function validateBoolean(value: any, fieldName: string, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  throw new ValidationError(`${fieldName} must be a boolean`);
}

export function validateIpAddress(ip: any, fieldName: string): string {
  if (typeof ip !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (!IP_ADDRESS_REGEX.test(ip)) {
    throw new ValidationError(`${fieldName} is not a valid IP address`);
  }

  const octets = ip.split('.').map(Number);
  if (octets.some(octet => octet < 0 || octet > 255)) {
    throw new ValidationError(`${fieldName} contains invalid octets`);
  }

  return ip;
}

export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as T;
  }

  const sanitized: any = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      if (typeof key === 'string' && MONGODB_OPERATOR_REGEX.test(key)) {
        continue;
      }

      sanitized[key] = sanitizeObject((obj as any)[key]);
    }
  }

  return sanitized as T;
}

export function validateArray<T>(
  value: any,
  fieldName: string,
  maxLength: number = 10000
): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength}`);
  }

  return value;
}

