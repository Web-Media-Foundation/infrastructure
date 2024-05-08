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

  readonly decoded = new OpenPromise<null>();

  readonly attached = new OpenPromise<boolean>();

  next: Chunk<FileMetadata, ChunkMetadata> | null = null;

  readonly adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;

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

    const { wrappedData } = chunk;

    this.context
      .decodeAudioData(wrappedData.buffer)
      .then((buffer) => {
        this.duration = this.chunk.duration;
        console.log('buffer: ', buffer.duration, 'adapter: ', this.chunk.duration);
        this.decoded.resolve(null);
      })
      .catch((error) => {
        this.decoded.reject(error);
        const warpedError = error ?? new Error(`Could not decode audio buffer`);

        this.dispatchEvent(new ErrorEvent(warpedError));
        this.attached.reject(warpedError);
      });
  }

  async attach(nextChunk: Chunk<FileMetadata, ChunkMetadata> | null) {
    if (nextChunk === this) {
      throw new Error(`Loop chain detected`);
    }

    if (this.attached.state !== OpenPromiseState.Idle) {
      throw new Error(`Chunk alreay attached`);
    }

    this.next = nextChunk;

    await this.resolveAttachedState();
  }

  createBuffer(): Promise<IAudioBuffer> {
    if (!this.attached) {
      throw new Error(
        'Something went wrong! Chunk was not ready in time for playback'
      );
    }

    return this.context.decodeAudioData(this.extended!.slice(0).buffer);
  }

  private async resolveAttachedState() {
    this.attached.resolve(true);

    await this.decoded;

    if (this.duration === null) {
      throw new Error('Edge case detected, duration is null');
    }

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
  }
}
