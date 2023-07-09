/* eslint-disable no-restricted-syntax */
/* eslint-disable import/no-cycle */

import {
  GainNode,
  IGainNode,
  IAudioNode,
  AudioContext,
  IAudioBuffer,
  IAudioBufferSourceNode,
} from 'standardized-audio-context';

import { OpenPromise } from '@web-media/open-promise';
import { EventTarget } from '@web-media/event-target';

import Chunk from './Chunk';
import { BinaryLoader } from './Loader';
import { MediaDeMuxAdapter } from './adapters/MediaDeMuxAdapter';

const OVERLAP = 0.2;

class PhonographClipError extends Error {
  phonographCode: string;

  url: string;

  constructor(message: string, opts: { phonographCode: string; url: string }) {
    super(message);

    this.phonographCode = opts.phonographCode;
    this.url = opts.url;
  }
}

export class CanPlayThroughEvent extends CustomEvent<void> {
  constructor() {
    super('canplaythrough');
  }
}

export class LoadEvent extends CustomEvent<void> {
  constructor() {
    super('load');
  }
}

interface ILoadErrorEventDetail {
  url: string;
  phonographCode: string;
  error: unknown;
}

export class LoadErrorEvent extends CustomEvent<ILoadErrorEventDetail> {
  constructor(
    url: string,
    phonographCode: string,
    error: unknown,
    public cause?: unknown
  ) {
    super('loaderror', { detail: { url, phonographCode, error } });
  }
}

export class PlaybackErrorEvent extends CustomEvent<unknown> {
  constructor(error: unknown) {
    super('playbackerror', { detail: error });
  }
}

interface LoadProgressEventDetail {
  progress: number;
  loaded: number;
  total: number;
}

export class LoadProgressEvent extends CustomEvent<LoadProgressEventDetail> {
  constructor(progress: number, loaded: number, total: number) {
    super('loadprogress', {
      detail: { progress, loaded, total },
    });
  }
}

export class DisposeEvent extends CustomEvent<void> {
  constructor() {
    super('dispose');
  }
}

export class PauseEvent extends CustomEvent<void> {
  constructor() {
    super('pause');
  }
}

export class EndedEvent extends CustomEvent<void> {
  constructor() {
    super('ended');
  }
}

// A cache of audio buffers starting from current time
interface AudioBufferCache<FileMetadata, ChunkMetadata> {
  currentChunkStartTime: number;
  currentChunk: Chunk<FileMetadata, ChunkMetadata> | null;
  currentBuffer: IAudioBuffer | null;
  nextBuffer: IAudioBuffer | null;
  pendingBuffer: IAudioBuffer | null;
}

export class Clip<FileMetadata, ChunkMetadata> extends EventTarget {
  url: string;

  loop: boolean;

  readonly adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;

  context: AudioContext;

  buffered = 0;

  length = 0;

  loaded = new OpenPromise<boolean>();

  canPlayThough = new OpenPromise<boolean>();

  controller = new AbortController();

  loader: BinaryLoader;

  playing = false;

  ended = false;

  private _startTime: number = 0;

  private _currentTime = 0;

  private __chunks: Chunk<FileMetadata, ChunkMetadata>[] = [];

  public get _chunks(): Chunk<FileMetadata, ChunkMetadata>[] {
    return this.__chunks;
  }

  public set _chunks(value: Chunk<FileMetadata, ChunkMetadata>[]) {
    this.__chunks = value;
  }

  private _contextTimeAtStart: number = 0;

  private _pendingSourceStart: number = 0;

  private _connected: boolean = false;

  private fadeTarget: number;

  private _gain: GainNode<AudioContext>;

  private _loadStarted: boolean = false;

  private _actualPlaying = false;

  public get stuck() {
    if (this.playing) {
      return !this._actualPlaying;
    }
    return !this.audioBufferCacheHit();
  }

  private _currentSource: IAudioBufferSourceNode<AudioContext> | null = null;

  private _nextSource: IAudioBufferSourceNode<AudioContext> | null = null;

  private _currentGain: IGainNode<AudioContext> | null = null;

  private _nextGain: IGainNode<AudioContext> | null = null;

  private _audioBufferCache: AudioBufferCache<
    FileMetadata,
    ChunkMetadata
  > | null = null;

