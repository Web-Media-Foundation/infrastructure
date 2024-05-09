# @web-media/phonograph

[![GitHub](https://img.shields.io/github/license/web-media-foundation/infrastructure)](https://github.com/Web-Media-Foundation/infrastructure)
[![npm](https://img.shields.io/npm/v/%40web-media%2Fphonograph)](https://www.npmjs.com/package/@web-media/phonograph)

Phonograph is an advanced JavaScript library designed to handle the complex task of audio playback in web applications, particularly on mobile devices.

## Features

Make some noise on webpage is tough, phonograph leverages the power of the Web Audio API to simplify your life. Our library smooths out the inconsistencies commonly found in audio playback across mainstream browsers, providing a unified and simplified interface for developers. With Phonograph, triggering sounds programmatically, including autoplay features, is more accessible and reliable.

## Limitations

- **CORS Configuration**: Since Phonograph uses the Fetch API, it requires proper Cross-Origin Resource Sharing (CORS) configuration on the server hosting the audio files.
- **MP3 Support Only**: Currently, Phonograph only supports MP3 file format. Support for Ogg (Opus) and other formats is under development.

## Usage

To integrate Phonograph into your web application, you will need two essential components: a `Clip` instance to handle data streaming and media playback, and an `Adapter` for the specific audio format you're working with. Currently, Phonograph supports the MP3 format through the `Mp3DeMuxAdapter`.

### Initialize

Initialize a new `Clip` with the URL of your MP3 file and an instance of `Mp3DeMuxAdapter`.

```ts
import { Clip, Mp3DeMuxAdapter } from 'phonograph';

const clip = new Clip({
  url: '/path/to/your-audio.mp3',
  adapter: new Mp3DeMuxAdapter(),
});

clip.buffer().then(() => {
  console.log('Audio is buffered and ready to play.');
});
```

### Events

Attach event listeners to handle various states like errors and loading progress.

```ts
clip.addEventListener('error', (error) => console.error(error));
clip.addEventListener('loadprogress', (event) => {
  console.log(event.detail);
});
clip.addEventListener('ready', (event) => {
  console.log(event.detail);
});
```

### Control
Use the `play` and `pause` methods to control audio playback.

```ts
document.querySelector('#play').addEventListener('click', () => {
  clip.play();
});

document.querySelector('#pause').addEventListener('click', () => {
  clip.pause();
});
```


## Credits

This project is a fork of Rich Harris's original [Phonograph](https://github.com/Rich-Harris/phonograph). It includes several enhancements over the original version:

- **Bug Fixes**: We have addressed numerous bugs reported in the original issue tracker as well as new issues we identified.
- **Feature Improvements**: The library has been updated with new features that improve its usability.
- **Architecture Modernization**: The codebase has been modernized to utilize contemporary JavaScript features and best practices. We've also laid the groundwork for supporting multiple audio formats in the future.
