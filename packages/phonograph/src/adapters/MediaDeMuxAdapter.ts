export interface IDataChunk<ChunkMetadata> {
  duration: number;
  data: Uint8Array;
  metadata: ChunkMetadata;
  frames: number;
  readonly wrappedData: Uint8Array;
}

export interface IAppendDataResult<ChunkMetadata> {
  consumed: number;
  data: IDataChunk<ChunkMetadata>;
}

export abstract class MediaDeMuxAdapter<FileMetadata, ChunkMetadata> {
  abstract metadata: FileMetadata;

  abstract dataChunks: IDataChunk<ChunkMetadata>[];

  abstract appendData(x: Uint8Array): IAppendDataResult<ChunkMetadata> | null;
}
