/**
 * SecurityUtils Tests
 * Comprehensive tests for security utility functions
 */

import {
  escapeHtml,
  isValidElectronVersion,
  isValidFilePath,
  safeJsonParse,
  isValidMetadataSize,
  sanitizeString,
  isValidEnum,
  isValidImportFileSize
} from '../SecurityUtils';

describe('SecurityUtils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's a test")).toBe('It&#039;s a test');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('Say "Hello"')).toBe('Say &quot;Hello&quot;');
    });

    it('should handle null and undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should handle numbers', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(0)).toBe('0');
    });

    it('should handle booleans', () => {
      expect(escapeHtml(true)).toBe('true');
      expect(escapeHtml(false)).toBe('false');
    });

    it('should prevent XSS with img tag', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      expect(escapeHtml(malicious))
        .toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should prevent XSS with javascript: URL', () => {
      const malicious = '<a href="javascript:alert(1)">Click</a>';
      expect(escapeHtml(malicious))
        .toBe('&lt;a href=&quot;javascript:alert(1)&quot;&gt;Click&lt;&#x2F;a&gt;');
    });

    it('should handle mixed content', () => {
      const mixed = '<div>Hello & "Goodbye"</div>';
      expect(escapeHtml(mixed))
        .toBe('&lt;div&gt;Hello &amp; &quot;Goodbye&quot;&lt;&#x2F;div&gt;');
    });
  });

  describe('isValidElectronVersion', () => {
    it('should accept valid semantic versions', () => {
      expect(isValidElectronVersion('1.0.0')).toBe(true);
      expect(isValidElectronVersion('12.3.45')).toBe(true);
      expect(isValidElectronVersion('0.0.1')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidElectronVersion('1.0')).toBe(false);
      expect(isValidElectronVersion('1')).toBe(false);
      expect(isValidElectronVersion('v1.0.0')).toBe(false);
      expect(isValidElectronVersion('1.0.0-beta')).toBe(false);
    });

    it('should reject command injection attempts', () => {
      expect(isValidElectronVersion('1.0.0; rm -rf /')).toBe(false);
      expect(isValidElectronVersion('1.0.0 && malicious')).toBe(false);
      expect(isValidElectronVersion('1.0.0 | cat /etc/passwd')).toBe(false);
      expect(isValidElectronVersion('$(whoami)')).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidElectronVersion('../../../etc/passwd')).toBe(false);
      expect(isValidElectronVersion('..\\..\\windows\\system32')).toBe(false);
    });

    it('should reject empty and special characters', () => {
      expect(isValidElectronVersion('')).toBe(false);
      expect(isValidElectronVersion('   ')).toBe(false);
      expect(isValidElectronVersion('1.0.0\n')).toBe(false);
    });
  });

  describe('isValidFilePath', () => {
    it('should accept valid file paths', () => {
      expect(isValidFilePath('/home/user/file.txt')).toBe(true);
      expect(isValidFilePath('C:\\Users\\file.txt')).toBe(true);
      expect(isValidFilePath('./relative/path.js')).toBe(true);
    });

    it('should reject paths exceeding max length', () => {
      const longPath = 'a'.repeat(501);
      expect(isValidFilePath(longPath)).toBe(false);
      expect(isValidFilePath(longPath, 500)).toBe(false);
    });

    it('should accept paths within custom max length', () => {
      const path = 'a'.repeat(100);
      expect(isValidFilePath(path, 100)).toBe(true);
      expect(isValidFilePath(path, 99)).toBe(false);
    });

    it('should reject null byte injection', () => {
      expect(isValidFilePath('/path/to/file\0.txt')).toBe(false);
      expect(isValidFilePath('file\x00name.txt')).toBe(false);
    });

    it('should reject empty paths', () => {
      expect(isValidFilePath('')).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const json = '{"key": "value", "num": 123}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ key: 'value', num: 123 });
    });

    it('should return fallback for invalid JSON', () => {
      const fallback = { default: true };
      expect(safeJsonParse('invalid json', fallback)).toEqual(fallback);
      expect(safeJsonParse('{broken', fallback)).toEqual(fallback);
    });

    it('should return fallback for null/undefined input', () => {
      const fallback = { default: true };
      expect(safeJsonParse(null, fallback)).toEqual(fallback);
      expect(safeJsonParse(undefined, fallback)).toEqual(fallback);
    });

    it('should parse arrays', () => {
      const json = '[1, 2, 3]';
      expect(safeJsonParse(json, [])).toEqual([1, 2, 3]);
    });

    it('should parse nested objects', () => {
      const json = '{"outer": {"inner": "value"}}';
      const result = safeJsonParse(json, {});
      expect(result).toEqual({ outer: { inner: 'value' } });
    });

    it('should handle empty string', () => {
      const fallback = { empty: true };
      expect(safeJsonParse('', fallback)).toEqual(fallback);
    });

    it('should not throw on malformed JSON', () => {
      expect(() => safeJsonParse('{"unclosed":', {})).not.toThrow();
    });
  });

  describe('isValidMetadataSize', () => {
    it('should accept small metadata objects', () => {
      const small = { key: 'value' };
      expect(isValidMetadataSize(small)).toBe(true);
    });

    it('should accept metadata at size limit', () => {
      // Create object close to 10KB
      const data = { data: 'x'.repeat(10000) };
      expect(isValidMetadataSize(data, 10240)).toBe(true);
    });

    it('should reject oversized metadata', () => {
      const large = { data: 'x'.repeat(20000) };
      expect(isValidMetadataSize(large, 10240)).toBe(false);
    });

    it('should accept null/undefined metadata', () => {
      expect(isValidMetadataSize(null)).toBe(true);
      expect(isValidMetadataSize(undefined)).toBe(true);
    });

    it('should handle custom size limits', () => {
      const data = { data: 'x'.repeat(100) };
      expect(isValidMetadataSize(data, 1000)).toBe(true);
      expect(isValidMetadataSize(data, 50)).toBe(false);
    });

    it('should reject circular references gracefully', () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      expect(isValidMetadataSize(circular)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove script tags', () => {
      const malicious = 'Hello <script>alert(1)</script> World';
      expect(sanitizeString(malicious)).toBe('Hello  World');
    });

    it('should remove multiple script tags', () => {
      const malicious = '<script>bad1</script>Good<script>bad2</script>';
      expect(sanitizeString(malicious)).toBe('Good');
    });

    it('should handle script tags with attributes', () => {
      const malicious = '<script src="evil.js">alert(1)</script>';
      expect(sanitizeString(malicious)).toBe('');
    });

    it('should be case insensitive', () => {
      const malicious = '<SCRIPT>alert(1)</SCRIPT>';
      expect(sanitizeString(malicious)).toBe('');
    });

    it('should handle mixed case', () => {
      const malicious = '<ScRiPt>alert(1)</ScRiPt>';
      expect(sanitizeString(malicious)).toBe('');
    });

    it('should leave safe content untouched', () => {
      const safe = 'Just normal text without scripts';
      expect(sanitizeString(safe)).toBe(safe);
    });
  });

  describe('isValidEnum', () => {
    const validValues = ['value1', 'value2', 'value3'];

    it('should accept valid enum values', () => {
      expect(isValidEnum('value1', validValues)).toBe(true);
      expect(isValidEnum('value2', validValues)).toBe(true);
      expect(isValidEnum('value3', validValues)).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isValidEnum('value4', validValues)).toBe(false);
      expect(isValidEnum('invalid', validValues)).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidEnum(null, validValues)).toBe(false);
      expect(isValidEnum(undefined, validValues)).toBe(false);
    });

    it('should be type-safe', () => {
      expect(isValidEnum(123, validValues)).toBe(false);
      expect(isValidEnum(true, validValues)).toBe(false);
    });

    it('should work with number enums', () => {
      const numbers = [1, 2, 3];
      expect(isValidEnum(1, numbers)).toBe(true);
      expect(isValidEnum(4, numbers)).toBe(false);
    });
  });

  describe('isValidImportFileSize', () => {
    it('should accept files within default limit (10MB)', () => {
      expect(isValidImportFileSize(1024)).toBe(true); // 1KB
      expect(isValidImportFileSize(1024 * 1024)).toBe(true); // 1MB
      expect(isValidImportFileSize(5 * 1024 * 1024)).toBe(true); // 5MB
    });

    it('should reject files exceeding default limit', () => {
      const elevenMB = 11 * 1024 * 1024;
      expect(isValidImportFileSize(elevenMB)).toBe(false);
    });

    it('should accept files at exact limit', () => {
      const tenMB = 10 * 1024 * 1024;
      expect(isValidImportFileSize(tenMB)).toBe(true);
    });

    it('should reject zero-size files', () => {
      expect(isValidImportFileSize(0)).toBe(false);
    });

    it('should reject negative sizes', () => {
      expect(isValidImportFileSize(-1)).toBe(false);
      expect(isValidImportFileSize(-1000)).toBe(false);
    });

    it('should work with custom size limits', () => {
      const oneMB = 1024 * 1024;
      expect(isValidImportFileSize(500 * 1024, oneMB)).toBe(true);
      expect(isValidImportFileSize(2 * oneMB, oneMB)).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle XSS attempt through complete flow', () => {
      const maliciousInput = '<script>document.cookie</script>';
      const sanitized = sanitizeString(maliciousInput);
      const escaped = escapeHtml(sanitized);
      expect(escaped).not.toContain('<script>');
      expect(escaped).not.toContain('document.cookie');
    });

    it('should validate and parse JSON safely', () => {
      const jsonString = '{"size": 100}';
      const metadata = safeJsonParse(jsonString, {});
      expect(isValidMetadataSize(metadata)).toBe(true);
    });

    it('should validate file operations safely', () => {
      const filePath = '/safe/path/file.txt';
      expect(isValidFilePath(filePath)).toBe(true);
      expect(isValidImportFileSize(1024)).toBe(true);
    });

    it('should prevent command injection in version check', () => {
      const maliciousVersion = '1.0.0; rm -rf /';
      expect(isValidElectronVersion(maliciousVersion)).toBe(false);
    });
  });
});
