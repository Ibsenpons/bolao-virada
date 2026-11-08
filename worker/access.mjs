import { createRemoteJWKSet, jwtVerify } from 'jose';

const remoteKeys = new Map();
export function validTeamDomain(value) {
  return typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(value);
}

function keysFor(teamDomain) {
  if (!remoteKeys.has(teamDomain)) {
    remoteKeys.set(teamDomain, createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)));
  }
  return remoteKeys.get(teamDomain);
}

// Static Assets executa atrás de um roteador interno; ctx.access não chega ao Worker.
// Por isso validamos assinatura, emissor, público e validade do JWT recebido do Access.
export async function verifyAccessToken(token, env, testKeys) {
  if (!validTeamDomain(env.ACCESS_TEAM_DOMAIN) || !env.ACCESS_AUD || !token) return null;
  try {
    const { payload } = await jwtVerify(token, testKeys ?? keysFor(env.ACCESS_TEAM_DOMAIN), {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ['RS256'],
    });
    if (payload.type !== 'app' || typeof payload.email !== 'string' || !payload.email.trim() ||
      !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.nbf)) return null;
    return payload;
  } catch {
    return null;
  }
}
