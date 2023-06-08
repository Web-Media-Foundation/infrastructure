import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.recative.mobile_shell',
  appName: 'Web Media Foundation',
  webDir: 'build',
  bundledWebRuntime: false,
  backgroundColor:'#376e85',
  cordova:{
    preferences:{
      URL_SCHEME: "recative"
    }
  }
};

export default config;
