import createLoadRemoteModule, {
  createRequires,
} from '@paciolan/remote-module-loader';

import * as sdk from '../external';

import { joinPath } from './joinPath';
import { postProcessUrl } from './postProcessUrl';

const dependencies = {
  '@nanostores/react': require('@nanostores/react'),
  classnames: require('classnames'),
  nanostores: require('nanostores'),
  debug: require('debug'),
  nanoid: require('nanoid'),
  baseui: require('baseui'),
  'baseui/block': require('baseui/block'),
  'baseui/button': require('baseui/button'),
  'baseui/select': require('baseui/select'),
  'baseui/form-control': require('baseui/form-control'),
  'baseui/typography': require('baseui/typography'),
  react: require('react'),
  'react/jsx-runtime': require('react/jsx-runtime'),
  'react-dom': require('react-dom'),
  'react-use': require('react-use'),
  'react-slider': require('react-slider'),
  'use-constant': require('use-constant'),
  'lottie-react': require('lottie-react'),
  'i18next': require('i18next'),
  'react-i18next': require('react-i18next'),
  '@web-media/client-sdk': sdk,
  '@web-media/act-player': require('@web-media/act-player'),
  '@web-media/definitions': require('@web-media/definitions'),
  '@web-media/open-promise': require('@web-media/open-promise'),
  '@web-media/act-protocol': require('@web-media/act-protocol'),
  '@web-media/core-manager': require('@web-media/core-manager'),
  '@web-media/smart-resource': require('@web-media/smart-resource'),
};

export const loadCustomizedModule = (
  scriptName: string,
  pathPattern: string,
  dataType: string,
  baseUrl: string | null = '',
) => {
  const requires = createRequires(dependencies);
  const loadRemoteModule = createLoadRemoteModule({ requires });

  return loadRemoteModule(
    baseUrl === null ? scriptName : postProcessUrl(
      joinPath(baseUrl, scriptName),
      pathPattern,
      dataType,
      true,
    ),
  );
};
