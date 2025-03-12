declare module 'node-gtts' {
  export default function gtts(lang: string): {
    stream(text: string): NodeJS.ReadableStream;
  };
}
