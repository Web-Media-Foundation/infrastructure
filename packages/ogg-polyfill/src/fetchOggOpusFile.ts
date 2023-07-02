import { IOggTags, IOggHeader, OggPage } from './OggPage';
import {
  IOpusPacket,
  OpusParseError,
  parseOpusPacket,
} from './parseOpusPacket';

export interface IOggParseResult<Type extends string, T> {
  type: Type;
  page: OggPage;
  data: T;
}

export interface IOggHeaderParseResult
  extends IOggParseResult<'header', IOggHeader> {}

export interface IOggTagsParseResult
  extends IOggParseResult<'tags', IOggTags> {}

export interface IOggPacketsParseResult
  extends IOggParseResult<'packets', IOpusPacket[]> {}

export async function* fetchOggOpusFile(url: string) {
  const request = await fetch(url);
  const reader = request.body?.getReader();

  if (!reader) {
    throw new TypeError(`Valid reader not found`);
  }

  let done = false;
  let buffer: Uint8Array | null = null;

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

    const page = new OggPage(buffer);

    try {
      page.validatePageSize();
    } catch (e) {
      if (e instanceof OpusParseError) {
        continue;
      }

      throw e;
    }

    if (page.pageSequenceNumber === 0) {
      const result: IOggHeaderParseResult = {
        type: 'header',
        page,
        data: page.getOggHeader(),
      };

      yield result;
    }

    if (page.pageSequenceNumber === 1) {
      const result: IOggTagsParseResult = {
        type: 'tags',
        page,
        data: page.getOggTags(),
      };

      yield result;
    }

    if (page.pageSequenceNumber > 1) {
      const packets = page.mapSegments(parseOpusPacket);

      const result: IOggPacketsParseResult = {
        type: 'packets',
        page,
        data: packets,
      };

      yield result;
    }

    buffer = buffer.slice(page.pageSize);
  }

  return null;
}
