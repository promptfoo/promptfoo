# Google media detection fixtures

Small complete media containers generated locally using ffmpeg version 6.1.1-3ubuntu5, with synthetic
440 Hz sine audio (48 kHz, 0.08 seconds) and black 32×32 video (two frames at 25 fps).
No downloaded or recorded content is used.

- `vorbis-*.ogg`: `libvorbis` audio with `TITLE=theora` or `TITLE=ordinary`.
- `opus-*.ogg`: `libopus` audio with the same comment controls.
- `theora.ogg`: `libtheora` video, retained as unsupported Ogg video.
- `webm-84.webm`: `libvpx-vp9` WebM with the normal one-byte DocType size.
- `webm-4004.webm`: identical WebM after changing DocType size `84` to `40 04`
  and increasing the enclosing EBML header length by one. The entire Segment moves
  one byte, so offsets relative to its start are unchanged.
- `matroska.mkv`: the WebM video remuxed with `-c copy -f matroska`.

All files were identified by ffprobe and fully decoded by ffmpeg with no errors.
Ogg page lengths/lacing, complete packet boundaries, BOS/EOS flags and every page
CRC were also verified. The audio comment is in the comment packet, not the codec
identification packet. These controls prove local input/request construction; they
do not prove that a model accepts the container or codec. Tests do not invoke FFmpeg.

Generation examples (replace `TITLE` with `ordinary` for the matching control):

```sh
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.08 -c:a libvorbis -metadata TITLE=theora vorbis-theora.ogg
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.08 -c:a libopus -metadata TITLE=theora opus-theora.ogg
ffmpeg -f lavfi -i color=c=black:s=32x32:r=25:d=0.08 -frames:v 2 -c:v libtheora -f ogg theora.ogg
ffmpeg -f lavfi -i color=c=black:s=32x32:r=25:d=0.08 -frames:v 2 -c:v libvpx-vp9 -f webm webm-84.webm
ffmpeg -i webm-84.webm -c copy -f matroska matroska.mkv
```
