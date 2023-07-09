class AudioFetcherError extends Error {}

export class BinaryLoader {
  constructor(
    public readonly url: string,
    public readonly abortSignal: AbortSignal
  ) {}

  public fetched = false;

  public totalSize = 0;

  public downloadedSize = 0;

  public progress = 0;

  buffer: Uint8Array | null = null;

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
    let buffer: Uint8Array | null = null;

    while (!done || (buffer && buffer.length)) {
      if (this.abortSignal?.aborted) return;

      const { value, done: d } = await reader.read();
      done = d;

      if (value) {
        this.downloadedSize += value.byteLength;
        this.progress = this.downloadedSize / this.totalSize;
      }

      if (!buffer && value) {
        buffer = value;
      } else if (buffer && value) {
        const nextBuffer: Uint8Array = new Uint8Array(
          buffer.length + value.length
        );

        nextBuffer.set(buffer);
        nextBuffer.set(value, buffer.length);

        buffer = nextBuffer;
      }

      yield buffer!;
    }
  }
}
