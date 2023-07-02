export enum Mode {
  SILK,
  Hybrid,
  CELT,
}

export enum BandWidth {
  NB,
  MB,
  WB,
  SWB,
  FB,
}

export enum FrameSize {
  Ms2d5 = 2.5,
  Ms5 = 5,
  Ms10 = 10,
  Ms20 = 20,
  Ms40 = 40,
  Ms60 = 60,
}

interface OpusFrameConfig {
  index: number;
  mode: Mode;
  bandWidth: BandWidth;
  frameSize: FrameSize;
}

const CONFIGS: OpusFrameConfig[] = [
  {
    index: 0,
    mode: Mode.SILK,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 1,
    mode: Mode.SILK,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 2,
    mode: Mode.SILK,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms40,
  },
  {
    index: 3,
    mode: Mode.SILK,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms60,
  },
  {
    index: 4,
    mode: Mode.SILK,
    bandWidth: BandWidth.MB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 5,
    mode: Mode.SILK,
    bandWidth: BandWidth.MB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 6,
    mode: Mode.SILK,
    bandWidth: BandWidth.MB,
    frameSize: FrameSize.Ms40,
  },
  {
    index: 7,
    mode: Mode.SILK,
    bandWidth: BandWidth.MB,
    frameSize: FrameSize.Ms60,
  },
  {
    index: 8,
    mode: Mode.SILK,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 9,
    mode: Mode.SILK,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 10,
    mode: Mode.SILK,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms40,
  },
  {
    index: 11,
    mode: Mode.SILK,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms60,
  },
  {
    index: 12,
    mode: Mode.Hybrid,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 13,
    mode: Mode.Hybrid,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 14,
    mode: Mode.Hybrid,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 15,
    mode: Mode.Hybrid,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 16,
    mode: Mode.CELT,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms2d5,
  },
  {
    index: 17,
    mode: Mode.CELT,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms5,
  },
  {
    index: 18,
    mode: Mode.CELT,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 19,
    mode: Mode.CELT,
    bandWidth: BandWidth.NB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 20,
    mode: Mode.CELT,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms2d5,
  },
  {
    index: 21,
    mode: Mode.CELT,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms5,
  },
  {
    index: 22,
    mode: Mode.CELT,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 23,
    mode: Mode.CELT,
    bandWidth: BandWidth.WB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 24,
    mode: Mode.CELT,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms2d5,
  },
  {
    index: 25,
    mode: Mode.CELT,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms5,
  },
  {
    index: 26,
    mode: Mode.CELT,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 27,
    mode: Mode.CELT,
    bandWidth: BandWidth.SWB,
    frameSize: FrameSize.Ms20,
  },
  {
    index: 28,
    mode: Mode.CELT,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms2d5,
  },
  {
    index: 29,
    mode: Mode.CELT,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms5,
  },
  {
    index: 30,
    mode: Mode.CELT,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms10,
  },
  {
    index: 31,
    mode: Mode.CELT,
    bandWidth: BandWidth.FB,
    frameSize: FrameSize.Ms20,
  },
];

CONFIGS.map((x) => Object.freeze(x));

export enum Channel {
  Mono = 0,
  Stereo = 1,
}

export class OpusParseError extends Error {}

const parseDoubleByteFrameLength = (byte1: number, byte2: number) => {
  return byte2 * 4 + byte1;
};

const parseFrameLengthCoding = (dataView: DataView, index: number) => {
  if (dataView.byteLength <= index + 1) {
    throw new OpusParseError(
      `Unable to parse the frame length, insufficient data length (expected at least ${index} bytes, got ${dataView.byteLength}), check: https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.1`
    );
  }

  const result = parseDoubleByteFrameLength(
    dataView.getUint8(index),
    dataView.getUint8(index + 1)
  );

  return result;
};

export interface IOpusPacket {
  config: OpusFrameConfig;
  channel: Channel;
  framesFlag: number;
  paddingLength: number;
  frameLengthByteLength: number;
  frameByteLengths: number[];
}

