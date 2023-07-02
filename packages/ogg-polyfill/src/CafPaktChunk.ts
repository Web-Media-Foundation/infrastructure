import { CafChunkStore } from './CafChunk';

interface ICAFPacketTableHeader {
  numberPackets: bigint;
  numberValidFrames: bigint;
  primingFrames: number;
  remainderFrames: number;
}

interface ICafPaktChunk {
  header: ICAFPacketTableHeader;
  body: number[];
}

export class CafPaktChunk {
  readonly header: ICAFPacketTableHeader;

  readonly body: number[];

  readonly type = 'pakt';

  constructor({ header, body }: ICafPaktChunk) {
    this.header = header;
    this.body = body;
  }

  static packetsTable = (data: Uint8Array) => {
    const numbers: number[] = [];
    let currentNumber = 0;

    for (let i = 0; i < data.length; i += 1) {
      const byte = data[i];
      currentNumber = (currentNumber << 7) | (byte & 0x7f);

      if ((byte & 0x80) === 0) {
        numbers.push(currentNumber);
        currentNumber = 0;
      }
    }

    return numbers;
  };

  static constructPacketsTable = (numbers: number[]) => {
    const data: number[] = [];

    for (let i = 0; i < numbers.length; i += 1) {
      const encodedNumber: number[] = [];
      let number = numbers[i];

      while (number > 127) {
        const byte = number % 128;
        encodedNumber.unshift(byte);
        number = Math.floor(number / 128);
      }
      encodedNumber.unshift(number);

      for (let j = 0, l = encodedNumber.length; j < l - 1; j += 1) {
        encodedNumber[j] = encodedNumber[j] | 128;
      }

      data.push(...encodedNumber);
    }

    return new Uint8Array(data);
  };

  static parsePacketTableHeader = (x: Uint8Array) => {
    const dataView = new DataView(x.buffer);
    const numberPackets = dataView.getBigInt64(0, false);
    const numberValidFrames = dataView.getBigInt64(8, false);
    const primingFrames = dataView.getInt32(16, false);
    const remainderFrames = dataView.getInt32(20, false);

    const packetTableHeader: ICAFPacketTableHeader = {
      numberPackets,
      numberValidFrames,
      primingFrames,
      remainderFrames,
    };

    return packetTableHeader;
  };

  static constructParsePacketTableHeader = (
    packetTableHeader: ICAFPacketTableHeader
  ) => {
    const buffer = new ArrayBuffer(24);
    const dataView = new DataView(buffer);

    dataView.setBigInt64(0, packetTableHeader.numberPackets, false);
    dataView.setBigInt64(8, packetTableHeader.numberValidFrames, false);
    dataView.setInt32(16, packetTableHeader.primingFrames, false);
    dataView.setInt32(20, packetTableHeader.remainderFrames, false);

    const reversedPacketTableHeader = new Uint8Array(buffer);

    return reversedPacketTableHeader;
  };

  static from = (data: Uint8Array) => {
    const chunkStore = new CafChunkStore(data);

    if (chunkStore.type !== 'pakt') {
      throw new TypeError(`Not a packet chunk`);
    }

    const header = chunkStore.body.slice(0, 24);
    const body = chunkStore.body.slice(24);

    return new CafPaktChunk({
      header: CafPaktChunk.parsePacketTableHeader(header),
      body: CafPaktChunk.packetsTable(body),
    });
  };

  get byteLength() {
    const body = CafPaktChunk.constructPacketsTable(this.body);

    return CafChunkStore.headerSize + 24 + body.byteLength;
  }

  encode = () => {
    const header = CafPaktChunk.constructParsePacketTableHeader(this.header);
    const body = CafPaktChunk.constructPacketsTable(this.body);

    const h = CafChunkStore.headerSize;

    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);

    result.set(new TextEncoder().encode(this.type));
    dataView.setBigUint64(4, BigInt(result.byteLength - h), false);

    result.set(header, h);
    result.set(body, h + header.byteLength);

    return result;
  };
}
