import { IOpusTags, IOpusHeader, OggOpusPage } from './OggOpusPage';
import {
  IOpusPacket,
  OpusParseError,
  parseOpusPacket,
} from './parseOpusPacket';

export interface IOggParseResult<Type extends string, T> {
  type: Type;
  page: OggOpusPage;
  data: T;
}

export interface IOggHeaderParseResult
  extends IOggParseResult<'header', IOpusHeader> { }

export interface IOggTagsParseResult
  extends IOggParseResult<'tags', IOpusTags> { }

export interface IOggPacketsParseResult
  extends IOggParseResult<'packets', IOpusPacket[]> { }

export async function* fetchOggOpusFile(url: string, tolerate = false) {
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

    const page = new OggOpusPage(buffer);

    try {
      page.validatePageSize();
    } catch (e) {
      if (e instanceof OpusParseError) {
        continue;
      }

      throw e;
    }

    const parseHeader = (): IOggHeaderParseResult => ({
      type: 'header',
      page,
      data: page.getOggHeader(),
    });

    const parseTags = (): IOggTagsParseResult => ({
      type: 'tags',
      page,
      data: page.getOggTags(),
    })

    const parsePackets = (): IOggPacketsParseResult => ({
      type: 'packets',
      page,
      data: page.mapSegments(parseOpusPacket),
    });

    try {
      if (page.pageSequenceNumber > 1) {
        yield parsePackets();
      } else if (page.isHeaderPage()) {
        yield parseHeader();
      } else if (page.isTagsPage()) {
        yield parseTags();
      } else {
        yield parsePackets();
      }
      buffer = buffer.slice(page.pageSize);
    } catch (e) {
      if (tolerate) {
        throw e;
      } else {
        buffer = buffer.slice(1);
      }
    }

  }

  return null;
}