  constructor({
    context,
    url,
    loop,
    volume,
    adapter,
  }: {
    context?: AudioContext;
    url: string;
    loop?: boolean;
    volume?: number;
    adapter: MediaDeMuxAdapter<FileMetadata, ChunkMetadata>;
  }) {
    super();

    this.context = context || new AudioContext();
    this.url = url;
    this.loop = loop || false;
    this.adapter = adapter;

    this.loader = new BinaryLoader(url, this.controller.signal);

    this.fadeTarget = volume || 1;
    this._gain = this.context.createGain();
    this._gain.gain.value = this.fadeTarget;

    this._gain.connect(this.context.destination);

    this._chunks = [];

    this.canPlayThough.then(() => {
      this.dispatchEvent(new CanPlayThroughEvent());
    });
  }

  async buffer() {
    if (this._loadStarted) return;
    this._loadStarted = true;
    const loadStartTime = Date.now();
    let totalLoadedBytes = 0;
    const checkCanplaythrough = () => {
      if (this.canPlayThough.resolvedValue || !this.length) return;
      let duration = 0;
      let bytes = 0;
      for (const chunk of this._chunks) {
        if (!chunk.duration) break;
        duration += chunk.duration;
        bytes += chunk.chunk.rawData.length;
      }
      if (!duration) return;
      const scale = this.length / bytes;
      const estimatedDuration = duration * scale;
      const timeNow = Date.now();
      const elapsed = timeNow - loadStartTime;
      const bitrate = totalLoadedBytes / elapsed;
      const estimatedTimeToDownload =
        (1.5 * (this.length - totalLoadedBytes)) / bitrate / 1e3;
      // if we have enough audio that we can start playing now
      // and finish downloading before we run out, we've
      // reached canplaythrough
      const availableAudio = (bytes / this.length) * estimatedDuration;
      if (availableAudio > estimatedTimeToDownload) {
        if (!this.canPlayThough.resolvedValue) {
          this.canPlayThough.resolve(true);
        }
      }
    };

    try {
      const fetcher = this.loader.fetch();
      let done = false;
      let value: Uint8Array | null = null;
      let finalized = false;

      while (!done || !finalized) {
        this.controller.signal.throwIfAborted();
        const { value: v, done: d } = await fetcher.next();
        done = !!d;

        this.buffered = this.loader.downloadedSize;
        this.length = this.loader.totalSize;
        this.dispatchEvent(
          new LoadProgressEvent(
            this.loader.progress,
            this.loader.downloadedSize,
            this.loader.totalSize
          )
        );

        if (v) {
          value = v;
        }

        while (value) {
          const parseResult = this.adapter.appendData(value, done);

          if (done) {
            finalized = true;
          }

          if (!parseResult) break;

          const { consumed, data } = parseResult;

          value = this.loader.consume(consumed);

          const chunk = new Chunk<FileMetadata, ChunkMetadata>({
            clip: this,
            chunkIndex: this.__chunks.length,
            chunk: data,
            adapter: this.adapter,
          });

          chunk.once('ready', () => {
            if (!this.canPlayThough.resolvedValue) {
              checkCanplaythrough();
            }
            this.trySetupAudioBufferCache();
          });

          chunk.on('error', (({ detail, target }: CustomEvent<Error>) => {
            const newEvent = new LoadErrorEvent(
              this.url,
              'COULD_NOT_DECODE',
              detail,
              target
            );

            this.dispatchEvent(newEvent);
          }) as EventListenerOrEventListenerObject);

          const lastChunk = this._chunks[this._chunks.length - 1];
          if (lastChunk) lastChunk.attach(chunk);

          this._chunks.push(chunk);
          totalLoadedBytes += consumed;
        }
      }

      const firstChunk = this._chunks[0];

      if (!firstChunk) {
        throw new TypeError(
          `No first chunk found, this is not a valid MP3 file`
        );
      }

      firstChunk.ready.then(() => {
        if (!this.canPlayThough.resolvedValue) {
          this.canPlayThough.resolve(true);
        }
        this.loaded.resolve(true);
        this.dispatchEvent(new LoadEvent());
      });
    } catch (error) {
      const newEvent = new LoadErrorEvent(this.url, 'COULD_NOT_DECODE', error);
      this.dispatchEvent(newEvent);
      this._loadStarted = false;

      throw error;
    }
  }

