export interface ICAFFileHeader {
  fileType: string;
  fileVersion: number;
  fileFlags: number;
}

export class CafHeaderChunk {
  readonly fileType: string;
  readonly fileVersion: number;
  readonly fileFlags: number;

  constructor(x: ICAFFileHeader) {
    this.fileType = x.fileType;
    this.fileVersion = x.fileVersion;
    this.fileFlags = x.fileFlags;
  }

  static from = (x: Uint8Array) => {
    const dataView = new DataView(x.buffer);

    return new CafHeaderChunk({
      fileType: String.fromCharCode(...x.slice(0, 4)),
      fileVersion: dataView.getUint16(4, false),
      fileFlags: dataView.getUint16(6, false),
    });
  };

  get byteLength() {
    return 8;
  }

  encode = () => {
    const result = new Uint8Array(this.byteLength);
    const dataView = new DataView(result.buffer);
    result.set(new TextEncoder().encode(this.fileType));

    dataView.setUint16(4, this.fileVersion, false);
    dataView.setUint16(6, this.fileFlags, false);

    return result;
  };
}
