import * as React from 'react';
import useConstant from 'use-constant';
import { useStore } from '@nanostores/react';

import { SeriesCore } from '@recative/core-manager';
import type { RawUserImplementedFunctions } from '@recative/definitions';
import type {
  IEpisodeMetadata,
  ISeriesCoreConfig,
  IUserRelatedEnvVariable,
} from '@recative/core-manager';

import { useDataFetcher } from './useDataFetcher';

export const useSeriesCore = <EnvVariable extends Record<string, unknown>>(
  preferredUploaders: string[],
  trustedUploaders: string[],
  rawEpisodeMetadata: Omit<IEpisodeMetadata, 'episodeData'>,
  userImplementedFunctions: Partial<RawUserImplementedFunctions> | undefined,
  envVariable: EnvVariable | undefined,
  userData: IUserRelatedEnvVariable | undefined,
  getInjectedEpisodeMetadata:
  | ((x: IEpisodeMetadata) => IEpisodeMetadata | Promise<IEpisodeMetadata>)
  | undefined,
  navigate: ISeriesCoreConfig['navigate'],
) => {
  const fetchData = useDataFetcher();

  const getEpisodeMetadata = React.useCallback(
    async (nextEpisodeId: string): Promise<IEpisodeMetadata> => {
      const episodeDetail = await fetchData(nextEpisodeId);

      const notInjectedEpisodeMetadata = {
        ...rawEpisodeMetadata,
        episodeData: {
          resources: episodeDetail.resources,
          assets: episodeDetail.assets,
          preferredUploaders,
          trustedUploaders,
        },
      };

      return getInjectedEpisodeMetadata?.(notInjectedEpisodeMetadata) ?? notInjectedEpisodeMetadata;
    },
    [
      fetchData,
      getInjectedEpisodeMetadata,
      preferredUploaders,
      rawEpisodeMetadata,
      trustedUploaders,
    ],
  );

  const seriesCore = useConstant(() => new SeriesCore<EnvVariable>({
    navigate,
    getEpisodeMetadata,
  }));

  React.useEffect(() => {
    seriesCore.config.getEpisodeMetadata = getEpisodeMetadata;
  }, [getEpisodeMetadata, seriesCore.config]);

  React.useEffect(() => {
    seriesCore.config.navigate = navigate;
  }, [navigate, seriesCore.config]);

  React.useEffect(() => {
    if (userImplementedFunctions) {
      seriesCore.userImplementedFunction.set(userImplementedFunctions);
    }
  }, [seriesCore.userImplementedFunction, userImplementedFunctions]);

  const episodeCore = useStore(seriesCore.currentEpisodeCore);

  React.useEffect(() => {
    seriesCore.updateConfig({
      navigate,
      getEpisodeMetadata,
    });
  }, [navigate, getEpisodeMetadata, seriesCore]);

  return { episodeCore, seriesCore };
};
