import { describe, expect, it, vi } from 'vitest';
import { ConfigurationAgent } from '../../../src/redteam/configAgent/agent';

// Mock fetchWithProxy to avoid actual HTTP calls
vi.mock('../../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));

describe('ConfigurationAgent', () => {
  describe('URL Validation (SSRF Protection)', () => {
    it('should accept valid HTTPS URLs', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com');
    });

    it('should accept valid HTTP URLs', () => {
      const agent = new ConfigurationAgent('http://api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('http://api.example.com');
    });

    it('should add https:// if no protocol specified', () => {
      const agent = new ConfigurationAgent('api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com');
    });

    it('should remove trailing slashes', () => {
      const agent = new ConfigurationAgent('https://api.example.com/v1/');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com/v1');
    });

    describe('SSRF Protection - Blocked URLs', () => {
      it('should block localhost', () => {
        expect(() => new ConfigurationAgent('http://localhost')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block localhost with port', () => {
        expect(() => new ConfigurationAgent('http://localhost:8080')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block 127.0.0.1', () => {
        // 127.0.0.1 is caught by the explicit localhost check
        expect(() => new ConfigurationAgent('http://127.0.0.1')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block other loopback addresses', () => {
        // Other 127.x.x.x addresses are caught by the loopback range check
        expect(() => new ConfigurationAgent('http://127.0.0.2')).toThrow(
          'Access to loopback addresses is not allowed',
        );
      });

      it('should block 0.0.0.0', () => {
        expect(() => new ConfigurationAgent('http://0.0.0.0')).toThrow();
      });

      it('should block .localhost subdomains', () => {
        expect(() => new ConfigurationAgent('http://api.localhost')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      // Private IP ranges
      it('should block 10.x.x.x (private class A)', () => {
        expect(() => new ConfigurationAgent('http://10.0.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://10.255.255.255')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should block 172.16-31.x.x (private class B)', () => {
        expect(() => new ConfigurationAgent('http://172.16.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://172.31.255.255')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should allow 172.15.x.x (not private)', () => {
        // This should NOT throw - 172.15.x.x is not in the private range
        const agent = new ConfigurationAgent('http://172.15.0.1');
        expect(agent.getSession().baseUrl).toBe('http://172.15.0.1');
      });

      it('should block 192.168.x.x (private class C)', () => {
        expect(() => new ConfigurationAgent('http://192.168.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://192.168.1.100')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should block 169.254.x.x (link-local)', () => {
        expect(() => new ConfigurationAgent('http://169.254.0.1')).toThrow(
          'Access to link-local addresses is not allowed',
        );
      });

      // Cloud metadata endpoints
      it('should block AWS metadata endpoint', () => {
        expect(() => new ConfigurationAgent('http://169.254.169.254')).toThrow(
          'Access to link-local addresses is not allowed',
        );
      });

      it('should block common cloud metadata hostnames', () => {
        expect(() => new ConfigurationAgent('http://metadata.google.internal')).toThrow(
          'Access to cloud metadata endpoints is not allowed',
        );
        expect(() => new ConfigurationAgent('http://metadata')).toThrow(
          'Access to cloud metadata endpoints is not allowed',
        );
      });

      // Note: Protocol restrictions (ftp://, file://, etc.) are not currently
      // enforced due to the implementation prepending https:// to non-http URLs.
      // The core SSRF protections (localhost, private IPs, cloud metadata) work correctly.
      // TODO: Consider improving protocol handling in a future PR.
    });
  });

  describe('Session Management', () => {
    it('should create a session with unique ID', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session = agent.getSession();

      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.baseUrl).toBe('https://api.example.com');
      expect(session.phase).toBe('initializing');
      expect(session.messages).toEqual([]);
    });

    it('should return a copy of session to prevent mutation', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session1 = agent.getSession();
      const session2 = agent.getSession();

      expect(session1).not.toBe(session2);
      expect(session1).toEqual(session2);
    });

    it('should return a copy of messages to prevent mutation', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const messages1 = agent.getMessages();
      const messages2 = agent.getMessages();

      expect(messages1).not.toBe(messages2);
      expect(messages1).toEqual(messages2);
    });
  });

  describe('Cancel', () => {
    it('should add a cancellation message', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      agent.cancel();

      const messages = agent.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('info');
      expect(messages[0].content).toBe('Discovery cancelled.');
    });
  });
});
