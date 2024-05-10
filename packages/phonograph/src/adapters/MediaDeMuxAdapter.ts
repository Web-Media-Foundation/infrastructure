export interface IDataChunk<ChunkMetadata> {
  duration: number;
  rawData: Uint8Array;
  metadata: ChunkMetadata;
  frames: number;
  readonly wrappedData: Uint8Array;
}

export interface IAppendDataResult<ChunkMetadata> {
  consumed: number;
  /**
   * This value is only for debug purpose.
   */
  skipped?: number;
  data: IDataChunk<ChunkMetadata>;
}

export abstract class MediaDeMuxAdapter<FileMetadata, ChunkMetadata> {
  abstract metadata: FileMetadata;

  abstract appendData(
    x: Uint8Array,
    loadBatchId: number,
    loadStreamFinalized: boolean
  ): IAppendDataResult<ChunkMetadata> | ParsingBehavior;
}

export enum ParsingBehavior {
  WaitForMoreData,
}