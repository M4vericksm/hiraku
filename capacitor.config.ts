import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.hiraku.app',
	appName: 'Hiraku',
	webDir: 'build',
	server: {
		// Permite fetch HTTP (API local em cleartext) a partir do WebView.
		// Sem isso, Android bloqueia mixed content / cleartext.
		cleartext: true,
		androidScheme: 'http'
	}
};

export default config;
