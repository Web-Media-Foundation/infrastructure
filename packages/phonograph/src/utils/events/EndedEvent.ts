export class EndedEvent extends CustomEvent<void> {
  constructor() {
    super('ended');
  }
}
