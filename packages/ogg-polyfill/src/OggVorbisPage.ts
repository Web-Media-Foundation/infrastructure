import { OggPage } from './OggPage';

const vorbisHeadMagicSignature = [0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];
const vorbisSetupCodebookMagicSignature = [0x42, 0x43, 0x56];

const allowedBlockSizes = new Set([64, 128, 256, 512, 1024, 2048, 4096, 8192]);

/**
 * This class implemented Chapter 2 (Bitpacking Convention) of Vorbis I 
 * specification
 */
class BitStreamReader {
  private data: Uint8Array;
  cursor: number;

  constructor(data: Uint8Array, offset = 0) {
    this.data = data;
    this.cursor = offset;
  }

  private readBit(): number {
    const byteIndex = Math.floor(this.cursor / 8);
    const bitIndex = this.cursor % 8;
    const bit = (this.data[byteIndex] >> bitIndex) & 1;
    this.cursor++;
    return bit;
  }

  private readBitsAsNumber(numBits: number): number {
    let result = 0;
    for (let i = 0; i < numBits; i++) {
      const bit = this.readBit();
      result |= (bit << i);
    }
    return result;
  }

  public readBool(): boolean {
    return this.readBitsAsNumber(1) === 1;
  }

  public readUintN(x: number) {
    return this.readBitsAsNumber(x);
  }

  public readUint2(): number {
    return this.readBitsAsNumber(2);
  }

  public readUint3(): number {
    return this.readBitsAsNumber(3);
  }

  public readUint4(): number {
    return this.readBitsAsNumber(4);
  }

  public readUint5(): number {
    return this.readBitsAsNumber(5);
  }

  public readUint6(): number {
    return this.readBitsAsNumber(6);
  }

  public readUint8(): number {
    return this.readBitsAsNumber(8);
  }

  public readUint16(): number {
    return this.readBitsAsNumber(16);
  }

  public readUint24(): number {
    return this.readBitsAsNumber(24);
  }

  public readUint32(): number {
    return this.readBitsAsNumber(32);
  }
}

const float32Unpack = (x: number): number => {
  // Step 1: Extract mantissa
  const mantissa = x & 0x1fffff;

  // Step 2: Extract sign
  const sign = x & 0x80000000;

  // Step 3: Extract exponent
  const exponent = (x & 0x7fe00000) >>> 21;

  // Step 4: Negate mantissa if sign is nonzero
  const signedMantissa = sign ? -mantissa : mantissa;

  // Step 5: Calculate and return the floating-point value
  return signedMantissa * Math.pow(2, exponent - 788);
}

