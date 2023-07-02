import { CafChanChunk } from './CafChanChunk';
import { CafDataChunk } from './CafDataChunk';
import { CafDescChunk } from './CafDescChunk';
import { CafPaktChunk } from './CafPaktChunk';
import { CafChunkStore } from './CafChunk';
import { CafHeaderChunk } from './CafHeaderChunk';
import { ICAFChunkHeader, readCafChunkHeader } from './readCafChunkHeader';

export type CafChunk =
  | CafChanChunk
  | CafDataChunk
  | CafDescChunk
  | CafPaktChunk
  | CafChunkStore
  | CafHeaderChunk;

interface ITestModeResult {
  header: ICAFChunkHeader;
  raw: Uint8Array;
  chunk: CafChunk;
}

const CAF_HEADER_CHUNK_HEADER = {
  chunkType: '#header',
  chunkSize: 8n,
};

export async function* fetchCafOpusFile<TestMode extends boolean>(
  url: string,
  testMode: TestMode
): AsyncGenerator<
  TestMode extends true ? ITestModeResult : CafChunk,
  null,
  unknown
> {
  type R = TestMode extends true ? ITestModeResult : CafChunk;
  const request = await fetch(url);
  const reader = request.body?.getReader();

  if (!reader) {
    throw new TypeError(`Valid reader not found`);
  }

  let done = false;
  let buffer: Uint8Array | null = null;

  let headerParsed = false;

  while (!done || (buffer && buffer.length)) {
    const { value, done: d } = await reader.read();
    done = d;

    if (!buffer && value) {
      buffer = value;
    } else if (buffer && value) {
      const nextBuffer: Uint8Array = new Uint8Array(
        buffer.length + value.length
      );
      nextBuffer.set(buffer);
      nextBuffer.set(value, buffer.length);
      buffer = nextBuffer;
    }

    if (!buffer) {
      throw new Error('Buffer not ready');
    }

    if (!headerParsed) {
      if (buffer.length < 8) {
        continue;
      }

      const headerBuffer = buffer.slice(0, 8);
      const headerChunk = CafHeaderChunk.from(headerBuffer);
      buffer = buffer.slice(8);

      headerParsed = true;

      if (testMode) {
        yield {
          header: CAF_HEADER_CHUNK_HEADER,
          chunk: headerChunk,
          raw: headerBuffer,
        } as R;
      } else {
        yield headerChunk as R;
      }
    }

    const header = readCafChunkHeader(buffer);
    const bodySize = Number(header.chunkSize);
    const totalSize = CafChunkStore.headerSize + bodySize;

    if (buffer.length < totalSize) {
      continue;
    }

    const raw = buffer.slice(0, totalSize);
    buffer = buffer.slice(totalSize);

    const wrapResult = (chunk: CafChunk): R => {
      if (testMode) {
        return { header, chunk, raw } as R;
      }

      return chunk as R;
    };

    switch (header.chunkType) {
      case 'desc':
        yield wrapResult(CafDescChunk.from(raw));
        break;
      case 'chan':
        yield wrapResult(CafChanChunk.from(raw));
        break;
      case 'data':
        yield wrapResult(CafDataChunk.from(raw));
        break;
      case 'pakt':
        yield wrapResult(CafPaktChunk.from(raw));
        break;
      default:
        yield wrapResult(new CafChunkStore(raw));
    }
  }

  return null;
}
