import { describe, it, expect, beforeEach } from 'vitest';
import type { ProviderOptions } from '@promptfoo/types';
import { useProvidersStore } from './providersStore';
import { create } from 'zustand';

describe('useProvidersStore', () => {
  beforeEach(() => {
    useProvidersStore.setState({
      customProviders: [],
    });
  });

  it('should have an empty customProviders array on initial state', () => {
    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toEqual([]);
  });

  it('should add a custom provider to customProviders when addCustomProvider is called with a valid provider', () => {
    const newProvider: ProviderOptions = {
      id: 'custom:my-local-llm',
      label: 'My Local LLM',
      config: {
        apiKey: 'test-key-123',
        temperature: 0.8,
      },
    };
    expect(useProvidersStore.getState().customProviders).toEqual([]);

    useProvidersStore.getState().addCustomProvider(newProvider);

    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toHaveLength(1);
    expect(customProviders[0]).toEqual(newProvider);
  });

  it('should add a custom provider without an id to customProviders when addCustomProvider is called', () => {
    const newProvider: ProviderOptions = {
      label: 'My Local LLM',
      config: {
        apiKey: 'test-key-123',
        temperature: 0.8,
      },
    };
    useProvidersStore.getState().addCustomProvider(newProvider);
    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toHaveLength(1);
    expect(customProviders[0]).toEqual(newProvider);
  });

  it('should add a custom provider with minimal properties (just id) to customProviders', () => {
    const newProvider: ProviderOptions = {
      id: 'minimal-provider',
    };
    useProvidersStore.getState().addCustomProvider(newProvider);
    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toHaveLength(1);
    expect(customProviders[0]).toEqual(newProvider);
  });

  it("should remove a custom provider from customProviders when removeCustomProvider is called with the provider's id", () => {
    const provider1: ProviderOptions = { id: 'provider1', label: 'Provider 1' };
    const provider2: ProviderOptions = { id: 'provider2', label: 'Provider 2' };
    useProvidersStore.setState({ customProviders: [provider1, provider2] });

    useProvidersStore.getState().removeCustomProvider('provider1');

    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toHaveLength(1);
    expect(customProviders).toEqual([provider2]);
  });

  it('should not remove any provider if removeCustomProvider is called with an ID that does not exist', () => {
    const initialProvider: ProviderOptions = { id: 'existing-provider' };
    useProvidersStore.setState({ customProviders: [initialProvider] });
    const initialState = useProvidersStore.getState().customProviders;

    useProvidersStore.getState().removeCustomProvider('non-existent-id');

    expect(useProvidersStore.getState().customProviders).toEqual(initialState);
  });

  it('should add a custom provider even if a provider with the same ID already exists', () => {
    const initialProvider: ProviderOptions = {
      id: 'duplicate-id',
      label: 'Initial Provider',
      config: {
        apiKey: 'initial-key',
      },
    };

    useProvidersStore.setState({ customProviders: [initialProvider] });

    const duplicateProvider: ProviderOptions = {
      id: 'duplicate-id',
      label: 'Duplicate Provider',
      config: {
        apiKey: 'duplicate-key',
      },
    };

    useProvidersStore.getState().addCustomProvider(duplicateProvider);

    const { customProviders } = useProvidersStore.getState();
    expect(customProviders).toHaveLength(2);
    expect(customProviders[0]).toEqual(initialProvider);
    expect(customProviders[1]).toEqual(duplicateProvider);
  });

  it('should lose custom providers on application refresh or store recreation', () => {
    const newProvider: ProviderOptions = {
      id: 'custom:my-local-llm',
      label: 'My Local LLM',
      config: {
        apiKey: 'test-key-123',
      },
    };
    useProvidersStore.getState().addCustomProvider(newProvider);
    expect(useProvidersStore.getState().customProviders).toHaveLength(1);

    const newStore = create<{
      customProviders: ProviderOptions[];
      addCustomProvider: (provider: ProviderOptions) => void;
      removeCustomProvider: (providerId: string) => void;
    }>((set) => ({
      customProviders: [],
      addCustomProvider: (provider) =>
        set((state) => ({
          customProviders: [...state.customProviders, provider],
        })),
      removeCustomProvider: (providerId) =>
        set((state) => ({
          customProviders: state.customProviders.filter((p) => p.id !== providerId),
        })),
    }));
    const newStoreInstance = newStore.getState();

    expect(newStoreInstance.customProviders).toEqual([]);
  });
});
