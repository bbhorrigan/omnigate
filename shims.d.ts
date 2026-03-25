// Module shim for passport-openidconnect which lacks @types in some versions
declare module 'passport-openidconnect' {
  import { Strategy as PassportStrategy } from 'passport';

  interface StrategyOptions {
    issuer: string;
    authorizationURL: string;
    tokenURL: string;
    userInfoURL: string;
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string | string[];
  }

  type VerifyCallback = (
    err: any,
    user?: any,
    info?: any
  ) => void;

  type VerifyFunction = (
    issuer: string,
    profile: any,
    done: VerifyCallback
  ) => void;

  class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyFunction);
    name: string;
  }

  export { Strategy };
}
