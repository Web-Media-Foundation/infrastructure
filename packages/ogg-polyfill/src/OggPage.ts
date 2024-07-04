import { updateCrc32 } from "./crc";

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

    this.pageSegments = this.parsedSegmentTable.length;
  }

  validatePageSize = () => {
    const headerSize = this.segmentTable.length + 27;
    const pageBodySize = this.segmentTable.reduce((a, b) => a + b, 0);
    const pageSize = headerSize + pageBodySize;

    if (pageSize !== this.buffer.byteLength) {
      throw new TypeError(
        `Invalid page size, expected ${pageSize}bytes but actually ${this.buffer.byteLength}bytes.`
      );
    }
  };

  getPageSegment = (index: number) => {
    if (index > this.parsedSegmentTable.length) {
      throw new RangeError(`Segment start index out of range, index: ${index}, range: ${this.parsedSegmentTable.length}`);
    }
    const accumulatedPageSegmentSize = this.parsedSegmentTable
      .slice(0, index)
      .reduce((a, b) => a + b, 0);
    const segmentLength = this.parsedSegmentTable[index];

    return this.buffer.slice(
      27 + this.segmentTable.length + accumulatedPageSegmentSize,
      27 + this.segmentTable.length + accumulatedPageSegmentSize + segmentLength
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
    // Check Ogg magic signature
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
      throw new OggFormatError(`Insufficient page size, expected ${pageSize}, at least ${buffer.length}`);
    }

    return { dataView, pageBodySize, pageSize, pageSegmentsCount };
  }

  getTimestamp(preSkip: number) {
    return (this.absoluteGranulePosition - BigInt(preSkip)) / BigInt(48000.0);
  }

  static createLacedUint8Array(input: number[]): Uint8Array {
    const result: number[] = [];

    for (let i = 0; i < input.length; i += 1) {
      let value = input[i];

      while (value >= 255) {
        result.push(255);
        value -= 255;
      }

      result.push(value);
    }

    // Add a terminating 0 if the last value was 255
    if (result[result.length - 1] === 255) {
      result.push(0);
    }

    return new Uint8Array(result);
  }

  protected removePageSegmentAndGetRawResult(index: number, n: number) {
    if (index < 0) {
      throw new RangeError('index is smaller than 0');
    }
    if (index >= this.parsedSegmentTable.length) {
      throw new RangeError(`Segment start index out of range, index: ${index}, range: ${this.parsedSegmentTable.length}`);
    }
    if (n <= 0) {
      throw new RangeError('Number of segments to remove must be greater than 0');
    }
    if (index + n > this.parsedSegmentTable.length) {
      throw new RangeError(`Segment end index out of range, index: ${index + n}, range: ${this.parsedSegmentTable.length}`);
    }

    // Calculate the starting point of the segments to be removed
    const accumulatedPageSegmentSize = this.parsedSegmentTable
      .slice(0, index)
      .reduce((a, b) => a + b, 0);
    const segmentsToRemove = this.parsedSegmentTable.slice(index, index + n);
    const totalRemoveLength = segmentsToRemove.reduce((a, b) => a + b, 0);

    const newParsedSegmentTable = [...this.parsedSegmentTable];
    // Remove the segments from the parsedSegmentTable
    newParsedSegmentTable.splice(index, n);

    // Update the segmentTable
    const newSegmentTable = OggPage.createLacedUint8Array(newParsedSegmentTable);
    const newSegments = newSegmentTable.length;

    // Calculate new buffer size
    const newBufferSize = this.buffer.length - totalRemoveLength - this.segmentTable.length + newSegmentTable.length;

    // Create a new buffer excluding the segments to be removed
    const newBuffer = new Uint8Array(newBufferSize);

    // Set the header
    newBuffer.set(this.buffer.slice(0, 26));
    newBuffer.set([newSegmentTable.length], 26);
    // Set the new segment table
    newBuffer.set(newSegmentTable, 27);

    const removeFrom = 27 + this.segmentTable.length + accumulatedPageSegmentSize;
    const removeTo = removeFrom + totalRemoveLength;

    // Set the data before the segments to be removed
    newBuffer.set(
      this.buffer.slice(27 + this.segmentTable.length, removeFrom),
      27 + newSegments,
    );
    // Set the data after the segments to be removed
    newBuffer.set(
      this.buffer.slice(removeTo),
      27 + newSegments + (removeFrom - (27 + this.segmentTable.length))
    );

    // Validate the new buffer size
    if (newBuffer.length !== newBufferSize) {
      throw new Error(`Calculated new buffer size ${newBufferSize} does not match actual size ${newBuffer.length}`);
    }

    return newBuffer;
  }

  protected addPageSegmentAndGetRawResult(segments: Uint8Array[], index: number) {
    if (index < 0) {
      throw new RangeError('index is smaller than 0');
    }

    if (index > this.parsedSegmentTable.length) {
      throw new RangeError(`Segment index out of range, index: ${index}, range: ${this.parsedSegmentTable.length}`);
    }

    // Flatten packets into a single Uint8Array
    const newSegments = segments.map(packet => packet.length);
    const newSegmentTable = new Uint8Array(this.segmentTable.length + newSegments.length);
    newSegmentTable.set(this.segmentTable.slice(0, index));
    newSegmentTable.set(newSegments, index);
    newSegmentTable.set(this.segmentTable.slice(index), index + newSegments.length);

    const totalNewSegmentLength = segments.reduce((acc, packet) => acc + packet.length, 0);
    const newBuffer = new Uint8Array(this.buffer.length + totalNewSegmentLength);

    // Copy existing data before the insertion point
    const accumulatedPageSegmentSize = this.parsedSegmentTable.slice(0, index).reduce((a, b) => a + b, 0);
    newBuffer.set(this.buffer.slice(0, 27 + this.pageSegments + accumulatedPageSegmentSize));

    // Copy new segments into the new buffer
    let offset = 27 + this.pageSegments + accumulatedPageSegmentSize;
    segments.forEach(packet => {
      newBuffer.set(packet, offset);
      offset += packet.length;
    });

    // Copy remaining data after the insertion point
    newBuffer.set(this.buffer.slice(27 + this.pageSegments + accumulatedPageSegmentSize), offset);

    return newBuffer;
  }

  protected replacePageSegmentAndGetRawResult(segment: Uint8Array, index: number) {
    if (index < 0) {
      throw new RangeError('index is smaller than 0');
    }
    if (index > this.parsedSegmentTable.length) {
      throw new RangeError(`Segment index out of range, index: ${index}, range: ${this.parsedSegmentTable.length}`);
    }

    const oldSegmentSize = this.parsedSegmentTable[index];
    const newSegmentSize = segment.length;

    if (newSegmentSize > 255) {
      throw new RangeError('Segment size exceeds the maximum allowed size of 255 bytes');
    }

    // Update the segment table
    const newSegmentTable = new Uint8Array(this.segmentTable);
    newSegmentTable[index] = newSegmentSize;

    // Calculate the starting point of the segment to be replaced
    const accumulatedPageSegmentSize = this.parsedSegmentTable
      .slice(0, index)
      .reduce((a, b) => a + b, 0);

    // Create a new buffer including the replaced segment
    const newBuffer = new Uint8Array(this.buffer.length - oldSegmentSize + newSegmentSize);
    newBuffer.set(this.buffer.slice(0, 27 + this.pageSegments + accumulatedPageSegmentSize));
    newBuffer.set(segment, 27 + this.pageSegments + accumulatedPageSegmentSize);
    newBuffer.set(
      this.buffer.slice(27 + this.pageSegments + accumulatedPageSegmentSize + oldSegmentSize),
      27 + this.pageSegments + accumulatedPageSegmentSize + newSegmentSize
    );

    return newBuffer;
  }

  removePageSegment(index: number, n: number = 1) {
    return new OggPage(this.removePageSegmentAndGetRawResult(index, n));
  }

  addPageSegment(segments: Uint8Array[], index: number) {
    return new OggPage(this.addPageSegmentAndGetRawResult(segments, index));
  }

  replacePageSegment(segment: Uint8Array, index: number) {
    return new OggPage(this.replacePageSegmentAndGetRawResult(segment, index));
  }

  updatePageChecksum() {
    this.dataView.setUint32(22, 0, true);
    const crc = updateCrc32(this.buffer);
    this.dataView.setUint32(22, crc, true);
    this.pageChecksum = crc;
  }
}
