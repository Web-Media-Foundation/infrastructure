class AudioFetcherError extends Error { }

export class BinaryLoader {
  constructor(
    public readonly url: string,
    public readonly abortSignal: AbortSignal
  ) { }

  public fetched = false;

  public totalSize = 0;

  public downloadedSize = 0;

  public progress = 0;

  public buffer: Uint8Array | null = null;

  consume = (size: number) => {
    this.buffer = this.buffer?.slice(size) ?? null;

    return this.buffer;
  };

  async *fetch() {
    if (this.fetched) {
      throw new AudioFetcherError(`The file is already fetched`);
    }

    this.fetched = true;

    const request = await fetch(this.url, { signal: this.abortSignal });
    this.totalSize =
      Number.parseFloat(request.headers.get('content-length') ?? '0') ?? 0;

    if (!request.ok) {
      throw new AudioFetcherError(
        `Failed to request the file, ${request.status}(${request.statusText})`
      );
    }

    const reader = request.body?.getReader();

    if (!reader) {
      throw new TypeError(`Valid reader not found`);
    }

    let done = false;

    while (!done) {
      if (this.abortSignal?.aborted) return;

      const { value, done: d } = await reader.read();
      done = d;

      if (value) {
        this.downloadedSize += value.byteLength;
        this.progress = this.downloadedSize / this.totalSize;
      }

      if (!this.buffer && value) {
        this.buffer = value;
      } else if (this.buffer && value) {
        const nextBuffer: Uint8Array = new Uint8Array(
          this.buffer.length + value.length
        );

        nextBuffer.set(this.buffer);
        nextBuffer.set(value, this.buffer.length);

        this.buffer = nextBuffer;
      }

      yield this.buffer!;
    }
  }
}
