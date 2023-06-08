import type {
  IEpisode,
  IAssetForClient,
  IResourceItemForClient,
} from '@web-media/definitions';

export interface IEpisodeAbstraction {
  key: string;
  episode: IEpisode;
  assets: IAssetForClient[];
}

export interface IEpisodeDetail {
  key: string;
  episode: IEpisode;
  assets: IAssetForClient[];
  resources: IResourceItemForClient[];
}
