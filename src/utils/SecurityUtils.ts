/**
 * SecurityUtils
 * Security utilities for input validation and output sanitization
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param unsafe - Untrusted string that may contain HTML
 * @returns Safely escaped string for HTML insertion
 */
export function escapeHtml(unsafe: string | number | boolean | null | undefined): string {
  if (unsafe === null || unsafe === undefined) {
    return '';
  }

  const str = String(unsafe);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;'
  };

  return str.replace(/[&<>"'/]/g, (char) => map[char] || char);
}

/**
 * Validates electron version format
 * @param version - Version string to validate
 * @returns true if valid semantic version (e.g., "1.2.3")
 */
export function isValidElectronVersion(version: string): boolean {
  return /^[0-9]+\.[0-9]+\.[0-9]+$/.test(version);
}

/**
 * Validates file path length and characters
 * @param filePath - File path to validate
 * @param maxLength - Maximum allowed length (default: 500)
 * @returns true if valid
 */
export function isValidFilePath(filePath: string, maxLength: number = 500): boolean {
  if (!filePath || filePath.length > maxLength) {
    return false;
  }

  // Check for null bytes (path traversal attack)
  if (filePath.includes('\0')) {
    return false;
  }

  return true;
}

/**
 * Safely parses JSON with error handling
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) {
    return fallback;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('[SecurityUtils] JSON parse error:', error);
    return fallback;
  }
}

/**
 * Validates metadata object size
 * @param metadata - Metadata object to validate
 * @param maxSizeBytes - Maximum size in bytes (default: 10KB)
 * @returns true if within size limit
 */
export function isValidMetadataSize(metadata: unknown, maxSizeBytes: number = 10240): boolean {
  if (!metadata) {
    return true;
  }

  try {
    const jsonString = JSON.stringify(metadata);
    const sizeBytes = new TextEncoder().encode(jsonString).length;
    return sizeBytes <= maxSizeBytes;
  } catch {
    return false;
  }
}

/**
 * Sanitizes string to remove potential script tags
 * @param input - Input string to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

/**
 * Validates that a value is one of the allowed enum values
 * @param value - Value to check
 * @param allowedValues - Array of allowed values
 * @returns true if value is in allowed list
 */
export function isValidEnum<T>(value: unknown, allowedValues: T[]): value is T {
  return allowedValues.includes(value as T);
}

/**
 * Validates import file size
 * @param fileSize - Size in bytes
 * @param maxSize - Maximum allowed size (default: 10MB)
 * @returns true if within limit
 */
export function isValidImportFileSize(fileSize: number, maxSize: number = 10485760): boolean {
  return fileSize > 0 && fileSize <= maxSize;
}
