import express from 'express';
import path from 'path';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as OidcStrategy } from 'passport-openidconnect';
import { initDB, AppDataSource } from './db';
import { initRedis } from './cache';
import { AuthService } from './auth.service';
import { redisClient } from './cache';
import { signAccessToken, createRefreshToken, consumeRefreshToken } from './jwt';
import { requireAuth, AuthenticatedRequest } from './middleware';
import { proxyRouter } from './proxy/proxy.router';
import { connectRouter } from './connectors/connect.router';

const app = express();
app.use(express.json());
app.use(passport.initialize());

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'src', 'pages')));

// Initialize dependencies
Promise.all([initDB(), initRedis()])
  .then(() => {
    console.log('Dependencies initialized');

    const authService = new AuthService();

    // Configure GitHub Strategy
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackURL: '/auth/github/callback'
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email found'));

        const result = await authService.handleAuth(
          email,
          'github',
          { accessToken, refreshToken }
        );

        done(null, { id: result.userId, email });
      } catch (error) {
        done(error);
      }
    }));

    // Routes
    app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

    app.get('/auth/github/callback',
      passport.authenticate('github', { session: false, failureRedirect: '/?error=auth_failed' }),
      async (req: any, res: any) => {
        try {
          const { id, email } = req.user;
          const accessToken = signAccessToken({ sub: id, email });
          const refreshToken = await createRefreshToken(id);
          // Redirect to frontend with tokens
          res.redirect(`/?accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`);
        } catch (error) {
          console.error('Token issuance failed:', error);
          res.redirect('/?error=token_failed');
        }
      }
    );

    // Configure OIDC Strategy (generic — works with any OIDC provider: Okta, Auth0, Azure AD, etc.)
    if (process.env.OIDC_ISSUER) {
      passport.use('oidc', new OidcStrategy({
        issuer: process.env.OIDC_ISSUER,
        authorizationURL: process.env.OIDC_AUTHORIZATION_URL || `${process.env.OIDC_ISSUER}/authorize`,
        tokenURL: process.env.OIDC_TOKEN_URL || `${process.env.OIDC_ISSUER}/oauth/token`,
        userInfoURL: process.env.OIDC_USERINFO_URL || `${process.env.OIDC_ISSUER}/userinfo`,
        clientID: process.env.OIDC_CLIENT_ID || '',
        clientSecret: process.env.OIDC_CLIENT_SECRET || '',
        callbackURL: process.env.OIDC_CALLBACK_URL || '/auth/oidc/callback',
        scope: process.env.OIDC_SCOPES || 'openid profile email',
      }, async (issuer: string, profile: any, done: any) => {
        try {
          const email = profile.emails?.[0]?.value || profile._json?.email;
          if (!email) return done(new Error('No email found in OIDC profile'));

          const result = await authService.handleAuth(
            email,
            'oidc',
            { issuer, oidcId: profile.id }
          );

          done(null, { id: result.userId, email });
        } catch (error) {
          done(error);
        }
      }));

      app.get('/auth/oidc', passport.authenticate('oidc'));

      app.get('/auth/oidc/callback',
        passport.authenticate('oidc', { session: false, failureRedirect: '/login' }),
        async (req: any, res: any) => {
          try {
            const { id, email } = req.user;
            const accessToken = signAccessToken({ sub: id, email });
            const refreshToken = await createRefreshToken(id);
            res.json({ accessToken, refreshToken });
          } catch (error) {
            console.error('OIDC token issuance failed:', error);
            res.status(500).json({ error: 'Failed to issue tokens' });
          }
        }
      );

      console.log(`OIDC provider configured: ${process.env.OIDC_ISSUER}`);
    }

    // Exchange a refresh token for a new access + refresh token pair
    app.post('/auth/refresh', async (req: any, res: any) => {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken is required' });
      }

      const userId = await consumeRefreshToken(refreshToken);
      if (!userId) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      // Look up user to get email for the new access token
      const user = await authService.getUserById(userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const newAccessToken = signAccessToken({ sub: userId, email: user.email });
      const newRefreshToken = await createRefreshToken(userId);
      res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    });

    // Protected route — verifies the caller has a valid access token
    app.get('/auth/me', requireAuth, (req: any, res: any) => {
      const { sub, email } = (req as AuthenticatedRequest).tokenPayload;
      res.json({ userId: sub, email });
    });

    // Store credentials for a service (authenticated)
    app.post('/credentials', requireAuth, async (req: any, res: any) => {
      const { sub: userId, email } = (req as AuthenticatedRequest).tokenPayload;
      const { service, credentials } = req.body;

      if (!service || !credentials) {
        return res.status(400).json({ error: 'service and credentials are required' });
      }

      try {
        await authService.handleAuth(email, service, credentials);
        res.json({ success: true, service });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // List stored credential mappings (authenticated)
    app.get('/credentials', requireAuth, async (req: any, res: any) => {
      const { sub: userId } = (req as AuthenticatedRequest).tokenPayload;
      try {
        const mappings = await authService.getUserMappings(userId);
        res.json({ services: mappings.map(m => ({ service: m.saasType, updatedAt: m.updatedAt })) });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Connectors — OAuth/STS flows for downstream services
    app.use('/connect', connectRouter);

    // Proxy — authenticate once, access everything
    app.use('/proxy', proxyRouter);

    app.get('/health', (_: any, res: any) => {
      res.json({
        status: 'OK',
        db: AppDataSource.isInitialized,
        redis: redisClient?.isOpen ?? false
      });
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize:', error);
    process.exit(1);
  });
