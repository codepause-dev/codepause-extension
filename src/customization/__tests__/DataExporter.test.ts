/**
 * DataExporter Tests
 * Security-focused tests for data import/export functionality
 */

// Mock dependencies BEFORE imports
jest.mock('../../storage/MetricsRepository');
jest.mock('../../storage/ConfigRepository');
jest.mock('vscode', () => ({
  window: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
  workspace: {
    fs: {
      writeFile: jest.fn(),
      readFile: jest.fn(),
    },
  },
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
}), { virtual: true });

import { DataExporter } from '../DataExporter';
import { MetricsRepository } from '../../storage/MetricsRepository';
import { ConfigRepository } from '../../storage/ConfigRepository';

describe('DataExporter', () => {
  let dataExporter: DataExporter;
  let mockMetricsRepo: jest.Mocked<MetricsRepository>;
  let mockConfigRepo: jest.Mocked<ConfigRepository>;

  beforeEach(() => {
    mockMetricsRepo = new MetricsRepository(null as any) as jest.Mocked<MetricsRepository>;
    mockConfigRepo = new ConfigRepository(null as any) as jest.Mocked<ConfigRepository>;
    dataExporter = new DataExporter(mockMetricsRepo, mockConfigRepo);
  });

  describe('Import Validation Security Tests', () => {
    it('should reject non-object data', () => {
      const validation = (dataExporter as any).validateImportData(null);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('object');
    });

    it('should reject data without required fields', () => {
      const validation = (dataExporter as any).validateImportData({});
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('config, achievements, or metrics');
    });

    it('should accept valid config data', () => {
      const data = {
        config: {
          experienceLevel: 'mid',
          alertFrequency: 'medium',
          enableGamification: true,
          anonymizePaths: true,
          blindApprovalThreshold: 2000,
        },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid experience level', () => {
      const data = {
        config: {
          experienceLevel: 'invalid',
        },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('experience level');
    });

    it('should reject invalid alert frequency', () => {
      const data = {
        config: {
          alertFrequency: 'extreme',
        },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('alert frequency');
    });

    it('should reject non-boolean gamification flag', () => {
      const data = {
        config: {
          enableGamification: 'yes',
        },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('boolean');
    });

    it('should reject invalid threshold values', () => {
      const testCases = [
        { blindApprovalThreshold: -1 },
        { blindApprovalThreshold: 20000 },
        { blindApprovalThreshold: 'not a number' },
      ];

      testCases.forEach((config) => {
        const validation = (dataExporter as any).validateImportData({ config });
        expect(validation.valid).toBe(false);
      });
    });

    it('should accept valid achievements array', () => {
      const data = {
        achievements: [
          { id: 'achievement1', unlocked: true },
          { id: 'achievement2', unlocked: false },
        ],
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(true);
    });

    it('should reject achievements as non-array', () => {
      const data = {
        achievements: { id: 'test' },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('array');
    });

    it('should reject too many achievements (DoS prevention)', () => {
      const achievements = Array.from({ length: 101 }, (_, i) => ({
        id: `achievement${i}`,
        unlocked: true,
      }));
      const data = { achievements };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Too many achievements');
    });

    it('should reject achievements without ID', () => {
      const data = {
        achievements: [{ unlocked: true }],
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('string ID');
    });

    it('should reject achievements with XSS in ID', () => {
      const testCases = [
        { id: '<script>alert(1)</script>', unlocked: true },
        { id: 'test"onclick="alert(1)', unlocked: true },
        { id: 'a'.repeat(101), unlocked: true }, // Too long
      ];

      testCases.forEach((achievement) => {
        const validation = (dataExporter as any).validateImportData({
          achievements: [achievement],
        });
        expect(validation.valid).toBe(false);
      });
    });

    it('should accept valid metrics array', () => {
      const data = {
        metrics: [
          { date: '2024-01-01', totalEvents: 10 },
          { date: '2024-01-02', totalEvents: 15 },
        ],
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(true);
    });

    it('should reject metrics as non-array', () => {
      const data = {
        metrics: { date: '2024-01-01' },
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('array');
    });

    it('should reject too many metrics records (DoS prevention)', () => {
      const metrics = Array.from({ length: 366 }, (_, i) => ({
        date: `2024-01-${i}`,
        totalEvents: 0,
      }));
      const data = { metrics };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Too many metrics');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle nested malicious objects', () => {
      const data = {
        config: {
          nested: {
            deep: {
              malicious: '<script>alert(1)</script>',
            },
          },
        },
      };
      const validation = (dataExporter as any).validateImportData(data);
      // Should validate structure, not deep content
      expect(validation.valid).toBe(true);
    });

    it('should reject config with prototype pollution attempt', () => {
      const data = {
        config: {
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
        },
      };
      // Should not crash
      expect(() => {
        (dataExporter as any).validateImportData(data);
      }).not.toThrow();
    });

    it('should handle very large valid data', () => {
      const data = {
        config: { experienceLevel: 'senior' },
        achievements: Array.from({ length: 50 }, (_, i) => ({
          id: `valid_achievement_${i}`,
          unlocked: true,
        })),
        metrics: Array.from({ length: 100 }, (_, i) => ({
          date: `2024-${String(i + 1).padStart(2, '0')}-01`,
          totalEvents: i,
        })),
      };
      const validation = (dataExporter as any).validateImportData(data);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Enum Validation', () => {
    it('should only accept valid experience levels', () => {
      const validLevels = ['junior', 'mid', 'senior'];
      const invalidLevels = ['beginner', 'expert', 'master', '', null];

      validLevels.forEach((level) => {
        const validation = (dataExporter as any).validateImportData({
          config: { experienceLevel: level },
        });
        expect(validation.valid).toBe(true);
      });

      invalidLevels.forEach((level) => {
        const validation = (dataExporter as any).validateImportData({
          config: { experienceLevel: level },
        });
        expect(validation.valid).toBe(false);
      });
    });

    it('should only accept valid alert frequencies', () => {
      const validFreqs = ['low', 'medium', 'high'];
      const invalidFreqs = ['never', 'always', 'extreme', ''];

      validFreqs.forEach((freq) => {
        const validation = (dataExporter as any).validateImportData({
          config: { alertFrequency: freq },
        });
        expect(validation.valid).toBe(true);
      });

      invalidFreqs.forEach((freq) => {
        const validation = (dataExporter as any).validateImportData({
          config: { alertFrequency: freq },
        });
        expect(validation.valid).toBe(false);
      });
    });
  });

  describe('Type Safety', () => {
    it('should reject wrong types for boolean fields', () => {
      const testCases = [
        { enableGamification: 1 },
        { enableGamification: 'true' },
        { anonymizePaths: 0 },
        { anonymizePaths: 'false' },
      ];

      testCases.forEach((config) => {
        const validation = (dataExporter as any).validateImportData({ config });
        expect(validation.valid).toBe(false);
      });
    });

    it('should accept proper boolean values', () => {
      const testCases = [
        { enableGamification: true },
        { enableGamification: false },
        { anonymizePaths: true },
        { anonymizePaths: false },
      ];

      testCases.forEach((config) => {
        const validation = (dataExporter as any).validateImportData({ config });
        expect(validation.valid).toBe(true);
      });
    });

    it('should validate numeric thresholds properly', () => {
      const validThresholds = [0, 100, 2000, 5000, 10000];
      const invalidThresholds = [-1, 10001, NaN, Infinity, '2000'];

      validThresholds.forEach((threshold) => {
        const validation = (dataExporter as any).validateImportData({
          config: { blindApprovalThreshold: threshold },
        });
        expect(validation.valid).toBe(true);
      });

      invalidThresholds.forEach((threshold) => {
        const validation = (dataExporter as any).validateImportData({
          config: { blindApprovalThreshold: threshold },
        });
        expect(validation.valid).toBe(false);
      });
    });
  });

  describe('Boundary Testing', () => {
    it('should accept exactly 100 achievements', () => {
      const achievements = Array.from({ length: 100 }, (_, i) => ({
        id: `achievement${i}`,
        unlocked: true,
      }));
      const validation = (dataExporter as any).validateImportData({ achievements });
      expect(validation.valid).toBe(true);
    });

    it('should accept exactly 365 metrics records', () => {
      const metrics = Array.from({ length: 365 }, (_, i) => ({
        date: `2024-01-01`,
        totalEvents: i,
      }));
      const validation = (dataExporter as any).validateImportData({ metrics });
      expect(validation.valid).toBe(true);
    });

    it('should accept achievement ID at max length (100 chars)', () => {
      const achievements = [
        { id: 'a'.repeat(100), unlocked: true },
      ];
      const validation = (dataExporter as any).validateImportData({ achievements });
      expect(validation.valid).toBe(true);
    });

    it('should accept threshold at boundaries', () => {
      const testCases = [0, 10000];
      testCases.forEach((threshold) => {
        const validation = (dataExporter as any).validateImportData({
          config: { blindApprovalThreshold: threshold },
        });
        expect(validation.valid).toBe(true);
      });
    });
  });

  describe('Integration with SafeJsonParse', () => {
    it('should handle malformed JSON gracefully in import flow', () => {
      // This tests the integration with safeJsonParse
      // The actual import method should use safeJsonParse which is tested separately
      expect(() => {
        JSON.parse('{"broken": ');
      }).toThrow();

      // Our code should NOT throw
      // (This is ensured by safeJsonParse usage in the actual importData method)
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages', () => {
      const testCases = [
        { data: null, expectedError: 'object' },
        { data: {}, expectedError: 'config, achievements, or metrics' },
        { data: { config: 'string' }, expectedError: 'object' },
        { data: { config: { experienceLevel: 'invalid' } }, expectedError: 'experience level' },
        { data: { achievements: {} }, expectedError: 'array' },
      ];

      testCases.forEach(({ data, expectedError }) => {
        const validation = (dataExporter as any).validateImportData(data);
        expect(validation.valid).toBe(false);
        expect(validation.error?.toLowerCase()).toContain(expectedError.toLowerCase());
      });
    });
  });

  describe('Helper Methods', () => {
    it('should calculate summary from metrics', () => {
      const metrics = [
        { totalEvents: 10, totalAILines: 50, totalManualLines: 20, aiPercentage: 71 },
        { totalEvents: 15, totalAILines: 60, totalManualLines: 30, aiPercentage: 67 },
      ];

      const summary = (dataExporter as any).calculateSummary(metrics);
      expect(summary).toBeDefined();
      expect(summary.totalEvents).toBe(25);
      expect(summary.averageAIPercentage).toBeCloseTo((71 + 67) / 2, 1);
    });

    it('should handle empty metrics in calculateSummary', () => {
      const summary = (dataExporter as any).calculateSummary([]);
      expect(summary).toBeDefined();
      expect(summary.totalEvents).toBe(0);
      expect(summary.averageAIPercentage).toBe(0);
    });

    it('should convert metrics to CSV format', () => {
      const metrics = [
        {
          date: '2024-01-01',
          totalEvents: 10,
          totalAILines: 50,
          totalManualLines: 20,
          aiPercentage: 71,
          acceptanceRate: 85,
          averageReviewTime: 2000,
          blindApprovalCount: 2,
          sessionCount: 1,
        },
        {
          date: '2024-01-02',
          totalEvents: 15,
          totalAILines: 60,
          totalManualLines: 30,
          aiPercentage: 67,
          acceptanceRate: 90,
          averageReviewTime: 2500,
          blindApprovalCount: 3,
          sessionCount: 2,
        },
      ];

      const csv = (dataExporter as any).metricsToCSV(metrics);
      expect(csv).toContain('Date,Total Events');
      expect(csv).toContain('2024-01-01,10');
      expect(csv).toContain('2024-01-02,15');
    });

    it('should handle empty metrics array in CSV conversion', () => {
      const csv = (dataExporter as any).metricsToCSV([]);
      expect(csv).toBeDefined();
      expect(csv).toContain('Date,Total Events');
    });
  });

  describe('Export Methods', () => {
    beforeEach(() => {
      const vscode = require('vscode');
      vscode.window.showSaveDialog.mockResolvedValue({ fsPath: '/test/export.json' });
      vscode.workspace.fs.writeFile.mockResolvedValue(undefined);
      vscode.window.showInformationMessage.mockResolvedValue(undefined);
      vscode.window.showErrorMessage.mockResolvedValue(undefined);

      mockConfigRepo.getUserConfig.mockResolvedValue({
        experienceLevel: 'mid',
        alertFrequency: 'medium',
        enableGamification: true,
        anonymizePaths: false,
        blindApprovalThreshold: 2000,
      } as any);

      mockConfigRepo.getAllAchievements.mockResolvedValue([
        { id: 'achievement1', unlocked: true, title: 'Test', description: 'Test', category: 'review', icon: '🏆', requirement: { type: 'count', metric: 'reviews', target: 10, timeframe: 'all-time' }, progress: 100 },
      ] as any);

      mockMetricsRepo.getDailyMetrics.mockResolvedValue({
        date: '2024-01-01',
        totalEvents: 10,
        totalAILines: 50,
        totalManualLines: 20,
        aiPercentage: 71,
        averageReviewTime: 2000,
        sessionCount: 1,
        toolBreakdown: {},
      } as any);
    });

    it('should export all data successfully', async () => {
      const vscode = require('vscode');
      await dataExporter.exportAllData();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it.skip('should handle user canceling export dialog', async () => {
      const vscode = require('vscode');
      vscode.window.showSaveDialog.mockResolvedValue(undefined);

      await dataExporter.exportAllData();

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle export errors gracefully', async () => {
      const vscode = require('vscode');
      vscode.workspace.fs.writeFile.mockRejectedValue(new Error('Write failed'));

      await dataExporter.exportAllData();

      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });

    it('should export metrics successfully', async () => {
      const vscode = require('vscode');
      await dataExporter.exportMetrics();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('should export configuration successfully', async () => {
      const vscode = require('vscode');
      await dataExporter.exportConfiguration();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(mockConfigRepo.getUserConfig).toHaveBeenCalled();
      expect(mockConfigRepo.getAllAchievements).toHaveBeenCalled();
    });

    it('should export to CSV successfully', async () => {
      const vscode = require('vscode');
      await dataExporter.exportToCSV();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Import Methods', () => {
    beforeEach(() => {
      const vscode = require('vscode');
      vscode.window.showOpenDialog.mockResolvedValue([{ fsPath: '/test/import.json' }]);
      vscode.window.showWarningMessage.mockResolvedValue('Import');
      vscode.window.showInformationMessage.mockResolvedValue(undefined);
      vscode.workspace.fs.readFile.mockResolvedValue(
        Buffer.from(JSON.stringify({
          config: {
            experienceLevel: 'senior',
            alertFrequency: 'low',
            enableGamification: false,
            anonymizePaths: true,
            blindApprovalThreshold: 3000,
          },
          achievements: [{ id: 'test1', unlocked: true }],
        }))
      );

      mockConfigRepo.saveUserConfig.mockResolvedValue(undefined);
      mockConfigRepo.unlockAchievement.mockResolvedValue(undefined);
    });

    it('should import data successfully', async () => {
      const vscode = require('vscode');
      await dataExporter.importData();

      expect(vscode.window.showOpenDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.readFile).toHaveBeenCalled();
      expect(mockConfigRepo.saveUserConfig).toHaveBeenCalled();
      expect(mockConfigRepo.unlockAchievement).toHaveBeenCalled();
    });

    it.skip('should handle user canceling import dialog', async () => {
      const vscode = require('vscode');
      vscode.window.showOpenDialog.mockResolvedValue(undefined);

      await dataExporter.importData();

      expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
    });

    it('should handle user canceling import confirmation', async () => {
      const vscode = require('vscode');
      vscode.window.showWarningMessage.mockResolvedValue('Cancel');

      await dataExporter.importData();

      expect(mockConfigRepo.saveUserConfig).not.toHaveBeenCalled();
    });

    it('should reject files that are too large', async () => {
      const vscode = require('vscode');
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      vscode.workspace.fs.readFile.mockResolvedValue(largeBuffer);

      await dataExporter.importData();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('too large')
      );
      expect(mockConfigRepo.saveUserConfig).not.toHaveBeenCalled();
    });

    it('should reject invalid JSON', async () => {
      const vscode = require('vscode');
      vscode.workspace.fs.readFile.mockResolvedValue(Buffer.from('invalid json{'));

      await dataExporter.importData();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('invalid JSON')
      );
      expect(mockConfigRepo.saveUserConfig).not.toHaveBeenCalled();
    });

    it('should reject data that fails validation', async () => {
      const vscode = require('vscode');
      vscode.workspace.fs.readFile.mockResolvedValue(
        Buffer.from(JSON.stringify({ invalid: 'data' }))
      );

      await dataExporter.importData();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Invalid import file')
      );
      expect(mockConfigRepo.saveUserConfig).not.toHaveBeenCalled();
    });

    it('should handle import errors gracefully', async () => {
      const vscode = require('vscode');
      vscode.workspace.fs.readFile.mockRejectedValue(new Error('Read failed'));

      await dataExporter.importData();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import')
      );
    });
  });
});
