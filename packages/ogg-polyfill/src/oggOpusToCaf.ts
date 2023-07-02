import { CafDataChunk } from './CafDataChunk';
import { CafDescChunk } from './CafDescChunk';
import { CafPaktChunk } from './CafPaktChunk';
import { CafHeaderChunk } from './CafHeaderChunk';
import {
  IOggHeaderParseResult,
  IOggPacketsParseResult,
  IOggParseResult,
  IOggTagsParseResult,
} from './fetchOggOpusFile';
import { CafChanChunk } from './CafChanChunk';
import { CafChunk } from './fetchCafOpusFile';
import { IOggHeader } from './OggPage';

const OGG_CHANNEL_COUNT_TO_CAF_CHANNEL_LAYOUT_TAG = [
  (100 << 16) | 1, // kCAFChannelLayoutTag_Mono
  (101 << 16) | 2, // kCAFChannelLayoutTag_Stereo
  (113 << 16) | 3, // kCAFChannelLayoutTag_MPEG_3_0_A (This is actually incorrect, OGG defines it as L C R, but CAF do not have such a tags)
  (108 << 16) | 4, // kCAFChannelLayoutTag_Quadraphonic
  (119 << 16) | 5, // kCAFChannelLayoutTag_MPEG_5_0_C
];

interface ITestModeResult {
  chunk: CafChunk;
  raw: Uint8Array;
}

export async function* oggOpusToCaf<TestMode extends boolean>(
  x: AsyncGenerator<
    IOggHeaderParseResult | IOggTagsParseResult | IOggPacketsParseResult,
    null
  >,
  testMode: TestMode
): AsyncGenerator<
  TestMode extends true ? ITestModeResult : CafChunk,
  TestMode extends true ? ITestModeResult : CafChunk,
  unknown
> {
  type R = TestMode extends true ? ITestModeResult : CafChunk;

  const wrapResult = (c: CafChunk): R => {
    return testMode ? ({ chunk: c, raw: c.encode() } as R) : (c as R);
  };

  yield wrapResult(
    new CafHeaderChunk({
      fileType: 'caff',
      fileVersion: 1,
      fileFlags: 0,
    })
  );

  let done = false;
  let value:
    | IOggHeaderParseResult
    | IOggTagsParseResult
    | IOggPacketsParseResult
    | null = null;

  const packetsParseResults: IOggPacketsParseResult[] = [];
  let sampleRate = -1;

  let header: IOggParseResult<'header', IOggHeader> | null = null;

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    value = v;

    if (!value) continue;

    if (value.type === 'header') {
      header = value;
      continue;
    }

    if (value.type === 'packets') {
      packetsParseResults.push(value);
    }
  }

  if (header && packetsParseResults.length) {
    const firstPacket = packetsParseResults[0];

    sampleRate = header.data.inputSampleRate;

    yield wrapResult(
      new CafDescChunk({
        sampleRate: header.data.inputSampleRate,
        formatID: 'opus',
        formatFlags: 0,
        bytesPerPacket: 0,
        framesPerPacket:
          (firstPacket.data[0].config.frameSize * header.data.inputSampleRate) /
          1000,
        channelsPerFrame: header.data.channelCount,
        bitsPerChannel: 0,
      })
    );

    yield wrapResult(
      new CafChanChunk({
        channelLayoutTag:
          OGG_CHANNEL_COUNT_TO_CAF_CHANNEL_LAYOUT_TAG[
            header.data.channelCount - 1
          ],
        channelBitmap: 0,
        numberChannelDescriptions: 0,
        channelDescriptions: [],
      })
    );
  }

  const totalDataSize = packetsParseResults
    .flatMap((y) => y.page.parsedSegmentTable)
    .reduce((a, b) => a + b, 0);

  const dataChunk = new CafDataChunk({
    editCount: 0,
    data: new Uint8Array(totalDataSize),
  });

  let offset = 0;
  for (let i = 0, l = packetsParseResults.length; i < l; i += 1) {
    const packetsParseResult = packetsParseResults[i];
    const { page } = packetsParseResult;
    for (let j = 0, ll = page.parsedSegmentTable.length; j < ll; j += 1) {
      const chunkData = page.getPageSegment(j);
      dataChunk.data.set(chunkData, offset);
      offset += chunkData.length;
    }
  }

  yield wrapResult(dataChunk);

  const numberPackets = packetsParseResults
    .map((y) => y.page.parsedSegmentTable.length)
    .reduce((a, b) => a + b, 0);

  if (sampleRate === -1) {
    throw new Error(
      'Sample rate not found in header, unable to calculate numberValidFrames'
    );
  }

  const numberValidFrames = packetsParseResults
    .flatMap((y) => y.data.map((z) => (z.config.frameSize * sampleRate) / 1000))
    .reduce((a, b) => a + b, 0);

  const body = packetsParseResults.flatMap((y) =>
    y.page.parsedSegmentTable.flatMap((packetSize) => {
      return [packetSize];
    })
  );

  return wrapResult(
    new CafPaktChunk({
      header: {
        numberPackets: BigInt(numberPackets),
        numberValidFrames: BigInt(numberValidFrames),
        primingFrames: 0,
        remainderFrames: 0,
      },

      body,
    })
  );
}
