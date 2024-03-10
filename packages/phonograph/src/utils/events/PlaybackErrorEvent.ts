export class PlaybackErrorEvent extends CustomEvent<unknown> {
  constructor(error: unknown) {
    super('playbackerror', { detail: error });
  }
}
