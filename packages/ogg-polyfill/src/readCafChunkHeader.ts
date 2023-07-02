export interface ICAFChunkHeader {
  chunkType: string;
  chunkSize: bigint;
}

export const readCafChunkHeader = (x: Uint8Array) => {
  const mChunkType = x.slice(0, 4);
  const mChunkSize = x.slice(4, 12);

  const header: ICAFChunkHeader = {
    chunkType: new TextDecoder().decode(mChunkType),
    chunkSize: new DataView(mChunkSize.buffer).getBigInt64(0, false),
  };

  return header;
};
