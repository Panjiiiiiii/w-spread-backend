import app from './app';
import { ENV } from './config/env';
import { prisma } from './config/database';

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 Server running in ${ENV.NODE_ENV} mode on port ${ENV.PORT}`);
  console.log(`👉 Health check: http://localhost:${ENV.PORT}/api/v1/health`);
});

// Graceful shutdown
const handleShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    await prisma.$disconnect();
    console.log('Database disconnected.');
    process.exit(0);
  });
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
