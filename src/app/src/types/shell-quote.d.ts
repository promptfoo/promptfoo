declare module 'shell-quote' {
  export function quote(args: string[]): string;
  export function parse(cmd: string): string[];
}
