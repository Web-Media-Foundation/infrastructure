import { EventTarget } from '@web-media/event-target';
import { OpenPromise, OpenPromiseState } from '@web-media/open-promise';
import { AudioContext, IAudioBuffer } from 'standardized-audio-context';

import type { Clip } from './Clip';
import { IDataChunk, MediaDeMuxAdapter } from './adapters/MediaDeMuxAdapter';

export class ReadyEvent extends CustomEvent<void> {
  constructor() {
    super('ready');
  }
}

export class ErrorEvent extends CustomEvent<Error> {
  constructor(public error: Error) {
    super('error', { detail: error });
  }
}

export default class Chunk<FileMetadata, ChunkMetadata> extends EventTarget {
  clip: Clip<FileMetadata, ChunkMetadata>;

  context: AudioContext;

  duration: number | null = null;

  chunkIndex: number;

  chunk: IDataChunk<ChunkMetadata>;

  extended: Uint8Array | null;

  ready = new OpenPromise<boolean>();

  next: Chunk<FileMetadata, ChunkMetadata> | null = null;

  readonly adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;

  private _attached: boolean;

  private audioDataDecoded = new OpenPromise<null>();

  constructor({
    clip,
    chunk,
    adapter,
    chunkIndex,
  }: {
    clip: Clip<FileMetadata, ChunkMetadata>;
    chunk: IDataChunk<ChunkMetadata>;
    adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;
    chunkIndex: number;
  }) {
    super();
    this.clip = clip;
    this.chunkIndex = chunkIndex;
    this.context = clip.context;

    this.chunk = chunk;
    this.extended = null;

    this.adapter = adapter;

    this.duration = null;

    this._attached = false;

    const { wrappedData } = chunk;

    this.context
      .decodeAudioData(wrappedData.buffer)
      .then(() => {
        this.duration = this.chunk.duration;
        this.audioDataDecoded.resolve(null);
      })
      .catch((error) => {
        this.audioDataDecoded.reject(error);
        const warpedError = error ?? new Error(`Could not decode audio buffer`);

        this.dispatchEvent(new ErrorEvent(warpedError));
        this.ready.reject(warpedError);
      });
  }

  async attach(nextChunk: Chunk<FileMetadata, ChunkMetadata> | null) {
    this.next = nextChunk;
    this._attached = true;

    await this.resolveChunkReadyState();
  }

  createBuffer(): Promise<IAudioBuffer> {
    if (!this.ready) {
      throw new Error(
        'Something went wrong! Chunk was not ready in time for playback'
      );
    }

    return this.context.decodeAudioData(this.extended!.slice(0).buffer);
  }

  private async resolveChunkReadyState() {
    if (this.ready.state !== OpenPromiseState.Idle) {
      return;
    }

    await this.audioDataDecoded;

    if (this._attached && this.duration !== null) {
      this.ready.resolve(true);

      const thisChunkData = this.chunk.wrappedData;

      if (this.next) {
        const nextChunkData = this.next.chunk.rawData;

        const thisLength = thisChunkData.length;
        // we don't need the whole thing
        const nextLength = nextChunkData.length >> 1;

        this.extended = new Uint8Array(thisLength + nextLength);

        let p = 0;

        for (let i = 0; i < thisLength; i += 1, p += 1) {
          this.extended[p] = thisChunkData[i];
        }

        for (let i = 0; i < nextLength; i += 1, p += 1) {
          this.extended[p] = nextChunkData[i];
        }
      } else {
        this.extended = thisChunkData;
      }

      this.dispatchEvent(new ReadyEvent());
    }
  }
}
