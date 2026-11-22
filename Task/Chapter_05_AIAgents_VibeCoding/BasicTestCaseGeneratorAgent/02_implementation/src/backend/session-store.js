const sessions = new Map();
const MAX_SESSIONS = 10;
const SESSION_TTL_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldestId = sessions.keys().next().value;
    sessions.delete(oldestId);
  }
}

export function saveGeneration(id, value) {
  prune();
  sessions.set(id, { value, updatedAt: Date.now() });
}

export function getGeneration(id) {
  const entry = sessions.get(id);
  if (!entry || Date.now() - entry.updatedAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return null;
  }
  entry.updatedAt = Date.now();
  return entry.value;
}

export function removeGeneration(id) {
  return sessions.delete(id);
}
