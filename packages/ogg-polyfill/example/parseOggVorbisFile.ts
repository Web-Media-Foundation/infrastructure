import {
  IOggVorbisPage,
  fetchOggVorbisFile,
} from '../src/fetchOggVorbisFile';
import { oggVorbisExample } from './@example';

(async () => {
  const x = fetchOggVorbisFile(oggVorbisExample, true, 4);

  let done = false;
  let data:
    | IOggVorbisPage
    | null = null;

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    data = v;

    console.log(data);
  }
})();
