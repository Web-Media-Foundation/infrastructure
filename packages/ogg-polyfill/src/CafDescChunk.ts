import { CafChunkStore } from "./CafChunk";

export interface ICAFDescriptionChunk {
  sampleRate: number;
  formatID: string;
  formatFlags: number;
  bytesPerPacket: number;
  framesPerPacket: number;
  channelsPerFrame: number;
  bitsPerChannel: number;
}

export class CafDescChunk {
  sampleRate: number;
  formatID: string;
  formatFlags: number;
  bytesPerPacket: number;
  framesPerPacket: number;
  channelsPerFrame: number;
  bitsPerChannel: number;

  readonly type = "desc";

  constructor(x: ICAFDescriptionChunk) {
    this.sampleRate = x.sampleRate;
    this.formatID = x.formatID;
    this.formatFlags = x.formatFlags;
    this.bytesPerPacket = x.bytesPerPacket;
    this.framesPerPacket = x.framesPerPacket;
    this.channelsPerFrame = x.channelsPerFrame;
    this.bitsPerChannel = x.bitsPerChannel;
  }

  static from = (data: Uint8Array) => {
    const chunkStore = new CafChunkStore(data);

    if (chunkStore.type !== "desc") {
      throw new TypeError(`Not a description chunk`);
    }

    const dataView = new DataView(chunkStore.body.buffer);

    const sampleRate = dataView.getFloat64(0, false);
    const formatID = String.fromCharCode(...chunkStore.body.subarray(8, 12));
    const formatFlags = dataView.getUint32(12, false);
    const bytesPerPacket = dataView.getUint32(16, false);
    const framesPerPacket = dataView.getUint32(20, false);
    const channelsPerFrame = dataView.getUint32(24, false);
    const bitsPerChannel = dataView.getUint32(28, false);

    return new CafDescChunk({
      sampleRate,
      formatID,
      formatFlags,
      bytesPerPacket,
      framesPerPacket,
      channelsPerFrame,
      bitsPerChannel,
    });
  };

  get byteLength() {
    return 44;
  }

  encode = () => {
    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);

    result.set(new TextEncoder().encode(this.type));
    dataView.setBigUint64(4, 32n, false);

    const h = CafChunkStore.headerSize;
    dataView.setFloat64(h, this.sampleRate, false);
    result.set(new TextEncoder().encode(this.formatID), h + 8);
    dataView.setUint32(h + 12, this.formatFlags, false);
    dataView.setUint32(h + 16, this.bytesPerPacket, false);
    dataView.setUint32(h + 20, this.framesPerPacket, false);
    dataView.setUint32(h + 24, this.channelsPerFrame, false);
    dataView.setUint32(h + 28, this.bitsPerChannel, false);

    return result;
  };
}
