/* eslint-disable @typescript-eslint/comma-dangle */
import * as React from 'react';
import debug from 'debug';

import useConstant from 'use-constant';

import { ActPlayer } from '@recative/act-player';
import {
  EndEventDetail, InitializedEventDetail, SegmentStartEventDetail, SeriesCore
} from '@recative/core-manager';

import type { IUnmanagedActPointProps } from '@recative/act-player';
import type { RawUserImplementedFunctions } from '@recative/definitions';
import type {
  EpisodeCore,
  IEpisodeMetadata,
  ISeriesCoreConfig,
  IInitialAssetStatus,
} from '@recative/core-manager';

import { useCustomEventWrapper } from './hooks/useCustomEventWrapper';

import { fetch } from '../utils/fetch';
import { loadCustomizedModule } from '../utils/loadCustomizedModule';

import { useSdkConfig } from '../hooks/useSdkConfig';
import { useEpisodeDetail } from '../hooks/useEpisodeDetail';
import { useMemoryLeakFixer } from '../hooks/useMemoryLeakFixer';
import { useResetAssetStatusCallback } from '../hooks/useResetAssetStatusCallback';

import { CONTAINER_COMPONENT } from '../constant/storageKeys';
import { IEpisodeDetail } from '../external';

const log = debug('client:content-sdk');

export interface IContentProps<EnvVariable> {
  episodeId: string | undefined;
  initialAsset: IInitialAssetStatus | undefined;
  userImplementedFunctions: Partial<RawUserImplementedFunctions> | undefined;
  preferredUploaders: string[];
  trustedUploaders: string[];
  envVariable: EnvVariable | undefined;
  loadingComponent?: React.FC<{}>;
  attemptAutoplay?: IEpisodeMetadata['attemptAutoplay'];
  defaultContentLanguage?: IEpisodeMetadata['defaultContentLanguage'];
  defaultSubtitleLanguage?: IEpisodeMetadata['defaultSubtitleLanguage'];
  navigate: ISeriesCoreConfig['navigate'],
  playerPropsHookDependencies?: any;
  onEnd?: (x: EndEventDetail) => void;
  onSegmentEnd?: (x: SegmentStartEventDetail) => void;
  onSegmentStart?: (x: SegmentStartEventDetail) => void;
  onInitialized?: (x: InitializedEventDetail) => void;
}

const ON_END: IContentProps<unknown>['onEnd'] = () => log('[DEFAULT] All content ended');
const ON_SEGMENT_END: IContentProps<unknown>['onSegmentEnd'] = ({ episodeId, segment }: SegmentStartEventDetail) => log(`[DEFAULT] Segment ${segment} of ${episodeId} ended`);
const ON_SEGMENT_START: IContentProps<unknown>['onSegmentStart'] = ({ episodeId, segment }: SegmentStartEventDetail) => log(`[DEFAULT] Segment ${segment} of ${episodeId} ended`);

const usePlayerPropsDefaultHook = () => ({
  injectToPlayer: {
    onEnd: ON_END,
    onSegmentEnd: ON_SEGMENT_END,
    onSegmentStart: ON_SEGMENT_START,
  },
  injectToContainer: undefined,
});

const DefaultContainerComponent: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  // eslint-disable-next-line react/forbid-dom-props
  <div className="demoContainer" style={{ width: '100%', height: '100%' }}>
    {children}
  </div>
);

const DefaultContainerModule = {
  Container: DefaultContainerComponent,
};

interface IContentModule<PlayerPropsInjectedDependencies> {
  Container?: React.FC<any>;
  interfaceComponents?: React.FC<any>[];
  usePlayerProps?: (props: {
    episodeId?: string;
    dependencies: PlayerPropsInjectedDependencies;
    coreRef: React.RefObject<EpisodeCore>;
    userImplementedFunctions: Partial<RawUserImplementedFunctions> | undefined;
  }) => {
    injectToPlayer?: Partial<IUnmanagedActPointProps>;
    injectToContainer?: Record<string, unknown>;
  };
}

export const ContentModuleFactory = <
  EnvVariable extends Record<string, unknown>,
  ContentModule
