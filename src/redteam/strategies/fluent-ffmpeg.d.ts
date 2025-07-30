declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(input: string): FfmpegCommand;
    inputFormat(format: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    complexFilter(filterSpec: string[]): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    save(path: string): FfmpegCommand;
    on(event: 'end', callback: () => void): FfmpegCommand;
    on(event: 'error', callback: (err: Error) => void): FfmpegCommand;
  }

  function ffmpeg(): FfmpegCommand;
  export = ffmpeg;
}
