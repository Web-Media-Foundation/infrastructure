export class LoadEvent extends CustomEvent<void> {
  constructor() {
    super('load');
  }
}
