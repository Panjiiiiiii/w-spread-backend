import { Router } from 'express';
import { PredictionController } from '../controllers/prediction.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.post('/predict', requireAuth, PredictionController.create);
router.get('/predictions', requireAuth, PredictionController.list);

export default router;
