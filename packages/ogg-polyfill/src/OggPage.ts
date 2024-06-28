const oggMagicSignature = [0x4f, 0x67, 0x67, 0x53];
const opusHeadMagicSignature = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const opusCommentMagicSignature = [
  0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73,
];

export class OggFormatError extends Error { }

export interface IOpusChannelMapping {
  streamCount: number;
  coupledCount: number;
  channelMapping: number[];
}

export interface IOggHeader {
  version: number;
  channelCount: number;
  preSkip: number;
  inputSampleRate: number;
  outputGain: number;
  mappingFamily: number;
  channelMapping: IOpusChannelMapping | null;
}

export interface IOggTags {
  vendorString: string;
  userCommentString: string[];
}

export class OggPage {
  ready = false;

  structureVersion: number;

  headerType: number;

  isFreshPacket: boolean;

  isBos: boolean;

  isBoe: boolean;

  absoluteGranulePosition: bigint;

  streamSerialNumber: number;

  pageSequenceNumber: number;

  pageChecksum: number;

  pageSegments: number;

  segmentTable: Uint8Array;

  parsedSegmentTable: number[];

  dataView: DataView;

  pageSize: number;

  constructor(readonly buffer: Uint8Array) {
    const { dataView, pageSize, pageSegmentsCount } =
      OggPage.validatePage(buffer);

    this.dataView = dataView;
    this.structureVersion = dataView.getUint8(4);

    const headerType = dataView.getUint8(5);
    this.headerType = headerType;
    this.isFreshPacket = !(headerType & 0x1);
    this.isBos = !!((headerType & 0x2) >>> 1);
    this.isBoe = !!((headerType & 0x4) >>> 2);

    this.absoluteGranulePosition = dataView.getBigUint64(6, true);
    this.streamSerialNumber = dataView.getUint32(14, true);
    this.pageSequenceNumber = dataView.getUint32(18, true);
    this.pageChecksum = dataView.getUint32(22, true);
    this.pageSegments = pageSegmentsCount;
    this.segmentTable = buffer.slice(27, 27 + pageSegmentsCount);

    this.pageSize = pageSize;

    this.buffer = buffer.slice(0, pageSize);

    this.parsedSegmentTable = [];

    // RFC3533 Page 7
    let accumulatedSize = 0;
    for (let i = 0, l = this.segmentTable.length; i < l; i += 1) {
      const segmentSize = this.segmentTable[i];

      if (segmentSize === 255) {
        accumulatedSize += segmentSize;

        continue;
      }

      if (accumulatedSize > 0) {
        accumulatedSize += segmentSize;
        this.parsedSegmentTable.push(accumulatedSize);
        accumulatedSize = 0;

        continue;
      }

      if (segmentSize !== 0) {
        this.parsedSegmentTable.push(segmentSize);
      }
    }
  }

  validatePageSize = () => {
    const headerSize = this.pageSegments + 27;
    const pageBodySize = this.segmentTable.reduce((a, b) => a + b, 0);
    const pageSize = headerSize + pageBodySize;

    if (pageSize !== this.buffer.byteLength) {
      throw new TypeError(
        `Invalid page size, expected ${pageSize}bytes but actually ${this.buffer.byteLength}bytes.`
      );
    }
  };

  getPageSegment = (i: number) => {
    const accumulatedPageSegmentSize = this.parsedSegmentTable
      .slice(0, i)
      .reduce((a, b) => a + b, 0);
    const segmentLength = this.parsedSegmentTable[i];

    return this.buffer.slice(
      27 + this.pageSegments + accumulatedPageSegmentSize,
      27 + this.pageSegments + accumulatedPageSegmentSize + segmentLength
    );
  };

  mapSegments = <T>(callback: (x: Uint8Array, index: number) => T) => {
    const parsedSegmentLength = this.parsedSegmentTable.length;
    const result = new Array<T>(parsedSegmentLength);

    for (let i = 0; i < parsedSegmentLength; i += 1) {
      result[i] = callback(this.getPageSegment(i), i);
    }

    return result;
  };

