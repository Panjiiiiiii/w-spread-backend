import { Router } from 'express';
import { MembershipController } from '../controllers/membership.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.get('/me', requireAuth, MembershipController.getMine);
router.patch('/revenuecat-user', requireAuth, MembershipController.linkRevenueCatUser);
router.post('/revenuecat/webhook', MembershipController.revenueCatWebhook);

export default router;
