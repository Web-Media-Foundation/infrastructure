import { oggMagicSignature } from './OggPage';
import { IVorbisCommentHeader, IVorbisIdentificationHeader, IVorbisSetupHeader, OggVorbisPage, VorbisFormatError } from './OggVorbisPage';

export interface IOggParseResult<Type extends string, T> {
  type: Type;
  data: T;
  index: number;
  getRawSegment: () => Uint8Array;
}

export interface IOggVorbiseHeaderIdentificationParseResult
  extends IOggParseResult<'identification', IVorbisIdentificationHeader> { }

export interface IOggVorbiseHeaderCommentParseResult
  extends IOggParseResult<'comment', IVorbisCommentHeader> { }

export interface IOggVorbiseHeaderSetupParseResult
  extends IOggParseResult<'setup', IVorbisSetupHeader> { }

export interface IOggVorbisPacketsParseResult {
  type: 'body';
  index: number;
  getRawSegment: () => Uint8Array;
}

export type IOggVorbisParseResult =
  | IOggVorbiseHeaderIdentificationParseResult
  | IOggVorbiseHeaderCommentParseResult
  | IOggVorbiseHeaderSetupParseResult
  | IOggVorbisPacketsParseResult;

export interface IOggVorbisPage {
  page: OggVorbisPage;
  packets: IOggVorbisParseResult[];
}

export async function* fetchOggVorbisFile(url: string, tolerate = false, headerSearchRange = 3) {
  const request = await fetch(url);
  const reader = request.body?.getReader();

  if (!reader) {
    throw new TypeError(`Valid reader not found`);
  }

  let done = false;
  let buffer: Uint8Array | null = null;

  let audioChannels: number | null = null;

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

    if (done && buffer.byteLength < oggMagicSignature.length) {
      // The leftover should not be parsed anymore
      break;
    }

    const page = new OggVorbisPage(buffer);

    try {
      page.validatePageSize();
    } catch (e) {
      if (e instanceof VorbisFormatError) {
        continue;
      }

      throw e;
    }

    const result: IOggVorbisPage = {
      page,
      packets: [],
    };

    const parseIdentification = (pageIndex = 0): IOggVorbiseHeaderIdentificationParseResult => ({
      type: 'identification',
      data: page.getIdentification(pageIndex),
      index: pageIndex,
      getRawSegment: () => page.getPageSegment(pageIndex),
    });

    const parseComments = (pageIndex = 0): IOggVorbiseHeaderCommentParseResult => ({
      type: 'comment',
      data: page.getComments(pageIndex),
      index: pageIndex,
      getRawSegment: () => page.getPageSegment(pageIndex),
    });

    const parseSetup = (channels: number, pageIndex = 0): IOggVorbiseHeaderSetupParseResult => ({
      type: 'setup',
      data: page.getSetup(channels, pageIndex),
      index: pageIndex,
      getRawSegment: () => page.getPageSegment(pageIndex),
    });

    const parseBody = (pageIndex: number): IOggVorbisPacketsParseResult => ({
      type: 'body',
      index: pageIndex,
      getRawSegment: () => page.getPageSegment(pageIndex),
    });

    let accumulatedSegments = 0;
    try {
      for (let segment = 0; segment < page.pageSegments; segment += 1) {
        if (accumulatedSegments > headerSearchRange) {
          result.packets.push(parseBody(segment));
        } else if (page.isIdentificationPacket(segment)) {
          const identification = parseIdentification(segment);
          audioChannels = identification.data.audioChannels;

          result.packets.push(identification);
        } else if (page.isCommentPacket(segment)) {
          result.packets.push(parseComments(segment));
        } else if (page.isSetupPacket(segment)) {
          if (audioChannels !== null) {
            result.packets.push(parseSetup(audioChannels, segment));
          } else {
            // Wee need to tell developers that the file is abnormal
            // eslint-disable-next-line no-console
            console.warn("Found a setup packet but no identification packet detected, will skip");
          }
        } else {
          result.packets.push(parseBody(segment));
        }
        accumulatedSegments += 1;
      }

      yield result;
      buffer = buffer.slice(page.pageSize);
    } catch (e) {
      if (!tolerate) {
        throw e;
      } else {
        buffer = buffer.slice(1);
      }
    }

  }

  return null;
}
