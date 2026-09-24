// Ajoute req.user, rempli par le middleware requireAuth
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; role: string };
    }
  }
}

export {};
