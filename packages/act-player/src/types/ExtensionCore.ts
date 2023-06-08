import * as React from 'react';
import type { EpisodeCore } from '@web-media/core-manager';
import type { ContentSpec } from '@web-media/definitions';

export type InterfaceExtensionComponent = React.FC<{
  core: EpisodeCore;
  loadingComponent?: React.FC;
}>;
export type AssetExtensionComponent = React.FC<{
  id: string;
  core: EpisodeCore;
  spec: ContentSpec;
  show: boolean;
  loadingComponent?: React.FC;
}>;
