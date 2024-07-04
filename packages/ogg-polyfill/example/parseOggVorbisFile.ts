/* eslint-disable no-console */
import {
  IOggVorbisPage,
  fetchOggVorbisFile,
  readOggVorbisFile,
} from '../src/fetchOggVorbisFile';
import { oggVorbisExample } from './@example';

document.addEventListener("DOMContentLoaded", () => {
  const $fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  const $form = document.querySelector('form') as HTMLFormElement | null;
  const $urlInput = $form?.querySelector('input[name="url"]') as HTMLInputElement | null;

  if (!$fileInput) throw new Error(`fileInput not found`);
  if (!$form) throw new Error(`form not found`);
  if (!$urlInput) throw new Error(`urlInput not found`);

  $urlInput.value = oggVorbisExample;

  $fileInput.addEventListener('change', async (event) => {
    console.clear();

    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = (file.stream() as unknown as ReadableStream<Uint8Array>).getReader();
      const oggVorbisReader = readOggVorbisFile(reader, true, 4);

      let done = false;
      let data: IOggVorbisPage | null = null;

      while (!done) {
        const { done: d, value: v } = await oggVorbisReader.next();

        done = !!d;
        data = v;

        console.log(data);
      }
    }
  });

  $form.addEventListener('submit', async (event) => {
    console.clear();

    event.preventDefault();
    const url = $urlInput?.value;
    if (url) {
      const x = fetchOggVorbisFile(url, true, 4);

      let done = false;
      let data: IOggVorbisPage | null = null;

      while (!done) {
        const { done: d, value: v } = await x.next();

        done = !!d;
        data = v;

        console.log(data);
      }
    }
  });
});