  connect(
    destination: IAudioNode<AudioContext>,
    output?: number,
    input?: number
  ) {
    if (!this._connected) {
      this._gain.disconnect();
      this._connected = true;
    }

    this._gain.connect(destination, output, input);
    return this;
  }

  disconnect(
    destination: IAudioNode<AudioContext>,
    output?: number,
    input?: number
  ) {
    this._gain.disconnect(destination, output, input);
  }

  _disconnectAllAndReplaceAudioContext(newAudioContext: AudioContext) {
    // To be safe, make sure the clip is paused when calling this
    // TODO: do we need to maintain more thing
    this._gain.disconnect();
    this.context = newAudioContext;
    this._chunks.forEach((chunk) => {
      chunk.context = newAudioContext;
    });
    this._gain = newAudioContext.createGain();
    this._gain.gain.value = this.fadeTarget;
  }

  dispose() {
    if (this.playing) this.pause();

    if (this._loadStarted) {
      this.controller.abort();
      this._loadStarted = false;
    }

    this._currentTime = 0;
    this.loaded = new OpenPromise<boolean>();
    this.canPlayThough = new OpenPromise<boolean>();
    this._chunks = [];

    this.dispatchEvent(new DisposeEvent());
  }

  play() {
    const promise = new Promise((fulfil, reject) => {
      this.once('ended', fulfil);

      this.once('loaderror', reject);
      this.once('playbackerror', reject);

      this.once('dispose', () => {
        if (this.ended) return;

        const err = new PhonographClipError('Clip was disposed', {
          phonographCode: 'CLIP_WAS_DISPOSED',
          url: this.url,
        });
        reject(err);
      });
    });

    if (!this.canPlayThough.resolvedValue) {
      this.buffer();
    }

    this.playing = true;
    this.ended = false;
    this.tryResumePlayback();

    return promise;
  }

  pause() {
    if (!this.playing) {
      return this;
    }

    this.resetAudioNodes();
    this.stopFade();
    this.playing = false;
    this._actualPlaying = false;
    this.dispatchEvent(new PauseEvent());

    return this;
  }

  get currentTime() {
    if (this.playing && this._actualPlaying) {
      return (
        this._startTime + (this.context.currentTime - this._contextTimeAtStart)
      );
    }
    return this._currentTime;
  }

  set currentTime(currentTime) {
    if (this.playing) {
      this.pause();
      this._currentTime = currentTime;
      this._audioBufferCache = null;
      this.trySetupAudioBufferCache();
      this.play().catch(() => {});
    } else {
      this._currentTime = currentTime;
      this._audioBufferCache = null;
      this.trySetupAudioBufferCache();
    }
  }

  get duration() {
    let total = 0;
    for (const chunk of this._chunks) {
      if (!chunk.duration) return null;
      total += chunk.duration;
    }

    return total;
  }

  get paused() {
    return !this.playing;
  }

  get volume() {
    return this._gain.gain.value;
  }

  set volume(volume) {
    this.stopFade();
    this.fadeTarget = volume;
    this._gain.gain.value = volume;
  }

  fade(startVolume: number, endVolume: number, duration: number) {
    this.stopFade();
    if (!this.playing) {
      this.volume = endVolume;
      return;
    }
    const now = this.context.currentTime;
    this._gain.gain.value = startVolume;
    this._gain.gain.linearRampToValueAtTime(endVolume, now + duration);
    this.fadeTarget = endVolume;
  }

  private stopFade() {
    const now = this.context.currentTime;
    this._gain!.gain.cancelScheduledValues(now);
    this._gain!.gain.value = this.fadeTarget;
  }

  // Attempt to setup AudioBufferCache if it is not setup
  // Should be called when new chunk is ready
  private trySetupAudioBufferCache() {
    if (this._audioBufferCache !== null) {
      return;
    }
    let lastChunk: Chunk<FileMetadata, ChunkMetadata> | null = null;
    let chunk: Chunk<FileMetadata, ChunkMetadata> | null =
      this._chunks[0] ?? null;
    let time = 0;
    while (chunk !== null) {
      if (chunk.duration === null) {
        return;
      }
      const chunkEnd = time + chunk.duration;
      if (chunkEnd > this._currentTime) {
        // TODO: reuse audio buffer in old cache
        this._audioBufferCache = {
          currentChunkStartTime: time,
          currentChunk: chunk,
          currentBuffer: null,
          nextBuffer: null,
          pendingBuffer: null,
        };
        this.decodeChunk(chunk ?? null);
        this.decodeChunk(chunk?.next ?? null);
        this.decodeChunk(chunk?.next?.next ?? null);
        return;
      }
      time = chunkEnd;
      lastChunk = chunk;
      chunk = lastChunk.next;
    }
    // All available Chunk visited, check if there are more chunks to be load.
    if (lastChunk?.ready) {
      this._audioBufferCache = {
        currentChunkStartTime: time,
        currentChunk: null,
        currentBuffer: null,
        nextBuffer: null,
        pendingBuffer: null,
      };
    }
  }

