import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TurnDetector, SilenceDetector } from '../../../src/providers/voice/turnDetection';
import { bufferToBase64 } from '../../../src/providers/voice/audioBuffer';
import type { AudioChunk } from '../../../src/providers/voice/types';

describe('TurnDetector', () => {
  let detector: TurnDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new TurnDetector({
      mode: 'server_vad',
      silenceThresholdMs: 500,
      vadThreshold: 0.5,
      minTurnDurationMs: 100,
      maxTurnDurationMs: 10000,
      prefixPaddingMs: 300,
    });
  });

  afterEach(() => {
    detector.reset();
    vi.useRealTimers();
  });

  describe('onSpeechStart', () => {
    it('should emit turn_start event', () => {
      const handler = vi.fn();
      detector.on('turn_start', handler);

      detector.onSpeechStart();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not emit multiple turn_start events', () => {
      const handler = vi.fn();
      detector.on('turn_start', handler);

      detector.onSpeechStart();
      detector.onSpeechStart();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should set isInTurn to true', () => {
      expect(detector.isInTurn()).toBe(false);

      detector.onSpeechStart();

      expect(detector.isInTurn()).toBe(true);
    });
  });

  describe('onSpeechEnd', () => {
    it('should emit turn_end event after minimum duration', () => {
      const handler = vi.fn();
      detector.on('turn_end', handler);

      detector.onSpeechStart();
      vi.advanceTimersByTime(200); // Past min duration (100ms)
      detector.onSpeechEnd();

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should not emit turn_end if below minimum duration', () => {
      const handler = vi.fn();
      detector.on('turn_end', handler);

      detector.onSpeechStart();
      vi.advanceTimersByTime(50); // Below min duration
      detector.onSpeechEnd();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should not emit turn_end if not speaking', () => {
      const handler = vi.fn();
      detector.on('turn_end', handler);

      detector.onSpeechEnd();

      expect(handler).not.toHaveBeenCalled();
    });

    it('should set isInTurn to false', () => {
      detector.onSpeechStart();
      vi.advanceTimersByTime(200);
      detector.onSpeechEnd();

      expect(detector.isInTurn()).toBe(false);
    });
  });

  describe('forceEndTurn', () => {
    it('should emit turn_timeout and turn_end', () => {
      const timeoutHandler = vi.fn();
      const endHandler = vi.fn();

      detector.on('turn_timeout', timeoutHandler);
      detector.on('turn_end', endHandler);

      detector.onSpeechStart();
      detector.forceEndTurn();

      expect(timeoutHandler).toHaveBeenCalledTimes(1);
      expect(endHandler).toHaveBeenCalledTimes(1);
    });

    it('should not emit if not in turn', () => {
      const handler = vi.fn();
      detector.on('turn_timeout', handler);

      detector.forceEndTurn();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('max duration timer', () => {
    it('should force end turn after max duration', () => {
      const timeoutHandler = vi.fn();
      detector.on('turn_timeout', timeoutHandler);

      detector.onSpeechStart();
      vi.advanceTimersByTime(10000); // Max duration

      expect(timeoutHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      detector.onSpeechStart();
      expect(detector.isInTurn()).toBe(true);

      detector.reset();

      expect(detector.isInTurn()).toBe(false);
      expect(detector.getTurnDuration()).toBe(0);
    });
  });

  describe('getTurnDuration', () => {
    it('should return 0 when not in turn', () => {
      expect(detector.getTurnDuration()).toBe(0);
    });

    it('should return elapsed time when in turn', () => {
      detector.onSpeechStart();
      vi.advanceTimersByTime(500);

      expect(detector.getTurnDuration()).toBe(500);
    });
  });

  describe('silence mode', () => {
    beforeEach(() => {
      detector = new TurnDetector({
        mode: 'silence',
        silenceThresholdMs: 500,
        vadThreshold: 0.02,
        minTurnDurationMs: 100,
        maxTurnDurationMs: 10000,
        prefixPaddingMs: 300,
      });
    });

    it('should detect speech from audio chunks', () => {
      const handler = vi.fn();
      detector.on('turn_start', handler);

      // Create a chunk with some audio (not silent)
      const loudAudio = Buffer.alloc(100);
      for (let i = 0; i < loudAudio.length; i += 2) {
        loudAudio.writeInt16LE(10000, i); // Loud sample
      }

      const chunk: AudioChunk = {
        data: bufferToBase64(loudAudio),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      };

      detector.onAudioChunk(chunk);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should end turn after silence threshold', () => {
      const endHandler = vi.fn();
      detector.on('turn_end', endHandler);

      // Start with loud audio
      const loudAudio = Buffer.alloc(100);
      for (let i = 0; i < loudAudio.length; i += 2) {
        loudAudio.writeInt16LE(10000, i);
      }

      detector.onAudioChunk({
        data: bufferToBase64(loudAudio),
        timestamp: 0,
        format: 'pcm16',
        sampleRate: 24000,
      });

      // Now silent audio
      const silentAudio = Buffer.alloc(100);
      detector.onAudioChunk({
        data: bufferToBase64(silentAudio),
        timestamp: 100,
        format: 'pcm16',
        sampleRate: 24000,
      });

      // Wait for silence threshold
      vi.advanceTimersByTime(500);

      expect(endHandler).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SilenceDetector', () => {
  let detector: SilenceDetector;

  beforeEach(() => {
    detector = new SilenceDetector(0.02);
  });

  describe('isSilent', () => {
    it('should detect silent audio (all zeros)', () => {
      const silentData = Buffer.alloc(100);
      expect(detector.isSilent(silentData)).toBe(true);
    });

    it('should detect loud audio as not silent', () => {
      const loudData = Buffer.alloc(100);
      for (let i = 0; i < loudData.length; i += 2) {
        loudData.writeInt16LE(16000, i); // About 50% amplitude
      }
      expect(detector.isSilent(loudData)).toBe(false);
    });

    it('should detect quiet audio as silent', () => {
      const quietData = Buffer.alloc(100);
      for (let i = 0; i < quietData.length; i += 2) {
        quietData.writeInt16LE(300, i); // About 1% amplitude
      }
      expect(detector.isSilent(quietData)).toBe(true);
    });
  });

  describe('getRmsAmplitude', () => {
    it('should return 0 for empty buffer', () => {
      expect(detector.getRmsAmplitude(Buffer.alloc(0))).toBe(0);
    });

    it('should return 0 for silent audio', () => {
      const silentData = Buffer.alloc(100);
      expect(detector.getRmsAmplitude(silentData)).toBe(0);
    });

    it('should return correct RMS for constant signal', () => {
      const data = Buffer.alloc(100);
      for (let i = 0; i < data.length; i += 2) {
        data.writeInt16LE(16384, i); // 50% of max
      }
      const rms = detector.getRmsAmplitude(data);
      expect(rms).toBeCloseTo(0.5, 1);
    });

    it('should handle negative samples', () => {
      const data = Buffer.alloc(4);
      data.writeInt16LE(-16384, 0);
      data.writeInt16LE(16384, 2);

      const rms = detector.getRmsAmplitude(data);
      expect(rms).toBeCloseTo(0.5, 1);
    });
  });

  describe('getPeakAmplitude', () => {
    it('should return 0 for empty buffer', () => {
      expect(detector.getPeakAmplitude(Buffer.alloc(0))).toBe(0);
    });

    it('should return peak value', () => {
      const data = Buffer.alloc(6);
      data.writeInt16LE(1000, 0);
      data.writeInt16LE(16384, 2);
      data.writeInt16LE(5000, 4);

      const peak = detector.getPeakAmplitude(data);
      expect(peak).toBeCloseTo(0.5, 1);
    });

    it('should handle negative peaks', () => {
      const data = Buffer.alloc(4);
      data.writeInt16LE(-32000, 0);
      data.writeInt16LE(1000, 2);

      const peak = detector.getPeakAmplitude(data);
      expect(peak).toBeCloseTo(32000 / 32768, 2);
    });
  });

  describe('threshold configuration', () => {
    it('should use custom threshold', () => {
      const strictDetector = new SilenceDetector(0.5);
      const lenientDetector = new SilenceDetector(0.01);

      const mediumData = Buffer.alloc(100);
      for (let i = 0; i < mediumData.length; i += 2) {
        mediumData.writeInt16LE(8000, i); // About 25% amplitude
      }

      expect(strictDetector.isSilent(mediumData)).toBe(true);
      expect(lenientDetector.isSilent(mediumData)).toBe(false);
    });

    it('should allow updating threshold', () => {
      detector.setThreshold(0.5);
      expect(detector.getThreshold()).toBe(0.5);
    });
  });
});
