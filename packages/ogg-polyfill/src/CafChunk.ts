export class CafChunkStore {
  readonly type: string;
  readonly size: bigint;
  readonly sizeWithHeader: bigint;

  body: Uint8Array;
  header: Uint8Array;

  static headerSize = 12;

  constructor(x: Iterable<number>) {
    const array = new Uint8Array(x);
    const dataView = new DataView(array.buffer);
    const type = String.fromCharCode(...array.slice(0, 4));
    const size = dataView.getBigUint64(4, false);

    this.type = type;
    this.size = size;
    this.sizeWithHeader = size + 12n;

    this.header = array.slice(0, 12);
    this.body = array.slice(12, Number(size) + 12);
  }

  get byteLength() {
    return CafChunkStore.headerSize + this.body.byteLength;
  }

  encode = () => {
    const h = CafChunkStore.headerSize;

    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);

    result.set(new TextEncoder().encode(this.type));
    dataView.setBigUint64(4, BigInt(result.byteLength - h), false);

    result.set(this.body, h);

    return result;
  };
}
