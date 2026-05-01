/**
 * BullMQ Queue Setup
 * Decouples load test triggering from execution.
 * Backend enqueues jobs → Worker processes them separately.
 */

const { Queue } = require('bullmq');
const logger = require('./logger');

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // required by BullMQ
};

// The queue that holds pending load test jobs
const loadTestQueue = new Queue('load-tests', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,              // retry once on failure
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 100,    // keep last 100 completed jobs
    removeOnFail: 50,         // keep last 50 failed jobs
  },
});

loadTestQueue.on('error', (err) => {
  logger.error('Queue error', { error: err.message });
});

/**
 * Add a load test job to the queue
 * @param {object} jobData - { testId, apiUrl, vus, duration }
 */
async function enqueueLoadTest(jobData) {
  const job = await loadTestQueue.add('run-k6', jobData, {
    jobId: jobData.testId, // use testId as jobId for easy lookup
  });
  logger.info('Load test enqueued', { testId: jobData.testId, jobId: job.id });
  return job;
}

module.exports = { loadTestQueue, enqueueLoadTest, redisConnection };
