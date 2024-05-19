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

import { EventTarget } from '@web-media/event-target';
import { OpenPromise, OpenPromiseState } from '@web-media/open-promise';

import Chunk from './Chunk';
import { BinaryLoader } from './Loader';
import { MediaDeMuxAdapter, ParsingBehavior } from './adapters/MediaDeMuxAdapter';

import { LoadEvent } from './utils/events/LoadEvent';
import { PauseEvent } from './utils/events/PauseEvent';
import { EndedEvent } from './utils/events/EndedEvent';
import { DisposeEvent } from './utils/events/DisposeEvent';
import { LoadErrorEvent } from './utils/events/LoadErrorEvent';
import { LoadProgressEvent } from './utils/events/LoadProgressEvent';
import { PlaybackErrorEvent } from './utils/events/PlaybackErrorEvent';
import { CanPlayThroughEvent } from './utils/events/CanPlayThroughEvent';

import { PhonographClipError } from './utils/error/PhonographClipError';

const OVERLAP = 0.2;

// A cache of audio buffers starting from current time
interface AudioBufferCache<FileMetadata, ChunkMetadata> {
  currentChunkStartTime: number;
  currentChunk: Chunk<FileMetadata, ChunkMetadata> | null;
  currentBuffer: IAudioBuffer | null;
  nextBuffer: IAudioBuffer | null;
  /* Literally next next buffer */
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

  private _chunks: Chunk<FileMetadata, ChunkMetadata>[] = [];

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

  /**
   * calculates if enough audio data is available to start playing and finish
   * downloading before running out.
   * If the conditions inside the function are met, it will resolve the
   * `canPlayThough` promise to `true`. Otherwise, it may not perform any
   * action.
   */
  private checkCanPlayThrough = (
    loadStartTime: number,
    totalLoadedBytes: number
  ) => {
    if (this.canPlayThough.state !== OpenPromiseState.Fulfilled || !this.length)
      return;
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
    // reached can play through
    const availableAudio = (bytes / this.length) * estimatedDuration;
    if (availableAudio > estimatedTimeToDownload) {
      if (this.canPlayThough.state !== OpenPromiseState.Fulfilled) {
        this.canPlayThough.resolve(true);
      }
    }
  };

  private handleChunkReady = (loadStartTime: number, totalLoadedBytes: number) => {
    this.checkCanPlayThrough(loadStartTime, totalLoadedBytes);
  };

  private handleChunkError = (({ detail, target }: CustomEvent<Error>) => {
    const loadErrorEvent = new LoadErrorEvent(
      this.url,
      'COULD_NOT_DECODE',
      detail,
      target
    );

    this.dispatchEvent(loadErrorEvent);
  }) as EventListenerOrEventListenerObject;

