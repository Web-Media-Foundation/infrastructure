import React from 'react';
import debug from 'debug';

import { useAsync } from '@react-hookz/web';

import { fetch } from './utils/fetch';
import type { IEpisodeDetail } from './types/IEpisodeDetail';
import type { IClientSdkConfig } from './types/IClientSdkConfig';

const log = debug('client:provider');

export interface IClientSdkConfigContextValue extends IClientSdkConfig {
  setClientSdkConfig: React.Dispatch<React.SetStateAction<IClientSdkConfig>>;
}

export const ClientSdkContext = React.createContext<IClientSdkConfigContextValue | null>(null);

interface IPlayerSdkProviderProps {
  pathPattern: string;
  dataType: 'bson' | 'json';
  children: React.ReactNode;
}

export const PlayerSdkProvider: React.FC<IPlayerSdkProviderProps> = ({
  pathPattern,
  dataType = 'bson',
  ...props
}) => {
  const [clientSdkConfig, setClientSdkConfig] = React.useState<IClientSdkConfig>({
    pathPattern,
    episodesMap: new Map(),
    initialAssetStatus: undefined,
    videoModalUrls: [],
    dataType,
    requestStatus: {},
  });

  React.useEffect(() => {
    setClientSdkConfig({ ...clientSdkConfig, pathPattern, dataType });
  }, [pathPattern, dataType]);

  const fetchEpisodes = React.useCallback(async () => {
    log(`Fetching episode list with path pattern: ${pathPattern}`);

    if (pathPattern) {
      const result = await fetch<IEpisodeDetail[]>(
        'episodes',
        dataType,
        pathPattern,
        setClientSdkConfig,
      );
      log('Fetched episode list,', result);
      return result;
    }

    log('No pathPattern provided');
    return null;
  }, [pathPattern]);

  const [episodes, episodesController] = useAsync(fetchEpisodes);

  React.useEffect(() => {
    episodesController.execute();
  }, [fetchEpisodes]);

  React.useEffect(() => {
    log('Episode list updated: ', episodes.result);

    if (episodes.result) {
      const result = new Map();

      episodes.result.forEach(({ episode }) => {
        result.set(episode.id, episode);
      });

      setClientSdkConfig({ ...clientSdkConfig, episodesMap: result });
    }
  }, [episodes.result]);

  const contextValue = React.useMemo(
    () => ({
      ...clientSdkConfig,
      setClientSdkConfig,
    }),
    [clientSdkConfig, setClientSdkConfig],
  );

  return (
    <ClientSdkContext.Provider value={contextValue}>
      {props.children}
    </ClientSdkContext.Provider>
  );
};