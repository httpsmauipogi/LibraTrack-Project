// Build cross-portal links that work when the system is opened from a phone
// or tablet on the LAN, while keeping localhost defaults for local development
// and for the existing test suite (which fetches via 127.0.0.1).
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function portalBase(req, envName, port) {
  const configured = process.env[envName];
  if (configured) return configured.replace(/\/$/, "");

  const requestHost = req?.hostname;
  const host = requestHost && !LOOPBACK_HOSTS.has(requestHost) ? requestHost : "localhost";
  const formattedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

  return `http://${formattedHost}:${port}`;
}
