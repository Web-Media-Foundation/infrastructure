import { IVorbisCommentHeader, IVorbisIdentificationHeader, IVorbisSetupHeader, OggVorbisPage, VorbisFormatError } from './OggVorbisPage';

export interface IOggParseResult<Type extends string, T> {
  type: Type;
  page: OggVorbisPage;
  data: T;
}

export interface IOggVorbiseHeaderIdentificationParseResult
  extends IOggParseResult<'identification', IVorbisIdentificationHeader> { }

export interface IOggVorbiseHeaderCommentParseResult
  extends IOggParseResult<'comment', IVorbisCommentHeader> { }

export interface IOggVorbiseHeaderSetupParseResult
  extends IOggParseResult<'setup', IVorbisSetupHeader> { }

export interface IOggVorbisPacketsParseResult {
  type: 'body';
  page: OggVorbisPage;
}

export async function* fetchOggVorbisFile(url: string, tolerate = false) {
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

    const page = new OggVorbisPage(buffer);

    try {
      page.validatePageSize();
    } catch (e) {
      if (e instanceof VorbisFormatError) {
        continue;
      }

      throw e;
    }

    const parseIdentification = (pageIndex = 0): IOggVorbiseHeaderIdentificationParseResult => ({
      type: 'identification',
      page,
      data: page.getIdentification(pageIndex),
    });

    const parseComments = (pageIndex = 0): IOggVorbiseHeaderCommentParseResult => ({
      type: 'comment',
      page,
      data: page.getComments(pageIndex),
    });

    const parseSetup = (audioChannels: number, pageIndex = 0): IOggVorbiseHeaderSetupParseResult => ({
      type: 'setup',
      page,
      data: page.getSetup(pageIndex, audioChannels),
    });

    const parsePackets = (): IOggVorbisPacketsParseResult => ({
      type: 'body',
      page
    });

    let accumulatedSegments = 0;
    try {

      for (let segment = 0; segment < page.pageSegments; segment += 1) {
        if (accumulatedSegments > 3) {
          yield parsePackets();
        } else if (page.isIdentificationPacket(segment)) {
          const identification = parseIdentification(segment);
          audioChannels = identification.data.audioChannels;

          yield identification;
        } else if (page.isCommentPacket(segment)) {
          yield parseComments(segment);
        } else if (page.isSetupPacket(segment)) {
          if (audioChannels !== null) {
            yield parseSetup(audioChannels, segment);
          } else {
            console.warn("Found a setup packet but no identification packet detected, will skip");
          }
        } else {
          yield parsePackets();
        }

        accumulatedSegments += 1;
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
