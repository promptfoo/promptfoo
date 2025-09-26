// Add TextEncoder/TextDecoder polyfills for jsdom environment
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Setup common mocks
jest.mock('../../src/logger');
jest.mock('../../src/globalConfig/globalConfig');