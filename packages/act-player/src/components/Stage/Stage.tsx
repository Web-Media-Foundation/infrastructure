import * as React from 'react';
import cn from 'classnames';
import useConstant from 'use-constant';
import { useStore } from '@nanostores/react';
import { useStyletron } from 'baseui';

import { Block } from 'baseui/block';

import { useBugFreeStore } from '../../hooks/useBugFreeStore';

import { Buffering } from '../Loading/Buffering';
import { ModuleContainer } from '../Layout/ModuleContainer';
import type { InterfaceExtensionComponent, AssetExtensionComponent } from '../../types/ExtensionCore';

import { Video } from './Video';
import { ActPoint } from './ActPoint';
import { getController } from './controllers';

const CONTENT_EXTENSIONS: Record<string, AssetExtensionComponent> = {
  '@recative/content-extension-video': Video,
  '@recative/content-extension-act-point': ActPoint,
};

const useStyles = () => {
  const [css] = useStyletron();

  const stageContainerStyles = React.useMemo(() => css({
    height: '100%',
  }), []);

  const elementContainerStyles = React.useMemo(() => css({
    backgroundColor: 'black',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    overflowX: 'hidden',
    overflowY: 'hidden',
    pointerEvents: 'auto',
  }), []);

  const bufferingStyles = React.useMemo(() => css({
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: '0',
    left: '0',
  }), []);

  return { stageContainerStyles, elementContainerStyles, bufferingStyles };
};

export const Stage: InterfaceExtensionComponent = React.memo((props) => {
  const { stageContainerStyles, elementContainerStyles, bufferingStyles } = useStyles();

  const core = useConstant(() => {
    const controller = getController();
    const coreFunctions = props.core.registerComponent(
      'stage',
      controller.controller,
    );

    return { controller, coreFunctions };
  });

  const assetsShow = useStore(core.controller.assetShowAtom);
  const stageContents = useBugFreeStore(core.controller.stageContentsAtom);
  const stageEmpty = useStore(props.core.stageEmpty);
  const playing = useStore(props.core.playing);
  const stuck = useStore(props.core.stuck);

  return (
    <ModuleContainer>
      <Block className={cn(stageContainerStyles, elementContainerStyles)} display={stageEmpty ? 'none' : 'block'}>
        {stageContents.map(({ id, spec }) => {
          const Component = CONTENT_EXTENSIONS[spec?.contentExtensionId || ''];

          if (!Component) return null;

          return (
            <Component
              key={id}
              id={id}
              spec={spec!}
              core={props.core}
              show={!!assetsShow[id]}
              loadingComponent={props.loadingComponent}
            />
          );
        })}
      </Block>
      { playing && stuck && (
          <Block className={cn(bufferingStyles)}>
            <Buffering loadingComponent={props.loadingComponent} />
          </Block>
      )}
    </ModuleContainer>
  );
});

export { getController as getStageController } from './controllers';