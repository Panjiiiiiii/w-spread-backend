import { Router } from 'express';
import healthRoutes from './health.routes';
import userRoutes from './user.routes';
import authRoutes from './auth.routes';
import membershipRoutes from './membership.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/users', userRoutes);
router.use('/auth', authRoutes);
router.use('/memberships', membershipRoutes);

export default router;
