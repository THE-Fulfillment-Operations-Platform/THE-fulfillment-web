export const TOKEN_KEY = 'the_token'
export const USER_KEY = 'the_user'
// RFC3339 expiry the backend returns with the token, kept so the client can
// proactively end an expired session instead of waiting for the next 401.
export const EXPIRES_KEY = 'the_expires'
