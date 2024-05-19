/* eslint-disable no-console */
import { Clip, Mp3DeMuxAdapter } from '../src/index';

const clip = new Clip({
  url: '/demo/deepnote.mp3',
  adapter: new Mp3DeMuxAdapter(),
});

clip.addEventListener('error', (error) => console.error(error));
clip.addEventListener('loadprogress', ((event: CustomEvent) => {
  console.log(event.detail);
}) as EventListener);
clip.addEventListener('ready', ((event: CustomEvent) => {
  console.log(event.detail);
}) as EventListener);

console.log(
  'The clip has been stored in a global variable called `clip`, you can explore the variable as you want.'
);

const init = document.querySelector('#init') as HTMLButtonElement;

init.disabled = false;

init.addEventListener('click', () => {
  init.disabled = true;
  clip.buffer().then(() => {
    console.log('The buffer is loaded and the whole demo is operatable.');
    const play = document.querySelector('#play') as HTMLButtonElement;
    const pause = document.querySelector('#pause') as HTMLButtonElement;
    const progress = document.querySelector('#progress') as HTMLSpanElement;

    init.disabled = true;
    play.disabled = false;
    pause.disabled = false;

    play.addEventListener('click', () => {
      console.log('play triggered');
      clip.play();
    });

    pause.addEventListener('click', () => {
      clip.pause();
    });

    const updateProgress = () => {
      progress.innerText = `${clip.currentTime.toFixed(3)} / ${clip.duration?.toFixed(3)}`;
    };

    clip.on('play', updateProgress);
    clip.on('pause', updateProgress);
    clip.on('ended', updateProgress);
    clip.on('error', (event) => {
      console.error(event);
    });
    clip.on('loaderror', (event) => {
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