export const parseOpusPacket = (x: Uint8Array): IOpusPacket => {
  const tocByte = x[0];
  const configLabel = (tocByte & 0b11111000) >>> 3;

  const dataView = new DataView(x.buffer);

  const config = CONFIGS[configLabel];

  const channel = ((tocByte & 0b00000100) >>> 2) as Channel;

  const framesFlag = tocByte & 0b00000011;

  let frames = 0;
  let hasPadding = false;
  let paddingLength = 0;
  let frameLengthByteLength = 0;
  const frameByteLengths: number[] = [];

  if (framesFlag === 0) {
    // Implements https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.2
    frames = 1;
    frameByteLengths.push(x.byteLength - 1);
  } else if (framesFlag === 1) {
    // Implements https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.3
    frames = 2;

    if ((x.byteLength - 1) % 2 === 1) {
      throw new OpusParseError(
        `Code 1 packets MUST have an odd total length, but got a ${x.byteLength}bytes packet, check: https://datatracker.ietf.org/doc/html/rfc6716#ref-R3`
      );
    }

    frameByteLengths.push((x.byteLength - 1) / 2);
  } else if (framesFlag === 2) {
    frames = 2;

    if (x.byteLength === 1) {
      throw new OpusParseError(
        `A 1-byte code 2 packet is invalid, see: https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.4`
      );
    }

    frameLengthByteLength = dataView.getUint8(1) > 251 ? 2 : 1;

    if (x.byteLength === 2 && frameLengthByteLength === 2) {
      throw new OpusParseError(
        `A 2-byte code 2 packet whose second byte is in the range 252...255 is invalid, see: https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.4`
      );
    }
    if (frameLengthByteLength === 2) {
      // Implements https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.4
      const firstFrameByteLength = parseFrameLengthCoding(dataView, 1);
      frameByteLengths.push(
        firstFrameByteLength,
        x.byteLength - 3 - firstFrameByteLength
      );
    } else if (frameLengthByteLength === 1) {
      const firstFrameByteLength = dataView.getUint8(1);
      frameByteLengths.push(
        firstFrameByteLength,
        x.byteLength - 2 - firstFrameByteLength
      );
    } else {
      throw new OpusParseError(`Unexpected frame length byte length.`);
    }
  } else if (framesFlag === 3) {
    if (x.byteLength < 2) {
      throw new OpusParseError(
        `Code 3 packets MUST have at least 2 bytes, check: https://datatracker.ietf.org/doc/html/rfc6716#ref-R6`
      );
    }
    const frameCountByte = x[1];
    frames = frameCountByte & 0b00111111;
    hasPadding = !!((frameCountByte & 0b01000000) >>> 6);
    const isCBR = !!((frameCountByte & 0b10000000) >>> 7);

    if (frames > 48) {
      throw new OpusParseError(
        `The maximum frame count for any code 3 is 48, but got ${frameCountByte}, check: https://datatracker.ietf.org/doc/html/rfc6716#ref-R5`
      );
    }

    if (frames === 0) {
      throw new OpusParseError(
        `Code 3 packets contain at least one frame, check: https://datatracker.ietf.org/doc/html/rfc6716#ref-R5`
      );
    }

    if (hasPadding) {
      paddingLength = dataView.getUint8(2);

      if (paddingLength === 255) {
        paddingLength = 254 + dataView.getUint8(3);
      }
    }

    if (isCBR) {
      // p is the number of header bytes used to indicate the padding size plus the number of padding bytes themselves.
      const p = (paddingLength > 254 ? 2 : 1) + paddingLength;
      // In the CBR case, let R=N-2-P be the number of bytes remaining in the packet after subtracting the (optional) padding.
      const r = x.byteLength - 2 - p;
      const frameSize = r / frames;

      if (frameSize !== Math.round(frameSize)) {
        throw new OpusParseError(
          `The value R MUST be a non-negative integer multiple of M (R=${r}, M=${frames}), check: https://datatracker.ietf.org/doc/html/rfc6716#ref-R6`
        );
      }

      for (let i = 0; i < frames; i += 1) {
        frameByteLengths.push(frameSize);
      }
    } else {
      for (let i = 0; i < frames; i += 1) {
        // Implemented https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.1
        const beginIndex = 2 + frameLengthByteLength;

        if (x.byteLength <= beginIndex) {
          throw new OpusParseError(
            `Failed to parse frame byte length for frame #${i}, insufficient data length (expected at least ${beginIndex} bytes, got ${dataView.byteLength}), see: https://datatracker.ietf.org/doc/html/rfc6716#section-3.2.1`
          );
        }

        let frameByteLength = 0;
        const thisFrameLengthByteLength =
          dataView.getUint8(beginIndex) > 251 ? 1 : 2;

        if (thisFrameLengthByteLength === 2) {
          frameByteLength = parseFrameLengthCoding(dataView, beginIndex);
        } else if (thisFrameLengthByteLength === 1) {
          frameByteLength = dataView.getUint8(beginIndex);
        } else {
          throw new OpusParseError(`Unexpected frame length byte length.`);
        }

        frameByteLengths.push(frameByteLength);
        frameLengthByteLength += thisFrameLengthByteLength;
      }
    }
  } else {
    throw new OpusParseError(`Invalid frames flag.`);
  }

  return {
    config,
    channel,
    framesFlag,
    paddingLength,
    frameLengthByteLength,
    frameByteLengths,
  };
};
