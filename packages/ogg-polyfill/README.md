# @web-media/ogg-polyfill

[![GitHub](https://img.shields.io/github/license/web-media-foundation/infrastructure)](https://github.com/Web-Media-Foundation/infrastructure)
[![npm](https://img.shields.io/npm/v/%40web-media%2Fogg-polyfill)](https://www.npmjs.com/package/@web-media/ogg-polyfill)
[![Static Badge](https://img.shields.io/badge/demo-blue?logo=CodeSandbox&label=CSB)](https://codesandbox.io/s/web-media-ogg-polyfill-demo-8x5wk8)

`@web-media/ogg-polyfill` is a web infrastructure project that provides Ogg
format support for Safari.

## Features

Compared to other implementations, `@web-media/ogg-polyfill` offers superior
performance thanks to our implementation approach. In fact, we don't perform
complex transcoding on media files; instead, we simply replace the audio
container with the [CAF format](https://en.wikipedia.org/wiki/Core_Audio_Format).
By doing so, we only need to break down and reassemble the binary sequences of
the Ogg files, a process so fast that it's hardly noticeable to our users.

# Limitations

- To play an Ogg file from another origin, the server must respond with a
  CORS header in accordance with the [same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy)
  for media files.
- Vorbis encoding is not supported since Safari does not provide Vorbis encoding
  support within the browser.
- Lossless encoding is not supported. Typically, you can use the FLAC container
  to achieve the playback. Thus, we haven't seen a need to implement this
  feature. If you have such a requirement, please let us know!
- Ogg files containing VBR Opus can be converted, but will not be playable
  even on Safari 17.  Use CBR (not VBR, not CVBR) only.

# Usage

Currently, our implementation does not automatically replace all Ogg media
requests. Please use this API to perform the operation.

```typescript
const x = fetchOggOpusFile(oggExample);
const caf = oggOpusToCaf(x, true);

let done = false;
let data: Uint8Array[] = [];

while (!done) {
  const { done: d, value: v } = await caf.next();
  done = !!d;

  if (v) {
    data.push(v.raw);
  }
}

const cafFileSize = data.reduce((acc, curr) => acc + curr.byteLength, 0);
const cafBinaryData = new Uint8Array(cafFileSize);

let offset = 0;

for (const chunk of data) {
  cafBinaryData.set(chunk, offset);
  offset += chunk.byteLength;
}
```

`cafBinaryData` is the converted file. You can use the [`URL.createObjectURL`](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
API to pass this file to an audio tag for playback, or you can directly pass
this binary sequence to the Audio Context API for playback or processing.

# Credit

Ah, let's give a standing ovation to Apple for their splendidly dreadful browser
implementation and their impeccable taste in technology. Without these
awe-inspiring gems of incompetence, we wouldn't have been graced with the
glorious existence of this marvelous tool 🙃.
