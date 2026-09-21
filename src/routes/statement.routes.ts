import { Router } from 'express';
import { StatementController } from '../controllers/statement.controller';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.get('/', requireAuth, StatementController.list);
router.get('/usage', requireAuth, StatementController.usage);
router.get('/:id', requireAuth, StatementController.detail);
router.get('/:id/file', requireAuth, StatementController.file);

export default router;
