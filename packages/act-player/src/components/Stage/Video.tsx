import * as React from 'react';
import cn from 'classnames';
import debug from 'debug';
import useConstant from 'use-constant';
import { useStore } from '@nanostores/react';
import { useStyletron } from 'baseui';
import { useInterval } from 'react-use';
import { Block } from 'baseui/block';

import { convertSRTToStates } from '@recative/core-manager';

import { isSafari } from '../../variables/safari';
import { ModuleContainer } from '../Layout/ModuleContainer';

import type { AssetExtensionComponent } from '../../types/ExtensionCore';

import { getController } from './videoControllers';

const log = debug('player:video');

// milliseconds
const UNSTUCK_CHECK_INTERVAL = 500;

// seconds
const BUFFER_SIZE_TARGET = 5;
const BUFFER_SIZE_DELTA = 1;

// data url for one pixel black png
const BLANK_POSTER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAABNJREFUCB1jZGBg+A/EDEwgAgQADigBA//q6GsAAAAASUVORK5CYII%3D';

const RESOURCE_QUERY_WEIGHTS = {
  category: 1e4,
  lang: 1,
};

const IS_SAFARI = isSafari();

const isVideoWaiting = (video: HTMLVideoElement) => {
  let buffering = true;
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime && currentTime < buffered.end(i)) {
      buffering = false;
    }
  }
  return video.seeking || buffering;
};

const hasEnoughBuffer = (video: HTMLVideoElement) => {
  // Note: sometime the browser do not update buffered
  // when it actually has enough data (like chrome)
  // However you can always trust readyState
  if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
    return true;
  }
  const { buffered, duration, currentTime } = video;
  for (let i = 0; i < buffered.length; i += 1) {
    if (buffered.start(i) <= currentTime && currentTime < buffered.end(i)) {
      if (
        buffered.end(i)
        >= Math.min(duration - BUFFER_SIZE_DELTA, currentTime + BUFFER_SIZE_TARGET)
      ) {
        return true;
      }
    }
  }
  return false;
};

