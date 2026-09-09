import { Request, Response } from 'express';
import { sendResponse } from '../utils/apiResponse';

export class HealthController {
  static check(_req: Request, res: Response) {
    return sendResponse(res, {
      message: 'Server is healthy and running',
      data: {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  }
}
