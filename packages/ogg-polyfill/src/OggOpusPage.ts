import { OggPage } from './OggPage';

const opusHeadMagicSignature = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const opusCommentMagicSignature = [
  0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73,
];

export class OpusFormatError extends Error { }

export interface IOpusChannelMapping {
  streamCount: number;
  coupledCount: number;
  channelMapping: number[];
}

export interface IOpusHeader {
  version: number;
  channelCount: number;
  preSkip: number;
  inputSampleRate: number;
  outputGain: number;
  mappingFamily: number;
  channelMapping: IOpusChannelMapping | null;
}

export interface IOpusTags {
  vendorString: string;
  userCommentString: string[];
}


export class OggOpusPage extends OggPage {
  getOggHeader(): IOpusHeader {
    const array = this.getPageSegment(0);
    const dataView = new DataView(array.buffer);

    if (!this.isHeaderPage()) {
      throw new OpusFormatError('Invalid magic signature');
    }

    const version = dataView.getUint8(8);
    const channelCount = dataView.getUint8(9);
    const preSkip = dataView.getUint16(10, true);
    const inputSampleRate = dataView.getUint32(12, true);
    const outputGain = dataView.getUint16(16, true);
    const mappingFamily = dataView.getUint8(18);

    let channelMapping: IOpusChannelMapping | null = null;

    if (array.length > 19) {
      const streamCount = dataView.getUint8(19);
      const coupledCount = dataView.getUint8(20);

      const channelMappings: number[] = [];

      for (let i = 0; i < channelCount; i += 1) {
        channelMappings.push(dataView.getUint8(21 + i));
      }

      channelMapping = {
        streamCount,
        coupledCount,
        channelMapping: channelMappings,
      };
    }

    return {
      version,
      channelCount,
      preSkip,
      inputSampleRate,
      outputGain,
      mappingFamily,
      channelMapping,
    };
  }

  getOggTags(): IOpusTags {
    const array = this.getPageSegment(0);
    const dataView = new DataView(array.buffer);

    if (!this.isTagsPage()) {
      throw new Error('Invalid magic signature.');
    }

    const vendorStringLength = dataView.getInt32(8, true);
    const vendorString = new TextDecoder().decode(
      array.slice(12, 12 + vendorStringLength)
    );

    const userCommentListLength = dataView.getInt32(
      12 + vendorStringLength,
      true
    );

    let commentListLengthLeft = userCommentListLength;
    const userCommentStrings: string[] = [];

    while (commentListLengthLeft > 0) {
      const offset = userCommentListLength - commentListLengthLeft;
      const userCommentStringLength = dataView.getInt32(
        12 + vendorStringLength + 4 + offset,
        true
      );
      const userCommentString = new TextDecoder().decode(
        array.slice(
          12 + vendorStringLength + 8 + offset,
          12 + vendorStringLength + 8 + offset + userCommentStringLength
        )
      );

      userCommentStrings.push(userCommentString);

      commentListLengthLeft -= userCommentStringLength + 4;
    }

    return {
      vendorString,
      userCommentString: userCommentStrings,
    };
  }

  isHeaderPage(): boolean {
    const array = this.getPageSegment(0);
    for (let i = 0; i < opusHeadMagicSignature.length; i += 1) {
      if (array[i] !== opusHeadMagicSignature[i]) {
        return false;
      }
    }
    return true;
  }

  isTagsPage(): boolean {
    const array = this.getPageSegment(0);
    for (let i = 0; i < opusCommentMagicSignature.length; i += 1) {
      if (array[i] !== opusCommentMagicSignature[i]) {
        return false;
      }
    }
    return true;
  }
}
