import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/themes.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

async function cleanupLocalhostServiceWorkers() {
	try {
		const registrations = await navigator.serviceWorker.getRegistrations();
		await Promise.all(registrations.map((registration) => registration.unregister()));
	} catch {
		// Ignore cleanup failures in development.
	}

	if ("caches" in window) {
		try {
			const cacheKeys = await caches.keys();
			await Promise.all(
				cacheKeys
					.filter((key) => key.startsWith("nova-app-shell-"))
					.map((key) => caches.delete(key)),
			);
		} catch {
			// Ignore cache cleanup failures in development.
		}
	}
}

if ("serviceWorker" in navigator) {
	const isLocalhost = LOCALHOST_HOSTS.has(window.location.hostname);
	window.addEventListener("load", () => {
		if (import.meta.env.PROD && !isLocalhost) {
			navigator.serviceWorker.register("/sw.js").catch(() => undefined);
			return;
		}

		void cleanupLocalhostServiceWorkers();
	});
}
