// Note: type annotations allow type checking and IDEs autocompletion

const path = require('path');
const lightCodeTheme = require('prism-react-renderer/themes/github');

const labels = require('./packages');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Web Media Foundation',
  tagline: 'Web is Beautiful',
  url: 'https://Web-Media-Foundation.github.io',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  projectName: 'recative.github.io',
  organizationName: 'recative',
  trailingSlash: false,
  deploymentBranch: 'main',

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Web-Media-Foundation/infrastructure/tree/master/packages/documents',
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/Web-Media-Foundation/infrastructure/tree/master/packages/documents',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        logo: {
          alt: 'Web Media Foundation',
          src: 'img/logo.svg',
        },
        items: [
          {
            to: 'docs/technotes/intro',
            activeBasePath: 'docs/technotes',
            position: 'left',
            label: 'Technotes',
          },
          {
            to: 'docs/studio/intro',
            activeBasePath: 'docs/studio',
            position: 'left',
            label: 'Studio',
          },
          {
            to: 'docs/ap-core/intro',
            activeBasePath: 'docs/ap-core',
            position: 'left',
            label: 'AP Core',
          },
          {
            to: 'api',
            label: 'API',
            activeBasePath: 'api',
            position: 'left',
          },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            href: 'https://github.com/Web-Media-Foundation/infrastructure',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        links: [],
        copyright: `© Web Media Foundation ${new Date().getFullYear()}`,
      },
      colorMode: {
        defaultMode: 'light',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      prism: {
        theme: lightCodeTheme,
      },
    }),
  plugins: [
    [
      'docusaurus-plugin-typedoc-api',
      {
        projectRoot: path.join(__dirname, '..', '..'),
        packages: labels.map(({ id }) => ({
          path: `packages/${id}`,
          entry: 'src/index.ts',
        })),
        exclude: ['*.spec.ts', '*.test.ts'],
      },
    ],
  ],
};

module.exports = config;
