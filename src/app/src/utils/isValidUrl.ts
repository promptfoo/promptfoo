export const isValidUrl = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

/** Only render browser-navigable web links for untrusted evaluation metadata. */
export const isSafeExternalUrl = (str: string): boolean => {
  try {
    const url = new URL(str);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};
