export const oggMagicSignature = [0x4f, 0x67, 0x67, 0x53];

export class OggFormatError extends Error { }


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
        throw new OggFormatError(`Invalid OGG magic signature at position ${i}, got ${buffer[i]} but expected ${oggMagicSignature[i]}`);
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

  getTimestamp(preSkip: number) {
    return (this.absoluteGranulePosition - BigInt(preSkip)) / BigInt(48000.0);
  }

  removePageSegment(index: number) {
    if (index < 0 || index >= this.parsedSegmentTable.length) {
      throw new RangeError('Segment index out of range');
    }

    // Calculate the starting point of the segment to be removed
    const accumulatedPageSegmentSize = this.parsedSegmentTable
      .slice(0, index)
      .reduce((a, b) => a + b, 0);
    const segmentLength = this.parsedSegmentTable[index];

    const newParsedSegmentTable = [...this.parsedSegmentTable];
    // Remove the segment from the parsedSegmentTable
    newParsedSegmentTable.splice(index, 1);

    // Update the segmentTable
    const newSegmentTable = new Uint8Array(this.segmentTable.length - 1);
    newSegmentTable.set(this.segmentTable.slice(0, index));
    newSegmentTable.set(this.segmentTable.slice(index + 1), index);

    // Create a new buffer excluding the segment to be removed
    const newBuffer = new Uint8Array(this.buffer.length - segmentLength);
    newBuffer.set(this.buffer.slice(0, 27 + this.pageSegments + accumulatedPageSegmentSize));
    newBuffer.set(
      this.buffer.slice(27 + this.pageSegments + accumulatedPageSegmentSize + segmentLength),
      27 + this.pageSegments + accumulatedPageSegmentSize
    );

    return new OggPage(newBuffer);
  }
}
