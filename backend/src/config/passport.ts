import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db } from './database';

export function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;
          const avatar = profile.photos?.[0]?.value;

          if (!email) return done(new Error('No email from Google'), undefined);

          // Upsert user
          const result = await db.query(
            `INSERT INTO users (google_id, email, name, avatar)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (google_id) DO UPDATE SET email=$2, name=$3, avatar=$4, updated_at=NOW()
             RETURNING *`,
            [profile.id, email, name, avatar]
          );

          return done(null, result.rows[0]);
        } catch (err) {
          return done(err as Error, undefined);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const result = await db.query('SELECT * FROM users WHERE id=$1', [id]);
      done(null, result.rows[0] || null);
    } catch (err) {
      done(err);
    }
  });
}
