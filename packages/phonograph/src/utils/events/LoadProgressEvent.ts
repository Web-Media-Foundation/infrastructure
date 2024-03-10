export interface LoadProgressEventDetail {
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