>(
    pathPattern: string,
    dataType: string,
    baseUrl = '',
  ) => React.lazy(async () => {
    const debugContainerComponents = localStorage.getItem(CONTAINER_COMPONENT);

    const containerModule = await (async () => {
      try {
        return (await loadCustomizedModule(
          debugContainerComponents || 'containerComponents.js',
          pathPattern,
          dataType,
          debugContainerComponents ? null : baseUrl,
        )) as IContentModule<ContentModule>;
      } catch (e) {
        console.warn('Failed to load customized module!');
        console.error(e);
        return DefaultContainerModule as IContentModule<ContentModule>;
      }
    })();

    const {
      usePlayerProps: internalUsePlayerProps,
      Container,
      interfaceComponents,
    } = containerModule;
    const ContainerComponent: React.FC<any> = Container || DefaultContainerComponent;
    const usePlayerProps = internalUsePlayerProps ?? usePlayerPropsDefaultHook;

    const Content = ({
      children,
      episodeId,
      envVariable,
      initialAsset,
      loadingComponent,
      preferredUploaders,
      trustedUploaders,
      userImplementedFunctions,
      playerPropsHookDependencies,
      navigate,
      attemptAutoplay,
      defaultContentLanguage,
      defaultSubtitleLanguage,
      onEnd: playerOnEnd,
      onSegmentEnd: playerOnSegmentEnd,
      onSegmentStart: playerOnSegmentStart,
      onInitialized: playerOnInitialized,
      ...props
    }: React.PropsWithChildren<IContentProps<EnvVariable>>) => {
      const config = useSdkConfig();
      const episodeCoreRef: React.MutableRefObject<
      EpisodeCore<EnvVariable> | null
      > = React.useRef(null);

      useMemoryLeakFixer();

      const episodeDetail = useEpisodeDetail(episodeId ?? null);

      const {
        pathPattern: internalPathPattern,
        dataType: internalDataType,
        setClientSdkConfig
      } = useSdkConfig();

      const fetchData = React.useCallback(
        (fileName: string) => fetch(
          fileName,
          internalDataType,
          internalPathPattern,
          setClientSdkConfig
        ) as Promise<IEpisodeDetail>,
        [internalDataType, internalPathPattern, setClientSdkConfig]
      );

      const getEpisodeMetadata = React.useCallback(
        (nextEpisodeId: string) => ({
          attemptAutoplay,
          defaultContentLanguage,
          defaultSubtitleLanguage,
          episodeData: fetchData(nextEpisodeId).then(({ resources, assets }) => ({
            resources,
            assets,
            preferredUploaders,
            trustedUploaders
          })),
        }),
        [
          attemptAutoplay,
          defaultContentLanguage,
          defaultSubtitleLanguage,
          fetchData,
          preferredUploaders,
          trustedUploaders
        ]
      );

      const seriesCore = useConstant(() => new SeriesCore({
        navigate,
        getEpisodeMetadata
      }));

      React.useEffect(() => {
        seriesCore.updateConfig({
          navigate,
          getEpisodeMetadata
        });
      }, [navigate, getEpisodeMetadata, seriesCore]);

      const playerPropsHookProps = React.useMemo(
        () => ({
          dependencies: { ...playerPropsHookDependencies, fetchData },
          coreRef: episodeCoreRef,
          userImplementedFunctions,
          episodeId,
          envVariable,
          assets: episodeDetail?.assets,
        }),
        [
          playerPropsHookDependencies,
          userImplementedFunctions,
          episodeId,
          envVariable,
          episodeDetail,
          fetchData,
        ]
      );

      const { injectToPlayer, injectToContainer } = usePlayerProps(playerPropsHookProps);

      const {
        hookOnEnd, hookOnSegmentEnd, hookOnSegmentStart, playerProps
      } = React.useMemo(() => {
        const {
          onEnd: hookOnEnd0,
          onSegmentEnd: hookOnSegmentEnd0,
          onSegmentStart: hookOnSegmentStart0,
          ...playerProps0
        } = injectToPlayer ?? {};

        return {
          hookOnEnd: hookOnEnd0,
          hookOnSegmentEnd: hookOnSegmentEnd0,
          hookOnSegmentStart: hookOnSegmentStart0,
          playerProps: playerProps0,
        };
      }, [injectToPlayer]);

      React.useEffect(() => {
        log('Episode #', episodeId);
        log('Episode Detail', episodeDetail);
        log('Props for hook', playerPropsHookProps);
        log('Injected player props', playerProps);
      }, [episodeDetail, episodeId, playerProps, playerPropsHookProps]);

      const resetInitialAsset = useResetAssetStatusCallback();

      useCustomEventWrapper(playerOnEnd, hookOnEnd, 'end', seriesCore);
      useCustomEventWrapper(playerOnSegmentEnd, hookOnSegmentEnd, 'segmentEnd', seriesCore);
      useCustomEventWrapper(playerOnSegmentStart, hookOnSegmentStart, 'segmentStart', seriesCore);
      useCustomEventWrapper(resetInitialAsset, playerOnInitialized, 'initialized', seriesCore);

      return (
        <ContainerComponent
          episodeListRequestStatus={config.requestStatus.episodes}
          episodeDetailRequestStatus={
            episodeId && config.requestStatus[episodeId]
          }
          episodeId={episodeDetail?.episode.id || ''}
          episodes={config.episodesMap}
          {...props}
          {...injectToContainer}
        >
          {
            episodeDetail
            && episodeDetail.assets
            && userImplementedFunctions
            && episodeId
              ? (
                <ActPlayer<EnvVariable>
                  coreRef={episodeCoreRef as any}
                  episodeId={episodeDetail.episode.id || ''}
                  assets={episodeDetail.assets}
                  resources={episodeDetail.resources}
                  preferredUploaders={preferredUploaders}
                  trustedUploaders={trustedUploaders}
                  initialAsset={initialAsset || config.initialAssetStatus}
                  userImplementedFunctions={userImplementedFunctions}
                  interfaceComponents={interfaceComponents}
                  userData={undefined}
                  envVariable={envVariable as any}
                  loadingComponent={loadingComponent}
                  {...playerProps}
                />
              )
              : (
                loadingComponent ?? <div />
              )
          }
        </ContainerComponent>
      );
    };

    return {
      default: Content as React.FC<IContentProps<EnvVariable>>,
    };
  });
