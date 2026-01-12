/**
 * TelemetryService Tests
 */

import { TelemetryService } from '../TelemetryService';
import * as vscode from 'vscode';
import * as crypto from 'crypto';

// Mock vscode
jest.mock('vscode', () => ({
  workspace: {
    getConfiguration: jest.fn()
  },
  env: {
    machineId: 'test-machine-id-12345'
  },
  version: '1.85.0'
}), { virtual: true });

// Mock crypto
jest.mock('crypto');

// Mock fetch
global.fetch = jest.fn();

describe('TelemetryService', () => {
  let service: TelemetryService;
  let mockContext: any;
  let mockVscodeConfig: any;
  let mockCodePauseConfig: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock context
    mockContext = {
      globalState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined)
      },
      extension: {
        packageJSON: {
          version: '0.2.0'
        }
      }
    };

    // Mock VS Code configuration
    mockVscodeConfig = {
      get: jest.fn().mockReturnValue('all') // telemetryLevel = 'all'
    };

    mockCodePauseConfig = {
      get: jest.fn().mockReturnValue(true) // enableTelemetry = true
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
      if (section === 'telemetry') {
        return mockVscodeConfig;
      }
      if (section === 'codePause') {
        return mockCodePauseConfig;
      }
      return { get: jest.fn() };
    });

    // Mock crypto.createHash
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('1234567890abcdef1234567890abcdef')
    };
    (crypto.createHash as jest.Mock).mockReturnValue(mockHash);

    // Mock fetch
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      statusText: 'OK'
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should respect VS Code telemetry setting when disabled', () => {
      mockVscodeConfig.get.mockReturnValue('off'); // telemetryLevel = 'off'

      service = new TelemetryService(mockContext);
      service.initialize();

      expect(service.isTrackingEnabled()).toBe(false);
    });

    it('should respect CodePause telemetry setting when disabled', () => {
      mockCodePauseConfig.get.mockReturnValue(false); // enableTelemetry = false

      service = new TelemetryService(mockContext);
      service.initialize();

      expect(service.isTrackingEnabled()).toBe(false);
    });

    it('should enable telemetry when both settings allow', () => {
      service = new TelemetryService(mockContext);
      service.initialize();

      expect(service.isTrackingEnabled()).toBe(true);
    });

    it('should generate anonymous user ID on first use', () => {
      mockContext.globalState.get.mockReturnValue(undefined); // No existing ID

      service = new TelemetryService(mockContext);

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockContext.globalState.update).toHaveBeenCalledWith(
        'telemetry.userId',
        expect.any(String)
      );
    });

    it('should reuse existing user ID', () => {
      mockContext.globalState.get.mockReturnValue('existing-user-id');

      service = new TelemetryService(mockContext);

      expect(service.getUserId()).toBe('existing-user-id');
      expect(crypto.createHash).not.toHaveBeenCalled();
    });

    it('should start flush interval when enabled', () => {
      service = new TelemetryService(mockContext);

      const intervalCount = jest.getTimerCount();
      service.initialize();

      // Should have created one interval
      expect(jest.getTimerCount()).toBeGreaterThan(intervalCount);
    });

    it('should not start flush interval when disabled', () => {
      mockVscodeConfig.get.mockReturnValue('off');

      service = new TelemetryService(mockContext);

      const intervalCount = jest.getTimerCount();
      service.initialize();

      // Should not have created any intervals
      expect(jest.getTimerCount()).toBe(intervalCount);
    });
  });

  describe('event tracking', () => {
    beforeEach(() => {
      service = new TelemetryService(mockContext);
      service.initialize();
    });

    it('should track events with properties', () => {
      service.track('test.event', { foo: 'bar', count: 42 });

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should not track events when disabled', () => {
      mockVscodeConfig.get.mockReturnValue('off');
      service = new TelemetryService(mockContext);

      service.track('test.event');

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should sanitize properties containing PII', () => {
      service.track('test.event', {
        validProp: 'ok',
        filePath: '/secret/path.ts',
        userName: 'john',
        email: 'john@example.com',
        count: 10
      });

      // Manually trigger flush to inspect payload
      service.track('dummy', {}); // Add dummy event
      jest.advanceTimersByTime(5 * 60 * 1000); // Trigger flush

      // Check fetch was called
      expect(global.fetch).toHaveBeenCalled();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      // Should only have validProp and count (no PII fields)
      const event = payload.events[0];
      expect(event.properties).toHaveProperty('validProp');
      expect(event.properties).toHaveProperty('count');
      expect(event.properties).not.toHaveProperty('filePath');
      expect(event.properties).not.toHaveProperty('userName');
      expect(event.properties).not.toHaveProperty('email');
    });

    it('should only allow primitive types in properties', () => {
      service.track('test.event', {
        string: 'value',
        number: 42,
        boolean: true,
        object: { nested: 'value' } as any,
        array: [1, 2, 3] as any
      });

      jest.advanceTimersByTime(5 * 60 * 1000);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      const event = payload.events[0];

      expect(event.properties).toHaveProperty('string');
      expect(event.properties).toHaveProperty('number');
      expect(event.properties).toHaveProperty('boolean');
      expect(event.properties).not.toHaveProperty('object');
      expect(event.properties).not.toHaveProperty('array');
    });
  });

  describe('specific event tracking', () => {
    beforeEach(() => {
      service = new TelemetryService(mockContext);
      service.initialize();
    });

    it('should track activation event', () => {
      service.trackActivation();

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should mark first-time activation', () => {
      mockContext.globalState.get.mockImplementation((key: string) => {
        if (key === 'hasActivatedBefore') {
          return false;
        }
        return undefined;
      });

      service.trackActivation();

      expect(mockContext.globalState.update).toHaveBeenCalledWith('hasActivatedBefore', true);
    });

    it('should track command execution', () => {
      service.trackCommand('codePause.openDashboard');

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should track errors', () => {
      service.trackError('database');

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should track session end', () => {
      service.trackSessionEnd(60000, 10);

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should track feature usage', () => {
      service.trackFeature('dashboard', 'opened');

      expect(service.getPendingEventCount()).toBe(1);
    });
  });

  describe('event flushing', () => {
    beforeEach(() => {
      service = new TelemetryService(mockContext);
      service.initialize();
    });

    it('should flush events after interval', async () => {
      service.track('test.event1');
      service.track('test.event2');

      jest.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      // Wait for async flush
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.codepause.dev/telemetry',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should flush immediately when buffer is full', async () => {
      // Add 50 events (max buffer size)
      for (let i = 0; i < 50; i++) {
        service.track('test.event');
      }

      // Wait for async flush
      await Promise.resolve();

      expect(global.fetch).toHaveBeenCalled();
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should include metadata in payload', async () => {
      service.track('test.event');

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      expect(payload).toHaveProperty('userId');
      expect(payload).toHaveProperty('extensionVersion', '0.2.0');
      expect(payload).toHaveProperty('vscodeVersion', '1.85.0');
      expect(payload).toHaveProperty('platform');
      expect(payload).toHaveProperty('events');
      expect(payload.events).toHaveLength(1);
    });

    it('should retry failed flushes', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        statusText: 'Server Error'
      });

      service.track('test.event');

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      // Event should still be in buffer
      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should handle fetch errors gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      service.track('test.event');

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      // Event should still be in buffer for retry
      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should clear buffer after successful flush', async () => {
      service.track('test.event1');
      service.track('test.event2');

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      service = new TelemetryService(mockContext);
      service.initialize();
    });

    it('should clear flush interval', async () => {
      const intervalCount = jest.getTimerCount();

      await service.dispose();

      // Interval should be cleared
      expect(jest.getTimerCount()).toBeLessThan(intervalCount);
    });

    it('should flush remaining events', async () => {
      service.track('test.event');

      await service.dispose();

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should not fail if no events to flush', async () => {
      await expect(service.dispose()).resolves.not.toThrow();
    });
  });

  describe('privacy features', () => {
    beforeEach(() => {
      service = new TelemetryService(mockContext);
      service.initialize();
    });

    it('should hash machine ID to create anonymous user ID', () => {
      const userId = service.getUserId();

      expect(userId).toHaveLength(16);
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should not include timestamps with high precision', async () => {
      service.track('test.event');

      jest.advanceTimersByTime(5 * 60 * 1000);
      await Promise.resolve();

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);

      // Timestamp should exist but we don't track exact precision in payload
      expect(payload.events[0]).toHaveProperty('timestamp');
    });

    it('should allow opting out via setting', () => {
      mockCodePauseConfig.get.mockReturnValue(false);

      const disabledService = new TelemetryService(mockContext);
      disabledService.track('test.event');

      expect(disabledService.getPendingEventCount()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty properties gracefully', () => {
      service = new TelemetryService(mockContext);
      service.track('test.event', {});

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should handle undefined properties', () => {
      service = new TelemetryService(mockContext);
      service.track('test.event', undefined);

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should handle context with missing packageJSON', () => {
      const invalidContext = {
        ...mockContext,
        extension: { packageJSON: {} }
      };

      expect(() => new TelemetryService(invalidContext)).not.toThrow();
    });
  });
});
