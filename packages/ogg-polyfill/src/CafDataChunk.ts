import { CafChunkStore } from './CafChunk';

interface ICAFData {
  editCount: number;
  data: Uint8Array;
}

export class CafDataChunk {
  readonly editCount: number;

  readonly data: Uint8Array;

  readonly type = 'data';

  constructor({ editCount, data }: ICAFData) {
    this.editCount = editCount;
    this.data = data;
  }

  static from = (data: Uint8Array) => {
    const chunkStore = new CafChunkStore(data);

    if (chunkStore.type !== 'data') {
      throw new TypeError(`Not a data chunk`);
    }

    const dataView = new DataView(chunkStore.body.buffer);

    const editCount = dataView.getUint32(0, false);
    const body = chunkStore.body.slice(4);

    return new CafDataChunk({ editCount, data: body });
  };

  get byteLength() {
    return CafChunkStore.headerSize + this.data.byteLength + 4;
  }

  encode = () => {
    const h = CafChunkStore.headerSize;

    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);

    result.set(new TextEncoder().encode(this.type));
    dataView.setBigUint64(4, BigInt(result.byteLength - h), false);

    dataView.setUint32(h, this.editCount, false);
    result.set(this.data, h + 4);

    return result;
  };
}