  // Check is there enough audio buffer to schedule current and next chunk
  private audioBufferCacheHit() {
    const audioBufferCache = this._audioBufferCache;
    if (audioBufferCache === null) {
      return false;
    }
    const { currentChunk, currentBuffer, nextBuffer } = audioBufferCache;
    if (currentChunk === null) {
      return true;
    }
    if (!currentChunk.ready) {
      return false;
    }
    if (currentBuffer === null) {
      return false;
    }
    const nextChunk = currentChunk.next;
    if (nextChunk === null) {
      return true;
    }
    if (!nextChunk.ready) {
      return false;
    }
    if (nextBuffer === null) {
      return false;
    }
    return true;
  }

  // Advance the audioBufferCache to next chunk when current chunk is played
  private advanceAudioBufferCache() {
    const { currentChunk, currentChunkStartTime, nextBuffer, pendingBuffer } =
      this._audioBufferCache!;
    this._audioBufferCache = {
      currentChunkStartTime: currentChunkStartTime + currentChunk!.duration!,
      currentChunk: currentChunk!.next!,
      currentBuffer: nextBuffer,
      nextBuffer: pendingBuffer,
      pendingBuffer: null,
    };
    this.decodeChunk(currentChunk?.next?.next?.next ?? null);
  }

  // Start play the audioBuffer when the audioBufferCacheHit is true
  private startPlay() {
    this._startTime = this._currentTime;
    this._actualPlaying = true;
    const { currentChunkStartTime, currentChunk, currentBuffer, nextBuffer } =
      this._audioBufferCache!;

    this._contextTimeAtStart = this.context.currentTime;
    if (currentChunk !== null) {
      this._pendingSourceStart =
        this._contextTimeAtStart +
        (currentChunk.duration! - (this._startTime - currentChunkStartTime));

      this._currentSource = this.context.createBufferSource();
      this._currentSource.buffer = currentBuffer!;
      this._currentGain = this.context.createGain();
      this._currentGain.connect(this._gain);
      this._currentGain.gain.setValueAtTime(
        0,
        this._pendingSourceStart + OVERLAP
      );
      this._currentSource.connect(this._currentGain);
      this._currentSource.start(
        this._contextTimeAtStart,
        this._startTime - currentChunkStartTime
      );
      this._currentSource.stop(this._pendingSourceStart + OVERLAP * 2);
      this._currentSource.addEventListener('ended', this.onCurrentSourceEnd);
      if (currentChunk.next !== null) {
        const pendingStart =
          this._pendingSourceStart + currentChunk.next!.duration!;
        this._nextSource = this.context.createBufferSource();
        this._nextSource.buffer = nextBuffer!;
        this._nextGain = this.context.createGain();
        this._nextGain.connect(this._gain);
        this._nextGain.gain.setValueAtTime(0, this._pendingSourceStart);
        this._nextGain.gain.setValueAtTime(
          1,
          this._pendingSourceStart + OVERLAP
        );
        this._nextSource.connect(this._nextGain);
        this._nextSource.start(this._pendingSourceStart);
        this._nextGain.gain.setValueAtTime(0, pendingStart + OVERLAP);
        this._nextSource.stop(pendingStart + OVERLAP * 2);
        this._pendingSourceStart = pendingStart;
      }
    } else {
      this.pause().currentTime = 0;
      // TODO: schedule playing of first chunk instead of do this
      if (this.loop) {
        this.play();
      } else {
        this.ended = true;
        this.dispatchEvent(new EndedEvent());
      }
    }
  }

