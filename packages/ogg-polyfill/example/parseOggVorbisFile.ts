import {
  IOggVorbiseHeaderIdentificationParseResult,
  IOggVorbiseHeaderCommentParseResult,
  IOggVorbiseHeaderSetupParseResult,
  IOggVorbisPacketsParseResult,
  fetchOggVorbisFile,
} from '../src/fetchOggVorbisFile';
import { oggVorbisExample } from './@example';

(async () => {
  const x = fetchOggVorbisFile(oggVorbisExample, true, 4);

  let done = false;
  let data:
    | IOggVorbiseHeaderIdentificationParseResult
    | IOggVorbiseHeaderCommentParseResult
    | IOggVorbiseHeaderSetupParseResult
    | IOggVorbisPacketsParseResult
    | null = null;

  while (!done) {
    const { done: d, value: v } = await x.next();

    done = !!d;
    data = v;

    console.log(data);
  }
})();
