/**
 * The session cookie's name, and nothing else.
 *
 * Its own module because the proxy runs on the edge runtime, where `node:crypto`
 * and `pg` do not exist. Importing this from `lib/auth` dragged that whole
 * module — and its Node-only dependencies — into the edge bundle and broke the
 * build. One constant with no imports can be read safely from either side.
 */
export const SESSION_COOKIE = "pms_session";
