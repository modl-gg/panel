import { promises as fs } from 'fs';

const MAX_JSON_SIZE = 2 * 1024 * 1024 * 1024; // 2GB max file size
const MAX_ARRAY_LENGTH = 1000000; // Max 1 million records
const MAX_STRING_LENGTH = 10000; // Max 10k characters per string field
const MAX_NESTING_DEPTH = 20; // Prevent deeply nested objects

interface ValidationOptions {
  maxArrayLength?: number;
  maxStringLength?: number;
  maxNestingDepth?: number;
}

export class SecureJSONError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureJSONError';
  }
}

function validateObjectDepth(obj: any, currentDepth: number = 0, maxDepth: number): void {
  if (currentDepth > maxDepth) {
    throw new SecureJSONError(`JSON nesting depth exceeds maximum allowed depth of ${maxDepth}`);
  }

  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        validateObjectDepth(item, currentDepth + 1, maxDepth);
      }
    } else {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          validateObjectDepth(obj[key], currentDepth + 1, maxDepth);
        }
      }
    }
  }
}

function sanitizeObject(obj: any, options: ValidationOptions): any {
  const { maxArrayLength = MAX_ARRAY_LENGTH, maxStringLength = MAX_STRING_LENGTH } = options;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    if (obj.length > maxStringLength) {
      throw new SecureJSONError(`String length ${obj.length} exceeds maximum allowed length of ${maxStringLength}`);
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length > maxArrayLength) {
      throw new SecureJSONError(`Array length ${obj.length} exceeds maximum allowed length of ${maxArrayLength}`);
    }
    return obj.map(item => sanitizeObject(item, options));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Block dangerous keys that could lead to prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new SecureJSONError(`Forbidden property name: ${key}`);
        }
        sanitized[key] = sanitizeObject(obj[key], options);
      }
    }
    return sanitized;
  }

  return obj;
}

export async function parseSecureJSON(
  filePath: string,
  options: ValidationOptions = {}
): Promise<any> {
  const {
    maxArrayLength = MAX_ARRAY_LENGTH,
    maxStringLength = MAX_STRING_LENGTH,
    maxNestingDepth = MAX_NESTING_DEPTH
  } = options;

  const stats = await fs.stat(filePath);
  if (stats.size > MAX_JSON_SIZE) {
    throw new SecureJSONError(`File size ${stats.size} exceeds maximum allowed size of ${MAX_JSON_SIZE}`);
  }

  const fileContent = await fs.readFile(filePath, 'utf-8');

  let parsed: any;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error: any) {
    throw new SecureJSONError(`Invalid JSON format: ${error.message}`);
  }

  validateObjectDepth(parsed, 0, maxNestingDepth);

  const sanitized = sanitizeObject(parsed, {
    maxArrayLength,
    maxStringLength
  });

  return sanitized;
}

export function parseSecureJSONString(
  jsonString: string,
  options: ValidationOptions = {}
): any {
  const {
    maxArrayLength = MAX_ARRAY_LENGTH,
    maxStringLength = MAX_STRING_LENGTH,
    maxNestingDepth = MAX_NESTING_DEPTH
  } = options;

  if (jsonString.length > MAX_JSON_SIZE) {
    throw new SecureJSONError(`JSON string size exceeds maximum allowed size`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error: any) {
    throw new SecureJSONError(`Invalid JSON format: ${error.message}`);
  }

  validateObjectDepth(parsed, 0, maxNestingDepth);

  const sanitized = sanitizeObject(parsed, {
    maxArrayLength,
    maxStringLength
  });

  return sanitized;
}

