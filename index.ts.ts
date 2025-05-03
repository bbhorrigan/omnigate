import express from 'express';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { initDB } from './config/db';
import { initRedis } from './services/cache';
import { AuthService } from './services/auth.service';
import { redisClient } from './services/cache';

const app = express();
app.use(express.json());
app.use(passport.initialize());

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
        
        done(null, { id: result.userId });
      } catch (error) {
        done(error);
      }
    }));

    // Routes
    app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
    
    app.get('/auth/github/callback', 
      passport.authenticate('github', { failureRedirect: '/login' }),
      (req, res) => {
        res.json({ success: true, userId: (req.user as any).id });
      }
    );

    app.get('/health', (_, res) => {
      res.json({ 
        status: 'OK',
        db: AppDataSource.isInitialized,
        redis: redisClient.isOpen
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