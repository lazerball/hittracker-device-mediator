import * as winston from 'winston';

export const logger = new winston.Logger();

logger.add(winston.transports.Console, {
  type: 'verbose',
  colorize: true,
  prettyPrint: true,
  handleExceptions: true,
  humanReadableUnhandledException: true,
});

logger.cli();

process.on('unhandledRejection', (reason, p) => {
  logger.warn('Possibly Unhandled Rejection at: Promise ', p, ' reason: ', reason);
});