export const InternalVideo: AssetExtensionComponent = (props) => {
  const [css] = useStyletron();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const audioRef = React.useRef<string>('');
  const subtitleRef = React.useRef<string | null>('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const unstuckCheckInterval = React.useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const videoComponentInitialized = React.useRef(false);

  const fullSizeStyle = css({
    width: '100%',
    height: '100%',
    backgroundColor: 'black',
  });

  const core = useConstant(() => {
    const controller = getController(props.id);

    const coreFunctions = props.core.registerComponent(
      props.id,
      controller.controller,
    );

    controller.setCoreFunctions(coreFunctions);

    return { controller, coreFunctions };
  });

  const resolution = useStore(props.core.resolution);
  const contentLanguage = useStore(props.core.contentLanguage);
  const subtitleLanguage = useStore(props.core.subtitleLanguage);

  const clearUnstuckCheckInterval = React.useCallback(() => {
    if (unstuckCheckInterval.current !== null) {
      clearInterval(unstuckCheckInterval.current);
      unstuckCheckInterval.current = null;
    }
  }, [core]);

  const unstuckCheck = React.useCallback(() => {
    if (hasEnoughBuffer(videoRef.current!)) {
      core.coreFunctions.reportUnstuck();
      clearUnstuckCheckInterval();
    }
  }, [core, clearUnstuckCheckInterval]);

  const scheduleUnstuckCheck = React.useCallback(() => {
    if (unstuckCheckInterval.current === null) {
      unstuckCheckInterval.current = setInterval(
        () => unstuckCheck(),
        UNSTUCK_CHECK_INTERVAL,
      );
      unstuckCheck();
    }
  }, [core, unstuckCheck]);

  const stuck = React.useCallback(() => {
    if (!isVideoWaiting(videoRef.current!)) {
      // Chrome somehow gives false positive here
      // maybe it is just seeking but it seeks so fast that
      // we already complete seeking here
      return;
    }
    if (videoRef.current!.readyState <= HTMLMediaElement.HAVE_CURRENT_DATA) {
      core.coreFunctions.log('Stuck reason: do not have data');
    } else if (videoRef.current!.seeking) {
      core.coreFunctions.log('Stuck reason: seeking');
    } else {
      core.coreFunctions.log('Stuck reason: unknown');
    }
    // As a workaround to force the browser to update the readyState
    if (!videoRef.current!.seeking) {
      videoRef.current!.currentTime = videoRef.current!.currentTime;
    }
    core.coreFunctions.reportStuck();
    clearUnstuckCheckInterval();
  }, [core, clearUnstuckCheckInterval]);

  React.useEffect(() => {
    return () => clearUnstuckCheckInterval();
  }, [core]);

  React.useLayoutEffect(() => {
    if (videoComponentInitialized.current) return;

    const $video = videoRef.current;
    if (!$video) return;

    videoComponentInitialized.current = true;

    $video.muted = true;
    $video.controls = false;
    $video.autoplay = false;
    $video.className = fullSizeStyle;
    $video.setAttribute('playsinline', 'true');
    $video.setAttribute('x5-playsinline', 'true');
    $video.setAttribute('webkit-playsinline', 'true');
    $video.setAttribute('x5-video-player-type', 'h5');
    $video.setAttribute('x5-video-player-fullscreen', 'true');
    core.controller.setVideoTag($video);

    return () => {
      core.controller.removeVideoTag();
    };
  }, []);

  const episodeData = props.core.getEpisodeData()!;

  const queryFn = 'resourceLabel' in props.spec
    ? episodeData.resources.getResourceByLabel
    : episodeData.resources.getResourceById;

  const query = props.spec.resourceLabel ?? props.spec.resourceId;

  if (typeof query !== 'string') {
    throw new Error('Invalid resource query!');
  }

  React.useLayoutEffect(() => {
    const matchedResource = queryFn(
      query,
      {
        category: 'video',
      },
      RESOURCE_QUERY_WEIGHTS,
    );

    log('Matched resource is:', matchedResource);

    Promise.resolve(matchedResource)
      .then((selectedVideo) => {
        if (!selectedVideo) {
          throw new Error('Invalid audio URL');
        }

        if (selectedVideo !== videoRef.current!.src) {
          videoRef.current!.src = selectedVideo;
          clearUnstuckCheckInterval();
        }
      });
  }, [query, queryFn, resolution, contentLanguage]);

  React.useLayoutEffect(() => {
    const matchedResource = queryFn(
      query,
      {
        category: 'audio',
      },
      RESOURCE_QUERY_WEIGHTS,
    );

    Promise.resolve(matchedResource)
      .then((selectedAudio) => {
        if (!selectedAudio) {
          throw new Error('Invalid audio URL');
        }

        if (selectedAudio !== audioRef.current) {
          core.coreFunctions.setAudioTrack(selectedAudio);
          audioRef.current = selectedAudio;
        }
      });
  }, [props.spec, contentLanguage]);

  React.useLayoutEffect(() => {
    if (subtitleLanguage !== 'null') {
      const matchedResource = queryFn(
        query,
        {
          category: 'subtitle',
          lang: subtitleLanguage,
        },
        RESOURCE_QUERY_WEIGHTS,
      );

      Promise.resolve(matchedResource)
        .then((selectedSubtitle) => {
          if (!selectedSubtitle) {
            throw new Error('Invalid audio URL');
          }

          if (selectedSubtitle === subtitleRef.current) return;

          subtitleRef.current = selectedSubtitle || null;

          if (subtitleRef.current === null) {
            core.coreFunctions.setManagedCoreStateTriggers([]);
            return;
          }

          return fetch(subtitleRef.current)
            .then((respond) => respond.text())
            .then((srt) => {
              if (subtitleRef.current === selectedSubtitle) {
                core.coreFunctions.setManagedCoreStateTriggers(
                  convertSRTToStates(srt, props.id),
                );
              }
            });
        });
    }
  }, [props.spec, props.core, subtitleLanguage]);

  React.useEffect(() => {
    core.coreFunctions.updateContentState('preloading');

    return () => props.core.unregisterComponent(props.id);
  }, [props.id]);

  /**
   * This is a dirty fix for a bug in the Safari browser (iOS 14.4), it
   * reports the video is playing but not actually playing, we have to
   * tell core manager to force kick the video element.
   */
  useInterval(core.controller.forceCheckup, IS_SAFARI ? 100 : null);

  return (
    <ModuleContainer hidden={!props.show}>
      <Block ref={containerRef} className={cn(fullSizeStyle)}>
        <video
          ref={videoRef}
          className={fullSizeStyle}
          preload="auto"
          poster={BLANK_POSTER}
          onCanPlay={() => {
            scheduleUnstuckCheck();
            core.coreFunctions.updateContentState('ready');
            core.controller.setVideoReady();
          }}
          onLoadedMetadata={() => {
            // For iOS Safari: the browser won't load the data until the video start to play
            // For other browser: the browser only load the first some frames
            // when the video is never played so the browser may not load the more buffer
            // when there is not enough buffer
            videoRef.current!.play();
          }}
          onTimeUpdate={() => {
            core.controller.updateSyncTime();
            core.coreFunctions.reportProgress(
              videoRef.current!.currentTime * 1000,
            );
            core.controller.checkVideoPlayingState();
          }}
          onEnded={core.coreFunctions.finishItself}
          onWaiting={() => {
            stuck();
          }}
        />
      </Block>
    </ModuleContainer>
  );
};

export const Video = React.memo(InternalVideo);