  // Advance audio nodes to next chunk when current chunk is played
  // and the audioBufferCacheHit is true
  // should be called after advanceAudioBufferCache
  private advanceAudioNodes() {
    this._currentSource?.stop();
    this._currentSource?.disconnect();
    this._currentGain?.disconnect();
    this._currentGain = this._nextGain;
    this._currentSource = this._nextSource;
    this._currentSource?.addEventListener('ended', this.onCurrentSourceEnd);
    const { currentChunk, nextBuffer } = this._audioBufferCache!;
    if ((currentChunk?.next ?? null) !== null) {
      const pendingStart =
        this._pendingSourceStart + currentChunk!.next!.duration!;
      this._nextSource = this.context.createBufferSource();
      this._nextSource.buffer = nextBuffer!;
      this._nextGain = this.context.createGain();
      this._nextGain.connect(this._gain);
      this._nextGain.gain.setValueAtTime(0, this._pendingSourceStart);
      this._nextGain.gain.setValueAtTime(1, this._pendingSourceStart + OVERLAP);
      this._nextSource.connect(this._nextGain);
      this._nextSource.start(this._pendingSourceStart);
      this._nextGain.gain.setValueAtTime(0, pendingStart + OVERLAP);
      this._nextSource.stop(pendingStart + OVERLAP * 2);
      this._pendingSourceStart = pendingStart;
    } else {
      this._nextGain = null;
      this._nextSource = null;
    }
    if (currentChunk === null) {
      this.pause().currentTime = 0;
      // TODO: schedule playing of first chunk instead of do this
      if (this.loop) {
        this.play();
      } else {
        this.ended = true;
        this.dispatchEvent(new EndedEvent());
      }
    }
  }

  // Reset audioNodes when stuck or paused
  private resetAudioNodes() {
    if (this._currentSource) {
      this._currentSource.stop();
      this._currentSource.disconnect();
      this._currentSource = null;
    }
    if (this._nextSource) {
      this._nextSource.stop();
      this._nextSource.disconnect();
      this._nextSource = null;
    }
    if (this._currentGain) {
      this._currentGain.disconnect();
      this._currentGain = null;
    }
    if (this._nextGain) {
      this._nextGain.disconnect();
      this._nextSource = null;
    }
    if (!this.playing || !this._actualPlaying) {
      return;
    }
    this._currentTime =
      this._startTime + (this.context.currentTime - this._contextTimeAtStart);
    this._audioBufferCache = null;
    this.trySetupAudioBufferCache();
  }

  // Advance to next Chunk if playback of current source ends
  private onCurrentSourceEnd = (event: Event) => {
    if (event.target !== this._currentSource) {
      return;
    }
    if (!this.playing || !this._actualPlaying) {
      return;
    }
    this.advanceAudioBufferCache();
    if (this.audioBufferCacheHit()) {
      this.advanceAudioNodes();
    } else {
      this.resetAudioNodes();
      this._actualPlaying = false;
    }
  };

  // Put audio buffer into AudioBufferCache when it is decoded
  private onBufferDecoded(
    chunk: Chunk<FileMetadata, ChunkMetadata>,
    buffer: IAudioBuffer
  ) {
    const audioBufferCache = this._audioBufferCache;
    if (audioBufferCache === null) {
      return;
    }
    if (audioBufferCache.currentChunk === chunk) {
      if (audioBufferCache.currentBuffer === null) {
        audioBufferCache.currentBuffer = buffer;
      }
    }
    if (audioBufferCache.currentChunk?.next === chunk) {
      if (audioBufferCache.nextBuffer === null) {
        audioBufferCache.nextBuffer = buffer;
      }
    }
    if (audioBufferCache.currentChunk?.next?.next === chunk) {
      if (audioBufferCache.pendingBuffer === null) {
        audioBufferCache.pendingBuffer = buffer;
      }
    }
    this.tryResumePlayback();
  }

  // Start chunk decode
  private decodeChunk(chunk: Chunk<FileMetadata, ChunkMetadata> | null) {
    if (chunk === null) {
      return;
    }

    chunk.ready.then(() => {
      chunk
        .createBuffer()
        .then((buffer) => {
          this.onBufferDecoded(chunk, buffer);
        })
        .catch((error) => {
          this.dispatchEvent(new PlaybackErrorEvent(error));
        });
    });
  }

  // Attempt to resume playback when not actual Playing
  private tryResumePlayback() {
    if (this._actualPlaying || !this.playing) {
      return;
    }
    if (this._audioBufferCache === null) {
      return;
    }
    if (this.audioBufferCacheHit()) {
      this.startPlay();
    }
  }
}
