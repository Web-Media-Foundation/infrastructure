interface ISecret {
  target: EventTargetPolyfill;
  callback: EventListenerOrEventListenerObject | null;
  options: AddEventListenerOptions | boolean | undefined;
}

const wm = new WeakMap<EventTargetPolyfill, Record<string, Set<ISecret>>>();

const define = (target: object, name: string, value: unknown) => {
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
};

const dispatch = (x: ISecret, event: Event) => {
  const { options } = x;

  if (typeof options === 'object' && 'once' in options && options.once) {
    x.target.removeEventListener(event.type, x.callback);
  }

  if (typeof x.callback === 'function') {
    x.callback.call(x.target, event);
  } else {
    x.callback?.handleEvent(event);
  }
};

export class EventTargetPolyfill {
  addEventListener = (
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ) => {
    const secret = wm.get(this) ?? {};
    const listeners = secret[type] ?? new Set();

    secret[type] = listeners;
    wm.set(this, secret);

    listeners.add({ target: this, callback, options });
  };

  dispatchEvent = (event: Event) => {
    const secret = wm.get(this);
    if (!secret) return false;

    const listeners = secret[event.type];

    if (listeners) {
      define(event, 'target', this);
      define(event, 'currentTarget', this);

      [...listeners].forEach((x) => dispatch(x, event), event);
    }
    return true;
  };

  removeEventListener = (
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options?: EventListenerOptions | boolean
  ) => {
    const secret = wm.get(this) ?? {};
    const listeners = secret[type] ?? [];

    secret[type] = listeners;
    wm.set(this, secret);

    listeners.forEach((listener) => {
      if (listener.callback === callback) {
        listeners.delete(listener);
      }
    });
  };

  on = this.addEventListener;

  off = this.removeEventListener;

  once = (
    type: string,
    callback: EventListenerOrEventListenerObject | null
  ) => {
    this.addEventListener(type, callback, { once: true });
  };
}
