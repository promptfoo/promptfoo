export function getCurrentTimestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
