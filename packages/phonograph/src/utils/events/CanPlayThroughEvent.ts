export class CanPlayThroughEvent extends CustomEvent<void> {
  constructor() {
    super('canplaythrough');
  }
}
