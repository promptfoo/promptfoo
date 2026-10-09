type OpenAiRequestType = 'chat' | 'responses' | 'completion';

const requestTypes = new WeakMap<object, OpenAiRequestType>();

/** Register only concrete implementations that preserve the native request path. */
export function registerOpenAiRequestType(prototype: object, type: OpenAiRequestType): void {
  requestTypes.set(prototype, type);
}

/** A subclass must qualify independently; prototype-chain inheritance is insufficient. */
export function getOpenAiRequestType(prototype: object): OpenAiRequestType | undefined {
  return requestTypes.get(prototype);
}
