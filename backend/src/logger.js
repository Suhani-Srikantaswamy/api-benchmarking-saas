/**
 * Structured Logger using Winston
 * Outputs JSON in production, pretty-printed in development
 */

const { createLogger, format, transports } = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProd
    ? format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
    : format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} [${level}] ${message}${extras}`;
        })
      ),
  transports: [
    new transports.Console(),
    // In production add file transport or ship to Loki/CloudWatch
    ...(isProd ? [new transports.File({ filename: '/tmp/app-error.log', level: 'error' })] : []),
  ],
});

module.exports = logger;
