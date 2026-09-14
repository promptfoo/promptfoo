// Inspect validated JSON before a consumer relies on its decoded object properties.
export function hasDuplicateJsonKeys(json: string): boolean {
  const objects: Set<string>[] = [];
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '{') {
      objects.push(new Set());
    } else if (character === '}') {
      objects.pop();
    } else if (character === '"') {
      const start = index++;
      while (index < json.length && json[index] !== '"') {
        index += json[index] === '\\' ? 2 : 1;
      }
      let next = index + 1;
      while (next < json.length && /\s/.test(json[next])) {
        next++;
      }
      if (json[next] === ':') {
        const source = json.slice(start + 1, index);
        const key = source.includes('\\') ? (JSON.parse(`"${source}"`) as string) : source;
        const keys = objects[objects.length - 1];
        if (keys.has(key)) {
          return true;
        }
        keys.add(key);
      }
    }
  }
  return false;
}
