import { CafChunkStore } from "./CafChunk";

export interface ICAFChannelDescription {
  channelLabel: number;
  channelFlags: number;
  coordinates: readonly [number, number, number];
}

export interface ICAFChannelLayout {
  channelLayoutTag: number;
  channelBitmap: number;
  numberChannelDescriptions: number;
  channelDescriptions: ICAFChannelDescription[];
}

export class CafChanChunk {
  channelLayoutTag: number;
  channelBitmap: number;
  numberChannelDescriptions: number;
  channelDescriptions: ICAFChannelDescription[];

  readonly type = "chan";

  constructor(x: ICAFChannelLayout) {
    this.channelLayoutTag = x.channelLayoutTag;
    this.channelBitmap = x.channelBitmap;
    this.numberChannelDescriptions = x.numberChannelDescriptions;
    this.channelDescriptions = x.channelDescriptions;
  }

  static from = (data: Uint8Array) => {
    const chunkStore = new CafChunkStore(data);

    if (chunkStore.type !== "chan") {
      throw new TypeError(`Not a channel chunk`);
    }

    const dataView = new DataView(chunkStore.body.buffer);

    const channelLayoutTag = dataView.getUint32(0, false);
    const channelBitmap = dataView.getUint32(4, false);
    const numberChannelDescriptions = dataView.getUint32(8, false);

    const channelDescriptions: ICAFChannelDescription[] = [];

    for (let i = 0; i < numberChannelDescriptions; i++) {
      const channelLabel = dataView.getUint32(12 + i * 12, false);
      const channelFlags = dataView.getUint32(16 + i * 12, false);

      const coordinates = [
        dataView.getFloat64(20 + i * 12, false),
        dataView.getFloat64(28 + i * 12, false),
        dataView.getFloat64(36 + i * 12, false),
      ] as const;

      channelDescriptions.push({
        channelLabel,
        channelFlags,
        coordinates,
      });
    }

    return new CafChanChunk({
      channelLayoutTag,
      channelBitmap,
      numberChannelDescriptions,
      channelDescriptions,
    });
  };

  get byteLength() {
    return CafChunkStore.headerSize + 12 +
      this.numberChannelDescriptions * (this.channelDescriptions.length * 32)
  }

  encode = () => {
    const h = CafChunkStore.headerSize;

    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);

    result.set(new TextEncoder().encode(this.type));
    dataView.setBigUint64(4, BigInt(result.length - h), false);

    dataView.setUint32(h + 0, this.channelLayoutTag, false);
    dataView.setUint32(h + 4, this.channelBitmap, false);
    dataView.setUint32(h + 8, this.numberChannelDescriptions, false);

    for (let i = 0; i < this.numberChannelDescriptions; i++) {
      const channelDescription = this.channelDescriptions[i];

      dataView.setUint32(
        h + 12 + i * 12,
        channelDescription.channelLabel,
        false
      );
      dataView.setUint32(
        h + 16 + i * 12,
        channelDescription.channelFlags,
        false
      );

      for (let j = 0; j < channelDescription.coordinates.length; j++) {
        dataView.setFloat64(
          h + 20 + i * 12 + j * 8,
          channelDescription.coordinates[j],
          false
        );
      }
    }

    return result;
  };
}
