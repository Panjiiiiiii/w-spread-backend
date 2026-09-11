import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();
router.post('/register', AuthController.uploadAvatar, AuthController.register);
router.post('/login', AuthController.login);
router.patch('/me/avatar', requireAuth, AuthController.uploadAvatar, AuthController.updateAvatar);
export default router;
