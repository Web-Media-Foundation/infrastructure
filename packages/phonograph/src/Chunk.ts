import { EventTarget } from '@web-media/event-target';
import { OpenPromise } from '@web-media/open-promise';
import { AudioContext, IAudioBuffer } from 'standardized-audio-context';

import type { Clip } from './Clip';
import { IDataChunk, MediaDeMuxAdapter } from './adapters/MediaDeMuxAdapter';

export class ReadyEvent extends CustomEvent<void> {
  constructor() {
    super('ready');
  }
}

export class ErrorEvent extends CustomEvent<void> {
  constructor(public error: Error) {
    super('error');
  }
}

export default class Chunk<FileMetadata, ChunkMetadata> extends EventTarget {
  clip: Clip<FileMetadata, ChunkMetadata>;

  context: AudioContext;

  duration: number | null = null;

  numFrames: number | null = null;

  chunkIndex: number;

  chunk: IDataChunk<ChunkMetadata>;

  extended: Uint8Array | null;

  ready = new OpenPromise<boolean>();

  next: Chunk<FileMetadata, ChunkMetadata> | null = null;

  readonly adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;

  private _attached: boolean;

  constructor({
    clip,
    chunk,
    onready,
    onerror,
    adapter,
    chunkIndex,
  }: {
    clip: Clip<FileMetadata, ChunkMetadata>;
    chunk: IDataChunk<ChunkMetadata>;
    onready: (() => void) | null;
    onerror: (error: unknown) => void;
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
    if (onready !== null) {
      this.once('ready', onready);
    }
    this.once('error', onerror);

    const decode = (callback: () => void, onError: (err: Error) => void) => {
      const { wrappedData } = this.chunk;

      this.context.decodeAudioData(wrappedData.buffer, callback, (error) => {
        return onError(error ?? new Error(`Could not decode audio buffer`));
      });
    };

    decode(
      () => {
        this.duration = this.chunk.duration;
        this.numFrames = this.chunk.frames;
        this._ready();
      },
      (error) => {
        this.dispatchEvent(new ErrorEvent(error));
      }
    );
  }

  attach(nextChunk: Chunk<FileMetadata, ChunkMetadata> | null) {
    this.next = nextChunk;
    this._attached = true;

    this._ready();
  }

  createBufferCallback(
    callback: (buffer: IAudioBuffer) => void,
    onError: (error: Error) => void
  ) {
    this.createBuffer().then(callback, onError);
  }

  createBuffer(): Promise<IAudioBuffer> {
    if (!this.ready) {
      throw new Error(
        'Something went wrong! Chunk was not ready in time for playback'
      );
    }
    return this.context.decodeAudioData(this.extended!.slice(0).buffer);
  }

  private _ready() {
    if (this.ready.resolvedValue) return;

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
