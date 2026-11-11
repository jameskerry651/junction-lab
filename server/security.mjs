// Shared security response headers.
//
// CSP is the second line of defence behind the sanitize-html allowlist: even if
// an injection reaches the DOM, the browser refuses to execute or fetch it.
// HSTS is opt-in because it only makes sense on a real HTTPS origin and is hard
// to walk back once a browser has cached a long max-age.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
];

export const contentSecurityPolicy = CSP_DIRECTIVES.join("; ");

// Report-Only keeps the policy visible in dev consoles without blocking HMR.
export function cspHeaderName(env = process.env) {
  return env.JUNCTION_CSP_REPORT_ONLY === "1"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
}

// JUNCTION_HSTS_MAX_AGE=<seconds> enables HSTS; 0 or unset leaves it off.
export function hstsValue(env = process.env) {
  const maxAge = Number(env.JUNCTION_HSTS_MAX_AGE);
  if (!Number.isInteger(maxAge) || maxAge <= 0) return null;
  return [
    `max-age=${maxAge}`,
    env.JUNCTION_HSTS_INCLUDE_SUBDOMAINS === "1" && "includeSubDomains",
    env.JUNCTION_HSTS_PRELOAD === "1" && "preload",
  ]
    .filter(Boolean)
    .join("; ");
}

// JUNCTION_CSP=off is the documented escape hatch if a deployment front end
// needs resources this policy does not allow.
export function securityHeaders(env = process.env) {
  const headers = {};
  if (env.JUNCTION_CSP !== "off")
    headers[cspHeaderName(env)] = contentSecurityPolicy;
  const hsts = hstsValue(env);
  if (hsts) headers["Strict-Transport-Security"] = hsts;
  return headers;
}
