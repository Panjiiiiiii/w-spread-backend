import { Router } from 'express';
import { PredictionController } from '../controllers/prediction.controller';
import { StatementController } from '../controllers/statement.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.post('/predict', requireAuth, PredictionController.create);
router.get('/predictions', requireAuth, PredictionController.list);
router.post('/upload-statement', requireAuth, StatementController.uploadPdf, StatementController.upload);
router.get('/statements/latest', requireAuth, StatementController.latest);

export default router;