  static validatePage(buffer: Uint8Array) {
    for (let i = 0; i < oggMagicSignature.length; i += 1) {
      if (buffer[i] !== oggMagicSignature[i]) {
        throw new OggFormatError('Invalid OGG magic signature');
      }
    }

    // OGG page header incomplete
    if (buffer.length < 27) {
      throw new OggFormatError('Incomplete buffer length');
    }
    const dataView = new DataView(buffer.buffer);

    const pageSegmentsCount = dataView.getUint8(26);
    // OGG segment table incomplete
    if (buffer.length < 27 + pageSegmentsCount) {
      throw new OggFormatError('Incomplete segment table');
    }

    let pageBodySize = 0;
    for (let i = 0; i < pageSegmentsCount; i += 1) {
      const segmentLength = dataView.getUint8(27 + i);
      pageBodySize += segmentLength;
    }

    const pageSize = 27 + pageSegmentsCount + pageBodySize;
    // OGG content not loaded completely
    if (buffer.length < pageSize) {
      throw new OggFormatError('Insufficient page size');
    }

    return { dataView, pageBodySize, pageSize, pageSegmentsCount };
  }

  getOggHeader(): IOggHeader {
    const array = this.getPageSegment(0);
    const dataView = new DataView(array.buffer);

    if (!this.isHeaderPage()) {
      throw new OggFormatError('Invalid magic signature');
    }

    const version = dataView.getUint8(8);
    const channelCount = dataView.getUint8(9);
    const preSkip = dataView.getUint16(10, true);
    const inputSampleRate = dataView.getUint32(12, true);
    const outputGain = dataView.getUint16(16, true);
    const mappingFamily = dataView.getUint8(18);

    let channelMapping: IOpusChannelMapping | null = null;

    if (array.length > 19) {
      const streamCount = dataView.getUint8(19);
      const coupledCount = dataView.getUint8(20);

      const channelMappings: number[] = [];

      for (let i = 0; i < channelCount; i += 1) {
        channelMappings.push(dataView.getUint8(21 + i));
      }

      channelMapping = {
        streamCount,
        coupledCount,
        channelMapping: channelMappings,
      };
    }

    return {
      version,
      channelCount,
      preSkip,
      inputSampleRate,
      outputGain,
      mappingFamily,
      channelMapping,
    };
  }

  getOggTags(): IOggTags {
    const array = this.getPageSegment(0);
    const dataView = new DataView(array.buffer);

    if (!this.isTagsPage()) {
      throw new Error('Invalid magic signature.');
    }

    const vendorStringLength = dataView.getInt32(8, true);
    const vendorString = new TextDecoder().decode(
      array.slice(12, 12 + vendorStringLength)
    );

    const userCommentListLength = dataView.getInt32(
      12 + vendorStringLength,
      true
    );

    let commentListLengthLeft = userCommentListLength;
    const userCommentStrings: string[] = [];

    while (commentListLengthLeft > 0) {
      const offset = userCommentListLength - commentListLengthLeft;
      const userCommentStringLength = dataView.getInt32(
        12 + vendorStringLength + 4 + offset,
        true
      );
      const userCommentString = new TextDecoder().decode(
        array.slice(
          12 + vendorStringLength + 8 + offset,
          12 + vendorStringLength + 8 + offset + userCommentStringLength
        )
      );

      userCommentStrings.push(userCommentString);

      commentListLengthLeft -= userCommentStringLength + 4;
    }

    return {
      vendorString,
      userCommentString: userCommentStrings,
    };
  }

  getTimestamp(preSkip: number) {
    return (this.absoluteGranulePosition - BigInt(preSkip)) / BigInt(48000.0);
  }

  isHeaderPage(): boolean {
    const array = this.getPageSegment(0);
    for (let i = 0; i < opusHeadMagicSignature.length; i += 1) {
      console.log('yes');
      if (array[i] !== opusHeadMagicSignature[i]) {
        console.log('no');
        return false;
      }
    }
    return true;
  }

  isTagsPage(): boolean {
    const array = this.getPageSegment(0);
    for (let i = 0; i < opusCommentMagicSignature.length; i += 1) {
      if (array[i] !== opusCommentMagicSignature[i]) {
        return false;
      }
    }
    return true;
  }
}
