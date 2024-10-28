import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ProviderOptions } from '@promptfoo/types';

interface ProvidersState {
  customProviders: ProviderOptions[];
}

const initialState: ProvidersState = {
  customProviders: [],
};

const providersSlice = createSlice({
  name: 'providers',
  initialState,
  reducers: {
    addCustomProvider: (state, action: PayloadAction<ProviderOptions>) => {
      state.customProviders.push(action.payload);
    },
    removeCustomProvider: (state, action: PayloadAction<string>) => {
      state.customProviders = state.customProviders.filter(
        provider => provider.id !== action.payload
      );
    },
  },
});

export const { addCustomProvider, removeCustomProvider } = providersSlice.actions;
export default providersSlice.reducer;