const lookup1Values = (entries: number, dimensions: number): number => {
  let low = 1;
  let high = entries;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (Math.pow(mid, dimensions) <= entries) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

export class VorbisFormatError extends Error { }

export interface IVorbisIdentificationHeader {
  vorbisVersion: number;
  audioChannels: number;
  audioSampleRate: number;
  bitrateMaximum: number;
  bitrateNominal: number;
  bitrateMinimum: number;
  blocksize0: number;
  blocksize1: number;
  framingFlag: boolean;
}

export interface IVorbisCommentHeader {
  vendor: string;
  comments: Record<string, string[]>;
}

interface IVorbisResidue {
  type: number;
  begin: number;
  end: number;
  partitionSize: number;
  classifications: number;
  classbook: number;
  cascade: number[];
  books: number[][];
}

interface IVorbisMapping {
  submaps: number;
  couplingSteps: number;
  magnitudes: number[];
  angles: number[];
  mux: number[];
  submapFloor: number[];
  submapResidue: number[];
}

interface IVorbisMode {
  blockFlag: boolean;
  windowType: number;
  transformType: number;
  mapping: number;
}

export interface IVorbisSetupHeader {
  codebooks: IVorbisSetupCodebook[];
  floors: (IVorbisFloorType0 | IVorbisFloorType1)[];
  residues: IVorbisResidue[];
  mappings: IVorbisMapping[];
  modes: IVorbisMode[];
}

interface IVorbisSetupCodebook {
  dimensions: number;
  entries: number;
  codewordLengths: number[];
  lookupType: VorbisSetupCodebookLookupType;
  minimumValue?: number;
  deltaValue?: number;
  valueBits?: number;
  sequenceP?: boolean;
  multiplicands?: number[];
}

export enum VorbisSetupCodebookLookupType {
  NoLookup = 0,
  Implicitly = 1,
  Explicitly = 2,
}

interface IVorbisFloorType0 {
  order: number;
  rate: number;
  barkMapSize: number;
  amplitudeBits: number;
  amplitudeOffset: number;
  numberOfBooks: number;
  bookList: number[];
}

interface IVorbisFloorType1 {
  partitions: number;
  partitionClassList: number[];
  classDimensions: number[];
  classSubclasses: number[];
  classMasterbooks: number[];
  subclassBooks: number[][];
  multiplier: number;
  rangebits: number;
  XList: number[];
  values: number;
}

export enum VorbisHeaderType {
  Identification = 1,
  Comment = 3,
  Setup = 5,
}

const dbgHex = (x: number) => {
  return `0x${x.toString(16).padStart(2, '0')}`
}

const ilog = (x: number): number => {
  if (x <= 0) {
    return 0;
  }

  let returnValue = 0;

  while (x > 0) {
    returnValue++;
    x >>>= 1;
  }

  return returnValue;
}

export class OggVorbisPage extends OggPage {
  getIdentification(segmentIndex = 0): IVorbisIdentificationHeader {
    const array = this.getPageSegment(segmentIndex);

    if (!this.isHeaderPacket(segmentIndex)) {
      throw new VorbisFormatError('Invalid magic signature');
    }

    if (!this.isIdentificationPacket(segmentIndex)) {
      throw new VorbisFormatError('The packet is not an identification packet');
    }

    const reader = new BitStreamReader(array, 7 * 8);

    const vorbisVersion = reader.readUint32();
    if (vorbisVersion !== 0) {
      throw new VorbisFormatError(`Unsupported Vorbis version: ${vorbisVersion}`);
    }

    const audioChannels = reader.readUint8();
    if (audioChannels <= 0) {
      throw new VorbisFormatError('Invalid number of audio channels');
    }

    const audioSampleRate = reader.readUint32();
    if (audioSampleRate <= 0) {
      throw new VorbisFormatError('Invalid audio sample rate');
    }

    const bitrateMaximum = reader.readUint32();
    const bitrateNominal = reader.readUint32();
    const bitrateMinimum = reader.readUint32();

    const blocksize0 = 1 << reader.readUint4();
    const blocksize1 = 1 << reader.readUint4();

    if (!allowedBlockSizes.has(blocksize0)) {
      throw new VorbisFormatError(`Invalid blocksize0 values: ${blocksize0}`);
    }

    if (!allowedBlockSizes.has(blocksize1)) {
      throw new VorbisFormatError(`Invalid blocksize1 values: ${blocksize1}`);
    }

    if (blocksize0 > blocksize1) {
      throw new VorbisFormatError('blocksize0 must be less than or equal to blocksize1');
    }

    const framingFlag = reader.readBool();
    if (!framingFlag) {
      throw new VorbisFormatError('Framing bit must be nonzero');
    }

    return {
      vorbisVersion,
      audioChannels,
      audioSampleRate,
      bitrateMaximum,
      bitrateNominal,
      bitrateMinimum,
      blocksize0,
      blocksize1,
      framingFlag,
    };
  }

  private decoder = new TextDecoder('utf-8');

  getComments(segmentIndex = 1): IVorbisCommentHeader {
    const array = this.getPageSegment(segmentIndex);

    if (!this.isHeaderPacket(segmentIndex)) {
      throw new VorbisFormatError('Invalid magic signature');
    }

    if (!this.isCommentPacket(segmentIndex)) {
      throw new VorbisFormatError('The packet is not a comment packet');
    }

    const reader = new BitStreamReader(array, 7 * 8);

    // Step 1: Read vendor string length (32 bits)
    const vendorLength = reader.readUint32();

    // Step 2: Read vendor string (UTF-8 vector as vendorLength octets)
    const vendorArray = array.subarray(reader.cursor / 8, (reader.cursor / 8) + vendorLength);
    const vendor = this.decoder.decode(vendorArray);
    reader.cursor += vendorLength * 8;

    // Step 3: Read number of comment fields (32 bits)
    const userCommentListLength = reader.readUint32();

    // Step 4: Iterate over the number of comment fields
    const comments: Record<string, string[]> = {};
    for (let i = 0; i < userCommentListLength; i++) {
      // Step 5: Read length of this user comment (32 bits)
      const commentLength = reader.readUint32();

      // Step 6: Read this user comment (UTF-8 vector as commentLength octets)
      const commentArray = array.subarray(reader.cursor / 8, (reader.cursor / 8) + commentLength);
      const comment = this.decoder.decode(commentArray);
      reader.cursor += commentLength * 8;

      // Split the comment into field name and value
      const [fieldName, fieldValue] = comment.split('=', 2);
      const normalizedFieldName = fieldName.toUpperCase();

      // Add the comment to the comments object
      if (!comments[normalizedFieldName]) {
        comments[normalizedFieldName] = [];
      }
      comments[normalizedFieldName].push(fieldValue);
    }

    // Step 7: Read framing bit (1 bit)
    const framingBit = reader.readBool();
    if (!framingBit) {
      throw new VorbisFormatError('Framing bit must be nonzero');
    }

    // Return the parsed comment header
    return {
      vendor,
      comments,
    };
  }

  private parseSetupCodebook(reader: BitStreamReader): IVorbisSetupCodebook {
    for (let i = 0, l = vorbisSetupCodebookMagicSignature.length; i < l; i += 1) {
      const byte = reader.readUint8();
      if (byte !== vorbisSetupCodebookMagicSignature[i]) {
        throw new VorbisFormatError(`Invalid codebook magic string, expected ${dbgHex(vorbisSetupCodebookMagicSignature[i])}, got ${dbgHex(byte)} in position ${reader.cursor - 8}`);
      }
    }

    // Read dimensions and entries
    const dimensions = reader.readUint16();
    const entries = reader.readUint24();

    // Read ordered flag
    const ordered = reader.readBool();

    // Initialize codeword lengths array
    const codewordLengths: number[] = new Array(entries).fill(0);

    if (ordered) {
      let currentEntry = 0;
      let currentLength = reader.readUint5() + 1;

      while (currentEntry < entries) {
        const number = reader.readUintN(ilog(entries - currentEntry));
        if (currentEntry + number > entries) {
          throw new VorbisFormatError('Invalid codebook: too many codewords');
        }
        for (let i = 0; i < number; i++) {
          codewordLengths[currentEntry++] = currentLength;
        }
        currentLength++;
      }
    } else {
      const sparse = reader.readBool();
      for (let i = 0; i < entries; i++) {
        if (sparse) {
          const flag = reader.readBool();
          if (flag) {
            codewordLengths[i] = reader.readUint5() + 1;
          } else {
            codewordLengths[i] = 0; // Unused entry
          }
        } else {
          codewordLengths[i] = reader.readUint5() + 1;
        }
      }
    }

    // Read lookup type
    const lookupType = reader.readUint4() as VorbisSetupCodebookLookupType;

    // Initialize lookup-related fields
    let minimumValue: number | undefined;
    let deltaValue: number | undefined;
    let valueBits: number | undefined;
    let sequenceP: boolean | undefined;
    let multiplicands: number[] | undefined;

    if (lookupType === VorbisSetupCodebookLookupType.Implicitly || lookupType === VorbisSetupCodebookLookupType.Explicitly) {
      minimumValue = float32Unpack(reader.readUint32());
      deltaValue = float32Unpack(reader.readUint32());
      valueBits = reader.readUint4() + 1;
      sequenceP = reader.readBool();

      let lookupValues: number;
      if (lookupType === VorbisSetupCodebookLookupType.Implicitly) {
        lookupValues = lookup1Values(entries, dimensions);
      } else {
        lookupValues = entries * dimensions;
      }

      multiplicands = new Array(lookupValues);
      for (let i = 0; i < lookupValues; i++) {
        multiplicands[i] = reader.readUintN(valueBits);
      }
    } else if (lookupType > VorbisSetupCodebookLookupType.Explicitly) {
      throw new VorbisFormatError('Unsupported lookup type');
    }

    return {
      dimensions,
      entries,
      codewordLengths,
      lookupType,
      minimumValue,
      deltaValue,
      valueBits,
      sequenceP,
      multiplicands,
    };
  }

  private parseFloorType0(codebookCount: number, reader: BitStreamReader): IVorbisFloorType0 {
    const floor0Order = reader.readUint8();
    const floor0Rate = reader.readUint16();
    const floor0BarkMapSize = reader.readUint16();
    const floor0AmplitudeBits = reader.readUint6();
    const floor0AmplitudeOffset = reader.readUint8();
    const floor0NumberOfBooks = reader.readUint4() + 1;

    const floor0BookList: number[] = [];
    for (let i = 0; i < floor0NumberOfBooks; i++) {
      const book = reader.readUint8();
      if (book > codebookCount) {
        throw new VorbisFormatError('Invalid book number in floor0_book_list');
      }
      floor0BookList.push(book);
    }

    return {
      order: floor0Order,
      rate: floor0Rate,
      barkMapSize: floor0BarkMapSize,
      amplitudeBits: floor0AmplitudeBits,
      amplitudeOffset: floor0AmplitudeOffset,
      numberOfBooks: floor0NumberOfBooks,
      bookList: floor0BookList,
    };
  }

  private parseFloorType1(reader: BitStreamReader): IVorbisFloorType1 {
    // Step 1: Read the number of partitions
    const floor1Partitions = reader.readUint5();

    // Step 2: Initialize partition class list and read values
    const floor1PartitionClassList: number[] = new Array(floor1Partitions);
    for (let i = 0; i < floor1Partitions; i++) {
      floor1PartitionClassList[i] = reader.readUint4();
    }

    // Step 3: Determine the maximum class number
    const maximumClass = Math.max(...floor1PartitionClassList);

    // Step 4: Initialize vectors for class dimensions, subclasses, and masterbooks
    const floor1ClassDimensions: number[] = new Array(maximumClass + 1);
    const floor1ClassSubclasses: number[] = new Array(maximumClass + 1);
    const floor1ClassMasterbooks: number[] = new Array(maximumClass + 1).fill(-1);
    const floor1SubclassBooks: number[][] = new Array(maximumClass + 1).fill(null).map(() => []);

    // Step 5: Read class dimensions, subclasses, masterbooks, and subclass books
    for (let i = 0; i <= maximumClass; i++) {
      floor1ClassDimensions[i] = reader.readUint3() + 1;
      floor1ClassSubclasses[i] = reader.readUint2();
      if (floor1ClassSubclasses[i] > 0) {
        floor1ClassMasterbooks[i] = reader.readUint8();
      }
      for (let j = 0; j < (1 << floor1ClassSubclasses[i]); j++) {
        floor1SubclassBooks[i][j] = reader.readUint8() - 1;
      }
    }

    // Step 6: Read the floor1_multiplier and rangebits
    const floor1Multiplier = reader.readUint2() + 1;
    const rangebits = reader.readUint4();

    // Step 7: Initialize X list and set the first two elements
    const floor1XList: number[] = [0, 1 << rangebits];
    let floor1Values = 2;

    // Step 8: Read the rest of the X list
    for (let i = 0; i < floor1Partitions; i++) {
      const currentClassNumber = floor1PartitionClassList[i];
      for (let j = 0; j < floor1ClassDimensions[currentClassNumber]; j++) {
        floor1XList[floor1Values++] = reader.readUintN(rangebits);
      }
    }

    // Ensure X list values are unique
    const uniqueXList = new Set(floor1XList);
    if (uniqueXList.size !== floor1XList.length) {
      throw new VorbisFormatError('Non-unique X values in floor1_X_list');
    }

    // Ensure X list length does not exceed 65
    if (floor1XList.length > 65) {
      throw new VorbisFormatError('floor1_X_list length exceeds 65 elements');
    }

    // Return the parsed floor type 1 configuration
    return {
      partitions: floor1Partitions,
      partitionClassList: floor1PartitionClassList,
      classDimensions: floor1ClassDimensions,
      classSubclasses: floor1ClassSubclasses,
      classMasterbooks: floor1ClassMasterbooks,
      subclassBooks: floor1SubclassBooks,
      multiplier: floor1Multiplier,
      rangebits: rangebits,
      XList: floor1XList,
      values: floor1Values,
    };
  }

  private parseResidue(codebookCount: number, reader: BitStreamReader): IVorbisResidue {
    // Read residue type (0, 1, or 2)
    const residueType = reader.readUint16();
    if (residueType > 2) {
      throw new VorbisFormatError(`Invalid residue type ${residueType}`);
    }

    // Read residue header
    const residueBegin = reader.readUint24();
    const residueEnd = reader.readUint24();
    const residuePartitionSize = reader.readUint24() + 1;
    const residueClassifications = reader.readUint6() + 1;
    const residueClassbook = reader.readUint8();

    // Validate the classbook
    if (residueClassbook >= codebookCount) {
      throw new VorbisFormatError('Invalid classbook number');
    }

    // Read residue cascade
    const residueCascade: number[] = new Array(residueClassifications);
    for (let i = 0; i < residueClassifications; i++) {
      let highBits = 0;
      const lowBits = reader.readUint3();
      const bitflag = reader.readBool();
      if (bitflag) {
        highBits = reader.readUint5();
      }
      residueCascade[i] = (highBits << 3) + lowBits;
    }

    // Read residue books
    const residueBooks: number[][] = new Array(residueClassifications);
    for (let i = 0; i < residueClassifications; i++) {
      residueBooks[i] = new Array(8).fill(-1); // Initialize with -1 (unused)
      for (let j = 0; j < 8; j++) {
        if ((residueCascade[i] & (1 << j)) !== 0) {
          const book = reader.readUint8();
          if (book >= codebookCount) {
            throw new VorbisFormatError('Invalid book number in residue_books');
          }
          residueBooks[i][j] = book;
        }
      }
    }

    return {
      type: residueType,
      begin: residueBegin,
      end: residueEnd,
      partitionSize: residuePartitionSize,
      classifications: residueClassifications,
      classbook: residueClassbook,
      cascade: residueCascade,
      books: residueBooks,
    };
  }

  private parseMapping(audioChannels: number, floorCount: number, residueCount: number, reader: BitStreamReader): IVorbisMapping {
    // Step 2a: Read the mapping type (16 bits)
    const mappingType = reader.readUint16();

    // Step 2b: If the mapping type is nonzero, the stream is undecodable
    if (mappingType !== 0) {
      throw new VorbisFormatError('Unsupported mapping type');
    }

    // Step 2c: If the mapping type is zero, proceed with parsing
    // Step 2c-i: Read 1 bit as a boolean flag for submaps
    const submapsFlag = reader.readBool();
    let submaps: number;
    if (submapsFlag) {
      submaps = reader.readUint4() + 1;
    } else {
      submaps = 1;
    }

    // Step 2c-ii: Read 1 bit as a boolean flag for coupling steps
    const couplingFlag = reader.readBool();
    let couplingSteps: number;
    let magnitudes: number[] = [];
    let angles: number[] = [];
    if (couplingFlag) {
      couplingSteps = reader.readUint8() + 1;
      const couplingBits = ilog(audioChannels - 1);

      for (let j = 0; j < couplingSteps; j++) {
        const magnitude = reader.readUintN(couplingBits);
        const angle = reader.readUintN(couplingBits);
        if (magnitude === angle || magnitude >= audioChannels || angle >= audioChannels) {
          throw new VorbisFormatError('Invalid coupling channel numbers');
        }
        magnitudes.push(magnitude);
        angles.push(angle);
      }
    } else {
      couplingSteps = 0;
    }

    // Step 2c-iii: Read 2 bits reserved field; if nonzero, the stream is undecodable
    const reserved = reader.readUint2();
    if (reserved !== 0) {
      throw new VorbisFormatError('Invalid reserved field in mapping');
    }

    // Step 2c-iv: Read channel multiplex settings if submaps > 1
    let mux: number[] = [];
    if (submaps > 1) {
      for (let j = 0; j < audioChannels; j++) {
        const muxValue = reader.readUint4();
        if (muxValue >= submaps) {
          throw new VorbisFormatError('Invalid multiplex value');
        }
        mux.push(muxValue);
      }
    }

    // Step 2c-v: Read floor and residue numbers for each submap
    let submapFloor: number[] = [];
    let submapResidue: number[] = [];
    for (let j = 0; j < submaps; j++) {
      reader.readUint8(); // Discard 8 bits (unused time configuration placeholder)
      const floorNumber = reader.readUint8();
      if (floorNumber >= floorCount) {
        throw new VorbisFormatError('Invalid floor number');
      }
      submapFloor.push(floorNumber);
      const residueNumber = reader.readUint8();
      if (residueNumber >= residueCount) {
        throw new VorbisFormatError('Invalid residue number');
      }
      submapResidue.push(residueNumber);
    }

    // Save the mapping configuration
    return {
      submaps,
      couplingSteps,
      magnitudes,
      angles,
      mux,
      submapFloor,
      submapResidue,
    };
  }

  private parseMode(mappingCount: number, reader: BitStreamReader): IVorbisMode[] {
    // Step 1: Read vorbis_mode_count and add one
    const modeCount = reader.readUint6() + 1;

    // Initialize mode configuration array
    const modes: IVorbisMode[] = [];

    for (let i = 0; i < modeCount; i++) {
      // Step 2a: Read the mode block flag (1 bit)
      const blockFlag = reader.readBool();

      // Step 2b: Read the mode window type (16 bits)
      const windowType = reader.readUint16();

      // Step 2c: Read the mode transform type (16 bits)
      const transformType = reader.readUint16();

      // Step 2d: Read the mode mapping (8 bits)
      const mapping = reader.readUint8();

      // Step 2e: Verify ranges
      if (windowType !== 0 || transformType !== 0) {
        throw new VorbisFormatError('Invalid window type or transform type');
      }
      if (mapping >= mappingCount) {
        throw new VorbisFormatError('Invalid mapping number');
      }

      // Save the mode configuration
      modes.push({
        blockFlag,
        windowType,
        transformType,
        mapping,
      });
    }

    // Step 3: Read 1 bit as a framing flag
    const framingFlag = reader.readBool();
    if (!framingFlag) {
      throw new VorbisFormatError('Framing error');
    }

    return modes;
  }

  getSetup(segmentIndex = 0, audioChannels: number): IVorbisSetupHeader {
    const array = this.getPageSegment(segmentIndex);

    if (!this.isHeaderPacket(segmentIndex)) {
      throw new VorbisFormatError('Invalid magic signature');
    }

    if (!this.isSetupPacket(segmentIndex)) {
      throw new VorbisFormatError('The packet is not a setup packet');
    }

    const reader = new BitStreamReader(array, 7 * 8);

    // Step 1: Parse codebooks
    const codebookCount = reader.readUint8() + 1;
    const codebooks: IVorbisSetupCodebook[] = [];
    for (let i = 0; i < codebookCount; i++) {
      const codebook = this.parseSetupCodebook(reader);
      codebooks.push(codebook);
    }

    // Step 2: Parse time configurations (skip as they are not used)
    const timeCount = reader.readUint6() + 1;
    for (let i = 0; i < timeCount; i++) {
      const timeType = reader.readUint16();
      if (timeType !== 0) {
        throw new VorbisFormatError('Unsupported time type');
      }
    }

    // Step 3: Parse floors
    const floorCount = reader.readUint6() + 1;
    const floors: (IVorbisFloorType0 | IVorbisFloorType1)[] = [];
    for (let i = 0; i < floorCount; i++) {
      const floorType = reader.readUint16();
      if (floorType === 0) {
        const floor = this.parseFloorType0(codebookCount, reader);
        floors.push(floor);
      } else if (floorType === 1) {
        const floor = this.parseFloorType1(reader);
        floors.push(floor);
      } else {
        throw new VorbisFormatError('Unsupported floor type');
      }
    }

    // Step 4: Parse residues
    const residueCount = reader.readUint6() + 1;
    const residues: IVorbisResidue[] = [];
    for (let i = 0; i < residueCount; i++) {
      const residue = this.parseResidue(codebookCount, reader);
      residues.push(residue);
    }

    // Step 5: Parse mappings
    const mappingCount = reader.readUint6() + 1;
    const mappings: IVorbisMapping[] = [];
    for (let i = 0; i < residueCount; i++) {
      const mapping = this.parseMapping(audioChannels, floorCount, residueCount, reader);
      mappings.push(mapping);
    }

    // Step 6: Parse modes
    const modes: IVorbisMode[] = this.parseMode(mappingCount, reader);

    return {
      codebooks,
      floors,
      residues,
      mappings,
      modes,
    };
  }

  isHeaderPacket(segmentIndex: number): boolean {
    const array = this.getPageSegment(segmentIndex);
    for (let i = 0; i < vorbisHeadMagicSignature.length; i += 1) {
      if (array[i + 1] !== vorbisHeadMagicSignature[i]) {
        return false;
      }
    }
    return true;
  }

  isIdentificationPacket(segmentIndex = 0): boolean {
    const array = this.getPageSegment(segmentIndex);

    return array[0] === VorbisHeaderType.Identification;
  }

  isCommentPacket(segmentIndex = 0): boolean {
    const array = this.getPageSegment(segmentIndex);

    return array[0] === VorbisHeaderType.Comment;
  }

  isSetupPacket(segmentIndex = 0): boolean {
    const array = this.getPageSegment(segmentIndex);

    return array[0] === VorbisHeaderType.Setup;
  }
}
