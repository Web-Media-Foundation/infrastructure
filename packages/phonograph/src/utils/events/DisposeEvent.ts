export class DisposeEvent extends CustomEvent<void> {
  constructor() {
    super('dispose');
  }
}
