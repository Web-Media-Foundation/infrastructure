import { MediaDeMuxAdapter } from '../MediaDeMuxAdapter';

export interface RawFrameHeader {
  type: 'raw';
  mpegVersion: number;
  mpegLayer: number;
  sampleRate: number;
  channelMode: number;
}

export interface ParsedMetadata {
  type: 'parsed';
  mpegVersion: number;
  mpegLayer: number;
  sampleRate: number;
  channelMode: string;
}

export interface SeekableParsedMetadata extends ParsedMetadata {
  start: number;
  end: number;
}

const mpegVersionLookup: Record<string, number> = {
  0: 2,
  1: 1,
};

const mpegLayerLookup: Record<string, number> = {
  1: 3,
  2: 2,
  3: 1,
};

const sampleRateLookup: Record<string, number> = {
  0: 44100,
  1: 48000,
  2: 32000,
};

const channelModeLookup: Record<string, string> = {
  0: 'stereo',
  1: 'joint stereo',
  2: 'dual channel',
  3: 'mono',
};

// You should see [73, 68, 51, 4, 0, 0, 0, 0, 0, 0] in your debugger.
const id3Header = new Uint8Array([
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

// http://mpgedit.org/mpgedit/mpeg_format/mpeghdr.htm
const bitrateLookup: Record<string, (number | null)[]> = {
  11: [null, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  12: [null, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  13: [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  21: [null, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  22: [null, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

// eslint-disable-next-line prefer-destructuring
bitrateLookup[23] = bitrateLookup[22];

const CHUNK_SIZE = 64 * 1024;

export class Mp3DeMuxAdapter extends MediaDeMuxAdapter<
  {},
  SeekableParsedMetadata[]
> {
  metadata = {};

  appendData = (value: Uint8Array, isLastChunk: boolean) => {
    let lastHeaderPosition: number | undefined | null = null;
    const frameMetadataSequence: SeekableParsedMetadata[] = [];

    let skip = 0;
    for (let i = 0; i < value.length; i += 1) {
      const headerValidate = Mp3DeMuxAdapter.validateHeader(value, i);

      if (!headerValidate) continue;

      skip = i;
      break;
    }

    // We found a valid header now
    const fileFrameHeader = Mp3DeMuxAdapter.processFrameHeader(value, skip);
    const fileMetadata = Mp3DeMuxAdapter.parseMetadata(fileFrameHeader);

    if (!this.metadata) {
      // Determine some facts about this mp3 file from the initial header
      // This is simply some random guess
      this.metadata = fileMetadata;
    }

    for (let j = skip + 4; j < value.length; j += 1) {
      const nextHeaderValidate = Mp3DeMuxAdapter.validateHeader(value, j);

      if (!nextHeaderValidate) continue;

      const start = lastHeaderPosition === null ? skip : lastHeaderPosition;

      const frameFrameHeader = Mp3DeMuxAdapter.processFrameHeader(value, j);
      const frameMetadata = Mp3DeMuxAdapter.parseMetadata(frameFrameHeader);

      if (j - start <= 4) continue;

      frameMetadataSequence.push({
        ...frameMetadata,
        start,
        end: j,
      });

      lastHeaderPosition = j;

      const frameLength = Mp3DeMuxAdapter.getFrameLength(
        value,
        j,
        frameMetadata
      );

      j += frameLength;
      j += 3;

      if (j > CHUNK_SIZE) break;
    }

    if (frameMetadataSequence.length < 4) {
      return null;
    }

    const { start } = frameMetadataSequence[0];
    let { end } = frameMetadataSequence[frameMetadataSequence.length - 1];

    if (isLastChunk) {
      end = value.length;
    }

    const rawChunkData = value.slice(start, end);

    const newChunk = {
      rawData: rawChunkData,
      metadata: frameMetadataSequence,
      duration: frameMetadataSequence.reduce(
        (a, x) => 1152 / x.sampleRate + a,
        0
      ),
      frames: frameMetadataSequence.length,
      get wrappedData() {
        return Mp3DeMuxAdapter.wrapChunk(this.rawData);
      },
    };

    return {
      skipped: start,
      consumed: start + rawChunkData.length,
      data: newChunk,
    };
  };

  static validateHeader = (data: Uint8Array, i = 0) => {
    // First 11 bits should be set to 1, and the 12nd bit should be 1 if the audio is MPEG Version 1 or
    // MPEG Version 2, this means MPEG Version 2.5 is not supported by this library.
    if (data[i + 0] !== 0b11111111 || (data[i + 1] & 0b11110000) !== 0b11110000)
      return false;

    const valid =
      // Layer Description should not be 00, since it is reserved
      (data[i + 1] & 0b00000110) !== 0b00000000 &&
      // Bitrate should not be 1111, since it is bad
      (data[i + 2] & 0b11110000) !== 0b11110000 &&
      // Sampling Rate Frequency should not be 11, the value is reserved
      (data[i + 2] & 0b00001100) !== 0b00001100 &&
      // Emphasis should not be 10, the value is reserved
      (data[i + 2] & 0b00000011) !== 0b00000010;

    return valid;
  };

  static processFrameHeader = (data: Uint8Array, i = 0): RawFrameHeader => {
    if (data[i + 0] !== 0b11111111 || (data[i + 1] & 0b11110000) !== 0b11110000)
      throw new TypeError(`Invalid frame header!`);

    return {
      type: 'raw',
      mpegVersion: data[i + 1] & 0b00001000,
      mpegLayer: data[i + 1] & 0b00000110,
      sampleRate: data[i + 2] & 0b00001100,
      channelMode: data[i + 3] & 0b11000000,
    } as const
  };

  static parseMetadata = (metadata: RawFrameHeader): ParsedMetadata => {
    const mpegVersion = mpegVersionLookup[metadata.mpegVersion >> 3];

    return {
      type: 'parsed',
      mpegVersion,
      mpegLayer: mpegLayerLookup[metadata.mpegLayer >> 1],
      sampleRate: sampleRateLookup[metadata.sampleRate >> 2] / mpegVersion,
      channelMode: channelModeLookup[metadata.channelMode >> 6],
    };
  };

  static wrapChunk = (original: Uint8Array) => {
    if (original.length >= 3) {
      if (
        original[0] === 0x49 &&
        original[1] === 0x44 &&
        original[2] === 0x33
      ) {
        // already has ID3 header
        return original;
      }
    }

    const result = new Uint8Array(id3Header.length + original.length);

    for (let i = 0; i < id3Header.length; i += 1) {
      result[i] = id3Header[i];
    }

    for (let i = 0; i < original.length; i += 1) {
      result[i + id3Header.length] = original[i];
    }

    return result;
  };

  /**
   * Frame length is length of a frame when compressed. It is calculated in
   * slots. One slot is 4 bytes long for Layer I, and one byte long for Layer II
   * and Layer III.
   */
  static getFrameLength = (
    data: Uint8Array,
    i: number,
    metadata: ParsedMetadata
  ) => {
    const { mpegVersion, mpegLayer, sampleRate } = metadata;

    const bitrateCode = (data[i + 2] & 0b11110000) >> 4;

    const bitrateBase = bitrateLookup[`${mpegVersion}${mpegLayer}`][bitrateCode];

    if (!bitrateBase) {
      throw new TypeError(`Bitrate not found`);
    }

    const bitrate = bitrateBase * 1e3;
    const padding = (data[i + 2] & 0b00000010) >> 1;

    const length = ~~(mpegLayer === 1
      ? ((12 * bitrate) / sampleRate + padding) * 4
      : (144 * bitrate) / sampleRate + padding);

    return length;
  };
}
