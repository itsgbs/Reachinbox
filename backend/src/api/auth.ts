import { Router, Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';

const router = Router();

// Initiate Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed` }),
  (req: Request, res: Response) => {
    const user = req.user as any;
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user`);
    }

    // Issue JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// Get current user
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    return res.json({ user: decoded });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ success: true });
  });
});

export default router;
