import { OpenPromise } from '@web-media/open-promise';
import { AudioContext, IAudioBuffer } from 'standardized-audio-context';

import type { Clip } from './Clip';
import { slice } from './utils/buffer';
import { IDataChunk, MediaDeMuxAdapter } from './adapters/MediaDeMuxAdapter';

export default class Chunk<FileMetadata, ChunkMetadata> {
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

  private callbacks: Record<string, Array<(data?: unknown) => void>> = {};

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
      () => {
        this._fire('error', new Error(`Could not decode audio buffer`));
      }
    );
  }

  off(eventName: string, cb: (data?: unknown) => void) {
    const callbacks = this.callbacks[eventName];
    if (!callbacks) return;

    const index = callbacks.indexOf(cb);
    if (~index) callbacks.splice(index, 1);
  }

  on(eventName: string, cb: (data?: unknown) => void) {
    const callbacks =
      this.callbacks[eventName] || (this.callbacks[eventName] = []);
    callbacks.push(cb);

    return {
      cancel: () => this.off(eventName, cb),
    };
  }

  once(eventName: string, cb: (data?: unknown) => void) {
    const _cb = (data?: unknown) => {
      cb(data);
      this.off(eventName, _cb);
    };

    return this.on(eventName, _cb);
  }

  private _fire(eventName: string, data?: unknown) {
    const callbacks = this.callbacks[eventName];
    if (!callbacks) return;

    callbacks.slice().forEach((cb) => cb(data));
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
      slice(this.extendedWithHeader!, 0, this.extendedWithHeader!.length).buffer
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

      this._fire('ready');
    }
  }
}
