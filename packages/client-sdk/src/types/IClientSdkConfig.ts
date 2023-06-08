import type { IEpisode } from '@web-media/definitions';
import type { IInitialAssetStatus } from '@web-media/core-manager';

import { NetworkRequestStatus } from '../constant/NetworkRequestStatus';

export interface IClientSdkConfig {
  pathPattern: string;
  dataType: 'bson' | 'json' | 'uson';
  episodesMap: Map<string, IEpisode>;
  episodeOrderToEpisodeIdMap: Map<number, string>;
  initialAssetStatus: IInitialAssetStatus | undefined;
  videoModalUrls: string[];
  requestStatus: Record<string, NetworkRequestStatus>;
}
