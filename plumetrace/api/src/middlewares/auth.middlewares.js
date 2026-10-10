/**
 * OWNER    : Yasho2
 * DUE      : D1 18:00
 * TASK     :
 *   Verify Cognito JWT with aws-jwt-verify (defence-in-depth behind the API GW authorizer); req.user = {sub, groups}. requireGroup('gov'|'fleet'|'admin') gates routes; admin passes everything.
 * DONE WHEN: A fleet user gets 403 on POST /actions/<district_report>/approve.
 * GUIDE    : docs/team/YASHO2.md  |  brief: docs/PROJECT_BRIEF.md
 * STATUS   : DONE
 */
import env from '../libs/env.js';
import { AppError } from './error.middlewares.js';

let _verifier = null;
async function verifyJwt(token) {
  if (!_verifier) {
    const { CognitoJwtVerifier } = await import('aws-jwt-verify');
    // The web app sends the Cognito **ID** token (web/src/lib/api.js uses
    // tokens.idToken), which is also what the API Gateway JWT authorizer validates
    // (jwtAudience = clientId). tokenUse:null accepts either id or access so this
    // defence-in-depth check matches what the browser actually sends.
    _verifier = CognitoJwtVerifier.create({
      userPoolId: env.COGNITO_POOL_ID,
      clientId: env.COGNITO_CLIENT_ID,
      tokenUse: null,
    });
  }
  return _verifier.verify(token);
}

/**
 * attachUser — set req.user = { sub, groups }.
 *  - MOCK_MODE: synthesise a user. Default group 'admin'; override for testing
 *    with the `x-mock-group` header (e.g. 'fleet' to prove gating).
 *  - real mode: verify the Cognito access token (defence-in-depth behind the
 *    API Gateway JWT authorizer).
 */
export const attachUser = async (req, _res, next) => {
  if (env.MOCK_MODE) {
    const g = req.header('x-mock-group');
    const groups = g ? g.split(',').map((s) => s.trim()) : ['admin'];
    req.user = { sub: req.header('x-mock-sub') || 'mock-user', groups };
    return next();
  }
  try {
    const auth = req.header('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new AppError(401, 'unauthorized', 'Missing bearer token');
    const payload = await verifyJwt(token);
    req.user = { sub: payload.sub, groups: payload['cognito:groups'] || [] };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, 'unauthorized', 'Invalid or expired token'));
  }
};

/** requireGroup(...allowed) — 403 unless the user is in an allowed group. 'admin' passes everything. */
export const requireGroup = (...allowed) => (req, _res, next) => {
  const groups = req.user?.groups || [];
  if (groups.includes('admin') || allowed.some((g) => groups.includes(g))) return next();
  next(new AppError(403, 'forbidden', `Requires one of: ${allowed.join(', ')}`));
};

/** Group required to approve/reject a given action type (brief §8.4, §14). */
export const groupForActionType = (type) =>
  type === 'shift_plan' || type === 'rider_notify' ? 'fleet' : 'gov';
