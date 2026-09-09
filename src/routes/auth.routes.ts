import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();
router.post('/register', AuthController.uploadAvatar, AuthController.register);
router.post('/login', AuthController.login);
router.post('/google', AuthController.googleLogin);
export default router;
