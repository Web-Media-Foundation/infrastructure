// eslint-disable-next-line import/no-cycle
import Clip from './Clip';

export default class Clone<FileMetadata, ChunkMetadata> extends Clip<
  FileMetadata,
  ChunkMetadata
> {
  original: Clip<FileMetadata, ChunkMetadata>;

  constructor(original: Clip<FileMetadata, ChunkMetadata>) {
    super({
      context: original.context,
      url: original.url,
      adapter: original.adapter,
    });
    this.original = original;
  }

  buffer() {
    return this.original.buffer();
  }

  clone() {
    return this.original.clone();
  }

  get canplaythrough() {
    return this.original.canPlayThough.resolvedValue;
  }

  // eslint-disable-next-line class-methods-use-this
  set canplaythrough(_) {
    // eslint-disable-line no-unused-vars
    // noop
  }

  // @ts-ignore
  get loaded() {
    return this.original.loaded;
  }

  // eslint-disable-next-line class-methods-use-this
  set loaded(_) {
    // eslint-disable-line no-unused-vars
    // noop
  }

  get _chunks() {
    return this.original._chunks;
  }

  // eslint-disable-next-line class-methods-use-this
  set _chunks(_) {
    // eslint-disable-line no-unused-vars
    // noop
  }
}
