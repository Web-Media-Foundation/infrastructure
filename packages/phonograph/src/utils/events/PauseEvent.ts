export class PauseEvent extends CustomEvent<void> {
  constructor() {
    super('pause');
  }
}
