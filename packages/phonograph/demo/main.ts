/* eslint-disable no-console */
import { Clip, Mp3DeMuxAdapter } from '../src/index';

const clip = new Clip({
  url: '/demo/deepnote.mp3',
  adapter: new Mp3DeMuxAdapter(),
});

const init = document.querySelector('#init') as HTMLButtonElement;

init.addEventListener('click', () => {
  clip.buffer().then(() => {
    const play = document.querySelector('#play') as HTMLButtonElement;
    const pause = document.querySelector('#pause') as HTMLButtonElement;
    const progress = document.querySelector('#progress') as HTMLSpanElement;

    init.disabled = true;
    play.disabled = false;
    pause.disabled = false;

    play.addEventListener('click', () => {
      clip.play();
    });

    pause.addEventListener('click', () => {
      clip.pause();
    });

    const updateProgress = () => {
      progress.innerText = `${clip.currentTime}`;
    };

    console.log(clip);
    clip.on('play', updateProgress);
    clip.on('pause', updateProgress);
    clip.on('ended', updateProgress);
    clip.on('error', (event) => {
      console.error(event);
    });

    const loop = () => {
      updateProgress();
      requestAnimationFrame(loop);
    };
    loop();
  });
});

// For debug purpose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).clip = clip;
