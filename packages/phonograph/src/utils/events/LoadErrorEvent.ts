export interface ILoadErrorEventDetail {
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
