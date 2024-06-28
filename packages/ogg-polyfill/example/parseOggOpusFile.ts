import {
  IOggHeaderParseResult,
  IOggPacketsParseResult,
  IOggTagsParseResult,
  fetchOggOpusFile,
} from '../src/fetchOggOpusFile';
import { oggExample } from './@example';

(async () => {
  const x = fetchOggOpusFile(oggExample, true);

  let done = false;
  let data:
    | IOggHeaderParseResult
    | IOggTagsParseResult
    | IOggPacketsParseResult
    | null = null;

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    data = v;

    console.log(data);
  }
})();
