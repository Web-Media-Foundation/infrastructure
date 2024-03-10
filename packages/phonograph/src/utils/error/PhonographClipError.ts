export class PhonographClipError extends Error {
  phonographCode: string;

  url: string;

  constructor(message: string, opts: { phonographCode: string; url: string }) {
    super(message);

    this.phonographCode = opts.phonographCode;
    this.url = opts.url;
  }
}
