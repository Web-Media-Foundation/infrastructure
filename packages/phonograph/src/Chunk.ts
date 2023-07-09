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

  extendedWithHeader: Uint8Array | null;

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
    this.extendedWithHeader = null;

    this.adapter = adapter;

    this.duration = null;

    this._attached = false;
    if (onready !== null) {
      this.once('ready', onready);
    }
    this.once('error', onerror);

    const decode = (callback: () => void, onError: (err: Error) => void) => {
      const raw = this.chunk.wrappedData;
      const { buffer } = raw;

      this.context.decodeAudioData(buffer, callback, (err) => {
        if (err) {
          return onError(err);
        }

        // filthy hack taken from http://stackoverflow.com/questions/10365335/decodeaudiodata-returning-a-null-error
        // Thanks Safari developers, you absolute numpties
        // for (; this._firstByte < raw.length - 1; this._firstByte += 1) {
        //   if (this.adapter.validateChunk(raw, this._firstByte)) {
        //     return decode(callback, onError);
        //   }
        // }

        onError(new Error(`Could not decode audio buffer`));
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
    return this.context.decodeAudioData(
      this.extendedWithHeader!.slice(0).buffer
    );
  }

  private _ready() {
    if (this.ready.resolvedValue) return;

    if (this._attached && this.duration !== null) {
      this.ready.resolve(true);

      const thisChunkData = this.chunk.wrappedData;

      if (this.next) {
        const nextChunkData = this.next.chunk.wrappedData;

        const rawLen = thisChunkData.length;
        const nextLen = nextChunkData.length >> 1; // we don't need the whole thing

        this.extended = new Uint8Array(rawLen + nextLen);

        let p = 0;

        for (let i = 0; i < rawLen; i += 1) {
          // eslint-disable-next-line no-plusplus
          this.extended[p++] = thisChunkData[i];
        }

        for (let i = 0; i < nextLen; i += 1) {
          // eslint-disable-next-line no-plusplus
          this.extended[p++] = thisChunkData[i];
        }
      } else {
        this.extended = thisChunkData;
      }
      this.extendedWithHeader = this.extended;

      this.dispatchEvent(new ReadyEvent());
    }
  }
}