  /**
   * Asynchronously loads and processes audio data, checking for readiness to
   * play through and handling errors accordingly.
   */
  async buffer() {
    this._loadStarted = true;
    const loadStartTime = Date.now();
    let totalLoadedBytes = 0;

    try {
      const { loader } = this;
      const fetcher = loader.fetch();
      let done = false;
      let batchId = 0;

      while (!done || loader.buffer?.length !== 0) {
        this.controller.signal.throwIfAborted();
        const { done: d } = await fetcher.next();
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

        while (loader.buffer?.length) {
          const parseResult = this.adapter.appendData(
            loader.buffer,
            batchId,
            done
          );
          batchId += 1;

          if (parseResult === ParsingBehavior.WaitForMoreData) break;

          const { consumed, data } = parseResult;

          this.loader.consume(consumed);

          const chunk = new Chunk<FileMetadata, ChunkMetadata>({
            clip: this,
            chunkIndex: this._chunks.length,
            chunk: data,
            adapter: this.adapter,
          });

          chunk.on('error', this.handleChunkError);

          await chunk.decoded;

          this.handleChunkReady(loadStartTime, totalLoadedBytes);

          // Connect last chunk with this chunk to create a chunk chain.
          const lastChunk = this._chunks[this._chunks.length - 1];
          if (lastChunk) await lastChunk.attach(chunk);

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

      // Last chunk should be resolved manually.
      const lastChunk = this._chunks[this._chunks.length - 1];
      await lastChunk.attach(null);

      await firstChunk.decoded;

      await this.trySetupAudioBufferCache();

      if (this.canPlayThough.state !== OpenPromiseState.Fulfilled) {
        this.canPlayThough.resolve(true);
      }
      this.loaded.resolve(true);
      this.dispatchEvent(new LoadEvent());
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
    const finishedPlaying = new Promise((fulfil, reject) => {
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

    return finishedPlaying;
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
      this.play().catch(() => { });
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
  private async trySetupAudioBufferCache() {
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

        await this.decodeChunk(chunk);
        await chunk.next?.attached;
        await this.decodeChunk(chunk?.next);

        this.decodeChunk(chunk?.next?.next ?? null);

        return;
      }
      time = chunkEnd;
      lastChunk = chunk;
      chunk = lastChunk.next;
    }
    // All available Chunk visited, check if there are more chunks to be load.
    if (lastChunk?.decoded) {
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
    if (!currentChunk.decoded) {
      return false;
    }
    if (currentBuffer === null) {
      return false;
    }
    const nextChunk = currentChunk.next;
    if (nextChunk === null) {
      return true;
    }
    if (!nextChunk.decoded) {
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
    // Initialization of Start Time Variables.
    this._startTime = this._currentTime;
    this._actualPlaying = true;
    const { currentChunkStartTime, currentChunk, currentBuffer, nextBuffer } =
      this._audioBufferCache!;

    // Recording the Current Context Time.
    this._contextTimeAtStart = this.context.currentTime;
    // Playback of the Current Audio Chunk.
    if (currentChunk !== null) {
      //  Calculates the time at which the current audio source should stop
      // playing and potentially when the next audio source should start.
      this._pendingSourceStart =
        this._contextTimeAtStart +
        (currentChunk.duration! - (this._startTime - currentChunkStartTime));

      // Setup and Scheduling of the Current Audio Source
      this._currentSource = this.context.createBufferSource();
      this._currentSource.buffer = currentBuffer!;
      this._currentGain = this.context.createGain();
      this._currentGain.connect(this._gain);
      this._currentGain.gain.setValueAtTime(
        0,
        this._pendingSourceStart + OVERLAP
      );
      this._currentSource.connect(this._currentGain);
      // Starts the playback of the current buffer at the computed start time.
      this._currentSource.start(
        this._contextTimeAtStart,
        this._startTime - currentChunkStartTime
      );
      // Stops the playback after the duration of the current chunk, plus an
      // overlap period.
      this._currentSource.stop(this._pendingSourceStart + OVERLAP * 2);
      this._currentSource.addEventListener('ended', this.onCurrentSourceEnd);
      // Setup and Scheduling of the Next Audio Source (if applicable)
      if (currentChunk.next !== null) {
        // If there is a next chunk to play (currentChunk.next), the method
        // repeats a similar process to set up the next audio source and gain
        // node.
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
        // Schedules the volume to fade in at the end of the current chunk and
        // fade out at the end of the next chunk, creating a crossfade effect.
        this._nextGain.gain.setValueAtTime(0, pendingStart + OVERLAP);
        this._nextSource.stop(pendingStart + OVERLAP * 2);
        this._pendingSourceStart = pendingStart;
      }
    } else {
      this.pause().currentTime = 0;
      // TODO: schedule playing of first chunk instead of do this
      if (this.loop) {
        // If looping is enabled (this.loop), playback is restarted.
        this.play();
      } else {
        // If looping is not enabled, sets the ended flag to true and dispatches
        // an EndedEvent to signal the end of playback.
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
    } else if (audioBufferCache.currentChunk?.next === chunk) {
      if (audioBufferCache.nextBuffer === null) {
        audioBufferCache.nextBuffer = buffer;
      }
    } else if (audioBufferCache.currentChunk?.next?.next === chunk) {
      if (audioBufferCache.pendingBuffer === null) {
        audioBufferCache.pendingBuffer = buffer;
      }
    }
    this.tryResumePlayback();
  }

  // Start chunk decode
  private async decodeChunk(chunk: Chunk<FileMetadata, ChunkMetadata> | null) {
    if (chunk === null) {
      return;
    }

    await chunk.decoded;

    try {
      const buffer = await chunk.createBuffer();
      this.onBufferDecoded(chunk, buffer);
    } catch (error) {
      this.dispatchEvent(new PlaybackErrorEvent(error));
    }
  }

  // Attempt to resume playback when not actual playing
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
