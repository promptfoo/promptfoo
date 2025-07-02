export function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
